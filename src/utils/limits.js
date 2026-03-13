import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { URL } from 'url';
import fg from 'fast-glob';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { OAUTH_CONFIG, extractUserInfo } from '../auth/oauth.js';
import {
  loadCache,
  loadConfig,
  loadLimitCache,
  loadState,
  saveCache,
  saveLimitCache
} from './config.js';
import { updateTargetJson } from './updater.js';

const CODEX_HOME = path.join(os.homedir(), '.codex');
const SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
const LOG_FILE = path.join(CODEX_HOME, 'log', 'codex-tui.log');
const SAMPLE_PREFERENCE_WINDOW_MS = 5000;
const SAMPLE_PROBE_TIMEOUT_MS = 20000;
const SAMPLE_USAGE_TIMEOUT_MS = 8000;
const TOKEN_REFRESH_TIMEOUT_MS = 30000;
const USAGE_URL = 'https://chatgpt.com/backend-api/codex/usage';
const ZJJAUTH_USER_AGENT = 'zjjauth/1.0.3';
const MENU_AUTO_REFRESH_INTERVAL_MS = 20000;
export const LOW_REMAINING_PERCENT_THRESHOLD = 10;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getProxyAgent() {
  const proxy = process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy;

  if (!proxy) {
    return null;
  }

  try {
    return new HttpsProxyAgent(proxy);
  } catch (err) {
    return null;
  }
}

function parseJsonText(text) {
  if (!text || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

function isHtmlChallengeBody(body) {
  const text = typeof body === 'string'
    ? body
    : '';

  return /<!DOCTYPE html>/i.test(text)
    || /Just a moment/i.test(text)
    || /Enable JavaScript and cookies to continue/i.test(text)
    || /__cf_chl/i.test(text);
}

function summarizeErrorBody(statusCode, body) {
  if (typeof body === 'object' && body) {
    const message = body.error?.message || body.error_description || body.error || body.message || null;
    return message ? String(message).trim() : null;
  }

  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  if (isHtmlChallengeBody(text)) {
    return 'Cloudflare challenge';
  }

  return text.slice(0, 160);
}

function buildHttpError(statusCode, body) {
  const errorMessage = summarizeErrorBody(statusCode, body);
  const error = new Error(errorMessage ? `HTTP ${statusCode}: ${errorMessage}` : `HTTP ${statusCode}`);
  error.statusCode = statusCode;
  error.responseBody = body;
  return error;
}

function requestJson(urlString, options = {}) {
  const url = new URL(urlString);
  const method = options.method || 'GET';
  const body = options.body || null;
  const headers = {
    Accept: 'application/json',
    'User-Agent': ZJJAUTH_USER_AGENT,
    ...(options.headers || {})
  };

  if (body != null && headers['Content-Length'] == null) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      agent: getProxyAgent() || undefined,
      timeout: options.timeoutMs || SAMPLE_USAGE_TIMEOUT_MS
    }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const parsedBody = parseJsonText(data);

        if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
          reject(buildHttpError(res.statusCode || 500, parsedBody));
          return;
        }

        resolve({
          statusCode: res.statusCode || 200,
          body: parsedBody
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`请求超时（${options.timeoutMs || SAMPLE_USAGE_TIMEOUT_MS}ms）`));
    });

    if (body != null) {
      req.write(body);
    }

    req.end();
  });
}

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch (err) {
      // 忽略 chmod 失败，保留原有权限即可
    }
  }
}

function safeParseJson(line) {
  try {
    return JSON.parse(line);
  } catch (err) {
    return null;
  }
}

function toTimestampMs(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function clampPercent(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(100, Math.max(0, parsed));
}

function normalizeWindow(windowInfo, fallbackWindowMinutes) {
  if (!windowInfo || typeof windowInfo !== 'object') {
    return null;
  }

  const usedPercent = Number(windowInfo.used_percent);
  const windowMinutes = Number(windowInfo.window_minutes || fallbackWindowMinutes);
  const resetsAt = Number(windowInfo.resets_at || 0);

  return {
    used_percent: Number.isFinite(usedPercent) ? usedPercent : null,
    window_minutes: Number.isFinite(windowMinutes) ? windowMinutes : fallbackWindowMinutes,
    resets_at: Number.isFinite(resetsAt) ? resetsAt : null
  };
}

function normalizeRateLimits(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') {
    return null;
  }

  return {
    limit_id: rateLimits.limit_id || 'codex',
    limit_name: rateLimits.limit_name || null,
    primary: normalizeWindow(rateLimits.primary, 300),
    secondary: normalizeWindow(rateLimits.secondary, 10080),
    credits: rateLimits.credits || null,
    plan_type: rateLimits.plan_type || null
  };
}

