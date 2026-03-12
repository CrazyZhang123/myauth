import chalk from 'chalk';
import { loadConfig, loadCache, loadState, saveState } from '../utils/config.js';
import { updateTargetJson } from '../utils/updater.js';
import path from 'path';
import fs from 'fs';

const RECENT_INDEX_LIMIT = 3;

function resolveSwitchParams(indexOrOptions, options = {}) {
  let targetIndex;
  let backup = true;

  if (typeof indexOrOptions === 'object') {
    targetIndex = indexOrOptions.index;
    backup = indexOrOptions.backup !== false;
  } else {
    targetIndex = indexOrOptions;
    backup = options.backup !== false;
  }

  return { targetIndex, backup };
}

function buildRecentIndexes(targetIndex, previousState) {
  return [
    targetIndex,
    ...((previousState?.recent_indexes || []).filter((index) => index !== targetIndex))
  ].slice(0, RECENT_INDEX_LIMIT);
}

export async function switchCredential(indexOrOptions, options = {}) {
  const config = loadConfig();

  const cache = loadCache();
  const { targetIndex, backup } = resolveSwitchParams(indexOrOptions, options);

  // 查找对应的凭据
  const credential = cache.find(c => c.index === targetIndex);

  if (!credential) {
    throw new Error(`错误: 未找到 index 为 ${targetIndex} 的凭据\n提示: 运行 zjjauth pool 查看可用账号`);
  }

  // 读取源 JSON
  const sourcePath = path.join(config.fromDir, credential.path);
  let sourceData;

  try {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    sourceData = JSON.parse(content);
  } catch (err) {
    throw new Error(`错误: 无法读取源文件 ${sourcePath}\n${err.message}`);
  }

  // 更新目标 JSON
  const result = updateTargetJson(config.targetFile, sourceData, backup);
  const previousState = loadState();

  const nextState = {
    current_index: targetIndex,
    updated_at: new Date().toISOString(),
    recent_indexes: buildRecentIndexes(targetIndex, previousState)
  };

  saveState(nextState);

  return {
    credential,
    config,
    targetIndex,
    backup,
    result,
    state: nextState
  };
}

export async function use(indexOrOptions, options = {}) {
  try {
    const switchResult = await switchCredential(indexOrOptions, options);

    console.log(chalk.green('✅ 凭据切换成功\n'));
    console.log(chalk.gray('📝 更新的字段:'));
    switchResult.result.updatedFields.forEach(field => console.log(chalk.gray(`  - ${field}`)));
    console.log();
    console.log(chalk.gray(`📁 目标文件: ${switchResult.config.targetFile}`));

    if (switchResult.result.backupPath) {
      console.log(chalk.gray(`💾 备份文件: ${switchResult.result.backupPath}`));
    }
  } catch (err) {
    console.error(chalk.red('❌ 错误: 更新失败'));
    console.error(err.message);
    process.exit(1);
  }
}
