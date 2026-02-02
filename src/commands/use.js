import chalk from 'chalk';
import { loadConfig, loadCache, saveState } from '../utils/config.js';
import { updateTargetJson } from '../utils/updater.js';
import path from 'path';
import fs from 'fs';

export async function use(indexOrOptions, options = {}) {
  const config = loadConfig();
  
  if (!config) {
    console.error(chalk.red('错误: 尚未配置，请先运行 zjjauth whoami'));
    process.exit(1);
  }

  const cache = loadCache();
  
  // 兼容两种调用方式：
  // 1. use(1, { backup: true }) - 从菜单调用
  // 2. use({ index: '1', backup: true }) - 从 CLI 调用
  let targetIndex;
  let backup = true;
  
  if (typeof indexOrOptions === 'object') {
    // CLI 调用方式
    targetIndex = indexOrOptions.index;
    backup = indexOrOptions.backup !== false;
  } else {
    // 菜单调用方式
    targetIndex = indexOrOptions;
    backup = options.backup !== false;
  }

  // 查找对应的凭据
  const credential = cache.find(c => c.index === targetIndex);
  
  if (!credential) {
    console.error(chalk.red(`错误: 未找到 index 为 ${targetIndex} 的凭据`));
    console.error(chalk.gray('提示: 运行 zjjauth ls 查看可用凭据'));
    process.exit(1);
  }

  // 读取源 JSON
  const sourcePath = path.join(config.fromDir, credential.path);
  let sourceData;
  
  try {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    sourceData = JSON.parse(content);
  } catch (err) {
    console.error(chalk.red(`错误: 无法读取源文件 ${sourcePath}`));
    console.error(err.message);
    process.exit(1);
  }

  // 更新目标 JSON
  try {
    const result = updateTargetJson(config.targetFile, sourceData, backup);
    
    console.log(chalk.green('✅ 凭据切换成功\n'));
    console.log(chalk.gray('📝 更新的字段:'));
    result.updatedFields.forEach(field => console.log(chalk.gray(`  - ${field}`)));
    console.log();
    console.log(chalk.gray(`📁 目标文件: ${config.targetFile}`));
    
    if (result.backupPath) {
      console.log(chalk.gray(`💾 备份文件: ${result.backupPath}`));
    }

    // 保存状态
    saveState({
      current_index: targetIndex,
      updated_at: new Date().toISOString()
    });

  } catch (err) {
    console.error(chalk.red('❌ 错误: 更新失败'));
    console.error(err.message);
    process.exit(1);
  }
}
