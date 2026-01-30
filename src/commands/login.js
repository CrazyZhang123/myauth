/**
 * OAuth 登录命令
 * 全交互式流程
 */

import { question, confirm } from '../utils/prompt.js';
import { generatePKCE, generateState, generateAuthUrl, exchangeCodeForTokens, extractUserInfo } from '../auth/oauth.js';
import { startCallbackServer } from '../auth/server.js';
import { generateCredentialFilename, createCredentialJson, saveCredential, getDefaultSaveDir, validateSaveDir } from '../auth/storage.js';
import { scanCredentials } from '../utils/scanner.js';
import { loadConfig, saveCache } from '../utils/config.js';
import { exec } from 'child_process';
import { platform } from 'os';

/**
 * 打开浏览器
 * @param {string} url - 要打开的 URL
 * @returns {Promise<boolean>}
 */
function openBrowser(url) {
  return new Promise((resolve) => {
    let command;
    
    switch (platform()) {
      case 'darwin':
        command = `open "${url}"`;
        break;
      case 'win32':
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
        break;
    }

    exec(command, (error) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * 交互式收集登录信息
 * @returns {Promise<{plan: string, teamSpace: string, saveDir: string}>}
 */
async function collectLoginInfo() {
  console.log('\n=== OAuth 登录配置 ===\n');

  // 1. 选择 plan
  console.log('请选择订阅计划:');
  console.log('  [1] Plus');
  console.log('  [2] Team');
  
  let planChoice;
  while (true) {
    planChoice = await question('\n请输入选项 (1/2): ');
    if (planChoice === '1' || planChoice === '2') {
      break;
    }
    console.log('无效选项，请输入 1 或 2');
  }

  const plan = planChoice === '1' ? 'plus' : 'team';
  console.log(`✓ 已选择: ${plan}\n`);

  // 2. 如果是 team，询问 team_space
  let teamSpace = '';
  if (plan === 'team') {
    teamSpace = await question('请输入 Team 空间名称 (可留空): ');
    teamSpace = teamSpace.trim();
    if (teamSpace) {
      console.log(`✓ Team 空间: ${teamSpace}\n`);
    } else {
      console.log('✓ 未设置 Team 空间\n');
    }
  }

  // 3. 选择保存目录
  const defaultDir = getDefaultSaveDir();
  console.log(`默认保存目录: ${defaultDir}`);
  
  const useDefault = await confirm('使用默认目录？');
  
  let saveDir;
  if (useDefault) {
    saveDir = defaultDir;
  } else {
    while (true) {
      saveDir = await question('请输入保存目录路径: ');
      saveDir = saveDir.trim();
      
      if (!saveDir) {
        console.log('路径不能为空');
        continue;
      }

      const validation = validateSaveDir(saveDir);
      if (!validation.valid) {
        console.log(`错误: ${validation.error}`);
        continue;
      }

      break;
    }
  }

  console.log(`✓ 保存目录: ${saveDir}\n`);

  return { plan, teamSpace, saveDir };
}

/**
 * 执行 OAuth 登录流程
 */
export async function login() {
  try {
    // 1. 交互式收集信息
    const { plan, teamSpace, saveDir } = await collectLoginInfo();

    // 2. 生成 PKCE 和 state
    console.log('正在准备 OAuth 认证...');
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();

    // 3. 启动本地回调服务器
    console.log('正在启动本地回调服务器...');
    let callbackResult;
    
    try {
      const serverPromise = startCallbackServer(state);
      callbackResult = await Promise.race([
        serverPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('服务器启动超时')), 5000)
        )
      ]);
    } catch (err) {
      console.error(`\n错误: ${err.message}`);
      console.error('提示: 请检查端口是否被占用，或稍后重试');
      process.exit(1);
    }

    const { code: authCode, port, server } = callbackResult;
    console.log(`✓ 回调服务器已启动 (端口: ${port})\n`);

    // 4. 生成授权 URL
    const authUrl = generateAuthUrl(port, state, codeChallenge);

    // 5. 打开浏览器
    console.log('正在打开浏览器进行授权...');
    const browserOpened = await openBrowser(authUrl);

    if (!browserOpened) {
      console.log('\n⚠ 无法自动打开浏览器，请手动访问以下 URL:\n');
      console.log(authUrl);
      console.log();
    }

    console.log('等待授权回调...');
    console.log('(如果浏览器未自动打开，请复制上方 URL 到浏览器)\n');

    // 6. 等待授权码
    let code;
    try {
      code = authCode;
      console.log('✓ 已收到授权码\n');
    } catch (err) {
      server.close();
      console.error(`\n错误: ${err.message}`);
      process.exit(1);
    }

    // 7. 交换 tokens
    console.log('正在交换 access token...');
    let tokens;
    
    try {
      tokens = await exchangeCodeForTokens(code, codeVerifier, port);
      console.log('✓ Token 交换成功\n');
    } catch (err) {
      server.close();
      console.error(`\n错误: ${err.message}`);
      process.exit(1);
    } finally {
      // 关闭服务器
      server.close();
    }

    // 8. 提取用户信息
    console.log('正在解析用户信息...');
    let userInfo;
    
    try {
      userInfo = extractUserInfo(tokens.id_token);
      
      if (!userInfo.email) {
        throw new Error('无法从 ID Token 中提取邮箱');
      }
      
      if (!userInfo.accountId) {
        throw new Error('无法从 ID Token 中提取账户 ID');
      }

      console.log(`✓ 用户: ${userInfo.email}\n`);
    } catch (err) {
      console.error(`\n错误: ${err.message}`);
      process.exit(1);
    }

    // 9. 生成文件名
    const filename = generateCredentialFilename(userInfo.email, plan, teamSpace);
    console.log(`文件名: ${filename}`);

    // 10. 创建凭据对象
    const credential = createCredentialJson(
      tokens,
      userInfo.email,
      userInfo.accountId,
      plan,
      teamSpace
    );

    // 11. 保存文件
    console.log('正在保存凭据...');
    let savedPath;
    
    try {
      savedPath = saveCredential(saveDir, filename, credential);
      console.log(`✓ 凭据已保存: ${savedPath}\n`);
    } catch (err) {
      console.error(`\n错误: 保存失败 - ${err.message}`);
      process.exit(1);
    }

    // 12. 更新缓存（如果已配置）
    const config = loadConfig();
    if (config && config.fromDir === saveDir) {
      console.log('正在更新缓存...');
      try {
        const credentials = await scanCredentials(saveDir, config.recursive || false);
        saveCache(credentials);
        
        // 找到刚保存的凭据的 index
        const newCred = credentials.find(c => c.email === userInfo.email && c.path === filename);
        if (newCred) {
          console.log(`✓ 缓存已更新 (index: ${newCred.index})\n`);
        } else {
          console.log('✓ 缓存已更新\n');
        }
      } catch (err) {
        console.log('⚠ 缓存更新失败，请运行 myauth ls --refresh 手动刷新\n');
      }
    }

    // 13. 输出摘要（严禁输出 token）
    console.log('=== 登录成功 ===');
    console.log(`Email: ${userInfo.email}`);
    console.log(`Type: codex`);
    console.log(`Plan: ${plan}`);
    if (plan === 'team' && teamSpace) {
      console.log(`Team Space: ${teamSpace}`);
    }
    console.log(`File: ${savedPath}`);
    
    // 如果已配置且在同一目录，显示 index
    if (config && config.fromDir === saveDir) {
      const cache = await scanCredentials(saveDir, config.recursive || false);
      const newCred = cache.find(c => c.email === userInfo.email && c.path === filename);
      if (newCred) {
        console.log(`Index: ${newCred.index}`);
      }
    }

    console.log('\n提示: 运行 myauth ls 查看所有凭据');
    console.log('提示: 运行 myauth use --index <N> 切换到此凭据');

    // Windows 安全提示
    if (platform() === 'win32') {
      console.log('\n⚠ 安全提示: 请确保凭据目录受到适当保护');
    }

  } catch (err) {
    console.error(`\n未预期的错误: ${err.message}`);
    process.exit(1);
  }
}
