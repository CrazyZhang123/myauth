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

function ensureParentDir(targetPath) {
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

function parseExpiryToMillis(sourceData) {
  if (!sourceData?.expired) {
    return null;
  }

  const time = new Date(sourceData.expired).getTime();
  return Number.isFinite(time) ? time : null;
}

function detectTargetFormat(targetPath, targetJson) {
  if (targetJson?.openai?.type === 'oauth') {
    return 'opencode';
  }

  if (targetPath.includes(`${path.sep}.local${path.sep}share${path.sep}opencode${path.sep}`)) {
    return 'opencode';
  }

  if (targetPath.includes(`${path.sep}opencode${path.sep}`)) {
    return 'opencode';
  }

  return 'codex';
}

function createEmptyTarget(targetFormat) {
  if (targetFormat === 'opencode') {
    return {
      openai: {
        type: 'oauth'
      }
    };
  }

  return {
    tokens: {}
  };
}

function updateCodexTarget(targetJson, sourceData) {
  const fieldMapping = [
    { source: 'id_token', target: ['tokens', 'id_token'] },
    { source: 'access_token', target: ['tokens', 'access_token'] },
    { source: 'refresh_token', target: ['tokens', 'refresh_token'] },
    { source: 'account_id', target: ['tokens', 'account_id'] },
    { source: 'last_refresh', target: ['last_refresh'] }
  ];

  const updatedFields = [];

  for (const mapping of fieldMapping) {
    const sourceValue = sourceData[mapping.source];
    if (sourceValue && typeof sourceValue === 'string') {
      setNestedValue(targetJson, mapping.target, sourceValue);
      updatedFields.push(mapping.target.join('.'));
    }
  }

  if (!targetJson.tokens || typeof targetJson.tokens !== 'object') {
    throw new Error('目标 JSON 校验失败: tokens 必须是对象');
  }

  return updatedFields;
}

function updateOpencodeTarget(targetJson, sourceData) {
  if (!targetJson.openai || typeof targetJson.openai !== 'object') {
    targetJson.openai = { type: 'oauth' };
  }

  targetJson.openai.type = 'oauth';

  const fieldMapping = [
    { source: 'refresh_token', target: ['openai', 'refresh'] },
    { source: 'access_token', target: ['openai', 'access'] },
    { source: 'account_id', target: ['openai', 'accountId'] }
  ];

  const updatedFields = ['openai.type'];

  for (const mapping of fieldMapping) {
    const sourceValue = sourceData[mapping.source];
    if (sourceValue && typeof sourceValue === 'string') {
      setNestedValue(targetJson, mapping.target, sourceValue);
      updatedFields.push(mapping.target.join('.'));
    }
  }

  const expires = parseExpiryToMillis(sourceData);
  if (expires != null) {
    setNestedValue(targetJson, ['openai', 'expires'], expires);
    updatedFields.push('openai.expires');
  }

  if (!targetJson.openai?.refresh || !targetJson.openai?.access) {
    throw new Error('目标 JSON 校验失败: openai OAuth 凭据不完整');
  }

  return updatedFields;
}

// 更新目标 JSON
export function updateTargetJson(targetPath, sourceData, enableBackup = true) {
  // 读取目标文件
  let targetJson;
  let targetFormat;
  try {
    const content = fs.readFileSync(targetPath, 'utf-8');
    targetJson = JSON.parse(content);
    targetFormat = detectTargetFormat(targetPath, targetJson);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`无法读取目标文件: ${err.message}`);
    }

    ensureParentDir(targetPath);
    targetFormat = detectTargetFormat(targetPath, null);
    targetJson = createEmptyTarget(targetFormat);
  }

  // 备份
  let backupPath = null;
  if (enableBackup && fs.existsSync(targetPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${targetPath}.${timestamp}.bak`;
    fs.copyFileSync(targetPath, backupPath);
  }

  // 字段映射规则（只允许写入这些字段）
  const updatedFields = targetFormat === 'opencode'
    ? updateOpencodeTarget(targetJson, sourceData)
    : updateCodexTarget(targetJson, sourceData);

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
    targetFormat,
    updatedFields,
    backupPath
  };
}
