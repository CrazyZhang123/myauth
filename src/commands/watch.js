import chalk from 'chalk';
import {
  ensureRuntimeDirs,
  loadCache,
  loadConfig,
  loadLimitCache,
  loadState,
  saveLimitCache
} from '../utils/config.js';
import { isBackCommand, question } from '../utils/prompt.js';
import { printMenuPageHeader } from '../utils/ui.js';
import {
  AUTO_SWITCH_MIN_REMAINING_PERCENT,
  fetchCredentialUsageSample,
  findLatestRateLimitSample,
  formatRemaining,
  formatResetAt,
  getCredentialHealth,
  getCredentialLimitSnapshot,
  getLogCursorAtEnd,
  getLowRemainingWindows,
  getRemainingPercent,
  isSampleCurrentForState,
  pickNextAvailableCredential,
  probeRateLimitSample,
  readQuotaLogUpdates,
  recordCredentialFailure,
  recordCredentialLimit
} from '../utils/limits.js';
import {
  getWatchServiceStatus,
  installWatchService,
  startWatchService,
  stopWatchService,
  uninstallWatchService
} from '../utils/service.js';
import { switchCredential } from './use.js';

const CURRENT_USAGE_TIMEOUT_MS = 5000;
const OTHER_USAGE_TIMEOUT_MS = 4000;
const WATCH_COOLDOWN_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatSwitchWindow(label, windowInfo) {
  const remainingPercent = getRemainingPercent(windowInfo);
  const remainingText = remainingPercent == null ? '-' : `${remainingPercent.toFixed(0)}% left`;
  return `${label} 低于 ${AUTO_SWITCH_MIN_REMAINING_PERCENT}%（当前 ${remainingText}，重置于 ${formatResetAt(windowInfo?.resets_at || null)}，剩余 ${formatRemaining(windowInfo?.resets_at || null)}）`;
}

function buildSwitchReason(lowWindows, rateLimits) {
  if (!Array.isArray(lowWindows) || lowWindows.length === 0) {
    return '检测到当前账号额度过低';
  }

  const details = [];

  if (lowWindows.includes('5H')) {
    details.push(formatSwitchWindow('5H', rateLimits?.primary));
  }

  if (lowWindows.includes('WEEK')) {
    details.push(formatSwitchWindow('周额度', rateLimits?.secondary));
  }

  return details.join('；');
}

function printSkippedCandidates(skipped) {
  if (!Array.isArray(skipped) || skipped.length === 0) {
    return;
  }

  const summary = skipped
    .map((item) => {
      const suffix = item.exhausted_windows?.length
        ? `${item.state}:${item.exhausted_windows.join('+')}`
        : item.state;
      return `${item.credential.index}:${suffix}`;
    })
    .join(', ');

  if (summary) {
    console.log(chalk.gray(`⏭️  已跳过账号: ${summary}`));
  }
}

async function probeUnknownCandidates(credentials, currentIndex, limitCache, config) {
  let bestCandidate = null;
  let bestScore = -1;

  for (const credential of credentials) {
    if (credential.index === currentIndex) {
      continue;
    }

    const snapshot = getCredentialLimitSnapshot(limitCache, credential);
    const health = getCredentialHealth(snapshot, AUTO_SWITCH_MIN_REMAINING_PERCENT);
    if (health.state !== 'unknown') {
      continue;
    }

    try {
      const result = await fetchCredentialUsageSample(credential, {
        credentialsDir: config.fromDir,
        targetFile: config.targetFile,
        isCurrent: false,
        timeoutMs: OTHER_USAGE_TIMEOUT_MS,
        maxAttempts: 3
      });

      if (!result?.sample) {
        continue;
      }

      limitCache = recordCredentialLimit(limitCache, credential, result.sample);
      const nextHealth = getCredentialHealth(getCredentialLimitSnapshot(limitCache, credential), AUTO_SWITCH_MIN_REMAINING_PERCENT);
      if (nextHealth.state === 'healthy' && nextHealth.score > bestScore) {
        bestCandidate = credential;
        bestScore = nextHealth.score;
      }
    } catch (err) {
      const previousSnapshot = getCredentialLimitSnapshot(limitCache, credential);
      if (!previousSnapshot?.rate_limits) {
        limitCache = recordCredentialFailure(limitCache, credential, err);
      }
    }
  }

  saveLimitCache(limitCache);

  return {
    candidate: bestCandidate,
    limitCache
  };
}

