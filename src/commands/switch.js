import chalk from 'chalk';
import { isBackCommand, question } from '../utils/prompt.js';
import {
  loadCache,
  loadConfig,
  loadLimitCache,
  loadState,
  saveCache,
  saveLimitCache
} from '../utils/config.js';
import {
  AUTO_SWITCH_MIN_REMAINING_PERCENT,
  fetchCredentialUsageSample,
  findLatestRateLimitSample,
  getCredentialHealth,
  getCredentialLimitSnapshot,
  getRemainingPercent,
  isSampleCurrentForState,
  recordCredentialFailure,
  recordCredentialLimit
} from '../utils/limits.js';
import { scanCredentials } from '../utils/scanner.js';
import { printMenuPageHeader } from '../utils/ui.js';
import { deleteCredential } from './delete.js';
import { switchCredential } from './use.js';

const CURRENT_USAGE_TIMEOUT_MS = 3500;
const OTHER_USAGE_TIMEOUT_MS = 2500;
const PRIORITY_POOL_REFRESH_LIMIT = 3;

function shortenMessage(message, maxLength = 96) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  return text.length > maxLength
    ? `${text.slice(0, maxLength - 1)}…`
    : text;
}

function renderProgressBar(percentLeft, width = 24) {
  if (percentLeft == null) {
    return `[${'.'.repeat(width)}]`;
  }

  const normalized = Math.max(0, Math.min(100, percentLeft));
  const filled = Math.round((normalized / 100) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}]`;
}

function formatResetText(resetAt) {
  if (!resetAt) {
    return null;
  }

  const resetDate = new Date(resetAt * 1000);
  const time = resetDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const today = new Date();
  const sameDay = today.getFullYear() === resetDate.getFullYear()
    && today.getMonth() === resetDate.getMonth()
    && today.getDate() === resetDate.getDate();

  if (sameDay) {
    return `resets ${time}`;
  }

  const day = String(resetDate.getDate()).padStart(2, '0');
  const month = resetDate.toLocaleString('en-US', { month: 'short' });
  return `resets ${time} on ${day} ${month}`;
}

async function refreshCredentialCache(config) {
  const credentials = await scanCredentials(config.fromDir);
  saveCache(credentials);
  return credentials;
}

function pickPriorityPoolTargets(credentials, limitCache, state, currentIndex) {
  const recentIndexes = state?.recent_indexes || [];
  const selected = [];
  const selectedIndexes = new Set();

  function pushCredential(credential) {
    if (!credential || credential.index === currentIndex || selectedIndexes.has(credential.index)) {
      return;
    }

    selected.push(credential);
    selectedIndexes.add(credential.index);
  }

  for (const recentIndex of recentIndexes) {
    if (selected.length >= PRIORITY_POOL_REFRESH_LIMIT) {
      break;
    }

    pushCredential(credentials.find((credential) => credential.index === recentIndex) || null);
  }

  const remaining = credentials
    .filter((credential) => credential.index !== currentIndex && !selectedIndexes.has(credential.index))
    .map((credential) => ({
      credential,
      health: getCredentialHealth(getCredentialLimitSnapshot(limitCache, credential), AUTO_SWITCH_MIN_REMAINING_PERCENT)
    }))
    .sort((left, right) => left.health.score - right.health.score);

  for (const item of remaining) {
    if (selected.length >= PRIORITY_POOL_REFRESH_LIMIT) {
      break;
    }

    pushCredential(item.credential);
  }

  return selected;
}

function buildAccountStatus(snapshot, isCurrent) {
  const parts = [];
  const health = getCredentialHealth(snapshot, AUTO_SWITCH_MIN_REMAINING_PERCENT);

  if (isCurrent) {
    parts.push('当前账号');
  }

  switch (health.state) {
    case 'healthy':
      parts.push('健康');
      break;
    case 'error':
      parts.push('请求失败');
      break;
    case 'low':
      parts.push(`低于 ${AUTO_SWITCH_MIN_REMAINING_PERCENT}%`);
      break;
    case 'exhausted':
      parts.push('已耗尽');
      break;
    case 'invalid':
      parts.push('已失效');
      break;
    default:
      parts.push('未采样');
      break;
  }

  return parts.join(' · ');
}

function printLimitLine(label, windowInfo, healthState) {
  const leftPercent = getRemainingPercent(windowInfo);
  const resetText = formatResetText(windowInfo?.resets_at || null);

  if (leftPercent == null) {
    console.log(chalk.gray(`    ${label.padEnd(13)} ${renderProgressBar(null)} --`));
    return;
  }

  const tone = healthState === 'invalid'
    ? chalk.redBright
    : leftPercent < AUTO_SWITCH_MIN_REMAINING_PERCENT
      ? chalk.yellowBright
      : chalk.white;
  const line = `    ${label.padEnd(13)} ${renderProgressBar(leftPercent)} ${leftPercent.toFixed(0)}% left`;
  console.log(
    tone(line)
    + (resetText ? ` ${chalk.gray(`(${resetText})`)}` : '')
  );
}

function printAccountCard(credential, snapshot, isCurrent) {
  const planLabel = credential.team_space
    ? `${credential.plan || '-'} / ${credential.team_space}`
    : (credential.plan || '-');
  const health = getCredentialHealth(snapshot, AUTO_SWITCH_MIN_REMAINING_PERCENT);
  const titleTone = health.state === 'invalid'
    ? chalk.redBright
    : health.state === 'error'
      ? chalk.yellowBright
    : health.state === 'low' || health.state === 'exhausted'
      ? chalk.yellowBright
      : isCurrent
        ? chalk.greenBright
        : chalk.white;

  console.log(
    titleTone(`[${credential.index}] ${credential.email || '-'}`)
    + ' '
    + chalk.gray(`(${planLabel})`)
    + ' '
    + chalk.gray(`· ${buildAccountStatus(snapshot, isCurrent)}`)
  );

  if (health.state === 'invalid') {
    console.log(chalk.redBright(`    状态          已失效${snapshot?.error_message ? ` (${shortenMessage(snapshot.error_message)})` : ''}`));
    console.log();
    return;
  }

  if (health.state === 'error') {
    console.log(chalk.yellowBright(`    状态          请求失败${snapshot?.error_message ? ` (${shortenMessage(snapshot.error_message)})` : ''}`));
    console.log();
    return;
  }

  printLimitLine('5h limit:', snapshot?.rate_limits?.primary, health.state);
  printLimitLine('Weekly limit:', snapshot?.rate_limits?.secondary, health.state);
  console.log();
}

async function refreshCurrentSnapshot(currentCredential, state, limitCache, config) {
  if (!currentCredential) {
    return {
      limitCache,
      refreshMode: 'none',
      notice: ''
    };
  }

  const previousSnapshot = getCredentialLimitSnapshot(limitCache, currentCredential);

  try {
    const usageResult = await fetchCredentialUsageSample(currentCredential, {
      credentialsDir: config.fromDir,
      targetFile: config.targetFile,
      isCurrent: true,
      timeoutMs: CURRENT_USAGE_TIMEOUT_MS,
      maxAttempts: 3
    });

    if (usageResult?.sample) {
      limitCache = recordCredentialLimit(limitCache, currentCredential, usageResult.sample);
      saveLimitCache(limitCache);
      return {
        limitCache,
        refreshMode: 'usage',
        notice: ''
      };
    }
  } catch (err) {
    const latestSample = await findLatestRateLimitSample({ maxFiles: 8 });
    if (latestSample && isSampleCurrentForState(latestSample, state)) {
      limitCache = recordCredentialLimit(limitCache, currentCredential, latestSample);
      saveLimitCache(limitCache);
      return {
        limitCache,
        refreshMode: 'session',
        notice: ''
      };
    }

    if (previousSnapshot?.rate_limits) {
      return {
        limitCache,
        refreshMode: 'cache',
        notice: '当前账号实时刷新失败，已回退到最近一次已知状态'
      };
    }

    limitCache = recordCredentialFailure(limitCache, currentCredential, err);
    saveLimitCache(limitCache);
    return {
      limitCache,
      refreshMode: 'error',
      notice: '当前账号实时刷新失败，且没有可回退的额度样本'
    };
  }

  return {
    limitCache,
    refreshMode: previousSnapshot?.rate_limits ? 'cache' : 'none',
    notice: ''
  };
}

async function refreshOtherSnapshots(credentials, currentIndex, limitCache, targets, config) {
  let refreshedCount = 0;
  let fallbackCount = 0;

  const results = await Promise.allSettled(
    targets.map(async (credential) => {
      const usageResult = await fetchCredentialUsageSample(credential, {
        credentialsDir: config.fromDir,
        targetFile: config.targetFile,
        isCurrent: false,
        timeoutMs: OTHER_USAGE_TIMEOUT_MS,
        maxAttempts: 3
      });

      return {
        credential,
        usageResult
      };
    })
  );

  for (const item of results) {
    if (item.status === 'fulfilled' && item.value.usageResult?.sample) {
      limitCache = recordCredentialLimit(limitCache, item.value.credential, item.value.usageResult.sample);
      refreshedCount += 1;
      continue;
    }

    const credential = item.status === 'fulfilled' ? item.value.credential : null;
    const error = item.status === 'rejected' ? item.reason : null;
    if (credential && error) {
      const previousSnapshot = getCredentialLimitSnapshot(limitCache, credential);
      if (previousSnapshot?.rate_limits) {
        fallbackCount += 1;
        continue;
      }
      limitCache = recordCredentialFailure(limitCache, credential, error);
    }
  }

  saveLimitCache(limitCache);

  return {
    limitCache,
    refreshMode: refreshedCount > 0 ? 'usage-priority' : 'cache',
    notice: fallbackCount > 0 ? `${fallbackCount} 个账号实时刷新失败，已保留最近一次已知状态` : ''
  };
}

function printAccountPool(view) {
  if (view.showMenuHeader) {
    printMenuPageHeader('2', '帐号池');
  }

  console.log(chalk.cyan.bold('🗂️ 帐号池'));
  console.log();

  if (view.banner) {
    console.log(chalk.gray(view.banner));
  } else if (view.refreshMode === 'usage-priority') {
    console.log(chalk.gray('⚡ 当前账号已优先刷新，最近使用账号也已补刷新'));
  } else if (view.refreshMode === 'usage') {
    console.log(chalk.gray('⚡ 当前账号已通过 /usage 实时刷新'));
  } else if (view.refreshMode === 'session') {
    console.log(chalk.gray('🛰️ 当前账号使用最新会话样本'));
  } else {
    console.log(chalk.gray('📦 当前显示最近一次已知状态'));
  }

  if (view.notice) {
    console.log(chalk.yellow(`⚠️  ${view.notice}`));
    console.log();
  }

  for (const credential of view.credentials) {
    const snapshot = getCredentialLimitSnapshot(view.limitCache, credential);
    printAccountCard(credential, snapshot, credential.index === view.currentIndex);
  }
}

async function buildAccountPoolView() {
  const config = loadConfig();
  const credentials = await refreshCredentialCache(config);
  let limitCache = loadLimitCache();
  const state = loadState();
  const currentIndex = state?.current_index || null;
  const currentCredential = credentials.find((credential) => credential.index === currentIndex) || null;

  const currentResult = await refreshCurrentSnapshot(currentCredential, state, limitCache, config);
  limitCache = currentResult.limitCache;

  const priorityTargets = pickPriorityPoolTargets(credentials, limitCache, state, currentIndex);
  const poolResult = await refreshOtherSnapshots(credentials, currentIndex, limitCache, priorityTargets, config);
  limitCache = poolResult.limitCache;

  return {
    credentials,
    limitCache,
    currentIndex,
    refreshMode: poolResult.refreshMode === 'usage-priority' ? 'usage-priority' : currentResult.refreshMode,
    notice: [currentResult.notice, poolResult.notice].filter(Boolean).join('；')
  };
}

async function handleAccountAction(view) {
  const choice = await question(chalk.cyan('账号序号（b 返回）: '));

  if (isBackCommand(choice)) {
    return 'back';
  }

  const credential = view.credentials.find((item) => item.index === choice);
  if (!credential) {
    console.log(chalk.red(`\n❌ 未找到 index 为 ${choice} 的账号`));
    await question(chalk.gray('按回车继续...'));
    return 'continue';
  }

  const action = await question(chalk.cyan('操作（回车切换 / d 删除 / b 返回）: '));
  if (isBackCommand(action)) {
    return 'continue';
  }

  if (action.toLowerCase() === 'd') {
    const confirmation = await question(chalk.red(`确认删除 [${credential.index}] ${credential.email || '-'} ? 输入 yes 删除: `));
    if (confirmation.toLowerCase() !== 'yes') {
      console.log(chalk.yellow('\n⚠️  已取消删除'));
      await question(chalk.gray('按回车继续...'));
      return 'continue';
    }

    await deleteCredential(credential.index);
    await question(chalk.gray('\n按回车继续...'));
    return 'continue';
  }

  if (credential.index === view.currentIndex) {
    console.log(chalk.yellow('\n⚠️  该账号已经是当前账号'));
    await question(chalk.gray('按回车继续...'));
    return 'continue';
  }

  await switchCredential(credential.index, { backup: true });
  console.log(chalk.green(`\n✅ 已切换到 [${credential.index}] ${credential.email || '-'}`));
  await question(chalk.gray('按回车继续...'));
  return 'continue';
}

export async function showAccountPool(options = {}) {
  const interactive = options.interactive === true;
  const config = loadConfig();

  while (true) {
    const credentials = await refreshCredentialCache(config);
    if (credentials.length === 0) {
      console.log(chalk.yellow('暂无可用账号'));
      console.log(chalk.gray('提示: 运行 zjjauth login 添加账号'));
      if (interactive) {
        await question(chalk.gray('\n按回车继续...'));
      }
      return;
    }

    if (interactive) {
      console.clear();
      printAccountPool({
        credentials,
        limitCache: loadLimitCache(),
        currentIndex: loadState()?.current_index || null,
        refreshMode: 'cache',
        banner: '⚡ 正在通过 /usage 后台刷新帐号池，先展示最近一次已知状态',
        showMenuHeader: true
      });
      console.log();
    }

    const view = await buildAccountPoolView();

    if (!interactive) {
      printAccountPool(view);
      return;
    }

    console.clear();
    printAccountPool({
      ...view,
      showMenuHeader: true
    });
    console.log();

    const result = await handleAccountAction(view);
    if (result === 'back') {
      return;
    }
  }
}

export async function switchMenu() {
  await showAccountPool({ interactive: true });
}