function normalizeUsageWindow(windowInfo, fallbackWindowMinutes) {
  if (!windowInfo || typeof windowInfo !== 'object') {
    return null;
  }

  const usedPercent = clampPercent(windowInfo.used_percent);
  const windowSeconds = Number(windowInfo.limit_window_seconds);
  const resetAtValue = Number(windowInfo.reset_at);
  const resetAfterSeconds = Number(windowInfo.reset_after_seconds);
  const resetAt = Number.isFinite(resetAtValue) && resetAtValue > 0
    ? resetAtValue
    : (Number.isFinite(resetAfterSeconds) && resetAfterSeconds > 0
      ? Math.floor(Date.now() / 1000) + resetAfterSeconds
      : null);

  return {
    used_percent: usedPercent,
    window_minutes: Number.isFinite(windowSeconds) && windowSeconds > 0
      ? Math.round(windowSeconds / 60)
      : fallbackWindowMinutes,
    resets_at: resetAt
  };
}

function buildSampleFromRecord(record, source = null) {
  const rateLimits = normalizeRateLimits(record?.payload?.rate_limits);
  if (!rateLimits) {
    return null;
  }

  const timestamp = record?.timestamp || new Date().toISOString();

  return {
    timestamp,
    timestamp_ms: toTimestampMs(timestamp),
    session_path: source,
    rate_limits: rateLimits
  };
}

function buildSampleFromUsagePayload(payload, source = 'usage') {
  if (!payload?.rate_limit || typeof payload.rate_limit !== 'object') {
    return null;
  }

  const timestamp = new Date().toISOString();

  return {
    timestamp,
    timestamp_ms: toTimestampMs(timestamp),
    session_path: source,
    rate_limits: {
      limit_id: 'codex',
      limit_name: 'codex',
      primary: normalizeUsageWindow(payload.rate_limit.primary_window, 300),
      secondary: normalizeUsageWindow(payload.rate_limit.secondary_window, 10080),
      credits: payload.credits || null,
      plan_type: normalizePlanType(payload.plan_type) || null
    }
  };
}

function getSamplePreferenceScore(sample) {
  const limitId = sample?.rate_limits?.limit_id;

  if (!limitId || limitId === 'codex') {
    return 3;
  }

  if (String(limitId).startsWith('codex_')) {
    return 2;
  }

  return 1;
}

function pickPreferredSample(currentSample, nextSample) {
  if (!currentSample) {
    return nextSample;
  }

  if (!nextSample) {
    return currentSample;
  }

  const timestampDiff = nextSample.timestamp_ms - currentSample.timestamp_ms;
  if (Math.abs(timestampDiff) > SAMPLE_PREFERENCE_WINDOW_MS) {
    return timestampDiff > 0 ? nextSample : currentSample;
  }

  const scoreDiff = getSamplePreferenceScore(nextSample) - getSamplePreferenceScore(currentSample);
  if (scoreDiff !== 0) {
    return scoreDiff > 0 ? nextSample : currentSample;
  }

  return timestampDiff >= 0 ? nextSample : currentSample;
}

function extractSampleFromLine(line, filePath) {
  const record = safeParseJson(line);
  if (!record || record.type !== 'event_msg') {
    return null;
  }

  if (record.payload?.type !== 'token_count') {
    return null;
  }

  return buildSampleFromRecord(record, filePath);
}

function extractLatestSampleFromFile(filePath) {
  let content;

  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }

  const lines = content.split('\n');
  let bestSample = null;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const sample = extractSampleFromLine(lines[index], filePath);
    if (!sample) {
      continue;
    }
    bestSample = pickPreferredSample(bestSample, sample);
  }

  return bestSample;
}

/**
 * 读取最新的 Codex 限额样本
 * @param {{maxFiles?: number}} options - 读取选项
 * @returns {Promise<object | null>}
 */
