/**
 * Electron 主进程入口
 */
const { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const logger = require('./utils/logger');
const pathUtils = require('./utils/pathUtils');
const configService = require('./services/configService');
const fileUtils = require('./utils/fileUtils');

const { registerFileIPC } = require('./ipc/fileIPC');
const { registerUpdateIPC } = require('./ipc/updateIPC');
const { registerDialogIPC } = require('./ipc/dialogIPC');

let mainWindow;
let tray = null;
let isRestarting = false;
let isQuitting = false;

function getAppIcon() {
  const iconDir = path.join(__dirname, '..', 'renderer', 'assets', 'icons');
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'logo.png';
  const iconPath = path.join(iconDir, iconFile);
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon;
    }
    logger.warn('应用图标加载为空: ' + iconPath);
  } catch (error) {
    logger.warn('应用图标加载失败: ' + error.message);
  }
  return null;
}

// 单实例锁 - 防止多开
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 当第二个实例尝试启动时，聚焦到第一个实例的窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 只在开发环境下设置自定义的 userData 路径
if (!app.isPackaged) {
  const appRoot = path.join(__dirname, '..');
  const customUserData = path.join(appRoot, 'storage');

  if (!fs.existsSync(customUserData)) {
    fs.mkdirSync(customUserData, { recursive: true });
  }

  app.setPath('userData', customUserData);
}

function getTitleBarStyle() {
  if (process.platform === 'darwin') {
    return 'hiddenInset';
  }
  return 'default';
}

function createWindow(silentMode = false) {
  const appIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'OOOInterface Update Assistant',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: getTitleBarStyle(),
    autoHideMenuBar: true,
    icon: appIcon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f5f5f5',
    show: false
  });

  if (appIcon) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!silentMode) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && !isRestarting) {
      const startupConfig = configService.getStartupConfig();
      if (startupConfig.minimizeToTray) {
        event.preventDefault();
        mainWindow.hide();
      }
    }
  });
}

// 监听系统主题变化（只注册一次）
nativeTheme.on('updated', () => {
  if (mainWindow) {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  }
});

// 注册本地 ZIP 导入 IPC
ipcMain.handle('import-local-zip', async (event, zipPath) => {
  const zipService = require('./services/zipService');
  const installDir = configService.getInstallDir();

  if (!installDir) {
    throw new Error('未设置安装目录，请在设置中先选择安装目录');
  }

  logger.info(`开始本地导入: ${zipPath} -> ${installDir}`);

  return zipService.extractAndValidateZip(zipPath, installDir, (progress) => {
    event.sender.send('update-progress', progress);
  });
});

// 注册获取用户路径的 IPC
ipcMain.handle('get-user-paths', async () => {
  return {
    documents: app.getPath('documents'),
    desktop: app.getPath('desktop'),
    home: app.getPath('home'),
    appData: app.getPath('appData')
  };
});

// 注册诊断功能（简化版，不再依赖 git）
ipcMain.handle('diagnose-git', async () => {
  const results = {
    tempDir: pathUtils.getTempDir(),
    tempDirExists: false,
    tempDirWritable: false
  };

  try {
    if (!fs.existsSync(results.tempDir)) {
      fs.mkdirSync(results.tempDir, { recursive: true });
    }
    results.tempDirExists = fs.existsSync(results.tempDir);

    const testFile = path.join(results.tempDir, 'test-write-' + Date.now() + '.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    results.tempDirWritable = true;
  } catch (error) {
    results.tempDirError = error.message;
  }

  return results;
});

// 注册恢复出厂设置功能
ipcMain.handle('app-reset', async () => {
  try {
    logger.info('开始恢复出厂设置...');

    // 清除临时目录
    const tempDir = pathUtils.getTempDir();
    try {
      if (fs.existsSync(tempDir)) {
        fileUtils.removeDirectory(tempDir);
        fs.mkdirSync(tempDir, { recursive: true });
      }
      logger.info('临时目录已清除');
    } catch (error) {
      logger.warn(`清除临时目录失败: ${error.message}`);
    }

    // 清除日志目录
    const logDir = pathUtils.getLogDir();
    try {
      if (fs.existsSync(logDir)) {
        fileUtils.removeDirectory(logDir);
        fs.mkdirSync(logDir, { recursive: true });
      }
      logger.info('日志目录已清除');
    } catch (error) {
      logger.warn(`清除日志目录失败: ${error.message}`);
    }

    // 清除缓存目录
    const cacheDir = pathUtils.getCacheDir();
    try {
      if (fs.existsSync(cacheDir)) {
        fileUtils.removeDirectory(cacheDir);
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      logger.info('缓存目录已清除');
    } catch (error) {
      logger.warn(`清除缓存目录失败: ${error.message}`);
    }

    // 删除配置文件（恢复出厂设置的关键）
    const configPath = pathUtils.getConfigFilePath();
    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        logger.info('配置文件已删除');
      }
    } catch (error) {
      logger.warn(`删除配置文件失败: ${error.message}`);
    }

    logger.info('恢复出厂设置完成，准备重启...');

    // 设置重启标志，防止 window-all-closed 触发 app.quit()
    isRestarting = true;

    // 先关闭窗口
    if (mainWindow) {
      mainWindow.close();
    }

    // 等待一下再重启
    setTimeout(() => {
      app.relaunch({ execPath: process.execPath });
      app.exit(0);
    }, 500);

    return true;
  } catch (error) {
    logger.error(`恢复出厂设置失败: ${error.message}`);
    throw error;
  }
});

