#!/usr/bin/env node

import { Command, Option } from 'commander';
import { login } from '../src/commands/login.js';
import { menu } from '../src/commands/menu.js';
import { switchMenu } from '../src/commands/switch.js';
import { watchLimits } from '../src/commands/watch.js';

const program = new Command();

program
  .name('zjjauth')
  .description('OAuth 凭据管理工具 - 极简帐号池与自动切号 CLI')
  .version('1.0.2')
  .addHelpText('after', `
示例:
  $ zjjauth
  $ zjjauth login
  $ zjjauth pool
  $ zjjauth watch
  $ zjjauth watch --install-service
  $ zjjauth watch --status
  
默认路径:
  凭据目录: ~/.zjjauth
  Codex 目标: ~/.codex/auth.json
  
更多信息: https://github.com/CrazyZhang123/myauth
`);

program.action(() => {
  menu();
});

program
  .command('pool')
  .alias('switch')
  .alias('s')
  .description('打开帐号池（切换 / 删除 / 实时额度）')
  .action(switchMenu);

program
  .command('login')
  .description('OAuth 登录获取新凭据')
  .action(login);

program
  .command('watch')
  .description('自动监控剩余额度并在低额度时切换账号')
  .option('--interval <seconds>', '轮询间隔（秒）', '10')
  .option('--once', '只执行一次检测')
  .option('--install-service', '安装并启动系统自启服务（macOS/Windows）')
  .option('--uninstall-service', '卸载系统自启服务（macOS/Windows）')
  .option('--start', '启动已安装的自动切号服务')
  .option('--stop', '停止已安装的自动切号服务')
  .option('--status', '查看自动切号服务状态')
  .addOption(new Option('--foreground-service').hideHelp())
  .action(async (options) => {
    await watchLimits(options);
  });

program.parse();
