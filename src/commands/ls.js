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

  // 输出列表（只包含 index, email, type）
  if (cache.length > 0) {
    console.log('INDEX | EMAIL                          | TYPE');
    console.log('------|--------------------------------|----------');
    
    for (const item of cache) {
      const index = item.index.padEnd(5);
      const email = (item.email || '-').padEnd(30);
      const type = item.type || '-';
      console.log(`${index} | ${email} | ${type}`);
    }
  }

  // 导出 CSV
  if (options.csv) {
    const csvLines = ['index,email,type'];
    for (const item of cache) {
      const email = item.email || '';
      const type = item.type || '';
      csvLines.push(`${item.index},${email},${type}`);
    }
    
    fs.writeFileSync(options.csv, csvLines.join('\n'), 'utf-8');
    console.log(`\n✓ 已导出到: ${options.csv}`);
  }
}