export async function findLatestRateLimitSample(options = {}) {
  if (!fs.existsSync(SESSIONS_DIR)) {
    return null;
  }

  const maxFiles = Number.isFinite(Number(options.maxFiles)) ? Number(options.maxFiles) : 20;
  const files = await fg('**/*.jsonl', {
    cwd: SESSIONS_DIR,
    absolute: true,
    onlyFiles: true
  });

  const latestFiles = files
    .map((filePath) => {
      try {
        return {
          path: filePath,
          mtime_ms: fs.statSync(filePath).mtimeMs
        };
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.mtime_ms - left.mtime_ms)
    .slice(0, maxFiles);

  let bestSample = null;

  for (const fileInfo of latestFiles) {
    const fileSample = extractLatestSampleFromFile(fileInfo.path);
    bestSample = pickPreferredSample(bestSample, fileSample);
  }

  return bestSample;
}

/**
 * 判断样本是否属于当前激活账号
 * @param {object | null} sample - 限额样本
 * @param {object | null} state - 当前状态
 * @returns {boolean}
 */
export function isSampleCurrentForState(sample, state) {
  if (!sample || !state?.updated_at) {
    return Boolean(sample);
  }

  const updatedAtMs = toTimestampMs(state.updated_at);
  if (!updatedAtMs) {
    return Boolean(sample);
  }

  return sample.timestamp_ms >= updatedAtMs - 1000;
}

/**
 * 判断限额快照是否匹配当前激活账号状态
 * @param {object | null} snapshot - 限额快照
 * @param {object | null} state - 当前状态
 * @returns {boolean}
 */
export function isSnapshotCurrentForState(snapshot, state) {
  if (!snapshot?.sampled_at) {
    return false;
  }

  return isSampleCurrentForState({
    timestamp: snapshot.sampled_at,
    timestamp_ms: toTimestampMs(snapshot.sampled_at)
  }, state);
}

function formatDurationPart(value, suffix) {
  return value > 0 ? `${value}${suffix}` : null;
}

/**
 * 格式化重置时间
 * @param {number | null} resetAt - Unix 秒级时间戳
 * @returns {string}
 */
export function formatResetAt(resetAt) {
  if (!resetAt) {
    return '-';
  }

  return new Date(resetAt * 1000).toLocaleString('zh-CN', {
    hour12: false
  });
}

/**
 * 格式化剩余时间
 * @param {number | null} resetAt - Unix 秒级时间戳
 * @returns {string}
 */
export function formatRemaining(resetAt) {
  if (!resetAt) {
    return '-';
  }

  const diffMs = resetAt * 1000 - Date.now();
  if (diffMs <= 0) {
    return '已重置';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return [
    formatDurationPart(days, 'd'),
    formatDurationPart(hours, 'h'),
    formatDurationPart(minutes, 'm')
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * 计算窗口的剩余百分比
 * @param {object | null} windowInfo - 限额窗口
 * @returns {number | null}
 */
export function getRemainingPercent(windowInfo) {
  if (!windowInfo || windowInfo.used_percent == null) {
    return null;
  }

  return clampPercent(100 - Number(windowInfo.used_percent));
}

function getCodexExecutable() {
  if (process.env.CODEX_BIN) {
    return process.env.CODEX_BIN;
  }

  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

function getCredentialFilePath(credential, credentialsDir) {
  if (!credential?.path) {
    return null;
  }

  return path.isAbsolute(credential.path)
    ? credential.path
    : path.join(credentialsDir, credential.path);
}

function hydrateCredentialIdentity(credentialData) {
  if (!credentialData || typeof credentialData !== 'object') {
    return null;
  }

  const nextData = {
    ...credentialData,
    type: credentialData.type || 'codex'
  };

  if (typeof nextData.id_token === 'string' && nextData.id_token) {
    try {
      const userInfo = extractUserInfo(nextData.id_token);
      if (userInfo.email) {
        nextData.email = userInfo.email;
      }
      if (userInfo.accountId) {
        nextData.account_id = userInfo.accountId;
      }
      if (userInfo.planType) {
        nextData.plan = userInfo.planType;
      }
    } catch (err) {
      // 忽略无法解析的 token，保留已有字段
    }
  }

  return nextData;
}

function mergeTargetAuthIntoCredential(credentialData, targetAuth) {
  if (!targetAuth || typeof targetAuth !== 'object') {
    return {
      data: hydrateCredentialIdentity(credentialData),
      changed: false
    };
  }

  const nextData = {
    ...(credentialData || {})
  };
  const tokens = targetAuth.tokens || {};
  let changed = false;

  for (const field of ['id_token', 'access_token', 'refresh_token', 'account_id']) {
    if (typeof tokens[field] === 'string' && tokens[field] && tokens[field] !== nextData[field]) {
      nextData[field] = tokens[field];
      changed = true;
    }
  }

  if (typeof targetAuth.last_refresh === 'string' && targetAuth.last_refresh && targetAuth.last_refresh !== nextData.last_refresh) {
    nextData.last_refresh = targetAuth.last_refresh;
    changed = true;
  }

  return {
    data: hydrateCredentialIdentity(nextData),
    changed
  };
}

function hasCredentialChanges(currentData, nextData) {
  const fields = [
    'email',
    'plan',
    'team_space',
    'id_token',
    'access_token',
    'refresh_token',
    'account_id',
    'last_refresh',
    'expired'
  ];

  return fields.some((field) => {
    const currentValue = currentData?.[field] ?? null;
    const nextValue = nextData?.[field] ?? null;
    return currentValue !== nextValue;
  });
}

function syncCacheCredential(credentialPath, nextData) {
  if (!credentialPath) {
    return;
  }

  const cache = loadCache();
  let changed = false;
  const nextCache = cache.map((item) => {
    if (item.path !== credentialPath) {
      return item;
    }

    changed = true;
    return {
      ...item,
      email: nextData.email || item.email || null,
      plan: nextData.plan || item.plan || null,
      team_space: nextData.team_space || item.team_space || null,
      id_token: nextData.id_token || null,
      access_token: nextData.access_token || null,
      refresh_token: nextData.refresh_token || null,
      account_id: nextData.account_id || null,
      last_refresh: nextData.last_refresh || null,
      expired: nextData.expired ?? item.expired ?? null
    };
  });

  if (changed) {
    saveCache(nextCache);
  }
}

function persistCredentialData(credential, credentialFilePath, nextData, options = {}) {
  const currentData = readJsonFile(credentialFilePath) || {};
  const mergedData = hydrateCredentialIdentity({
    ...currentData,
    ...nextData,
    path: undefined
  });

  if (hasCredentialChanges(currentData, mergedData)) {
    writeJsonFile(credentialFilePath, mergedData);
  }

  syncCacheCredential(credential?.path || null, mergedData);

  if (options.isCurrent && options.targetFile) {
    updateTargetJson(options.targetFile, mergedData, false);
  }
}

async function refreshTokensWithRefreshToken(refreshToken, timeoutMs = TOKEN_REFRESH_TIMEOUT_MS) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: OAUTH_CONFIG.clientId,
    refresh_token: refreshToken
  }).toString();
  const response = await requestJson(OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    timeoutMs,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  return response.body;
}

async function requestUsagePayload(credentialData, timeoutMs = SAMPLE_USAGE_TIMEOUT_MS) {
  if (!credentialData?.access_token || !credentialData?.account_id) {
    throw new Error('凭据缺少 access_token 或 account_id，无法请求 /usage');
  }

  const response = await requestJson(USAGE_URL, {
    method: 'GET',
    timeoutMs,
    headers: {
      Authorization: `Bearer ${credentialData.access_token}`,
      'ChatGPT-Account-Id': credentialData.account_id,
      Accept: 'application/json',
      'User-Agent': 'Codex CLI'
    }
  });

  return response.body;
}

function isRetryableUsageError(error) {
  const statusCode = Number(error?.statusCode || 0) || 0;
  const message = String(error?.message || '').toLowerCase();

  if (statusCode === 403 && message.includes('cloudflare challenge')) {
    return true;
  }

  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return /timeout|timed out|超时|econnreset|socket hang up|eai_again|network/i.test(message);
}

async function requestUsagePayloadWithRetry(credentialData, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(1500, Number(options.timeoutMs))
    : SAMPLE_USAGE_TIMEOUT_MS;
  const maxAttempts = Number.isFinite(Number(options.maxAttempts))
    ? Math.max(1, Number(options.maxAttempts))
    : 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestUsagePayload(credentialData, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableUsageError(error)) {
        throw error;
      }

      const delayMs = 200 * attempt * attempt + Math.floor(Math.random() * 120);
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('请求 /usage 失败');
}

/**
 * 通过官方 /usage 接口拉取某个账号的最新限额
 * @param {object} credential - 凭据对象
 * @param {{credentialsDir?: string, targetFile?: string, isCurrent?: boolean, timeoutMs?: number}} options - 拉取选项
 * @returns {Promise<{sample: object | null, refreshed: boolean, payload: object | null}>}
 */
export async function fetchCredentialUsageSample(credential, options = {}) {
  if (!credential?.path) {
    return {
      sample: null,
      refreshed: false,
      payload: null
    };
  }

  const credentialsDir = options.credentialsDir || path.join(os.homedir(), '.zjjauth');
  const credentialFilePath = getCredentialFilePath(credential, credentialsDir);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(1500, Number(options.timeoutMs))
    : SAMPLE_USAGE_TIMEOUT_MS;
  const maxAttempts = Number.isFinite(Number(options.maxAttempts))
    ? Math.max(1, Number(options.maxAttempts))
    : 3;
  const storedData = hydrateCredentialIdentity(readJsonFile(credentialFilePath) || {
    ...credential,
    type: credential.type || 'codex'
  });
  let credentialData = storedData;
  let shouldPersist = false;

  if (options.isCurrent && options.targetFile) {
    const merged = mergeTargetAuthIntoCredential(credentialData, readJsonFile(options.targetFile));
    credentialData = merged.data;
    shouldPersist = merged.changed;
  }

  let payload;
  let refreshed = false;

  try {
    payload = await requestUsagePayloadWithRetry(credentialData, {
      timeoutMs,
      maxAttempts
    });
  } catch (err) {
    if (err?.statusCode !== 401 || !credentialData?.refresh_token) {
      throw err;
    }

    const refreshedTokens = await refreshTokensWithRefreshToken(credentialData.refresh_token, TOKEN_REFRESH_TIMEOUT_MS);
    credentialData = hydrateCredentialIdentity({
      ...credentialData,
      id_token: refreshedTokens.id_token || credentialData.id_token,
      access_token: refreshedTokens.access_token || credentialData.access_token,
      refresh_token: refreshedTokens.refresh_token || credentialData.refresh_token,
      last_refresh: new Date().toISOString(),
      expired: false
    });
    refreshed = true;
    shouldPersist = true;
    payload = await requestUsagePayloadWithRetry(credentialData, {
      timeoutMs,
      maxAttempts
    });
  }

  if (payload?.email && payload.email !== credentialData.email) {
    credentialData.email = payload.email;
    shouldPersist = true;
  }

  if (payload?.account_id && payload.account_id !== credentialData.account_id) {
    credentialData.account_id = payload.account_id;
    shouldPersist = true;
  }

  if (payload?.plan_type && payload.plan_type !== credentialData.plan) {
    credentialData.plan = payload.plan_type;
    shouldPersist = true;
  }

  if (shouldPersist) {
    persistCredentialData(credential, credentialFilePath, credentialData, options);
  }

  return {
    sample: buildSampleFromUsagePayload(payload, refreshed ? 'usage+refresh' : 'usage'),
    refreshed,
    payload
  };
}

/**
 * 后台发起一次最小化 Codex 请求，用于刷新当前账号限额样本
 * @param {{cwd?: string, timeoutMs?: number, prompt?: string}} options - 探测选项
 * @returns {Promise<object | null>}
 */
export async function probeRateLimitSample(options = {}) {
  const cwd = options.cwd || process.cwd() || os.homedir();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(5000, Number(options.timeoutMs))
    : SAMPLE_PROBE_TIMEOUT_MS;
  const prompt = options.prompt || 'Reply with exactly OK.';
  const codexBin = getCodexExecutable();
  const args = [
    '-a', 'never',
    '-s', 'read-only',
    '-C', cwd,
    'exec',
    '--skip-git-repo-check',
    '--color', 'never',
    '--json',
    '--ephemeral',
    prompt
  ];

  return new Promise((resolve) => {
    let stdoutBuffer = '';
    let settled = false;
    let latestSample = null;
    let killTimer = null;
    const child = spawn(codexBin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0'
      }
    });

    function finish(value) {
      if (settled) {
        return;
      }

      settled = true;

      if (killTimer) {
        clearTimeout(killTimer);
      }

      resolve(value);
    }

    function consumeLine(line) {
      const record = safeParseJson(line.trim());
      if (!record || record.type !== 'event_msg' || record.payload?.type !== 'token_count') {
        return;
      }

      latestSample = buildSampleFromRecord(record, 'probe');
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        consumeLine(line);
      }
    });

    child.stderr.on('data', () => {
      // 主动消费 stderr，避免 warning 堵塞子进程管道
    });

    child.on('error', () => {
      finish(null);
    });

    child.on('close', async () => {
      if (stdoutBuffer.trim()) {
        consumeLine(stdoutBuffer);
      }

      if (latestSample) {
        finish(latestSample);
        return;
      }

      const fallbackSample = await findLatestRateLimitSample({ maxFiles: 8 });
      finish(fallbackSample);
    });

    killTimer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 1500);
    }, timeoutMs);
  });
}

