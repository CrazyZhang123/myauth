import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDefaultCodexTargetFile, getDefaultOpenCodeTargetFile } from './targets.js';

const CONFIG_DIR = path.join(os.homedir(), '.zjjauth');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CACHE_FILE = path.join(CONFIG_DIR, 'cache.json');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const LIMITS_FILE = path.join(CONFIG_DIR, 'limits.json');
const DEFAULT_CONFIG = Object.freeze({
  fromDir: CONFIG_DIR,
  targetFile: getDefaultCodexTargetFile(),
  opencodeTargetFile: getDefaultOpenCodeTargetFile(),
  proxyEnabled: false,
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
});

function normalizeConfig(config) {
  const nextConfig = (config && typeof config === 'object') ? config : {};
  const proxyPort = String(nextConfig.proxyPort || DEFAULT_CONFIG.proxyPort).trim();
  return {
    fromDir: nextConfig.fromDir || DEFAULT_CONFIG.fromDir,
    targetFile: nextConfig.targetFile || DEFAULT_CONFIG.targetFile,
    opencodeTargetFile: nextConfig.opencodeTargetFile || DEFAULT_CONFIG.opencodeTargetFile,
    proxyEnabled: nextConfig.proxyEnabled === true,
    proxyHost: String(nextConfig.proxyHost || DEFAULT_CONFIG.proxyHost).trim() || DEFAULT_CONFIG.proxyHost,
    proxyPort: /^\d{1,5}$/.test(proxyPort) ? proxyPort : DEFAULT_CONFIG.proxyPort
  };
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const recentIndexes = Array.isArray(state.recent_indexes)
    ? [...new Set(state.recent_indexes.filter((index) => typeof index === 'string' && index))]
    : [];

  return {
    current_index: state.current_index || null,
    updated_at: state.updated_at || null,
    recent_indexes: recentIndexes.slice(0, 3)
  };
}

// 确保配置目录存在
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function ensureParentDir(filePath) {
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
}

export function getDefaultConfig() {
  return { ...DEFAULT_CONFIG };
}

export function getConfigPaths() {
  return {
    configDir: CONFIG_DIR,
    configFile: CONFIG_FILE,
    cacheFile: CACHE_FILE,
    stateFile: STATE_FILE,
    limitsFile: LIMITS_FILE
  };
}

export function ensureRuntimeDirs() {
  ensureConfigDir();
}

// 读取配置
export function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return getDefaultConfig();
    }
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return normalizeConfig(JSON.parse(data));
  } catch (err) {
    return getDefaultConfig();
  }
}

// 保存配置
export function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(normalizeConfig(config), null, 2), 'utf-8');
}

// 读取缓存
export function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return [];
    }
    const data = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// 保存缓存
export function saveCache(cache) {
  ensureConfigDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

// 读取状态
export function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return null;
    }
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    return normalizeState(JSON.parse(data));
  } catch (err) {
    return null;
  }
}

// 保存状态
export function saveState(state) {
  ensureConfigDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(normalizeState(state), null, 2), 'utf-8');
}

// 读取限额缓存
export function loadLimitCache() {
  try {
    if (!fs.existsSync(LIMITS_FILE)) {
      return {};
    }
    const data = fs.readFileSync(LIMITS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

// 保存限额缓存
export function saveLimitCache(limitCache) {
  ensureConfigDir();
  fs.writeFileSync(LIMITS_FILE, JSON.stringify(limitCache, null, 2), 'utf-8');
}
