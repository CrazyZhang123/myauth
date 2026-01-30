import fs from 'fs';
import path from 'path';

// 深度合并对象（只更新指定路径）
function setNestedValue(obj, pathArray, value) {
  let current = obj;
  for (let i = 0; i < pathArray.length - 1; i++) {
    const key = pathArray[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[pathArray[pathArray.length - 1]] = value;
}

// 更新目标 JSON
export function updateTargetJson(targetPath, sourceData, enableBackup = true) {
  // 读取目标文件
  let targetJson;
  try {
    const content = fs.readFileSync(targetPath, 'utf-8');
    targetJson = JSON.parse(content);
  } catch (err) {
    throw new Error(`无法读取目标文件: ${err.message}`);
  }

  // 备份
  let backupPath = null;
  if (enableBackup) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${targetPath}.${timestamp}.bak`;
    fs.copyFileSync(targetPath, backupPath);
  }

  // 字段映射规则（只允许写入这些字段）
  const fieldMapping = [
    { source: 'id_token', target: ['tokens', 'id_token'] },
    { source: 'access_token', target: ['tokens', 'access_token'] },
    { source: 'account_id', target: ['tokens', 'account_id'] },
    { source: 'last_refresh', target: ['last_refresh'] }
  ];

  const updatedFields = [];

  // 合并更新
  for (const mapping of fieldMapping) {
    const sourceValue = sourceData[mapping.source];
    
    // 只有源字段存在且为字符串时才写入
    if (sourceValue && typeof sourceValue === 'string') {
      setNestedValue(targetJson, mapping.target, sourceValue);
      updatedFields.push(mapping.target.join('.'));
    }
  }

  // 校验
  if (!targetJson.tokens || typeof targetJson.tokens !== 'object') {
    throw new Error('目标 JSON 校验失败: tokens 必须是对象');
  }

  // 原子写入
  const tempPath = `${targetPath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(targetJson, null, 2), 'utf-8');
    
    // 校验临时文件
    const tempContent = fs.readFileSync(tempPath, 'utf-8');
    JSON.parse(tempContent);
    
    // 重命名覆盖
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    // 清理临时文件
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw new Error(`写入失败: ${err.message}`);
  }

  return {
    updatedFields,
    backupPath
  };
}
