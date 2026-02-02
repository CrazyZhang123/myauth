/**
 * OAuth 登录命令
 * 全交互式流程
 */

import chalk from 'chalk';
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
 * @returns {Promise<{plan: string, teamSpace: string}>}
 */
async function collectLoginInfo() {
  console.log('\n' + chalk.cyan.bold('🔐 OAuth 登录配置') + '\n');

  // 1. 选择 plan
  console.log(chalk.white('请选择订阅计划:'));
  console.log(chalk.white('  [1] Plus'));
  console.log(chalk.white('  [2] Team'));
  
  let planChoice;
  while (true) {
    planChoice = await question(chalk.cyan('\n请输入选项 (1/2): '));
    if (planChoice === '1' || planChoice === '2') {
      break;
    }
    console.log(chalk.red('❌ 无效选项，请输入 1 或 2'));
  }

  const plan = planChoice === '1' ? 'plus' : 'team';
  console.log(chalk.green(`✅ 已选择: ${plan}\n`));

  // 2. 如果是 team，询问 team_space
  let teamSpace = '';
  if (plan === 'team') {
    teamSpace = await question(chalk.cyan('🏢 请输入 Team 空间名称 (可留空): '));
    teamSpace = teamSpace.trim();
    if (teamSpace) {
      console.log(chalk.green(`✅ Team 空间: ${teamSpace}\n`));
    } else {
      console.log(chalk.gray('✓ 未设置 Team 空间\n'));
    }
  }

  return { plan, teamSpace };
}

/**
 * 执行 OAuth 登录流程
 */
export async function login() {
  try {
    // 1. 获取配置的保存目录
    const config = loadConfig();
    if (!config) {
      console.error(chalk.red('❌ 错误: 尚未配置，请先运行 myauth whoami'));
      process.exit(1);
    }
    
    const saveDir = config.fromDir;

    // 2. 交互式收集信息
    const { plan, teamSpace } = await collectLoginInfo();

    // 3. 生成 PKCE 和 state
    console.log(chalk.gray('🔐 正在准备 OAuth 认证...'));
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();

    // 4. 启动本地回调服务器
    console.log(chalk.gray('🚀 正在启动本地回调服务器...'));
    let port, server, waitForCode;
    
    try {
      const result = await startCallbackServer(state, 1455);
      port = result.port;
      server = result.server;
      waitForCode = result.waitForCode;
      console.log(chalk.green(`✅ 回调服务器已启动 (端口: ${port})\n`));
    } catch (err) {
      console.error(chalk.red(`\n❌ 错误: ${err.message}`));
      if (err.message.includes('已被占用')) {
        console.error(chalk.gray('💡 提示: 请关闭占用端口 1455 的程序，或检查是否有其他 myauth login 正在运行'));
      }
      process.exit(1);
    }

    // 5. 生成授权 URL
    const authUrl = generateAuthUrl(state, codeChallenge);

    // 6. 打开浏览器
    console.log(chalk.gray('🌐 正在打开浏览器进行授权...'));
    const browserOpened = await openBrowser(authUrl);

    if (!browserOpened) {
      console.log(chalk.yellow('\n⚠️  无法自动打开浏览器，请手动访问以下 URL:\n'));
    }
    
    // 始终显示 URL，方便用户复制
    console.log(chalk.cyan(authUrl));
    console.log();

    console.log(chalk.gray('⏳ 等待授权回调...'));
    if (!browserOpened) {
      console.log(chalk.gray('💡 (请复制上方 URL 到浏览器中打开)\n'));
    } else {
      console.log(chalk.gray('💡 (如果浏览器未正确跳转，请复制上方 URL)\n'));
    }

    // 7. 等待授权码
    let code;
    try {
      code = await waitForCode();
      console.log(chalk.green('✅ 已收到授权码\n'));
    } catch (err) {
      server.close();
      console.error(chalk.red(`\n❌ 错误: ${err.message}`));
      process.exit(1);
    }

    // 8. 交换 tokens
    console.log(chalk.gray('🔄 正在交换 access token...'));
    let tokens;
    
    try {
      tokens = await exchangeCodeForTokens(code, codeVerifier);
      console.log(chalk.green('✅ Token 交换成功\n'));
    } catch (err) {
      server.close();
      console.error(chalk.red(`\n❌ 错误: ${err.message}`));
      process.exit(1);
    } finally {
      // 关闭服务器
      server.close();
    }

    // 9. 提取用户信息
    console.log(chalk.gray('📋 正在解析用户信息...'));
    let userInfo;
    
    try {
      userInfo = extractUserInfo(tokens.id_token);
      
      if (!userInfo.email) {
        throw new Error('无法从 ID Token 中提取邮箱');
      }
      
      if (!userInfo.accountId) {
        throw new Error('无法从 ID Token 中提取账户 ID');
      }

      console.log(chalk.green(`✅ 用户: ${userInfo.email}\n`));
    } catch (err) {
      console.error(chalk.red(`\n❌ 错误: ${err.message}`));
      process.exit(1);
    }

    // 10. 生成文件名
    const filename = generateCredentialFilename(userInfo.email, plan, teamSpace);
    console.log(chalk.gray(`📝 文件名: ${filename}`));

    // 11. 创建凭据对象
    const credential = createCredentialJson(
      tokens,
      userInfo.email,
      userInfo.accountId,
      plan,
      teamSpace
    );

    // 12. 保存文件
    console.log(chalk.gray('💾 正在保存凭据...'));
    let savedPath;
    
    try {
      savedPath = saveCredential(saveDir, filename, credential);
      console.log(chalk.green(`✅ 凭据已保存: ${savedPath}\n`));
    } catch (err) {
      console.error(chalk.red(`\n❌ 错误: 保存失败 - ${err.message}`));
      process.exit(1);
    }

    // 13. 更新缓存
    console.log(chalk.gray('🔄 正在更新缓存...'));
    try {
      const credentials = await scanCredentials(saveDir);
      saveCache(credentials);
      
      // 找到刚保存的凭据的 index
      const newCred = credentials.find(c => c.email === userInfo.email && c.path === filename);
      if (newCred) {
        console.log(chalk.green(`✅ 缓存已更新 (index: ${newCred.index})\n`));
      } else {
        console.log(chalk.green('✅ 缓存已更新\n'));
      }
    } catch (err) {
      console.log(chalk.yellow('⚠️  缓存更新失败，请运行 myauth ls 手动刷新\n'));
    }

    // 14. 输出摘要（严禁输出 token）
    console.log(chalk.green.bold('✅ 登录成功'));
    console.log(chalk.gray(`📧 Email: ${userInfo.email}`));
    console.log(chalk.gray(`🏷️  Type: codex`));
    console.log(chalk.gray(`📦 Plan: ${plan}`));
    if (plan === 'team' && teamSpace) {
      console.log(chalk.gray(`🏢 Team Space: ${teamSpace}`));
    }
    console.log(chalk.gray(`📁 File: ${savedPath}`));
    
    // 显示 index
    const cache = await scanCredentials(saveDir);
    const newCred = cache.find(c => c.email === userInfo.email && c.path === filename);
    if (newCred) {
      console.log(chalk.gray(`🔢 Index: ${newCred.index}`));
    }

  } catch (err) {
    console.error(chalk.red(`\n❌ 未预期的错误: ${err.message}`));
    process.exit(1);
  }
}
