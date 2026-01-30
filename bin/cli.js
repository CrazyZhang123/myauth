#!/usr/bin/env node

import { Command } from 'commander';
import { whoami } from '../src/commands/whoami.js';
import { ls } from '../src/commands/ls.js';
import { use } from '../src/commands/use.js';

const program = new Command();

program
  .name('myauth')
  .description('凭据切换 CLI 工具 - 基于 CLIProxyAPI 项目')
  .version('1.0.0')
  .addHelpText('after', `
示例:
  $ myauth whoami              配置工具
  $ myauth ls                  列出可用凭据
  $ myauth ls --refresh        刷新凭据列表
  $ myauth use --index 1       切换到第 1 个凭据
  
默认路径:
  CLI 凭证: ~/.cli-proxy-api
  Codex 目标: ~/.codex/auth.json
  
更多信息: https://github.com/CrazyZhang123/myauth
`);

program
  .command('whoami')
  .description('配置工具或查看当前状态')
  .action(whoami);

program
  .command('ls')
  .description('列出可用的凭据源')
  .option('--refresh', '强制重新扫描并更新缓存')
  .option('--csv <path>', '导出为 CSV 文件')
  .action(ls);

program
  .command('use')
  .description('切换到指定凭据')
  .requiredOption('--index <id>', '凭据索引 ID')
  .option('--no-backup', '关闭备份（默认开启）')
  .action(use);

program.parse();
