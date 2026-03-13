import chalk from 'chalk';
import { question } from '../utils/prompt.js';
import { printMenuPageHeader } from '../utils/ui.js';

function printRemovedNotice() {
  console.log(chalk.yellow('⚠️  自动切号功能已移除'));
  console.log(chalk.gray('请使用 zjjauth pool 手动查看额度并切换账号。'));
}

export async function watchLimits() {
  printRemovedNotice();
}

export async function watchMenu() {
  printMenuPageHeader('3', '自动切号监控');
  printRemovedNotice();
  await question(chalk.gray('\n按回车继续...'));
}
