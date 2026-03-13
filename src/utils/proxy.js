import chalk from 'chalk';
import { loadConfig, saveConfig } from './config.js';
import { question } from './prompt.js';

const DEFAULT_PROXY_HOST = '127.0.0.1';
const DEFAULT_PROXY_PORT = '7890';
let proxyPrompted = false;

function getProxyPlatformMeta() {
  switch (process.platform) {
    case 'win32':
      return {
        name: 'Windows',
        hint: '常见本地 HTTP 代理端口：Clash Verge / v2rayN 多为 7890 或 7897'
      };
    case 'darwin':
      return {
        name: 'macOS',
        hint: '常见本地 HTTP 代理端口：ClashX / Clash Verge 多为 7890，Surge 常见 6152'
      };
    default:
      return {
        name: 'Linux',
        hint: '常见本地 HTTP 代理端口：clash / mihomo 多为 7890 或 7897'
      };
  }
}

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

export function buildProxyEnablePrompt(defaultEnabled, allowBack = false) {
  const meta = getProxyPlatformMeta();
  const answerHint = defaultEnabled ? 'Y/n' : 'y/N';
  const backHint = allowBack ? '，b 返回' : '';
  return `🌐 是否启用 ${meta.name} 本地代理？ [${answerHint}${backHint}] `;
}

export function buildProxyPortPrompt(defaultPort, allowBack = false) {
  const meta = getProxyPlatformMeta();
  const backHint = allowBack ? '，b 返回' : '';
  return `🔌 请输入 ${meta.name} 本地 HTTP 代理端口 [${defaultPort}${backHint}] `;
}

export function printProxyPortHint() {
  const meta = getProxyPlatformMeta();
  console.log(chalk.gray(`💡 ${meta.hint}`));
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
  let proxyEnabled = null;

  while (proxyEnabled == null) {
    const answer = await question(chalk.cyan(buildProxyEnablePrompt(defaultEnabled)));
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
    printProxyPortHint();
    while (true) {
      const portInput = await question(chalk.cyan(
        buildProxyPortPrompt(nextConfig.proxyPort || DEFAULT_PROXY_PORT)
      ));
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