async function refreshCandidateSnapshots(credentials, state, limitCache, config) {
  const currentIndex = state?.current_index || null;
  const candidates = credentials.filter((credential) => credential.index !== currentIndex);

  const results = await Promise.allSettled(
    candidates.map(async (credential) => {
      const result = await fetchCredentialUsageSample(credential, {
        credentialsDir: config.fromDir,
        targetFile: config.targetFile,
        isCurrent: false,
        timeoutMs: OTHER_USAGE_TIMEOUT_MS,
        maxAttempts: 3
      });

      return {
        credential,
        result
      };
    })
  );

  for (const item of results) {
    if (item.status === 'fulfilled' && item.value.result?.sample) {
      limitCache = recordCredentialLimit(limitCache, item.value.credential, item.value.result.sample);
      continue;
    }

    const credential = item.status === 'fulfilled' ? item.value.credential : null;
    const error = item.status === 'rejected' ? item.reason : null;

    if (credential && error) {
      const previousSnapshot = getCredentialLimitSnapshot(limitCache, credential);
      if (!previousSnapshot?.rate_limits) {
        limitCache = recordCredentialFailure(limitCache, credential, error);
      }
    }
  }

  saveLimitCache(limitCache);
  return limitCache;
}

async function findBestSwitchCandidate(credentials, state, limitCache, config) {
  limitCache = await refreshCandidateSnapshots(credentials, state, limitCache, config);

  const selection = pickNextAvailableCredential(
    credentials,
    state?.current_index || null,
    limitCache,
    AUTO_SWITCH_MIN_REMAINING_PERCENT
  );
  const snapshot = selection.credential
    ? getCredentialLimitSnapshot(limitCache, selection.credential)
    : null;
  const health = getCredentialHealth(snapshot, AUTO_SWITCH_MIN_REMAINING_PERCENT);

  if (health.state === 'healthy') {
    return {
      credential: selection.credential,
      skipped: selection.skipped,
      limitCache
    };
  }

  const probed = await probeUnknownCandidates(credentials, state?.current_index || null, limitCache, config);
  limitCache = probed.limitCache;

  return {
    credential: probed.candidate,
    skipped: selection.skipped,
    limitCache
  };
}

async function autoSwitchCredential(credentials, state, limitCache, reason, config) {
  const candidateResult = await findBestSwitchCandidate(credentials, state, limitCache, config);
  limitCache = candidateResult.limitCache;
  printSkippedCandidates(candidateResult.skipped);

  if (!candidateResult.credential) {
    console.log(chalk.red('❌ 自动切换失败：没有健康账号可切换'));
    return {
      switched: false,
      limitCache
    };
  }

  console.log(chalk.yellow(`⚠️  触发自动切换：${reason}`));
  console.log(chalk.gray(`🔄 正在切换到 [${candidateResult.credential.index}] ${candidateResult.credential.email || '-'}`));

  try {
    await switchCredential(candidateResult.credential.index, { backup: true });
    console.log(chalk.green('✅ 自动切换完成'));
    return {
      switched: true,
      limitCache
    };
  } catch (err) {
    console.error(chalk.red('❌ 自动切换失败'));
    console.error(err.message);
    return {
      switched: false,
      limitCache
    };
  }
}

