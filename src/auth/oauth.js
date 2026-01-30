/**
 * OAuth 核心逻辑
 * 实现 OAuth 2.0 Authorization Code + PKCE 流程
 */

import crypto from 'crypto';
import https from 'https';
import { URL } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';

// OAuth 配置（来自 CODEX_OAUTH_ANALYSIS.md）
export const OAUTH_CONFIG = {
  authUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  scopes: ['openid', 'email', 'profile', 'offline_access'],
  // 必须使用 localhost:1455，这是 OpenAI 预先注册的 redirect_uri
  redirectUri: 'http://localhost:1455/auth/callback',
  callbackPort: 1455
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
 * @param {string} state - CSRF 防护 state
 * @param {string} codeChallenge - PKCE challenge
 * @returns {string}
 */
export function generateAuthUrl(state, codeChallenge) {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: OAUTH_CONFIG.redirectUri,
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
 * @returns {Promise<{id_token: string, access_token: string, refresh_token: string, expires_in: number}>}
 */
/**
 * 交换授权码获取 tokens
 * @param {string} code - 授权码
 * @param {string} codeVerifier - PKCE verifier
 * @returns {Promise<{id_token: string, access_token: string, refresh_token: string, expires_in: number}>}
 */
export function exchangeCodeForTokens(code, codeVerifier) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OAUTH_CONFIG.clientId,
      code: code,
      redirect_uri: OAUTH_CONFIG.redirectUri,
      code_verifier: codeVerifier
    }).toString();

    const url = new URL(OAUTH_CONFIG.tokenUrl);
    
    // 检查代理设置
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || 
                  process.env.HTTP_PROXY || process.env.http_proxy;
    
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
    
    // 如果有代理，使用代理
    if (proxy) {
      options.agent = new HttpsProxyAgent(proxy);
      console.log('[调试] 使用代理:', proxy);
    } else {
      console.log('[调试] 未检测到代理环境变量，使用直连');
      console.log('[调试] 提示: 如需使用代理，请设置 HTTPS_PROXY 环境变量');
    }

    // 调试信息
    console.log('\n[调试] Token 交换请求:');
    console.log('URL:', OAUTH_CONFIG.tokenUrl);
    console.log('Headers:', options.headers);
    console.log('Body:', postData.substring(0, 200) + '...\n');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('[调试] 响应状态码:', res.statusCode);
        console.log('[调试] 响应内容:', data.substring(0, 500));
        
        if (res.statusCode !== 200) {
          try {
            const error = JSON.parse(data);
            const errorMsg = error.error?.message || error.error_description || error.error || JSON.stringify(error);
            reject(new Error(`Token 交换失败 (${res.statusCode}): ${errorMsg}`));
          } catch {
            reject(new Error(`Token 交换失败 (HTTP ${res.statusCode}): ${data}`));
          }
          return;
        }

        try {
          const tokens = JSON.parse(data);
          resolve(tokens);
        } catch (err) {
          reject(new Error(`解析 token 响应失败: ${err.message}\n响应内容: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[调试] 请求错误:', err);
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