// 注册完全关闭并重启功能
ipcMain.handle('app-restart', async () => {
  try {
    logger.info('开始完全关闭并重启应用...');

    // 设置重启标志
    isRestarting = true;

    // 先调用 relaunch 再关闭窗口
    app.relaunch({ execPath: process.execPath });

    // 关闭窗口
    if (mainWindow) {
      mainWindow.close();
    }

    // 退出当前实例
    app.exit(0);
  } catch (error) {
    logger.error(`应用重启失败: ${error.message}`);
    throw error;
  }
});

// 注册一键卸载功能
ipcMain.handle('app-uninstall', async () => {
  try {
    logger.info('开始一键卸载...');

    // 获取安装目录
    const installDir = configService.getInstallDir();

    // 删除安装目录（如果存在）
    if (installDir && fs.existsSync(installDir)) {
      try {
        fileUtils.removeDirectory(installDir);
        logger.info(`安装目录已删除: ${installDir}`);
      } catch (error) {
        logger.warn(`删除安装目录失败: ${error.message}`);
      }
    }

    // 清除临时目录
    const tempDir = pathUtils.getTempDir();
    try {
      if (fs.existsSync(tempDir)) {
        fileUtils.removeDirectory(tempDir);
      }
      logger.info('临时目录已清除');
    } catch (error) {
      logger.warn(`清除临时目录失败: ${error.message}`);
    }

    // 清除日志目录
    const logDir = pathUtils.getLogDir();
    try {
      if (fs.existsSync(logDir)) {
        fileUtils.removeDirectory(logDir);
      }
      logger.info('日志目录已清除');
    } catch (error) {
      logger.warn(`清除日志目录失败: ${error.message}`);
    }

    // 清除缓存目录
    const cacheDir = pathUtils.getCacheDir();
    try {
      if (fs.existsSync(cacheDir)) {
        fileUtils.removeDirectory(cacheDir);
      }
      logger.info('缓存目录已清除');
    } catch (error) {
      logger.warn(`清除缓存目录失败: ${error.message}`);
    }

    // 删除配置文件
    const configPath = pathUtils.getConfigFilePath();
    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        logger.info('配置文件已删除');
      }
    } catch (error) {
      logger.warn(`删除配置文件失败: ${error.message}`);
    }

    logger.info('一键卸载完成，准备退出...');

    // 设置重启标志，防止 window-all-closed 触发 app.quit()
    isRestarting = true;

    // 关闭窗口并退出
    if (mainWindow) {
      mainWindow.close();
    }

    setTimeout(() => {
      app.exit(0);
    }, 500);

    return true;
  } catch (error) {
    logger.error(`一键卸载失败: ${error.message}`);
    throw error;
  }
});

// 注册代理配置相关 IPC
ipcMain.handle('get-proxy-config', async () => {
  return configService.getProxyConfig();
});

ipcMain.handle('set-proxy-config', async (event, proxyConfig) => {
  configService.setProxyConfig(proxyConfig);
  return true;
});

ipcMain.handle('get-startup-config', async () => {
  return configService.getStartupConfig();
});

ipcMain.handle('set-startup-config', async (event, startupConfig) => {
  configService.setStartupConfig(startupConfig);
  if (startupConfig.launchOnBoot) {
    // 当同时开启最小化托盘时，传 --silent 参数实现静默启动
    const args = startupConfig.minimizeToTray ? ['--silent'] : [];
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false,
      path: process.execPath,
      args: args
    });
  } else {
    app.setLoginItemSettings({
      openAtLogin: false,
      path: process.execPath
    });
  }
  return true;
});

// 注册 appConfig 获取 IPC
const appConfigModule = require('./config/appConfig');
ipcMain.handle('get-app-config', async () => {
  return {
    fullVersion: appConfigModule.app.fullVersion,
    name: appConfigModule.app.name
  };
});

// =============================================
// 全局热键：注册/注销 + 配置 IPC
// =============================================

/**
 * 注册打开窗口的全局快捷键
 */