async function resolveCurrentSample(currentCredential, state, config) {
  try {
    const usageResult = await fetchCredentialUsageSample(currentCredential, {
      credentialsDir: config.fromDir,
      targetFile: config.targetFile,
      isCurrent: true,
      timeoutMs: CURRENT_USAGE_TIMEOUT_MS,
      maxAttempts: 3
    });

    return {
      sample: usageResult?.sample || null,
      error: null
    };
  } catch (err) {
    if (err?.statusCode === 401 || err?.statusCode === 403) {
      return {
        sample: null,
        error: err
      };
    }

    const latestSample = await findLatestRateLimitSample({ maxFiles: 8 });
    if (latestSample && isSampleCurrentForState(latestSample, state)) {
      return {
        sample: latestSample,
        error: err
      };
    }

    return {
      sample: null,
      error: err
    };
  }
}

async function maybeProbeCurrentSample(currentCredential, state, lastProbeAt, intervalSeconds) {
  const probeCooldownMs = Math.max(intervalSeconds * 1000, 10 * 60 * 1000);
  if (Date.now() - lastProbeAt < probeCooldownMs) {
    return {
      sample: null,
      lastProbeAt
    };
  }

  const probedSample = await probeRateLimitSample();
  if (probedSample && isSampleCurrentForState(probedSample, state)) {
    return {
      sample: probedSample,
      lastProbeAt: Date.now()
    };
  }

  return {
    sample: null,
    lastProbeAt: Date.now()
  };
}

function printServiceStatus(status) {
  const installText = status.installed ? '已安装' : '未安装';
  const runText = status.running ? '运行中' : (status.loaded ? '已加载' : '未运行');

  console.log(chalk.cyan.bold('👀 自动切号监控'));
  console.log();
  console.log(chalk.gray(`🧭 平台: ${process.platform}`));
  console.log(chalk.gray(`🧩 服务类型: ${status.serviceKind}`));
  console.log(chalk.gray(`📦 服务标识: ${status.label}`));
  console.log(chalk.gray(`📄 ${status.serviceFileLabel}: ${status.serviceFilePath}`));
  if (status.taskName && status.taskName !== status.label) {
    console.log(chalk.gray(`🪟 任务名: ${status.taskName}`));
  }
  console.log(chalk.gray(`📝 stdout: ${status.stdoutPath}`));
  console.log(chalk.gray(`📝 stderr: ${status.stderrPath}`));
  console.log(chalk.gray(`📌 安装状态: ${installText}`));
  console.log(chalk.gray(`🚦 运行状态: ${runText}`));
  if (status.state) {
    console.log(chalk.gray(`📊 平台状态: ${status.state}`));
  }
  console.log();
}

async function runServiceAction(action, intervalSeconds) {
  switch (action) {
    case 'install':
      return installWatchService({ intervalSeconds });
    case 'start':
      return startWatchService();
    case 'stop':
      return stopWatchService();
    case 'uninstall':
      return uninstallWatchService();
    default:
      return getWatchServiceStatus();
  }
}

export async function watchMenu() {
  while (true) {
    console.clear();
    printMenuPageHeader('3', '自动切号监控');

    try {
      printServiceStatus(getWatchServiceStatus());
    } catch (err) {
      console.log(chalk.red(`❌ ${err.message}`));
      console.log();
    }

    console.log(chalk.white('[1] 前台启动监控'));
    console.log(chalk.white('[2] 安装并启动自启服务'));
    console.log(chalk.white('[3] 启动已安装服务'));
    console.log(chalk.white('[4] 停止服务'));
    console.log(chalk.white('[5] 查看服务状态'));
    console.log(chalk.white('[6] 卸载服务'));
    console.log(chalk.white('[0] 返回主菜单'));
    console.log();

    const choice = await question(chalk.cyan('请选择操作 (0-6，b 返回): '));
    if (choice === '0' || isBackCommand(choice)) {
      return 'back';
    }

    try {
      switch (choice) {
        case '1':
          console.log();
          await watchLimits({});
          break;
        case '2':
          await runServiceAction('install', 10);
          console.log(chalk.green('\n✅ 自动切号服务已安装并启动'));
          break;
        case '3':
          await runServiceAction('start', 10);
          console.log(chalk.green('\n✅ 自动切号服务已启动'));
          break;
        case '4':
          await runServiceAction('stop', 10);
          console.log(chalk.green('\n✅ 自动切号服务已停止'));
          break;
        case '5':
          console.log(chalk.green('\n✅ 服务状态已刷新'));
          break;
        case '6':
          await runServiceAction('uninstall', 10);
          console.log(chalk.green('\n✅ 自动切号服务已卸载'));
          break;
        default:
          console.log(chalk.red('\n❌ 无效选项，请输入 0-6'));
      }
    } catch (err) {
      console.error(chalk.red(`\n❌ 操作失败: ${err.message}`));
    }

    await question(chalk.gray('\n按回车继续...'));
  }
}