/**
 * 判断窗口是否已经耗尽
 * @param {object | null} windowInfo - 限额窗口
 * @param {number} threshold - 触发阈值
 * @returns {boolean}
 */
export function isWindowExhausted(windowInfo, threshold = 100) {
  if (!windowInfo || windowInfo.used_percent == null) {
    return false;
  }

  if (windowInfo.used_percent < threshold) {
    return false;
  }

  if (!windowInfo.resets_at) {
    return true;
  }

  return windowInfo.resets_at * 1000 > Date.now();
}

/**
 * 获取当前已耗尽的窗口标签
 * @param {object | null} rateLimits - 限额数据
 * @param {number} threshold - 触发阈值
 * @returns {string[]}
 */
export function getActiveExhaustedWindows(rateLimits, threshold = 100) {
  const windows = [];

  if (isWindowExhausted(rateLimits?.primary, threshold)) {
    windows.push('5H');
  }

  if (isWindowExhausted(rateLimits?.secondary, threshold)) {
    windows.push('WEEK');
  }

  return windows;
}

/**
 * 生成限额详情表格数据
 * @param {object | null} rateLimits - 限额数据
 * @param {number} threshold - 触发阈值
 * @returns {Array<Array<string>>}
 */
export function buildLimitDetailRows(rateLimits, threshold = 100) {
  const rows = [
    ['5H', rateLimits?.primary],
    ['WEEK', rateLimits?.secondary]
  ];

  return rows.map(([label, windowInfo]) => {
    const exhausted = isWindowExhausted(windowInfo, threshold);

    return [
      label,
      getRemainingPercent(windowInfo) == null ? '-' : `${getRemainingPercent(windowInfo).toFixed(0)}% left`,
      formatResetAt(windowInfo?.resets_at || null),
      formatRemaining(windowInfo?.resets_at || null),
      exhausted ? '已耗尽' : '正常'
    ];
  });
}