function zhuCeQuanJuReJian() {
  const hotkeyConfig = configService.getHotkeyConfig();
  // 先注销已注册的快捷键
  zhuXiaoQuanJuReJian();

  if (!hotkeyConfig.enabled) {
    logger.info('热键功能未启用，跳过注册');
    return;
  }

  const accelerator = hotkeyConfig.openWindow;
  if (!accelerator) {
    logger.warn('热键配置为空，跳过注册');
    return;
  }

  try {
    const success = globalShortcut.register(accelerator, () => {
      if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          // 已显示时按热键则隐藏（与 ESC 行为一致）
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    if (success) {
      logger.info(`全局热键已注册: ${accelerator}`);
    } else {
      logger.error(`全局热键注册失败: ${accelerator}（可能被其他应用占用）`);
    }
  } catch (error) {
    logger.error(`全局热键注册异常: ${error.message}`);
  }
}

/**
 * 注销所有已注册的全局快捷键
 */
function zhuXiaoQuanJuReJian() {
  globalShortcut.unregisterAll();
}

// 注册热键配置 IPC
ipcMain.handle('get-hotkey-config', async () => {
  return configService.getHotkeyConfig();
});

ipcMain.handle('set-hotkey-config', async (event, hotkeyConfig) => {
  configService.setHotkeyConfig(hotkeyConfig);
  // 配置变更后立即重新注册
  zhuCeQuanJuReJian();
  return true;
});

// 注册窗口隐藏 IPC（ESC 关闭窗口用，避免触发 close 事件导致退出）
ipcMain.handle('window-hide', async () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  return true;
});

function createTray() {
  const iconDir = path.join(__dirname, '..', 'renderer', 'assets', 'icons');
  const pngIcon = path.join(iconDir, 'logo.png');
  const icoIcon = path.join(iconDir, 'icon.ico');

  let trayIconPath = null;
  if (process.platform === 'win32') {
    if (fs.existsSync(icoIcon)) {
      trayIconPath = icoIcon;
    } else if (fs.existsSync(pngIcon)) {
      trayIconPath = pngIcon;
    }
  } else {
    if (fs.existsSync(pngIcon)) {
      trayIconPath = pngIcon;
    } else if (fs.existsSync(icoIcon)) {
      trayIconPath = icoIcon;
    }
  }

  if (trayIconPath) {
    const trayIcon = nativeImage.createFromPath(trayIconPath);
    if (!trayIcon.isEmpty()) {
      tray = new Tray(trayIcon);
    } else {
      logger.warn('托盘图标加载为空: ' + trayIconPath);
      return;
    }
  } else {
    logger.warn('未找到可用的托盘图标');
    return;
  }

  if (process.platform === 'darwin') {
    tray.setIgnoreDoubleClickEvents(true);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setToolTip('OOOInterface Update Assistant');
  tray.setContextMenu(contextMenu);

  if (process.platform !== 'darwin') {
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  }
}

/**
 * 自动更新：启动时检查并自动下载安装更新
 */
async function checkAndAutoUpdate() {
  try {
    const installDir = configService.getInstallDir();
    if (!installDir || !fs.existsSync(installDir)) {
      logger.info('自动更新跳过：未设置安装目录');
      return;
    }

    const versionService = require('./services/versionService');
    const updateService = require('./services/updateService');

    const localVersion = versionService.getLocalVersion(installDir);
    if (!localVersion) {
      logger.info('自动更新跳过：无法读取本地版本');
      return;
    }

    const branch = configService.getBranch();
    const remoteVersion = await versionService.getRemoteVersion(branch);

    if (!remoteVersion) {
      logger.info('自动更新跳过：无法获取远程版本');
      return;
    }

    const comparison = versionService.compareLocalWithRemote(localVersion, remoteVersion);

    if (comparison >= 0) {
      logger.info(`自动更新跳过：当前已是最新版本 (${localVersion})`);
      return;
    }

    logger.info(`自动更新：发现新版本 ${remoteVersion}，当前版本 ${localVersion}，开始自动更新...`);

    await updateService.updateApp(installDir, branch, (progress) => {
      logger.info(`自动更新进度: ${progress.percent}% - ${progress.message}`);
    });

    logger.info('自动更新完成，准备重启应用...');

    isRestarting = true;
    app.relaunch({ execPath: process.execPath });
    app.exit(0);
  } catch (error) {
    logger.error(`自动更新失败: ${error.message}`);
  }
}

app.whenReady().then(() => {
  logger.initLogger(pathUtils.getLogDir());
  logger.info('应用启动');

  configService.initConfig();

  const savedBranch = configService.getBranch();

  const tempDir = pathUtils.getTempDir();
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  registerFileIPC();
  registerUpdateIPC();
  registerDialogIPC();

  const startupConfig = configService.getStartupConfig();
  const silentMode = process.argv.includes('--silent') && startupConfig.launchOnBoot && startupConfig.minimizeToTray;

  createWindow(silentMode);
  createTray();

  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: '显示窗口',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      }
    ]);
    app.dock.setMenu(dockMenu);
  }

  // 注册全局热键（打开窗口）
  zhuCeQuanJuReJian();

  // 自动更新检查
  if (startupConfig.autoUpdate) {
    setTimeout(() => {
      const branch = configService.getBranch();
      if (branch !== 'local') {
        checkAndAutoUpdate();
      } else {
        logger.info('自动更新跳过：当前为本地导入模式');
      }
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(false);
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (isRestarting) {
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  zhuXiaoQuanJuReJian();
  logger.info('应用退出');
});


