import { loadConfig, loadCache, saveState } from '../utils/config.js';
import { updateTargetJson } from '../utils/updater.js';
import path from 'path';
import fs from 'fs';

export async function use(options) {
  const config = loadConfig();
  
  if (!config) {
    console.error('错误: 尚未配置，请先运行 myauth whoami');
    process.exit(1);
  }

  const cache = loadCache();
  const targetIndex = options.index;

  // 查找对应的凭据
  const credential = cache.find(c => c.index === targetIndex);
  
  if (!credential) {
    console.error(`错误: 未找到 index 为 ${targetIndex} 的凭据`);
    console.error('提示: 运行 myauth ls 查看可用凭据');
    process.exit(1);
  }

  // 读取源 JSON
  const sourcePath = path.join(config.fromDir, credential.path);
  let sourceData;
  
  try {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    sourceData = JSON.parse(content);
  } catch (err) {
    console.error(`错误: 无法读取源文件 ${sourcePath}`);
    console.error(err.message);
    process.exit(1);
  }

  // 更新目标 JSON
  try {
    const result = updateTargetJson(config.targetFile, sourceData, options.backup);
    
    console.log('✓ 凭据切换成功\n');
    console.log('更新的字段:');
    result.updatedFields.forEach(field => console.log(`  - ${field}`));
    console.log();
    console.log(`目标文件: ${config.targetFile}`);
    
    if (result.backupPath) {
      console.log(`备份文件: ${result.backupPath}`);
    }

    // 保存状态
    saveState({
      current_index: targetIndex,
      updated_at: new Date().toISOString()
    });

  } catch (err) {
    console.error('错误: 更新失败');
    console.error(err.message);
    process.exit(1);
  }
}
