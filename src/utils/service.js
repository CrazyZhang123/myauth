import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { ensureRuntimeDirs, getConfigPaths } from './config.js';

const MAC_SERVICE_LABEL = 'com.crazyzhang.zjjauth.watch';
const WINDOWS_TASK_NAME = 'zjjauth-watch';

function ensureSupportedPlatform() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    throw new Error('自动切号服务目前只支持 macOS 和 Windows');
  }
}

function execLaunchctl(args) {
  return execFileSync('launchctl', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function execPowerShell(script) {
  return execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function isLikelyNpxPath(filePath) {
  return /[/\\]\.npm[/\\]_npx[/\\]/.test(filePath) || /[/\\]_npx[/\\]/.test(filePath);
}

function getMacServiceDomain() {
  return `gui/${process.getuid()}`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parsePowerShellJson(output) {
  const text = String(output || '').trim();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

export function getWatchServicePaths() {
  const configPaths = getConfigPaths();
  const common = {
    platform: process.platform,
    stdoutPath: path.join(configPaths.configDir, 'watch.log'),
    stderrPath: path.join(configPaths.configDir, 'watch.err.log')
  };

  if (process.platform === 'darwin') {
    const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    return {
      ...common,
      serviceKind: 'LaunchAgent',
      serviceId: MAC_SERVICE_LABEL,
      serviceFileLabel: 'plist',
      serviceFilePath: path.join(launchAgentsDir, `${MAC_SERVICE_LABEL}.plist`),
      launchAgentsDir
    };
  }

  if (process.platform === 'win32') {
    const wrapperPath = path.join(configPaths.configDir, 'watch-service.cmd');
    return {
      ...common,
      serviceKind: '计划任务',
      serviceId: WINDOWS_TASK_NAME,
      serviceFileLabel: '脚本',
      serviceFilePath: wrapperPath,
      wrapperPath,
      taskName: WINDOWS_TASK_NAME
    };
  }

  ensureSupportedPlatform();
  return null;
}

export function resolveServiceEntry() {
  ensureSupportedPlatform();

  const scriptPath = fs.realpathSync(process.argv[1]);
  if (isLikelyNpxPath(scriptPath)) {
    throw new Error('请先通过 npm i -g zjjauth 全局安装，再执行服务安装');
  }

  return {
    nodePath: process.execPath,
    scriptPath
  };
}

function buildLaunchAgentPlist(entry, intervalSeconds) {
  const paths = getWatchServicePaths();
  const programArguments = [
    entry.nodePath,
    entry.scriptPath,
    'watch',
    '--foreground-service',
    '--interval',
    String(intervalSeconds)
  ];

  const argLines = programArguments
    .map((arg) => `    <string>${xmlEscape(arg)}</string>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${MAC_SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argLines}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(os.homedir())}</string>
  <key>StandardOutPath</key>
  <string>${xmlEscape(paths.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(paths.stderrPath)}</string>
</dict>
</plist>
`;
}

function buildWindowsWrapper(entry, intervalSeconds, paths) {
  return [
    '@echo off',
    'setlocal',
    `\"${entry.nodePath}\" \"${entry.scriptPath}\" watch --foreground-service --interval ${intervalSeconds} 1>> \"${paths.stdoutPath}\" 2>> \"${paths.stderrPath}\"`
  ].join('\r\n');
}

function installMacWatchService(intervalSeconds) {
  const paths = getWatchServicePaths();
  const entry = resolveServiceEntry();

  if (!fs.existsSync(paths.launchAgentsDir)) {
    fs.mkdirSync(paths.launchAgentsDir, { recursive: true });
  }

  fs.writeFileSync(paths.serviceFilePath, buildLaunchAgentPlist(entry, intervalSeconds), 'utf-8');

  try {
    execLaunchctl(['bootout', getMacServiceDomain(), paths.serviceFilePath]);
  } catch (err) {
    // 已卸载或尚未加载都不算错误
  }

  execLaunchctl(['bootstrap', getMacServiceDomain(), paths.serviceFilePath]);
  execLaunchctl(['enable', `${getMacServiceDomain()}/${MAC_SERVICE_LABEL}`]);
  execLaunchctl(['kickstart', '-k', `${getMacServiceDomain()}/${MAC_SERVICE_LABEL}`]);

  return {
    label: MAC_SERVICE_LABEL,
    ...paths
  };
}

function installWindowsWatchService(intervalSeconds) {
  const paths = getWatchServicePaths();
  const entry = resolveServiceEntry();

  fs.writeFileSync(paths.wrapperPath, buildWindowsWrapper(entry, intervalSeconds, paths), 'utf-8');

  const script = `
$taskName = ${psQuote(paths.taskName)}
$wrapperPath = ${psQuote(paths.wrapperPath)}
$userId = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\\$($env:USERNAME)" } else { $env:USERNAME }
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/d /c "' + $wrapperPath + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'zjjauth auto switch watch' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
`;

  execPowerShell(script);

  return {
    label: paths.taskName,
    ...paths
  };
}

export function installWatchService(options = {}) {
  ensureSupportedPlatform();
  ensureRuntimeDirs();

  const intervalSeconds = Number.isFinite(Number(options.intervalSeconds))
    ? Math.max(5, Number(options.intervalSeconds))
    : 10;

  if (process.platform === 'darwin') {
    return installMacWatchService(intervalSeconds);
  }

  return installWindowsWatchService(intervalSeconds);
}

function startMacWatchService() {
  const paths = getWatchServicePaths();
  if (!fs.existsSync(paths.serviceFilePath)) {
    throw new Error('服务尚未安装，请先执行 zjjauth watch --install-service');
  }

  try {
    execLaunchctl(['bootstrap', getMacServiceDomain(), paths.serviceFilePath]);
  } catch (err) {
    // 已加载时直接 kickstart
  }

  execLaunchctl(['enable', `${getMacServiceDomain()}/${MAC_SERVICE_LABEL}`]);
  execLaunchctl(['kickstart', '-k', `${getMacServiceDomain()}/${MAC_SERVICE_LABEL}`]);

  return {
    label: MAC_SERVICE_LABEL,
    ...paths
  };
}

function startWindowsWatchService() {
  const paths = getWatchServicePaths();
  if (!fs.existsSync(paths.wrapperPath)) {
    throw new Error('服务尚未安装，请先执行 zjjauth watch --install-service');
  }

  execPowerShell(`
$taskName = ${psQuote(paths.taskName)}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) { throw '服务尚未安装，请先执行 zjjauth watch --install-service' }
Start-ScheduledTask -TaskName $taskName
`);

  return {
    label: paths.taskName,
    ...paths
  };
}

export function startWatchService() {
  ensureSupportedPlatform();
  return process.platform === 'darwin'
    ? startMacWatchService()
    : startWindowsWatchService();
}

function stopMacWatchService() {
  const paths = getWatchServicePaths();

  try {
    execLaunchctl(['bootout', getMacServiceDomain(), paths.serviceFilePath]);
  } catch (err) {
    if (!fs.existsSync(paths.serviceFilePath)) {
      return {
        label: MAC_SERVICE_LABEL,
        stopped: false,
        ...paths
      };
    }
  }

  return {
    label: MAC_SERVICE_LABEL,
    stopped: true,
    ...paths
  };
}

function stopWindowsWatchService() {
  const paths = getWatchServicePaths();
  if (!fs.existsSync(paths.wrapperPath)) {
    return {
      label: paths.taskName,
      stopped: false,
      ...paths
    };
  }

  execPowerShell(`
$taskName = ${psQuote(paths.taskName)}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) { exit 0 }
if ([string]$task.State -eq 'Running') {
  Stop-ScheduledTask -TaskName $taskName
}
`);

  return {
    label: paths.taskName,
    stopped: true,
    ...paths
  };
}

export function stopWatchService() {
  ensureSupportedPlatform();
  return process.platform === 'darwin'
    ? stopMacWatchService()
    : stopWindowsWatchService();
}

function uninstallMacWatchService() {
  const paths = getWatchServicePaths();

  try {
    stopMacWatchService();
  } catch (err) {
    // 删除前尽力停止
  }

  if (fs.existsSync(paths.serviceFilePath)) {
    fs.unlinkSync(paths.serviceFilePath);
  }

  return {
    label: MAC_SERVICE_LABEL,
    ...paths
  };
}

function uninstallWindowsWatchService() {
  const paths = getWatchServicePaths();

  execPowerShell(`
$taskName = ${psQuote(paths.taskName)}
try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}
`);

  if (fs.existsSync(paths.wrapperPath)) {
    fs.unlinkSync(paths.wrapperPath);
  }

  return {
    label: paths.taskName,
    ...paths
  };
}

export function uninstallWatchService() {
  ensureSupportedPlatform();
  return process.platform === 'darwin'
    ? uninstallMacWatchService()
    : uninstallWindowsWatchService();
}

function getMacWatchServiceStatus() {
  const paths = getWatchServicePaths();
  const installed = fs.existsSync(paths.serviceFilePath);

  if (!installed) {
    return {
      supported: true,
      installed: false,
      loaded: false,
      running: false,
      label: MAC_SERVICE_LABEL,
      ...paths
    };
  }

  try {
    const output = execLaunchctl(['print', `${getMacServiceDomain()}/${MAC_SERVICE_LABEL}`]);
    return {
      supported: true,
      installed: true,
      loaded: true,
      running: /state = running/i.test(output) || /pid = \d+/i.test(output),
      label: MAC_SERVICE_LABEL,
      raw: output,
      ...paths
    };
  } catch (err) {
    return {
      supported: true,
      installed: true,
      loaded: false,
      running: false,
      label: MAC_SERVICE_LABEL,
      ...paths
    };
  }
}

function getWindowsWatchServiceStatus() {
  const paths = getWatchServicePaths();
  const installed = fs.existsSync(paths.wrapperPath);

  if (!installed) {
    return {
      supported: true,
      installed: false,
      loaded: false,
      running: false,
      label: paths.taskName,
      state: 'Missing',
      ...paths
    };
  }

  const output = execPowerShell(`
$taskName = ${psQuote(paths.taskName)}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
  [pscustomobject]@{
    installed = $false
    loaded = $false
    running = $false
    state = 'Missing'
  } | ConvertTo-Json -Compress
  exit 0
}
$info = $task | Get-ScheduledTaskInfo
[pscustomobject]@{
  installed = $true
  loaded = $true
  running = ([string]$task.State -eq 'Running')
  state = [string]$task.State
  lastRunTime = $info.LastRunTime
  nextRunTime = $info.NextRunTime
  lastTaskResult = $info.LastTaskResult
} | ConvertTo-Json -Compress
`);
  const parsed = parsePowerShellJson(output) || {};

  return {
    supported: true,
    label: paths.taskName,
    ...paths,
    ...parsed
  };
}

export function getWatchServiceStatus() {
  ensureSupportedPlatform();
  return process.platform === 'darwin'
    ? getMacWatchServiceStatus()
    : getWindowsWatchServiceStatus();
}
