import fs from 'fs';
import os from 'os';
import path from 'path';

export function getDefaultCodexTargetFile() {
  return path.join(os.homedir(), '.codex', 'auth.json');
}

export function getDefaultOpenCodeTargetFile() {
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
}

function getWindowsOpenCodeFallbackFile() {
  if (process.platform !== 'win32' || !process.env.APPDATA) {
    return null;
  }

  return path.join(process.env.APPDATA, 'opencode', 'auth.json');
}

function pushTarget(targets, seenPaths, label, filePath) {
  if (typeof filePath !== 'string' || !filePath) {
    return;
  }

  if (seenPaths.has(filePath)) {
    return;
  }

  seenPaths.add(filePath);
  targets.push({
    label,
    path: filePath
  });
}

export function getTargetCandidates(config = {}) {
  const targets = [];
  const seenPaths = new Set();

  pushTarget(targets, seenPaths, 'Codex', config.targetFile || getDefaultCodexTargetFile());
  pushTarget(targets, seenPaths, 'Codex', getDefaultCodexTargetFile());

  pushTarget(targets, seenPaths, 'OpenCode', config.opencodeTargetFile || getDefaultOpenCodeTargetFile());
  pushTarget(targets, seenPaths, 'OpenCode', getDefaultOpenCodeTargetFile());
  pushTarget(targets, seenPaths, 'OpenCode', getWindowsOpenCodeFallbackFile());

  return targets;
}

export function targetDirectoryExists(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath) {
    return false;
  }

  return fs.existsSync(path.dirname(targetPath));
}

export function resolveExistingTargets(config = {}) {
  return getTargetCandidates(config).filter((target) => targetDirectoryExists(target.path));
}

export function getPrimaryTargetFile(config = {}) {
  const [target] = resolveExistingTargets(config);
  return target?.path || null;
}