/**
 * 更新某个凭据的限额缓存
 * @param {object} limitCache - 旧缓存
 * @param {object} credential - 凭据对象
 * @param {object} sample - 最新样本
 * @returns {object}
 */
export function recordCredentialLimit(limitCache, credential, sample) {
  if (!credential?.path || !sample?.rate_limits) {
    return limitCache || {};
  }

  return {
    ...(limitCache || {}),
    [credential.path]: {
      credential_path: credential.path,
      email: credential.email || null,
      account_id: credential.account_id || null,
      updated_at: new Date().toISOString(),
      sampled_at: sample.timestamp,
      session_path: sample.session_path,
      status: 'ok',
      error_message: null,
      rate_limits: sample.rate_limits
    }
  };
}

export function recordCredentialFailure(limitCache, credential, error, options = {}) {
  if (!credential?.path) {
    return limitCache || {};
  }

  const statusCode = Number(error?.statusCode || error?.code || 0) || null;
  const errorMessage = String(error?.message || '').trim() || null;
  const isInvalid = statusCode === 401
    || /deactivated|revoked|unauthorized|unauthenticated/i.test(errorMessage || '');

  return {
    ...(limitCache || {}),
    [credential.path]: {
      credential_path: credential.path,
      email: credential.email || null,
      account_id: credential.account_id || null,
      updated_at: new Date().toISOString(),
      sampled_at: options.sampledAt || null,
      session_path: options.sessionPath || null,
      status: isInvalid ? 'invalid' : 'error',
      error_message: errorMessage,
      rate_limits: null
    }
  };
}

