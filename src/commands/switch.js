import chalk from 'chalk';
import { question } from '../utils/prompt.js';
import { loadConfig, loadCache, loadState } from '../utils/config.js';
import { use } from './use.js';

/**
 * 快速切换菜单
 */
export async function switchMenu() {
  const config = loadConfig();
  
  if (!config) {
    console.error(chalk.red('错误: 尚未配置，请先运行 zjjauth whoami'));
    await question(chalk.gray('\n按回车继续...'));
    return;
  }

  const cache = loadCache();
  
  if (cache.length === 0) {
    console.log(chalk.yellow('暂无可用凭据'));
    console.log(chalk.gray('提示: 运行 zjjauth login 添加账号'));
    await question(chalk.gray('\n按回车继续...'));
    return;
  }

  const state = loadState();
  
  console.log(chalk.cyan.bold('🔄 快速切换凭据'));
  console.log();
  
  // 显示当前账号
  if (state?.current_index) {
    const current = cache.find(c => c.index === state.current_index);
    if (current) {
      const plan = current.plan || '-';
      const space = current.team_space ? ` - ${current.team_space}` : '';
      console.log(chalk.green('👤 当前账号: ') + chalk.white(`${current.email} (${plan}${space})`));
    }
  } else {
    console.log(chalk.yellow('⚠️  当前账号: 未选择'));
  }
  
  console.log();
  
  // 显示凭据列表
  console.log(chalk.gray('📋 可用凭据:'));
  for (const item of cache) {
    const isCurrent = item.index === state?.current_index;
    const plan = item.plan || '-';
    const space = item.team_space ? ` - ${item.team_space}` : '';
    
    if (isCurrent) {
      console.log(chalk.green(`  [${item.index}] ✓ ${item.email} (${plan}${space}) ← 当前`));
    } else {
      console.log(chalk.white(`  [${item.index}]   ${item.email} (${plan}${space})`));
    }
  }
  
  console.log();
  console.log(chalk.gray('💡 输入数字切换凭据，或按 q 返回'));
  const choice = await question(chalk.cyan('请选择: '));
  
  if (choice.toLowerCase().trim() === 'q') {
    return;
  }
  
  const targetIndex = choice.trim();
  
  // 检查是否是当前账号
  if (targetIndex === state?.current_index) {
    console.log(chalk.yellow('\n⚠️  已经是当前账号，无需切换'));
    await question(chalk.gray('按回车继续...'));
    return;
  }
  
  // 检查索引是否有效
  const credential = cache.find(c => c.index === targetIndex);
  if (!credential) {
    console.log(chalk.red(`\n❌ 错误: 未找到 index 为 ${targetIndex} 的凭据`));
    await question(chalk.gray('按回车继续...'));
    return;
  }
  
  // 调用 use 命令
  console.log('');
  await use(targetIndex, { backup: true });
  await question(chalk.gray('\n按回车继续...'));
}
