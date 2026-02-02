#!/usr/bin/env node

import { Command } from 'commander';
import { whoami } from '../src/commands/whoami.js';
import { ls } from '../src/commands/ls.js';
import { use } from '../src/commands/use.js';
import { login } from '../src/commands/login.js';
import { menu } from '../src/commands/menu.js';
import { switchMenu } from '../src/commands/switch.js';
import { deleteCredential } from '../src/commands/delete.js';

const program = new Command();

program
  .name('myauth')
  .description('OAuth 凭据管理工具 - 支持多账号快速切换')
  .version('1.0.0')
  .addHelpText('after', `
示例:
  $ myauth                     显示主菜单（交互式）
  $ myauth menu                显示主菜单
  $ myauth switch              快速切换凭据
  $ myauth login               OAuth 登录获取新凭据
  $ myauth ls                  列出可用凭据（自动刷新）
  $ myauth use 1               切换到第 1 个凭据
  $ myauth delete 1            删除第 1 个凭据
  $ myauth whoami              配置管理
  
默认路径:
  凭据目录: ~/.myauth
  Codex 目标: ~/.codex/auth.json
  
更多信息: https://github.com/CrazyZhang123/myauth
`);

// 默认命令：显示菜单
program
  .action(() => {
    menu();
  });

// 主菜单
program
  .command('menu')
  .description('显示主菜单（交互式）')
  .action(menu);

// 快速切换
program
  .command('switch')
  .alias('s')
  .description('快速切换凭据')
  .action(switchMenu);

// 配置管理
program
  .command('whoami')
  .description('配置管理或查看当前状态')
  .action(whoami);

// OAuth 登录
program
  .command('login')
  .description('OAuth 登录获取新凭据')
  .action(login);

// 列出凭据（自动刷新）
program
  .command('ls')
  .description('列出可用的凭据源（自动刷新）')
  .option('--csv <path>', '导出为 CSV 文件')
  .action(ls);

// 切换凭据
program
  .command('use <index>')
  .description('切换到指定凭据')
  .option('--no-backup', '关闭备份（默认开启）')
  .action((index, options) => {
    use({ index, backup: options.backup });
  });

// 删除凭据
program
  .command('delete <index>')
  .alias('rm')
  .description('删除指定凭据')
  .action(async (index) => {
    await deleteCredential(index);
  });

program.parse();
