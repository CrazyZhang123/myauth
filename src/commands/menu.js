import chalk from 'chalk';
import { question } from '../utils/prompt.js';
import { loadConfig, loadCache, loadState } from '../utils/config.js';
import { startLimitCacheAutoRefresh } from '../utils/limits.js';
import { login } from './login.js';
import { switchMenu } from './switch.js';
import { watchMenu } from './watch.js';

/**
 * 清屏
 */
function clearScreen() {
  console.clear();
}

/**
 * 主菜单
 */
export async function menu() {
  let stopAutoRefresh = null;

  while (true) {
    if (typeof stopAutoRefresh === 'function') {
      stopAutoRefresh();
      stopAutoRefresh = null;
    }

    clearScreen();
    
    // 标题
    console.log(chalk.cyan.bold('🔐 zjjauth - OAuth 凭据管理工具'));
    console.log();
    
    // 显示当前账号（如果有）
    const config = loadConfig();
    const state = loadState();
    if (state?.current_index) {
      const cache = loadCache();
      const current = cache.find(c => c.index === state.current_index);
      if (current) {
        const plan = current.plan || '-';
        const space = current.team_space ? ` / ${current.team_space}` : '';
        console.log(chalk.green('👤 当前账号: ') + chalk.white(`${current.email}   (${plan}${space})`));
      } else {
        console.log(chalk.yellow('⚠️  当前账号: 未选择'));
      }
    } else {
      console.log(chalk.yellow('⚠️  当前账号: 未选择'));
    }
    
    console.log();
    console.log(chalk.gray('📋 菜单'));
    console.log(chalk.white('[1] 🔑 登录帐号'));
    console.log(chalk.white('[2] 🗂️  帐号池'));
    console.log(chalk.white('[3] 👀 自动切号监控'));
    console.log(chalk.white('[0] 👋 退出'));
    console.log();

    stopAutoRefresh = startLimitCacheAutoRefresh({
      config,
      intervalMs: 10000,
      currentTimeoutMs: 4000,
      otherTimeoutMs: 3000
    });
    
    const choice = await question(chalk.cyan('请选择操作 (0-3): '));

    if (typeof stopAutoRefresh === 'function') {
      stopAutoRefresh();
      stopAutoRefresh = null;
    }
    
    try {
      switch (choice.trim()) {
        case '1':
          console.log('\n');
          if (await login() !== 'back') {
            await question(chalk.gray('\n按回车继续...'));
          }
          break;
          
        case '2':
          console.log('\n');
          await switchMenu();
          break;
          
        case '3':
          console.log('\n');
          await watchMenu();
          break;
          
        case '0':
          console.log(chalk.green('\n👋 再见！'));
          console.log(chalk.cyan('🌟 https://github.com/CrazyZhang123/myauth'));
          console.log(chalk.gray('💖 体验好可以点个 star，谢谢！\n'));
          process.exit(0);
          
        default:
          console.log(chalk.red('\n❌ 无效选项，请输入 0-3'));
          await question(chalk.gray('按回车继续...'));
      }
    } catch (err) {
      console.error(chalk.red('\n操作失败:'), err.message);
      await question(chalk.gray('\n按回车继续...'));
    }
  }
}
