import { loadConfig, loadCache, saveCache } from '../utils/config.js';
import { scanCredentials } from '../utils/scanner.js';
import fs from 'fs';

export async function ls(options) {
  const config = loadConfig();
  
  if (!config) {
    console.error('错误: 尚未配置，请先运行 myauth whoami');
    process.exit(1);
  }

  let cache = loadCache();

  // 如果需要刷新
  if (options.refresh) {
    console.log('正在重新扫描...');
    cache = await scanCredentials(config.fromDir, config.recursive);
    saveCache(cache);
    console.log('✓ 缓存已更新\n');
  }

  // 输出总数
  console.log(`可用凭据源总数: ${cache.length}\n`);

  // 根据来源类型决定显示的列
  const isOAuth = config.source === 'oauth';

  // 输出列表
  if (cache.length > 0) {
    if (isOAuth) {
      // OAuth 凭据：显示 INDEX | PLAN | SPACE | EMAIL | TYPE
      console.log('INDEX | PLAN  | SPACE          | EMAIL                          | TYPE');
      console.log('------|-------|----------------|--------------------------------|----------');
      
      for (const item of cache) {
        const index = item.index.padEnd(5);
        const plan = (item.plan || '-').padEnd(5);
        const space = (item.team_space || '-').padEnd(14);
        const email = (item.email || '-').padEnd(30);
        const type = item.type || '-';
        console.log(`${index} | ${plan} | ${space} | ${email} | ${type}`);
      }
    } else {
      // CLIProxyAPI 凭据：显示 INDEX | EMAIL | TYPE
      console.log('INDEX | EMAIL                          | TYPE');
      console.log('------|--------------------------------|----------');
      
      for (const item of cache) {
        const index = item.index.padEnd(5);
        const email = (item.email || '-').padEnd(30);
        const type = item.type || '-';
        console.log(`${index} | ${email} | ${type}`);
      }
    }
  }

  // 导出 CSV
  if (options.csv) {
    const csvLines = isOAuth 
      ? ['index,plan,team_space,email,type']
      : ['index,email,type'];
      
    for (const item of cache) {
      if (isOAuth) {
        const plan = item.plan || '';
        const space = item.team_space || '';
        const email = item.email || '';
        const type = item.type || '';
        csvLines.push(`${item.index},${plan},${space},${email},${type}`);
      } else {
        const email = item.email || '';
        const type = item.type || '';
        csvLines.push(`${item.index},${email},${type}`);
      }
    }
    
    fs.writeFileSync(options.csv, csvLines.join('\n'), 'utf-8');
    console.log(`\n✓ 已导出到: ${options.csv}`);
  }
}
