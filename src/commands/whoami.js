import chalk from 'chalk';
import { loadConfig, saveConfig, loadCache, saveCache, loadState } from '../utils/config.js';
import { question, confirm } from '../utils/prompt.js';
import { scanCredentials } from '../utils/scanner.js';
import { resolvePath, getDefaultPaths, formatPath } from '../utils/path.js';
import fs from 'fs';

export async function whoami() {
  const config = loadConfig();

  if (!config) {
    // 首次配置：交互式引导
    console.log(chalk.cyan.bold('🎉 欢迎使用 zjjauth！') + chalk.gray('首次使用需要配置。\n'));
    
    const defaults = getDefaultPaths();
    
    console.log(chalk.gray(`📁 默认凭据目录: ${formatPath(defaults.oauthDir)}`));
    console.log(chalk.gray(`📄 默认目标文件: ${formatPath(defaults.targetFile)}\n`));
    
    const fromDirInput = await question(chalk.cyan(`请输入凭据源目录路径 (默认: ${formatPath(defaults.oauthDir)}): `));
    const fromDir = resolvePath(fromDirInput || defaults.oauthDir);
    
    if (!fs.existsSync(fromDir)) {
      console.error(chalk.red(`❌ 错误: 目录不存在: ${fromDir}`));
      console.error(chalk.gray('💡 提示: 请先运行 zjjauth login 获取凭据'));
      process.exit(1);
    }

    const targetFileInput = await question(chalk.cyan(`请输入目标 JSON 文件路径 (默认: ${formatPath(defaults.targetFile)}): `));
    const targetFile = resolvePath(targetFileInput || defaults.targetFile);

    // 保存配置
    const newConfig = { 
      fromDir, 
      targetFile
    };
    saveConfig(newConfig);
    console.log(chalk.green('\n✅ 配置已保存\n'));

    // 自动扫描
    console.log(chalk.gray('🔍 正在扫描凭据源...'));
    const credentials = await scanCredentials(fromDir);
    saveCache(credentials);
    console.log(chalk.cyan(`✅ 发现 ${credentials.length} 个可用凭据源\n`));
    
    return;
  }

  // 已有配置：显示摘要并询问是否修改
  console.log(chalk.cyan.bold('⚙️  当前配置'));
  console.log(chalk.gray(`📁 fromDir: ${formatPath(config.fromDir)}`));
  console.log(chalk.gray(`📄 targetFile: ${formatPath(config.targetFile)}`));
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
  const shouldModify = await confirm(chalk.cyan('是否需要修改配置？ (y/n): '));
  
  if (shouldModify) {
    console.log(chalk.gray('\n请输入新配置（直接回车保持原值）:\n'));
    
    const fromDirInput = await question(chalk.cyan(`📁 fromDir [${formatPath(config.fromDir)}]: `));
    const newFromDir = resolvePath(fromDirInput || config.fromDir);
    
    const targetFileInput = await question(chalk.cyan(`📄 targetFile [${formatPath(config.targetFile)}]: `));
    
    const newConfig = {
      fromDir: newFromDir,
      targetFile: resolvePath(targetFileInput || config.targetFile)
    };

    // 验证路径
    if (!fs.existsSync(newConfig.fromDir)) {
      console.error(chalk.red(`\n❌ 错误: fromDir 不存在: ${newConfig.fromDir}`));
      process.exit(1);
    }

    saveConfig(newConfig);
    console.log(chalk.green('\n✅ 配置已更新\n'));

    // 刷新扫描
    console.log(chalk.gray('🔍 正在重新扫描凭据源...'));
    const credentials = await scanCredentials(newConfig.fromDir);
    saveCache(credentials);
    console.log(chalk.cyan(`✅ 发现 ${credentials.length} 个可用凭据源\n`));
  }
}
