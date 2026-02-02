import chalk from 'chalk';
import { question } from '../utils/prompt.js';
import { loadConfig, loadCache, loadState } from '../utils/config.js';
import { login } from './login.js';
import { ls } from './ls.js';
import { whoami } from './whoami.js';
import { switchMenu } from './switch.js';

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
  while (true) {
    clearScreen();
    
    // 标题
    console.log(chalk.cyan.bold('🔐 zjjauth - OAuth 凭据管理工具'));
    console.log();
    
    // 显示当前账号（如果有）
    const config = loadConfig();
    if (config) {
      const state = loadState();
      if (state?.current_index) {
        const cache = loadCache();
        const current = cache.find(c => c.index === state.current_index);
        if (current) {
          const plan = current.plan || '-';
          const space = current.team_space ? ` - ${current.team_space}` : '';
          console.log(chalk.green('👤 当前账号: ') + chalk.white(`${current.email}   (${plan}${space})`));
        } else {
          console.log(chalk.yellow('⚠️  当前账号: 未选择'));
        }
      } else {
        console.log(chalk.yellow('⚠️  当前账号: 未选择'));
      }
    } else {
      console.log(chalk.red('❌ 状态: 尚未配置'));
    }
    
    console.log();
    console.log(chalk.gray('📋 菜单'));
    console.log(chalk.white('[1] 🔑 登录/添加账号'));
    console.log(chalk.white('[2] 🔄 切换当前凭据（快速切换）'));
    console.log(chalk.white('[3] 📝 查看所有凭据'));
    console.log(chalk.white('[4] ⚙️  配置管理'));
    console.log(chalk.white('[0] 👋 退出'));
    console.log();
    
    const choice = await question(chalk.cyan('请选择操作 (0-4): '));
    
    try {
      switch (choice.trim()) {
        case '1':
          console.log('\n');
          await login();
          await question(chalk.gray('\n按回车继续...'));
          break;
          
        case '2':
          console.log('\n');
          await switchMenu();
          break;
          
        case '3':
          console.log('\n');
          await ls({ interactive: true });
          await question(chalk.gray('\n按回车继续...'));
          break;
          
        case '4':
          console.log('\n');
          await whoami();
          await question(chalk.gray('\n按回车继续...'));
          break;
          
        case '0':
          console.log(chalk.green('\n👋 再见！'));
          console.log(chalk.cyan('🌟 https://github.com/CrazyZhang123/myauth'));
          console.log(chalk.gray('💖 体验好可以点个 star，谢谢！\n'));
          process.exit(0);
          
        default:
          console.log(chalk.red('\n❌ 无效选项，请输入 0-4'));
          await question(chalk.gray('按回车继续...'));
      }
    } catch (err) {
      console.error(chalk.red('\n操作失败:'), err.message);
      await question(chalk.gray('\n按回车继续...'));
    }
  }
}
