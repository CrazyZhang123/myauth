/**
 * OAuth 核心逻辑
 * 实现 OAuth 2.0 Authorization Code + PKCE 流程
 */

import crypto from 'crypto';
import https from 'https';
import { URL } from 'url';

// OAuth 配置（来自 CODEX_OAUTH_ANALYSIS.md）
export const OAUTH_CONFIG = {
  authUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  scopes: ['openid', 'email', 'profile', 'offline_access'],
  redirectUriBase: 'http://127.0.0.1'
};

/**
 * 生成 PKCE 代码
 * @returns {{codeVerifier: string, codeChallenge: string}}
 */
export function generatePKCE() {
  // 生成 96 字节随机数据 (128 个 base64 字符)
  const randomBytes = crypto.randomBytes(96);
  const codeVerifier = randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // 计算 SHA256 哈希并 Base64 URL 编码
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}

/**
 * 生成随机 state
 * @returns {string}
 */
export function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成授权 URL
 * @param {number} port - 回调端口
 * @param {string} state - CSRF 防护 state
 * @param {string} codeChallenge - PKCE challenge
 * @returns {string}
 */
export function generateAuthUrl(port, state, codeChallenge) {
  const redirectUri = `${OAUTH_CONFIG.redirectUriBase}:${port}/callback`;
  
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: OAUTH_CONFIG.scopes.join(' '),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'login',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true'
  });

  return `${OAUTH_CONFIG.authUrl}?${params.toString()}`;
}

/**
 * 交换授权码获取 tokens
 * @param {string} code - 授权码
 * @param {string} codeVerifier - PKCE verifier
 * @param {number} port - 回调端口
 * @returns {Promise<{id_token: string, access_token: string, refresh_token: string, expires_in: number}>}
 */
export function exchangeCodeForTokens(code, codeVerifier, port) {
  return new Promise((resolve, reject) => {
    const redirectUri = `${OAUTH_CONFIG.redirectUriBase}:${port}/callback`;
    
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OAUTH_CONFIG.clientId,
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    }).toString();

    const url = new URL(OAUTH_CONFIG.tokenUrl);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          try {
            const error = JSON.parse(data);
            reject(new Error(`Token 交换失败: ${error.error_description || error.error || data}`));
          } catch {
            reject(new Error(`Token 交换失败 (HTTP ${res.statusCode}): ${data}`));
          }
          return;
        }

        try {
          const tokens = JSON.parse(data);
          resolve(tokens);
        } catch (err) {
          reject(new Error(`解析 token 响应失败: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Token 请求失败: ${err.message}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 解析 JWT Token (不验证签名)
 * @param {string} token - JWT token
 * @returns {object} - Claims
 */
export function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // 解码 payload (Base64 URL)
    let payload = parts[1];
    
    // 添加填充
    switch (payload.length % 4) {
      case 2:
        payload += '==';
        break;
      case 3:
        payload += '=';
        break;
    }

    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (err) {
    throw new Error(`JWT 解析失败: ${err.message}`);
  }
}

/**
 * 从 ID Token 提取用户信息
 * @param {string} idToken - ID Token
 * @returns {{email: string, accountId: string, planType: string}}
 */
export function extractUserInfo(idToken) {
  const claims = parseJWT(idToken);
  
  const email = claims.email || null;
  const authInfo = claims['https://api.openai.com/auth'] || {};
  const accountId = authInfo.chatgpt_account_id || null;
  const planType = authInfo.chatgpt_plan_type || 'free';

  return { email, accountId, planType };
}
