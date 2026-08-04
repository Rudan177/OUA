/**
 * Preload 脚本 - 安全桥接主进程和渲染进程
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const platform = process.platform;
const pathSep = platform === 'win32' ? '\\' : '/';

function joinPath(...args) {
  const parts = args.filter(p => p && p.length > 0);
  if (parts.length === 0) return '.';

  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (result.endsWith(pathSep) || part.startsWith(pathSep)) {
      result += part;
    } else {
      result += pathSep + part;
    }
  }
  return result;
}

contextBridge.exposeInMainWorld('electronAPI', {
  isDev: process.env.OUA_DEV === '1',
  platform: platform,
  path: {
    join: joinPath,
    sep: pathSep
  },
  /** 从 File 对象获取真实文件系统路径（用于拖放场景） */
  getFilePath: (file) => webUtils.getPathForFile(file),
  folder: {
    checkStructure: (dirPath) => ipcRenderer.invoke('check-folder-structure', dirPath),
    hasWritePermission: (dirPath) => ipcRenderer.invoke('has-write-permission', dirPath),
    ensureDirectory: (dirPath) => ipcRenderer.invoke('ensure-directory', dirPath),
    getInstallDir: () => ipcRenderer.invoke('get-install-dir'),
    setInstallDir: (dirPath) => ipcRenderer.invoke('set-install-dir', dirPath),
    getUserPaths: () => ipcRenderer.invoke('get-user-paths')
  },
  system: {
    diagnose: () => ipcRenderer.invoke('diagnose-git')
  },
  update: {
    getLocalVersion: (installDir) => ipcRenderer.invoke('get-local-version', installDir),
    getRemoteVersion: (branch) => ipcRenderer.invoke('get-remote-version', branch),
    compareVersions: (localVersion, remoteVersion) => ipcRenderer.invoke('compare-versions', localVersion, remoteVersion),
    firstInstall: (targetDir) => ipcRenderer.invoke('first-install', targetDir),
    forceOverwrite: (targetDir, branch) => ipcRenderer.invoke('force-overwrite', targetDir, branch),
    updateApp: (targetDir, branch) => ipcRenderer.invoke('update-app', targetDir, branch),
    switchBranch: (targetDir, branch) => ipcRenderer.invoke('switch-branch', targetDir, branch),
    importLocalZip: (zipPath) => ipcRenderer.invoke('import-local-zip', zipPath),
    getBranch: () => ipcRenderer.invoke('get-branch'),
    setBranch: (branch) => ipcRenderer.invoke('set-branch', branch),
    onUpdateProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('update-progress', handler);
      return () => ipcRenderer.removeListener('update-progress', handler);
    }
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    selectZipFile: () => ipcRenderer.invoke('select-zip-file'),
    fetchNotifications: () => ipcRenderer.invoke('fetch-notifications')
  },
  app: {
    reset: () => ipcRenderer.invoke('app-reset'),
    restart: () => ipcRenderer.invoke('app-restart'),
    uninstall: () => ipcRenderer.invoke('app-uninstall'),
    hideWindow: () => ipcRenderer.invoke('window-hide')
  },
  settings: {
    getProxyConfig: () => ipcRenderer.invoke('get-proxy-config'),
    setProxyConfig: (config) => ipcRenderer.invoke('set-proxy-config', config),
    getStartupConfig: () => ipcRenderer.invoke('get-startup-config'),
    setStartupConfig: (config) => ipcRenderer.invoke('set-startup-config', config),
    getHotkeyConfig: () => ipcRenderer.invoke('get-hotkey-config'),
    setHotkeyConfig: (config) => ipcRenderer.invoke('set-hotkey-config', config)
  },
  appConfig: {
    getAppInfo: () => ipcRenderer.invoke('get-app-config')
  },
  selfUpdate: {
    check: () => ipcRenderer.invoke('self-update-check'),
    download: () => ipcRenderer.invoke('self-update-download'),
    openDownload: (filePath) => ipcRenderer.invoke('self-update-open', filePath),
    clearPending: () => ipcRenderer.invoke('self-update-clear-pending'),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('self-update-progress', handler);
      return () => ipcRenderer.removeListener('self-update-progress', handler);
    }
  }
});