/**
 * 监控限额并在低于阈值时自动切换账号
 * @param {{interval?: string | number, once?: boolean, installService?: boolean, uninstallService?: boolean, start?: boolean, stop?: boolean, status?: boolean, foregroundService?: boolean}} options
 */
export async function watchLimits(options = {}) {
  const parsedInterval = Number(options.interval || 10);
  const intervalSeconds = Number.isFinite(parsedInterval)
    ? Math.max(5, parsedInterval)
    : 10;

  if (options.installService) {
    const result = installWatchService({ intervalSeconds });
    console.log(chalk.green('✅ 自动切号服务已安装并启动'));
    console.log(chalk.gray(`📄 ${result.serviceFileLabel}: ${result.serviceFilePath}`));
    return;
  }

  if (options.start) {
    const result = startWatchService();
    console.log(chalk.green('✅ 自动切号服务已启动'));
    console.log(chalk.gray(`📄 ${result.serviceFileLabel}: ${result.serviceFilePath}`));
    return;
  }

  if (options.stop) {
    const result = stopWatchService();
    console.log(chalk.green(result.stopped ? '✅ 自动切号服务已停止' : '⚠️  服务当前未运行'));
    console.log(chalk.gray(`📄 ${result.serviceFileLabel}: ${result.serviceFilePath}`));
    return;
  }

  if (options.uninstallService) {
    const result = uninstallWatchService();
    console.log(chalk.green('✅ 自动切号服务已卸载'));
    console.log(chalk.gray(`📄 ${result.serviceFileLabel}: ${result.serviceFilePath}`));
    return;
  }

  if (options.status) {
    printServiceStatus(getWatchServiceStatus());
    return;
  }

  ensureRuntimeDirs();

  const credentials = loadCache();
  if (credentials.length < 2) {
    console.error(chalk.red('❌ 错误: 至少需要 2 个账号才能启用自动切换'));
    process.exit(1);
  }

  let limitCache = loadLimitCache();
  let lastSampleKey = null;
  let lastProbeAt = 0;
  let cooldownUntil = 0;
  let logCursor = getLogCursorAtEnd();
  const runningAsService = options.foregroundService === true;

  console.log(chalk.cyan.bold(runningAsService ? '🤖 自动切号服务已启动' : '👀 限额自动切换监控已启动'));
  console.log(chalk.gray(`⏱️  轮询间隔: ${intervalSeconds} 秒`));
  console.log(chalk.gray(`🎯 切号阈值: 任一窗口剩余 < ${AUTO_SWITCH_MIN_REMAINING_PERCENT}%`));
  if (!runningAsService) {
    console.log(chalk.gray('💡 按 Ctrl+C 结束监控'));
  }
  console.log();

  while (true) {
    try {
      const currentCredentials = loadCache();
      const state = loadState();
      let currentCredential = currentCredentials.find((credential) => credential.index === state?.current_index) || null;

      if (!currentCredential) {
        const switchResult = await autoSwitchCredential(
          currentCredentials,
          state,
          limitCache,
          '当前没有生效账号',
          loadConfig()
        );
        limitCache = switchResult.limitCache;
        if (switchResult.switched) {
          cooldownUntil = Date.now() + WATCH_COOLDOWN_MS;
        }
      } else {
        const config = loadConfig();
        const currentSampleResult = await resolveCurrentSample(currentCredential, state, config);
        let liveSample = currentSampleResult.sample;

        if (!liveSample) {
          const probeResult = await maybeProbeCurrentSample(currentCredential, state, lastProbeAt, intervalSeconds);
          liveSample = probeResult.sample;
          lastProbeAt = probeResult.lastProbeAt;
        }

        if (liveSample) {
          limitCache = recordCredentialLimit(limitCache, currentCredential, liveSample);
          saveLimitCache(limitCache);

          const sampleKey = [
            currentCredential.index,
            liveSample.rate_limits.limit_id || 'codex',
            liveSample.rate_limits.primary?.used_percent ?? '-',
            liveSample.rate_limits.primary?.resets_at ?? '-',
            liveSample.rate_limits.secondary?.used_percent ?? '-',
            liveSample.rate_limits.secondary?.resets_at ?? '-'
          ].join(':');

          if (sampleKey !== lastSampleKey) {
            lastSampleKey = sampleKey;
            const fiveHourLeft = getRemainingPercent(liveSample.rate_limits.primary);
            const weekLeft = getRemainingPercent(liveSample.rate_limits.secondary);
            console.log(chalk.gray(
              `📈 ${currentCredential.email || '-'} `
              + `5H=${fiveHourLeft == null ? '-' : `${fiveHourLeft.toFixed(0)}% left`} `
              + `WEEK=${weekLeft == null ? '-' : `${weekLeft.toFixed(0)}% left`}`
            ));
          }

          const lowWindows = getLowRemainingWindows(liveSample.rate_limits, AUTO_SWITCH_MIN_REMAINING_PERCENT);
          if (Date.now() >= cooldownUntil && lowWindows.length > 0) {
            const switchResult = await autoSwitchCredential(
              currentCredentials,
              state,
              limitCache,
              buildSwitchReason(lowWindows, liveSample.rate_limits),
              config
            );
            limitCache = switchResult.limitCache;

            if (switchResult.switched) {
              cooldownUntil = Date.now() + WATCH_COOLDOWN_MS;
              lastSampleKey = null;
              lastProbeAt = 0;
            }
          }
        } else {
          const cachedSnapshot = getCredentialLimitSnapshot(limitCache, currentCredential);
          if (currentSampleResult.error && !cachedSnapshot?.rate_limits) {
            limitCache = recordCredentialFailure(limitCache, currentCredential, currentSampleResult.error);
            saveLimitCache(limitCache);
          }

          const snapshot = getCredentialLimitSnapshot(limitCache, currentCredential);
          const health = getCredentialHealth(snapshot, AUTO_SWITCH_MIN_REMAINING_PERCENT);

          if (Date.now() >= cooldownUntil && (health.state === 'low' || health.state === 'exhausted' || health.state === 'invalid')) {
            const switchResult = await autoSwitchCredential(
              currentCredentials,
              state,
              limitCache,
              `当前账号状态异常：${health.state}`,
              config
            );
            limitCache = switchResult.limitCache;

            if (switchResult.switched) {
              cooldownUntil = Date.now() + WATCH_COOLDOWN_MS;
              lastSampleKey = null;
              lastProbeAt = 0;
            }
          }
        }

        if (Date.now() >= cooldownUntil) {
          const logUpdate = readQuotaLogUpdates(logCursor);
          logCursor = logUpdate.next_cursor;

          if (logUpdate.matches.length > 0) {
            const switchResult = await autoSwitchCredential(
              currentCredentials,
              state,
              limitCache,
              '日志中出现限额/429 相关错误',
              loadConfig()
            );
            limitCache = switchResult.limitCache;

            if (switchResult.switched) {
              cooldownUntil = Date.now() + WATCH_COOLDOWN_MS;
              lastSampleKey = null;
              lastProbeAt = 0;
            }
          }
        }
      }
    } catch (err) {
      console.error(chalk.red(`❌ 监控异常: ${err.message}`));
    }

    if (options.once) {
      break;
    }

    await sleep(intervalSeconds * 1000);
  }
}