function normalizePlanType(value) {
  if (!value) {
    return null;
  }

  return String(value).trim().toLowerCase();
}

function isTeamCredential(credential) {
  return Boolean(credential?.team_space) || normalizePlanType(credential?.plan) === 'team';
}

function isSnapshotCompatibleWithCredential(snapshot, credential) {
  if (!snapshot || !credential) {
    return Boolean(snapshot);
  }

  const snapshotPlanType = normalizePlanType(snapshot?.rate_limits?.plan_type);
  if (!snapshotPlanType) {
    return true;
  }

  if (isTeamCredential(credential)) {
    return snapshotPlanType === 'team';
  }

  return snapshotPlanType !== 'team';
}

/**
 * 删除某个凭据的限额缓存
 * @param {object} limitCache - 旧缓存
 * @param {string} credentialPath - 凭据路径
 * @returns {object}
 */
export function removeCredentialLimit(limitCache, credentialPath) {
  if (!credentialPath || !limitCache?.[credentialPath]) {
    return limitCache || {};
  }

  const nextCache = { ...(limitCache || {}) };
  delete nextCache[credentialPath];
  return nextCache;
}

/**
 * 获取凭据的限额快照
 * @param {object} limitCache - 限额缓存
 * @param {object} credential - 凭据对象
 * @returns {object | null}
 */
