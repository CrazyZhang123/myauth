import chalk from 'chalk';
import { loadConfig, loadCache, saveCache } from '../utils/config.js';
import { scanCredentials } from '../utils/scanner.js';
import { deleteCredential } from './delete.js';
import { question } from '../utils/prompt.js';
import fs from 'fs';

export async function ls(options = {}) {
  const config = loadConfig();
  
  if (!config) {
    console.error(chalk.red('❌ 错误: 尚未配置，请先运行 myauth whoami'));
    process.exit(1);
  }

  // 自动刷新
  console.log(chalk.gray('🔍 正在扫描凭据...'));
  let cache = await scanCredentials(config.fromDir);
  saveCache(cache);
  
  // 清除"正在扫描"的行
  process.stdout.write('\r\x1b[K');

  // 输出总数
  console.log(chalk.cyan(`📊 可用凭据源总数: ${cache.length}\n`));

  // 输出列表
  if (cache.length > 0) {
    console.log(chalk.gray('INDEX | PLAN  | SPACE          | EMAIL                          | TYPE'));
    console.log(chalk.gray('------|-------|----------------|--------------------------------|----------'));
    
    for (const item of cache) {
      const index = item.index.padEnd(5);
      const plan = (item.plan || '-').padEnd(5);
      const space = (item.team_space || '-').padEnd(14);
      const email = (item.email || '-').padEnd(30);
      const type = item.type || '-';
      console.log(chalk.white(`${index} | ${plan} | ${space} | ${email} | ${type}`));
    }
    
    // 如果是交互式调用（从菜单），提供删除选项
    if (options.interactive) {
      console.log();
      console.log(chalk.gray('🗑️  输入数字删除对应凭据，或按回车返回'));
      const choice = await question(chalk.cyan('删除凭据 (索引): '));
      
      if (choice.trim()) {
        const targetIndex = choice.trim();
        const credential = cache.find(c => c.index === targetIndex);
        
        if (credential) {
          console.log();
          console.log(chalk.yellow(`⚠️  确认删除: ${credential.email} (${credential.plan || '-'})?`));
          const confirm = await question(chalk.cyan('确认删除？ (y/n): '));
          
          if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            console.log();
            const success = await deleteCredential(targetIndex);
            if (success) {
              // 重新扫描并显示
              cache = await scanCredentials(config.fromDir);
              saveCache(cache);
              console.log(chalk.cyan(`\n📊 剩余凭据: ${cache.length} 个`));
            }
          } else {
            console.log(chalk.gray('❌ 已取消删除'));
          }
        } else {
          console.log(chalk.red(`\n❌ 错误: 未找到 index 为 ${targetIndex} 的凭据`));
        }
      }
    }
  } else {
    console.log(chalk.yellow('⚠️  暂无可用凭据'));
    console.log(chalk.gray('💡 提示: 运行 myauth login 添加账号'));
  }

  // 导出 CSV
  if (options.csv) {
    const csvLines = ['index,plan,team_space,email,type'];
      
    for (const item of cache) {
      const plan = item.plan || '';
      const space = item.team_space || '';
      const email = item.email || '';
      const type = item.type || '';
      csvLines.push(`${item.index},${plan},${space},${email},${type}`);
    }
    
    fs.writeFileSync(options.csv, csvLines.join('\n'), 'utf-8');
    console.log(chalk.green(`\n✅ 已导出到: ${options.csv}`));
  }
}
