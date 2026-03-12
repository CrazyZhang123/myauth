import chalk from 'chalk';

/**
 * 输出子页面页头
 * @param {string} indexLabel - 主菜单序号
 * @param {string} menuLabel - 菜单名称
 */
export function printMenuPageHeader(indexLabel, menuLabel) {
  console.log(chalk.gray('🔙 返回主菜单（输入 b）'));
  console.log(chalk.gray(`📍 当前序号: [${indexLabel}] ${menuLabel}`));
  console.log();
}
