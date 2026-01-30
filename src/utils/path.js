import os from 'os';
import path from 'path';

/**
 * 解析路径，支持 ~ 符号
 * @param {string} inputPath - 输入路径
 * @returns {string} 解析后的绝对路径
 */
export function resolvePath(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  // 处理 ~ 开头的路径
  if (inputPath.startsWith('~')) {
    const homeDir = os.homedir();
    return path.join(homeDir, inputPath.slice(1));
  }

  // 处理相对路径
  if (!path.isAbsolute(inputPath)) {
    return path.resolve(inputPath);
  }

  // 已经是绝对路径
  return inputPath;
}

/**
 * 获取默认配置路径
 * @returns {object} 默认路径配置
 */
export function getDefaultPaths() {
  const homeDir = os.homedir();
  
  return {
    fromDir: path.join(homeDir, '.cli-proxy-api'),
    targetFile: path.join(homeDir, '.codex', 'auth.json')
  };
}

/**
 * 格式化路径显示（将用户目录替换为 ~）
 * @param {string} fullPath - 完整路径
 * @returns {string} 格式化后的路径
 */
export function formatPath(fullPath) {
  if (!fullPath) {
    return fullPath;
  }

  const homeDir = os.homedir();
  
  if (fullPath.startsWith(homeDir)) {
    return '~' + fullPath.slice(homeDir.length);
  }
  
  return fullPath;
}
