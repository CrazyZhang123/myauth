/**
 * 凭据存储管理
 * 负责文件命名、sanitize、保存等
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Sanitize 文件名片段
 * 移除或替换非法字符
 * @param {string} str - 原始字符串
 * @returns {string}
 */
export function sanitizeFilename(str) {
  if (!str) return '';
  
  return str
    .trim()
    // 替换非法字符为下划线
    .replace(/[\\/:*?"<>|]/g, '_')
    // 空格替换为下划线
    .replace(/\s+/g, '_')
    // 统一小写
    .toLowerCase()
    // 移除连续的下划线
    .replace(/_+/g, '_')
    // 移除首尾下划线
    .replace(/^_+|_+$/g, '');
}

/**
 * 生成凭据文件名
 * 格式: codex-{plan}-{team_space}-{email}.json
 * @param {string} email - 用户邮箱
 * @param {string} plan - 订阅计划 (team/plus)
 * @param {string} teamSpace - Team 空间名（可选）
 * @returns {string}
 */
export function generateCredentialFilename(email, plan, teamSpace = '') {
  const sanitizedEmail = sanitizeFilename(email);
  const sanitizedPlan = sanitizeFilename(plan);
  const sanitizedTeamSpace = sanitizeFilename(teamSpace);

  const parts = ['codex', sanitizedPlan];

  // 只有 team 且提供了 team_space 才添加
  if (sanitizedPlan === 'team' && sanitizedTeamSpace) {
    parts.push(sanitizedTeamSpace);
  }

  parts.push(sanitizedEmail);

  return `${parts.join('-')}.json`;
}

/**
 * 创建凭据 JSON 对象
 * @param {object} tokens - Token 数据
 * @param {string} email - 用户邮箱
 * @param {string} accountId - 账户 ID
 * @param {string} plan - 订阅计划
 * @param {string} teamSpace - Team 空间名（可选）
 * @returns {object}
 */
export function createCredentialJson(tokens, email, accountId, plan, teamSpace = '') {
  const now = new Date();
  
  // 计算过期时间（如果有 expires_in）
  let expired = null;
  if (tokens.expires_in) {
    const expireDate = new Date(now.getTime() + tokens.expires_in * 1000);
    expired = expireDate.toISOString();
  }

  const credential = {
    id_token: tokens.id_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    account_id: accountId,
    email: email,
    type: 'codex',
    plan: plan,
    last_refresh: now.toISOString(),
    expired: expired
  };

  // 只有 team 且提供了 team_space 才添加
  if (plan === 'team' && teamSpace) {
    credential.team_space = teamSpace;
  }

  return credential;
}

/**
 * 保存凭据到文件
 * @param {string} saveDir - 保存目录
 * @param {string} filename - 文件名
 * @param {object} credential - 凭据对象
 * @returns {string} - 保存的完整路径
 */
export function saveCredential(saveDir, filename, credential) {
  // 确保目录存在
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true, mode: 0o700 });
  }

  const fullPath = path.join(saveDir, filename);

  // 写入文件
  fs.writeFileSync(fullPath, JSON.stringify(credential, null, 2), 'utf-8');

  // 设置文件权限 (仅 Unix-like 系统)
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(fullPath, 0o600);
    } catch (err) {
      // 忽略权限设置失败
    }
  }

  return fullPath;
}

/**
 * 获取默认保存目录
 * @returns {string}
 */
export function getDefaultSaveDir() {
  return path.join(os.homedir(), '.myauth');
}

/**
 * 验证保存目录
 * @param {string} dir - 目录路径
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSaveDir(dir) {
  try {
    const resolved = path.resolve(dir);
    
    // 检查是否存在
    if (fs.existsSync(resolved)) {
      const stats = fs.statSync(resolved);
      if (!stats.isDirectory()) {
        return { valid: false, error: '路径存在但不是目录' };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
