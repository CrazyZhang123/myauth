import chalk from 'chalk';
import { loadConfig, loadCache, saveCache, loadState, saveState, loadLimitCache, saveLimitCache } from '../utils/config.js';
import { scanCredentials } from '../utils/scanner.js';
import { removeCredentialLimit } from '../utils/limits.js';
import path from 'path';
import fs from 'fs';

/**
 * 删除凭据
 * @param {string} targetIndex - 要删除的凭据索引
 */
export async function deleteCredential(targetIndex) {
  const config = loadConfig();

  const cache = loadCache();
  
  // 查找对应的凭据
  const credential = cache.find(c => c.index === targetIndex);
  
  if (!credential) {
    console.error(chalk.red(`错误: 未找到 index 为 ${targetIndex} 的凭据`));
    return false;
  }

  // 构建文件路径
  const filePath = path.join(config.fromDir, credential.path);
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`错误: 文件不存在: ${filePath}`));
    return false;
  }

  try {
    // 删除文件
    fs.unlinkSync(filePath);
    console.log(chalk.green(`✅ 已删除凭据: ${credential.email}`));
    
    const state = loadState();
    const recentIndexes = (state?.recent_indexes || []).filter((index) => index !== targetIndex);

    // 如果删除的是当前账号，清除状态
    if (state?.current_index === targetIndex) {
      saveState({
        current_index: null,
        updated_at: new Date().toISOString(),
        recent_indexes: recentIndexes
      });
      console.log(chalk.yellow('⚠️  提示: 已清除当前账号状态'));
    } else if (state && recentIndexes.length !== (state.recent_indexes || []).length) {
      saveState({
        ...state,
        recent_indexes: recentIndexes
      });
    }
    
    // 刷新缓存
    const newCache = await scanCredentials(config.fromDir);
    saveCache(newCache);

    // 清理限额缓存
    const limitCache = loadLimitCache();
    saveLimitCache(removeCredentialLimit(limitCache, credential.path));
    
    return true;
  } catch (err) {
    console.error(chalk.red('❌ 错误: 删除失败'));
    console.error(err.message);
    return false;
  }
}
