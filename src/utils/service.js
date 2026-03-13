function buildRemovedError() {
  return new Error('自动切号服务已移除');
}

export function getWatchServicePaths() {
  return null;
}

export function resolveServiceEntry() {
  throw buildRemovedError();
}

export function installWatchService() {
  throw buildRemovedError();
}

export function startWatchService() {
  throw buildRemovedError();
}

export function stopWatchService() {
  throw buildRemovedError();
}

export function uninstallWatchService() {
  throw buildRemovedError();
}

export function getWatchServiceStatus() {
  return {
    installed: false,
    running: false,
    description: '自动切号服务已移除'
  };
}