export function getCredentialLimitSnapshot(limitCache, credential) {
  if (!credential?.path) {
    return null;
  }

  const snapshot = limitCache?.[credential.path] || null;
  if (!snapshot) {
    return null;
  }

  return isSnapshotCompatibleWithCredential(snapshot, credential) ? snapshot : null;
}

function getWindowRemainderList(rateLimits) {
  return [
    ['5H', getRemainingPercent(rateLimits?.primary)],
    ['WEEK', getRemainingPercent(rateLimits?.secondary)]
  ];
}

export function getCredentialHealth(snapshot, minRemainingPercent = LOW_REMAINING_PERCENT_THRESHOLD) {
  if (!snapshot) {
    return {
      state: 'unknown',
      score: -1,
      windows: []
    };
  }

  if (snapshot.status === 'invalid') {
    return {
      state: 'invalid',
      score: -1,
      windows: [],
      message: snapshot.error_message || '凭据已失效'
    };
  }

  if (snapshot.status === 'error') {
    return {
      state: 'error',
      score: -1,
      windows: [],
      message: snapshot.error_message || '请求失败'
    };
  }

  if (!snapshot?.rate_limits) {
    return {
      state: 'unknown',
      score: -1,
      windows: []
    };
  }

  const windowRemainders = getWindowRemainderList(snapshot.rate_limits);
  const missingWindow = windowRemainders.some(([, value]) => value == null);
  if (missingWindow) {
    return {
      state: 'unknown',
      score: -1,
      windows: []
    };
  }

  const exhaustedWindows = windowRemainders
    .filter(([, value]) => value <= 0)
    .map(([label]) => label);
  if (exhaustedWindows.length > 0) {
    return {
      state: 'exhausted',
      score: 0,
      windows: exhaustedWindows
    };
  }

  const lowWindows = windowRemainders
    .filter(([, value]) => value < minRemainingPercent)
    .map(([label]) => label);
  if (lowWindows.length > 0) {
    return {
      state: 'low',
      score: 1,
      windows: lowWindows
    };
  }

  const remainingValues = windowRemainders.map(([, value]) => value);
  const minRemaining = Math.min(...remainingValues);
  const totalRemaining = remainingValues.reduce((sum, value) => sum + value, 0);

  return {
    state: 'healthy',
    score: minRemaining * 1000 + totalRemaining,
    windows: []
  };
}

/**
 * 静默刷新限额缓存，用于主菜单后台预热
 * @param {{config?: object, currentTimeoutMs?: number, otherTimeoutMs?: number}} options - 刷新选项
 * @returns {Promise<{limitCache: object, refreshedCount: number, failedCount: number}>}
 */
