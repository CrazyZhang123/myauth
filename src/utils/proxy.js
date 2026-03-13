import chalk from 'chalk';
import { loadConfig, saveConfig } from './config.js';
import { question } from './prompt.js';

const DEFAULT_PROXY_HOST = '127.0.0.1';
const DEFAULT_PROXY_PORT = '7890';
let proxyPrompted = false;

function buildProxyUrl(host, port) {
  return `http://${host}:${port}`;
}

function setProxyEnv(proxyUrl) {
  process.env.HTTPS_PROXY = proxyUrl;
  process.env.https_proxy = proxyUrl;
  process.env.HTTP_PROXY = proxyUrl;
  process.env.http_proxy = proxyUrl;
}

function clearProxyEnv() {
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  delete process.env.HTTP_PROXY;
  delete process.env.http_proxy;
}

function parseBooleanAnswer(answer, defaultValue) {
  const normalized = String(answer || '').trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (normalized === 'y' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'n' || normalized === 'no') {
    return false;
  }

  return null;
}

function isValidPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function applyProxyConfig(config) {
  if (config?.proxyEnabled) {
    const host = config.proxyHost || DEFAULT_PROXY_HOST;
    const port = config.proxyPort || DEFAULT_PROXY_PORT;
    setProxyEnv(buildProxyUrl(host, port));
    return;
  }

  clearProxyEnv();
}

export async function ensureProxyConfigInteractive() {
  const currentConfig = loadConfig();

  if (proxyPrompted) {
    applyProxyConfig(currentConfig);
    return currentConfig;
  }

  proxyPrompted = true;
  const defaultEnabled = currentConfig.proxyEnabled === true;
  const answerHint = defaultEnabled ? 'Y/n' : 'y/N';
  let proxyEnabled = null;

  while (proxyEnabled == null) {
    const answer = await question(
      chalk.cyan(`🌐 启动前检查代理：是否使用本地代理？ [${answerHint}] `)
    );
    proxyEnabled = parseBooleanAnswer(answer, defaultEnabled);
    if (proxyEnabled == null) {
      console.log(chalk.red('❌ 请输入 y 或 n'));
    }
  }

  const nextConfig = {
    ...currentConfig,
    proxyEnabled,
    proxyHost: currentConfig.proxyHost || DEFAULT_PROXY_HOST,
    proxyPort: currentConfig.proxyPort || DEFAULT_PROXY_PORT
  };

  if (proxyEnabled) {
    while (true) {
      const portInput = await question(
        chalk.cyan(`🔌 请输入代理端口 [${nextConfig.proxyPort || DEFAULT_PROXY_PORT}] `)
      );
      const port = portInput || nextConfig.proxyPort || DEFAULT_PROXY_PORT;
      if (!isValidPort(port)) {
        console.log(chalk.red('❌ 端口必须是 1-65535 的整数'));
        continue;
      }

      nextConfig.proxyPort = String(port);
      break;
    }

    saveConfig(nextConfig);
    applyProxyConfig(nextConfig);
    console.log(chalk.gray(`🌐 已启用代理: ${buildProxyUrl(nextConfig.proxyHost, nextConfig.proxyPort)}`));
    return nextConfig;
  }

  saveConfig(nextConfig);
  applyProxyConfig(nextConfig);
  console.log(chalk.gray('🌐 本次启动不使用代理'));
  return nextConfig;
}
