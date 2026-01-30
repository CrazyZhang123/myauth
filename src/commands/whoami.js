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
    
    // 询问凭据来源
    console.log('请选择凭据来源:');
    console.log('  [1] OAuth 登录 (推荐) - 使用 myauth login 获取的凭据');
    console.log('  [2] CLIProxyAPI - 使用 CLIProxyAPI 工具获取的凭据');
    
    let sourceChoice;
    while (true) {
      sourceChoice = await question('\n请输入选项 (1/2): ');
      if (sourceChoice === '1' || sourceChoice === '2') {
        break;
      }
      console.log('无效选项，请输入 1 或 2');
    }
    
    const defaults = getDefaultPaths();
    let fromDir;
    
    if (sourceChoice === '1') {
      // OAuth 登录凭据
      console.log('\n✓ 已选择: OAuth 登录凭据');
      console.log(`默认目录: ${formatPath(defaults.oauthDir)}\n`);
      
      const fromDirInput = await question(`请输入凭据源目录路径 (默认: ${formatPath(defaults.oauthDir)}): `);
      fromDir = resolvePath(fromDirInput || defaults.oauthDir);
    } else {
      // CLIProxyAPI 凭据
      console.log('\n✓ 已选择: CLIProxyAPI 凭据');
      console.log(`默认目录: ${formatPath(defaults.fromDir)}\n`);
      
      const fromDirInput = await question(`请输入凭据源目录路径 (默认: ${formatPath(defaults.fromDir)}): `);
      fromDir = resolvePath(fromDirInput || defaults.fromDir);
    }
    
    if (!fs.existsSync(fromDir)) {
      console.error(`错误: 目录不存在: ${fromDir}`);
      if (sourceChoice === '1') {
        console.error('提示: 请先运行 myauth login 获取凭据');
      } else {
        console.error('提示: 请先使用 CLIProxyAPI 获取凭据');
      }
      process.exit(1);
    }

    const targetFileInput = await question(`请输入目标 JSON 文件路径 (默认: ${formatPath(defaults.targetFile)}): `);
    const targetFile = resolvePath(targetFileInput || defaults.targetFile);

    const recursiveAnswer = await question('是否递归扫描子目录？(y/N): ');
    const recursive = recursiveAnswer.toLowerCase() === 'y';

    // 保存配置（包含来源类型）
    const newConfig = { 
      fromDir, 
      targetFile, 
      recursive,
      source: sourceChoice === '1' ? 'oauth' : 'cliproxyapi'
    };
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
  console.log(`来源: ${config.source === 'oauth' ? 'OAuth 登录' : 'CLIProxyAPI'}`);
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
      if (config.source === 'oauth' && current.plan) {
        console.log(`plan: ${current.plan}`);
        if (current.team_space) {
          console.log(`team_space: ${current.team_space}`);
        }
      }
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
    
    // 询问是否切换来源
    console.log('当前来源:', config.source === 'oauth' ? 'OAuth 登录' : 'CLIProxyAPI');
    const switchSource = await confirm('是否切换凭据来源？');
    
    let newSource = config.source;
    let newFromDir = config.fromDir;
    
    if (switchSource) {
      console.log('\n请选择新的凭据来源:');
      console.log('  [1] OAuth 登录');
      console.log('  [2] CLIProxyAPI');
      
      let sourceChoice;
      while (true) {
        sourceChoice = await question('\n请输入选项 (1/2): ');
        if (sourceChoice === '1' || sourceChoice === '2') {
          break;
        }
        console.log('无效选项，请输入 1 或 2');
      }
      
      newSource = sourceChoice === '1' ? 'oauth' : 'cliproxyapi';
      const defaults = getDefaultPaths();
      const defaultDir = sourceChoice === '1' ? defaults.oauthDir : defaults.fromDir;
      
      const fromDirInput = await question(`fromDir [${formatPath(defaultDir)}]: `);
      newFromDir = resolvePath(fromDirInput || defaultDir);
    } else {
      const fromDirInput = await question(`fromDir [${formatPath(config.fromDir)}]: `);
      newFromDir = resolvePath(fromDirInput || config.fromDir);
    }
    
    const targetFileInput = await question(`targetFile [${formatPath(config.targetFile)}]: `);
    const recursiveAnswer = await question(`recursive (y/N) [${config.recursive ? 'y' : 'N'}]: `);
    
    const newConfig = {
      fromDir: newFromDir,
      targetFile: resolvePath(targetFileInput || config.targetFile),
      recursive: recursiveAnswer.toLowerCase() === 'y' || (recursiveAnswer === '' && config.recursive),
      source: newSource
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
