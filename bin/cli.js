#!/usr/bin/env node

import { Command } from 'commander';
import { login } from '../src/commands/login.js';
import { menu } from '../src/commands/menu.js';
import { switchMenu } from '../src/commands/switch.js';
import { ensureProxyConfigInteractive } from '../src/utils/proxy.js';

const program = new Command();

program
  .name('zjjauth')
  .description('OAuth 凭据管理工具 - 极简帐号池 CLI')
  .version('1.0.3')
  .addHelpText('after', `
示例:
  $ zjjauth
  $ zjjauth login
  $ zjjauth pool
  
默认路径:
  凭据目录: ~/.zjjauth
  Codex 目标: ~/.codex/auth.json
  
更多信息: https://github.com/CrazyZhang123/myauth
`);

program.action(async () => {
  await ensureProxyConfigInteractive();
  await menu();
});

program
  .command('pool')
  .alias('switch')
  .alias('s')
  .description('打开帐号池（切换 / 删除 / 实时额度）')
  .action(async () => {
    await ensureProxyConfigInteractive();
    await switchMenu();
  });

program
  .command('login')
  .description('OAuth 登录获取新凭据')
  .action(async () => {
    await ensureProxyConfigInteractive();
    await login();
  });

program.parse();