export async function refreshLimitCacheSilently(options = {}) {
  const config = options.config || loadConfig();
  if (!config?.fromDir) {
    return {
      limitCache: {},
      refreshedCount: 0,
      failedCount: 0
    };
  }

  const credentials = loadCache();
  if (credentials.length === 0) {
    return {
      limitCache: loadLimitCache(),
      refreshedCount: 0,
      failedCount: 0
    };
  }

  const state = loadState();
  let limitCache = loadLimitCache();
  let refreshedCount = 0;
  let failedCount = 0;
  let changed = false;
  const currentTimeoutMs = Number.isFinite(Number(options.currentTimeoutMs))
    ? Math.max(2000, Number(options.currentTimeoutMs))
    : 8000;
  const otherTimeoutMs = Number.isFinite(Number(options.otherTimeoutMs))
    ? Math.max(2000, Number(options.otherTimeoutMs))
    : 8000;
  const currentCredential = credentials.find((credential) => credential.index === state?.current_index) || null;
  let latestCurrentSamplePromise = null;

  function recordResult(credential, sample) {
    limitCache = recordCredentialLimit(limitCache, credential, sample);
    refreshedCount += 1;
    changed = true;
  }

  async function getLatestCurrentSample() {
    if (!latestCurrentSamplePromise) {
      latestCurrentSamplePromise = findLatestRateLimitSample({ maxFiles: 8 });
    }

    return latestCurrentSamplePromise;
  }

  await Promise.allSettled(
    credentials.map(async (credential) => {
      try {
        const result = await fetchCredentialUsageSample(credential, {
          credentialsDir: config.fromDir,
          targetFile: config.targetFile,
          isCurrent: credential.index === currentCredential?.index,
          timeoutMs: credential.index === currentCredential?.index
            ? currentTimeoutMs
            : otherTimeoutMs
        });

        if (result?.sample) {
          recordResult(credential, result.sample);
        } else {
          if (credential.index === currentCredential?.index) {
            const fallbackSample = await getLatestCurrentSample();
            if (fallbackSample && isSampleCurrentForState(fallbackSample, state)) {
              recordResult(credential, fallbackSample);
              return;
            }
          }
          failedCount += 1;
        }
      } catch (err) {
        if (credential.index === currentCredential?.index) {
          const fallbackSample = await getLatestCurrentSample();
          if (fallbackSample && isSampleCurrentForState(fallbackSample, state)) {
            recordResult(credential, fallbackSample);
            return;
          }
        }
        failedCount += 1;
      }
    })
  );

  if (changed) {
    saveLimitCache(limitCache);
  }

  return {
    limitCache,
    refreshedCount,
    failedCount
  };
}

/**
 * 在主菜单等待期间启动静默自动刷新
 * @param {{config?: object, intervalMs?: number, currentTimeoutMs?: number, otherTimeoutMs?: number}} options - 自动刷新选项
 * @returns {() => void} 停止函数
 */
export function startLimitCacheAutoRefresh(options = {}) {
  const config = options.config || loadConfig();
  if (!config?.fromDir) {
    return () => {};
  }

  const intervalMs = Number.isFinite(Number(options.intervalMs))
    ? Math.max(10000, Number(options.intervalMs))
    : MENU_AUTO_REFRESH_INTERVAL_MS;
  let stopped = false;
  let running = false;
  let timer = null;

  async function runCycle() {
    if (stopped || running) {
      return;
    }

    running = true;

    try {
      await refreshLimitCacheSilently({
        config,
        currentTimeoutMs: options.currentTimeoutMs,
        otherTimeoutMs: options.otherTimeoutMs
      });
    } catch (err) {
      // 主菜单后台预热不应打断交互
    } finally {
      running = false;
    }
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * 读取日志文件大小
 * @returns {number}
 */
export function getLogCursorAtEnd() {
  try {
    return fs.statSync(LOG_FILE).size;
  } catch (err) {
    return 0;
  }
}

function isQuotaLogLine(line) {
  if (!line || line.includes('api.github.com/repos/openai/codex/releases/latest')) {
    return false;
  }

  const patterns = [
    /(turn error|unexpected status)\s+429/i,
    /usage limit/i,
    /(chatgpt\.com\/backend-api\/codex).*?(rate limit|quota|429)/i,
    /codex.*(limit reached|quota exceeded)/i
  ];

  return patterns.some((pattern) => pattern.test(line));
}

/**
 * 读取新增的限额相关日志
 * @param {number} previousCursor - 上一次读取位置
 * @returns {{next_cursor: number, matches: string[]}}
 */
export function readQuotaLogUpdates(previousCursor = 0) {
  let stat;

  try {
    stat = fs.statSync(LOG_FILE);
  } catch (err) {
    return {
      next_cursor: 0,
      matches: []
    };
  }

  const startOffset = previousCursor > stat.size ? 0 : previousCursor;
  const length = stat.size - startOffset;
  if (length <= 0) {
    return {
      next_cursor: stat.size,
      matches: []
    };
  }

  const buffer = Buffer.alloc(length);
  const fileDescriptor = fs.openSync(LOG_FILE, 'r');

  try {
    fs.readSync(fileDescriptor, buffer, 0, length, startOffset);
  } finally {
    fs.closeSync(fileDescriptor);
  }

  const matches = buffer
    .toString('utf-8')
    .split('\n')
    .filter((line) => isQuotaLogLine(line.trim()));

  return {
    next_cursor: stat.size,
    matches
  };
}
