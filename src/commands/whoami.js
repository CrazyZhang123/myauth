import chalk from 'chalk';
import { loadConfig, saveConfig, loadCache, saveCache, loadState } from '../utils/config.js';
import { question, isBackCommand } from '../utils/prompt.js';
import { scanCredentials } from '../utils/scanner.js';
import { resolvePath, getDefaultPaths, formatPath } from '../utils/path.js';
import {
  applyProxyConfig,
  buildProxyEnablePrompt,
  buildProxyPortPrompt,
  printProxyPortHint
} from '../utils/proxy.js';
import { printMenuPageHeader } from '../utils/ui.js';
import fs from 'fs';
import path from 'path';

async function askBoolean(prompt, defaultValue) {
  while (true) {
    const answer = (await question(prompt)).trim().toLowerCase();

    if (isBackCommand(answer)) {
      return null;
    }

    if (!answer) {
      return defaultValue;
    }

    if (answer === 'y' || answer === 'yes') {
      return true;
    }

    if (answer === 'n' || answer === 'no') {
      return false;
    }

    console.log(chalk.red('❌ 请输入 y 或 n'));
  }
}

async function askProxyConfig(config) {
  const proxyEnabled = await askBoolean(
    chalk.cyan(buildProxyEnablePrompt(config.proxyEnabled, true)),
    config.proxyEnabled
  );
  if (proxyEnabled == null) {
    return null;
  }

  const nextProxy = {
    proxyEnabled,
    proxyHost: config.proxyHost || '127.0.0.1',
    proxyPort: config.proxyPort || '7890'
  };

  if (!proxyEnabled) {
    return nextProxy;
  }

  printProxyPortHint();
  while (true) {
    const portInput = await question(chalk.cyan(buildProxyPortPrompt(nextProxy.proxyPort, true)));
    if (isBackCommand(portInput)) {
      return null;
    }

    const proxyPort = String(portInput || nextProxy.proxyPort).trim();
    const port = Number(proxyPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.log(chalk.red('❌ 端口必须是 1-65535 的整数'));
      continue;
    }

    nextProxy.proxyPort = proxyPort;
    return nextProxy;
  }
}

