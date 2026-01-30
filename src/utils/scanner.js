import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';

// 扫描目录中的 JSON 文件
export async function scanCredentials(fromDir, recursive = false) {
  const pattern = recursive ? '**/*.json' : '*.json';
  const files = await fg(pattern, {
    cwd: fromDir,
    absolute: false,
    onlyFiles: true
  });

  // 按文件名排序，确保顺序稳定
  files.sort();

  const results = [];
  let indexCounter = 1;

  for (const file of files) {
    const fullPath = path.join(fromDir, file);
    
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const json = JSON.parse(content);

      // 只处理 type 为 codex 的凭据
      if (json.type !== 'codex') {
        continue;
      }

      // 使用数字索引（从 1 开始）
      const index = indexCounter.toString();
      indexCounter++;

      // 提取字段（容错处理）
      const item = {
        index,
        path: file,
        email: json.email || null,
        type: json.type || null,
        plan: json.plan || null,
        team_space: json.team_space || null,
        id_token: json.id_token || null,
        access_token: json.access_token || null,
        account_id: json.account_id || null,
        last_refresh: json.last_refresh || null
      };

      results.push(item);
    } catch (err) {
      // 跳过无法解析的文件
      continue;
    }
  }

  return results;
}
