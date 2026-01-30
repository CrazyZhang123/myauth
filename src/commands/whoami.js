import { loadConfig, saveConfig, loadCache, saveCache, loadState } from '../utils/config.js';
import { question, confirm } from '../utils/prompt.js';
import { scanCredentials } from '../utils/scanner.js';
import { resolvePath, getDefaultPaths, formatPath } from '../utils/path.js';
import fs from 'fs';

export async function whoami() {
  const config = loadConfig();

  if (!config) {
    // 首次配置：交互式引导
    console.log('欢迎使用 myauth！首次使用需要配置。\n');
    
    const defaults = getDefaultPaths();
    
    const fromDirInput = await question(`请输入凭据源目录路径 (默认: ${formatPath(defaults.fromDir)}): `);
    const fromDir = resolvePath(fromDirInput || defaults.fromDir);
    
    if (!fs.existsSync(fromDir)) {
      console.error(`错误: 目录不存在: ${fromDir}`);
      console.error('提示: 请先使用 CLIProxyAPI 获取凭据');
      process.exit(1);
    }

    const targetFileInput = await question(`请输入目标 JSON 文件路径 (默认: ${formatPath(defaults.targetFile)}): `);
    const targetFile = resolvePath(targetFileInput || defaults.targetFile);

    const recursiveAnswer = await question('是否递归扫描子目录？(y/N): ');
    const recursive = recursiveAnswer.toLowerCase() === 'y';

    // 保存配置
    const newConfig = { fromDir, targetFile, recursive };
    saveConfig(newConfig);
    console.log('\n✓ 配置已保存\n');

    // 自动扫描
    console.log('正在扫描凭据源...');
    const credentials = await scanCredentials(fromDir, recursive);
    saveCache(credentials);
    console.log(`✓ 发现 ${credentials.length} 个可用凭据源\n`);
    
    return;
  }

  // 已有配置：显示摘要并询问是否修改
  console.log('=== 当前配置 ===');
  console.log(`fromDir: ${formatPath(config.fromDir)}`);
  console.log(`targetFile: ${formatPath(config.targetFile)}`);
  console.log(`recursive: ${config.recursive ? '是' : '否'}`);
  console.log();

  // 显示当前生效账号
  const state = loadState();
  const cache = loadCache();
  
  if (state && state.current_index) {
    const current = cache.find(c => c.index === state.current_index);
    if (current) {
      console.log('=== 当前生效账号 ===');
      console.log(`index: ${current.index}`);
      console.log(`email: ${current.email || '-'}`);
      console.log(`更新时间: ${state.updated_at || '-'}`);
    } else {
      console.log('=== 当前生效账号 ===');
      console.log('- (索引已失效)');
    }
  } else {
    console.log('=== 当前生效账号 ===');
    console.log('- (尚未选择任何 index)');
  }
  console.log();

  // 询问是否修改配置
  const shouldModify = await confirm('是否需要修改配置？');
  
  if (shouldModify) {
    console.log('\n请输入新配置（直接回车保持原值）:\n');
    
    const fromDirInput = await question(`fromDir [${formatPath(config.fromDir)}]: `);
    const targetFileInput = await question(`targetFile [${formatPath(config.targetFile)}]: `);
    const recursiveAnswer = await question(`recursive (y/N) [${config.recursive ? 'y' : 'N'}]: `);
    
    const newConfig = {
      fromDir: resolvePath(fromDirInput || config.fromDir),
      targetFile: resolvePath(targetFileInput || config.targetFile),
      recursive: recursiveAnswer.toLowerCase() === 'y' || (recursiveAnswer === '' && config.recursive)
    };

    // 验证路径
    if (!fs.existsSync(newConfig.fromDir)) {
      console.error(`错误: fromDir 不存在: ${newConfig.fromDir}`);
      process.exit(1);
    }

    saveConfig(newConfig);
    console.log('\n✓ 配置已更新\n');

    // 刷新扫描
    console.log('正在重新扫描凭据源...');
    const credentials = await scanCredentials(newConfig.fromDir, newConfig.recursive);
    saveCache(credentials);
    console.log(`✓ 发现 ${credentials.length} 个可用凭据源\n`);
  }
}