export async function whoami() {
  console.clear();
  printMenuPageHeader('3', '配置管理');
  const config = loadConfig();

  if (!config) {
    // 首次配置：交互式引导
    console.log(chalk.cyan.bold('🎉 欢迎使用 zjjauth！') + chalk.gray('首次使用需要配置。\n'));
    
    const defaults = getDefaultPaths();
    
    console.log(chalk.gray(`📁 默认凭据目录: ${formatPath(defaults.oauthDir)}`));
    console.log(chalk.gray(`📄 默认目标文件: ${formatPath(defaults.targetFile)}\n`));
    
    const fromDirInput = await question(chalk.cyan(`请输入凭据源目录路径 (默认: ${formatPath(defaults.oauthDir)}，b 返回): `));
    if (isBackCommand(fromDirInput)) {
      return 'back';
    }
    const fromDir = resolvePath(fromDirInput || defaults.oauthDir);
    
    // 自动创建目录（如果不存在）
    if (!fs.existsSync(fromDir)) {
      fs.mkdirSync(fromDir, { recursive: true });
    }

    const targetFileInput = await question(chalk.cyan(`请输入目标 JSON 文件路径 (默认: ${formatPath(defaults.targetFile)}，b 返回): `));
    if (isBackCommand(targetFileInput)) {
      return 'back';
    }
    const targetFile = resolvePath(targetFileInput || defaults.targetFile);
    
    // 自动创建目标文件的父目录
    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 保存配置
    const newConfig = { 
      fromDir, 
      targetFile,
      proxyEnabled: config.proxyEnabled,
      proxyHost: config.proxyHost,
      proxyPort: config.proxyPort
    };
    saveConfig(newConfig);
    applyProxyConfig(newConfig);
    console.log(chalk.green('\n✅ 配置已保存\n'));

    // 自动扫描
    console.log(chalk.gray('🔍 正在扫描凭据源...'));
    const credentials = await scanCredentials(fromDir);
    saveCache(credentials);
    console.log(chalk.cyan(`✅ 发现 ${credentials.length} 个可用凭据源\n`));
    
    return 'done';
  }

  // 已有配置：显示摘要并询问是否修改
  console.log(chalk.cyan.bold('⚙️ 当前配置'));
  console.log(chalk.gray(`📁 fromDir: ${formatPath(config.fromDir)}`));
  console.log(chalk.gray(`📄 targetFile: ${formatPath(config.targetFile)}`));
  console.log(chalk.gray(`🌐 proxy: ${config.proxyEnabled ? `${config.proxyHost}:${config.proxyPort}` : '关闭'}`));
  console.log();

  // 显示当前生效账号
  const state = loadState();
  const cache = loadCache();
  
  if (state && state.current_index) {
    const current = cache.find(c => c.index === state.current_index);
    if (current) {
      console.log(chalk.green.bold('👤 当前生效账号'));
      console.log(chalk.gray(`🔢 index: ${current.index}`));
      
      if (current.plan) {
        console.log(chalk.gray(`📦 plan: ${current.plan}`));
      }
      if (current.team_space) {
        console.log(chalk.gray(`🏢 team_space: ${current.team_space}`));
      }
      
      console.log(chalk.gray(`📧 email: ${current.email || '-'}`));
      console.log(chalk.gray(`🕐 更新时间: ${state.updated_at || '-'}`));
    } else {
      console.log(chalk.yellow.bold('⚠️  当前生效账号'));
      console.log(chalk.gray('索引已失效'));
    }
  } else {
    console.log(chalk.yellow.bold('⚠️  当前生效账号'));
    console.log(chalk.gray('尚未选择任何 index'));
  }
  console.log();

  // 询问是否修改配置
  const modifyAnswer = await question(chalk.cyan('是否需要修改配置？ (y/n，b 返回): '));
  if (isBackCommand(modifyAnswer)) {
    return 'back';
  }
  const shouldModify = modifyAnswer.toLowerCase() === 'y' || modifyAnswer.toLowerCase() === 'yes';
  
  if (shouldModify) {
    console.log(chalk.gray('\n请输入新配置（直接回车保持原值）:\n'));
    
    const fromDirInput = await question(chalk.cyan(`📁 fromDir [${formatPath(config.fromDir)}，b 返回]: `));
    if (isBackCommand(fromDirInput)) {
      return 'back';
    }
    const newFromDir = resolvePath(fromDirInput || config.fromDir);
    
    const targetFileInput = await question(chalk.cyan(`📄 targetFile [${formatPath(config.targetFile)}，b 返回]: `));
    if (isBackCommand(targetFileInput)) {
      return 'back';
    }
    const proxyConfig = await askProxyConfig(config);
    if (!proxyConfig) {
      return 'back';
    }
    
    const newConfig = {
      fromDir: newFromDir,
      targetFile: resolvePath(targetFileInput || config.targetFile),
      proxyEnabled: proxyConfig.proxyEnabled,
      proxyHost: proxyConfig.proxyHost,
      proxyPort: proxyConfig.proxyPort
    };

    // 自动创建目录（如果不存在）
    if (!fs.existsSync(newConfig.fromDir)) {
      fs.mkdirSync(newConfig.fromDir, { recursive: true });
    }
    
    const targetDir = path.dirname(newConfig.targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    saveConfig(newConfig);
    applyProxyConfig(newConfig);
    console.log(chalk.green('\n✅ 配置已更新\n'));

    // 刷新扫描
    console.log(chalk.gray('🔍 正在重新扫描凭据源...'));
    const credentials = await scanCredentials(newConfig.fromDir);
    saveCache(credentials);
    console.log(chalk.cyan(`✅ 发现 ${credentials.length} 个可用凭据源\n`));
  }

  return 'done';
}
