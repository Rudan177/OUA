/**
 * Electron 主进程入口
 */
const { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, globalShortcut, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

// 标记开发/打包环境，供 preload 与渲染进程使用（开发环境才启用诊断等调试功能）
process.env.OUA_DEV = app.isPackaged ? '0' : '1';

// 暴露 global.gc()，轻量模式关闭窗口后主动回收主进程 V8 堆内存
app.commandLine.appendSwitch('js-flags', '--expose-gc');

const logger = require('./utils/logger');
const pathUtils = require('./utils/pathUtils');
const configService = require('./services/configService');
const httpServerService = require('./services/httpServerService');
const appService = require('./services/appService');

const { registerFileIPC } = require('./ipc/fileIPC');
const { registerUpdateIPC } = require('./ipc/updateIPC');
const { registerDialogIPC } = require('./ipc/dialogIPC');

let mainWindow;
let tray = null;
let isRestarting = false;
let isQuitting = false;
let isEnteringDaemon = false;

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

function isSandboxUsable() {
  if (process.platform !== 'linux') {
    return true;
  }
  const sandboxBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'chrome-sandbox');
  if (!fs.existsSync(sandboxBin)) {
    return true;
  }
  try {
    const st = fs.statSync(sandboxBin);
    return st.uid === 0 && (st.mode & 0o4000) === 0o4000;
  } catch (error) {
    return false;
  }
}

function buildRelaunchArgs() {
  if (app.isPackaged) {
    return [];
  }
  const args = process.argv.slice(1);
  if (!isSandboxUsable()) {
    if (!args.includes('--no-sandbox')) {
      args.push('--no-sandbox');
    }
    if (!args.some((a) => a.startsWith('--ozone-platform'))) {
      args.push('--ozone-platform=x11');
    }
  }
  return args;
}

function relaunchApp() {
  isRestarting = true;
  const args = buildRelaunchArgs();
  app.relaunch({
    execPath: process.execPath,
    args: args
  });
}

// 单实例锁 - 防止多开
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    // C# 托盘助手「退出」在窗口模式下拉起带 --quit 的实例，触发本进程正常退出
    if (argv && argv.includes('--quit')) {
      logger.info('收到 --quit 请求，退出应用');
      isQuitting = true;
      app.quit();
      return;
    }
    // C# 托盘助手热键：带 --toggle 切换窗口显隐（与 Electron 原热键行为一致）
    if (argv && argv.includes('--toggle')) {
      if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
      return;
    }
    // C# 托盘助手「切换分支」：带 --switch-branch <分支>，在窗口模式的主进程内执行切换
    const switchBranchIdx = argv ? argv.indexOf('--switch-branch') : -1;
    if (switchBranchIdx >= 0 && argv[switchBranchIdx + 1]) {
      const targetBranch = argv[switchBranchIdx + 1];
      logger.info(`收到托盘切换分支请求: ${targetBranch}`);
      // 分支切换可能耗时较长，先聚焦窗口让用户看到进度
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      zhiXingTuoPanQieHuanFenZhi(targetBranch);
      return;
    }
    // 当第二个实例尝试启动时，聚焦到第一个实例的窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * 分支切换进度文件（托盘切换时写入，渲染进程轮询展示进度）
 */
function getBranchProgressFile() {
  return path.join(pathUtils.getStorageDir(), 'branch-switch-progress.json');
}

/**
 * 清理分支切换进度残留文件
 */
function qingLiFenZhiJinDu() {
  try {
    const file = getBranchProgressFile();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) { /* ignore */ }
}

/**
 * 执行托盘「切换分支」操作（在窗口模式主进程内运行）
 * 写入进度文件，由渲染进程轮询展示；完成后触发窗口刷新
 */
async function zhiXingTuoPanQieHuanFenZhi(targetBranch) {
  const progressFile = getBranchProgressFile();
  const writeProgress = (percent, message) => {
    try {
      fs.writeFileSync(progressFile, JSON.stringify({ percent, message, branch: targetBranch }), 'utf8');
    } catch (e) { /* ignore */ }
  };

  try {
    const installDir = configService.getInstallDir();
    if (!installDir) {
      writeProgress(0, '未设置安装目录，请先在主界面选择');
      return;
    }
    // 本地模式不允许切换远程分支
    if (configService.getBranch() === 'local') {
      writeProgress(0, '当前是本地模式，请先切换到远程模式');
      return;
    }

    writeProgress(0, '正在切换通道...');
    configService.setBranch(targetBranch);

    const updateService = require('./services/updateService');
    await updateService.switchBranch(installDir, targetBranch, (progress) => {
      writeProgress(progress.percent || 0, progress.message || '切换中...');
    });

    writeProgress(100, '切换完成');
    logger.info(`托盘切换分支完成: ${targetBranch}`);
    // 通知渲染进程刷新（若窗口已打开）
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tray-branch-switched', targetBranch);
    }
  } catch (error) {
    logger.error(`托盘切换分支失败: ${error.message}`);
    writeProgress(-1, '切换失败: ' + error.message);
  }
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

/**
 * 获取轻量模式守护进程文件路径（打包后在 asar 内，ELECTRON_RUN_AS_NODE 可读）
 */
function getDaemonJsPath() {
  return path.join(__dirname, 'daemon.js');
}

/**
 * 获取 C# 托盘助手 exe 路径
 */
function getHelperExePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'hotkey-helper.exe');
  }
  return path.join(__dirname, '..', 'tools', 'hotkey-helper.exe');
}

/**
 * 获取 C# 托盘助手使用的托盘图标路径
 */
function getHelperIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  return path.join(__dirname, '..', 'renderer', 'assets', 'icons', 'icon.ico');
}

/**
 * 获取 C# 托盘助手在两种模式下的启动参数（守护模式/窗口模式共用）
 */
function getTuoPanZhuShouArgs() {
  const helperIcon = getHelperIconPath();
  const hotkeyConfig = configService.getHotkeyConfig();
  // 开发模式拉起主程序需带上项目目录参数（打包后 exe 直接启动）
  const mainArgs = app.isPackaged ? [] : [pathUtils.getAppRoot()];
  const appConfigModule = require('./config/appConfig');
  const branches = [
    appConfigModule.git.ltsBranch,
    appConfigModule.git.mainBranch,
    appConfigModule.git.testBranch
  ].filter(Boolean);
  const args = [
    '--main-exe', process.execPath,
    '--main-args', JSON.stringify(mainArgs),
    '--storage', pathUtils.getStorageDir(),
    '--branches', branches.join(','),
    '--hotkey', hotkeyConfig.enabled ? (hotkeyConfig.openWindow || 'Ctrl+Shift+O') : 'disabled'
  ];
  if (helperIcon && fs.existsSync(helperIcon)) {
    args.push('--icon', helperIcon);
  }
  return args;
}

/**
 * 窗口模式下拉起 C# 托盘助手（轻量模式统一使用，与守护模式样式一致）
 * 若已在运行（守护模式残留的常驻实例）则不重复拉起
 */
function qidongTuoPanZhuShou() {
  if (process.platform !== 'win32') return;
  const helperExe = getHelperExePath();
  if (!helperExe || !fs.existsSync(helperExe)) {
    logger.warn(`托盘助手不存在: ${helperExe}`);
    return;
  }
  // 已在运行则跳过（守护模式的常驻实例接管窗口模式托盘）
  const helperPidFile = path.join(pathUtils.getStorageDir(), 'helper.pid');
  try {
    if (fs.existsSync(helperPidFile)) {
      const pid = parseInt(fs.readFileSync(helperPidFile, 'utf8'), 10);
      if (pid) {
        try {
          process.kill(pid, 0);
          logger.info('托盘助手已在运行，跳过拉起');
          return;
        } catch (e) { /* 进程不存在，重新拉起 */ }
      }
      try { fs.unlinkSync(helperPidFile); } catch (_) {}
    }
  } catch (e) { /* ignore */ }

  try {
    const child = spawn(helperExe, getTuoPanZhuShouArgs(), {
      windowsHide: true,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    setTimeout(() => {
      if (child.pid) {
        try {
          fs.writeFileSync(helperPidFile, String(child.pid), 'utf8');
        } catch (e) { /* ignore */ }
      }
    }, 300);
    logger.info(`托盘助手已拉起(窗口模式): ${helperExe}`);
  } catch (error) {
    logger.warn(`拉起托盘助手失败: ${error.message}`);
  }
}

/**
 * 停止 C# 托盘助手（按 helper.pid 精确结束，兜底按名称）
 */
function tingZhiTuoPanZhuShou() {
  if (process.platform !== 'win32') return;
  try {
    const helperPidFile = path.join(pathUtils.getStorageDir(), 'helper.pid');
    if (fs.existsSync(helperPidFile)) {
      const pid = parseInt(fs.readFileSync(helperPidFile, 'utf8'), 10);
      if (pid) {
        try { process.kill(pid); } catch (e) { /* 已退出 */ }
      }
      try { fs.unlinkSync(helperPidFile); } catch (_) {}
    }
  } catch (e) { /* ignore */ }
  const helperExe = getHelperExePath();
  if (helperExe) {
    execFile('taskkill', ['/IM', path.basename(helperExe), '/F'], { windowsHide: true }, () => {});
  }
}

/**
 * 拉起轻量模式守护进程（win32）
 * 以 ELECTRON_RUN_AS_NODE=1 方式用主程序 exe 运行 main/daemon.js，不加载 Chromium
 * @returns {ChildProcess|null}
 */
function qidongShouHuJinCheng() {
  if (process.platform !== 'win32') {
    logger.warn('非 Windows 平台不支持轻量模式守护进程');
    return null;
  }
  const daemonJs = getDaemonJsPath();
  const helperExe = getHelperExePath();
  const helperIcon = getHelperIconPath();

  const env = {
    ...process.env,
    OUA_PACKAGED: app.isPackaged ? '1' : '0',
    OUA_APP_ROOT: pathUtils.getAppRoot(),
    OUA_USER_DATA: pathUtils.getStorageDir(),
    OUA_MAIN_EXE: process.execPath,
    // 开发模式拉起主程序需带上项目目录参数（打包后 exe 直接启动）
    OUA_MAIN_ARGS: app.isPackaged ? '' : JSON.stringify([pathUtils.getAppRoot()]),
    OUA_HELPER_EXE: helperExe,
    OUA_HELPER_ICON: helperIcon,
    ELECTRON_RUN_AS_NODE: '1'
  };

  try {
    // 守护进程日志重定向到文件，便于排查崩溃；同时避免控制台残留句柄
    const daemonLogFile = fs.openSync(path.join(pathUtils.getLogDir(), 'daemon-console.log'), 'a');
    const child = spawn(process.execPath, [daemonJs], {
      env,
      detached: true,
      stdio: ['ignore', daemonLogFile, daemonLogFile],
      windowsHide: true
    });
    child.unref();
    logger.info(`守护进程已拉起: PID=${child.pid}，daemon.js=${daemonJs}`);
    return child;
  } catch (error) {
    logger.error(`拉起守护进程失败: ${error.message}`);
    return null;
  }
}

/**
 * 清理启动时残留的守护进程（win32）
 * 上一次守护进程可能崩溃残留，或用户手动启动 exe 时旧守护进程仍存活
 */
function qingLiShouHuJinCheng() {
  if (process.platform !== 'win32') return;
  try {
    // 注意：不清理 C# 托盘助手——它是跨守护/窗口模式常驻共享的组件，
    // 杀掉会与 qidongTuoPanZhuShou 产生竞态（Mutex 被未死实例占用导致新实例退出，托盘消失）。

    const pidFile = path.join(pathUtils.getStorageDir(), 'daemon.pid');
    if (!fs.existsSync(pidFile)) return;
    const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    if (!oldPid) return;
    // 进程存在则结束，否则只清理残留文件
    try {
      process.kill(oldPid, 0);
      execFile('taskkill', ['/PID', String(oldPid), '/T', '/F'], { windowsHide: true }, () => {
        try { fs.unlinkSync(pidFile); } catch (_) {}
      });
      logger.info(`已结束残留守护进程: ${oldPid}`);
    } catch (e) {
      try { fs.unlinkSync(pidFile); } catch (_) {}
    }
  } catch (error) {
    logger.warn(`清理残留守护进程失败: ${error.message}`);
  }
}

/**
 * 启动 HTTP server 并重试（刚清理过守护进程时端口可能短暂占用）
 */
async function startHttpWithRetry(config, retries = 8) {
  for (let i = 0; i < retries; i++) {
    const result = await httpServerService.qiDong(config);
    if (result && result.ok) return result;
    await new Promise((r) => setTimeout(r, 400));
  }
  logger.error('HTTP Server 启动失败（多次重试后放弃）');
  return null;
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

  // 相关链接（官网/主题商店等 target="_blank"）在新窗口打开，尺寸可控
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      const appIcon = getAppIcon();
      const child = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        autoHideMenuBar: true,
        icon: appIcon,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      if (appIcon) {
        child.setIcon(appIcon);
      }
      child.loadURL(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    // 渲染进程挂载后立即发送当前主题，避免依赖 JS matchMedia 的异步时序
    const currentTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    mainWindow.webContents.send('theme-changed', currentTheme);
    if (!silentMode) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isRestarting) {
      const startupConfig = configService.getStartupConfig();
      if (startupConfig.lightweightMode && process.platform === 'win32') {
        // 轻量模式：Electron 完全退出，由守护进程 + C# 托盘助手接管
        event.preventDefault();
        if (isEnteringDaemon) return; // 防重入
        isEnteringDaemon = true;
        logger.info('轻量模式：关闭窗口，进入守护进程模式');
        // 先停掉 HTTP server（异步），避免与守护进程端口冲突，再拉起守护进程并退出
        httpServerService.guanBi().then(() => {
          qidongShouHuJinCheng();
          isQuitting = true;
          app.exit(0);
        }).catch(() => {
          qidongShouHuJinCheng();
          isQuitting = true;
          app.exit(0);
        });
      } else if (startupConfig.minimizeToTray && !isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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
    appService.cleanUserData();
    logger.info('恢复出厂设置完成，准备重启...');

    // 设置重启标志，防止 window-all-closed 触发 app.quit()
    isRestarting = true;

    // 先关闭窗口
    if (mainWindow) {
      mainWindow.close();
    }

    // 等待一下再重启
    setTimeout(() => {
      relaunchApp();
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
    relaunchApp();

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

    // 删除安装目录
    appService.removeInstallDir();

    // 清除临时/日志/缓存目录与配置文件
    appService.cleanUserData();

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
      } else {
        // 轻量模式：窗口已销毁，重新创建
        createWindow(false);
        if (mainWindow) {
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

// 注册可访问性配置相关 IPC
ipcMain.handle('get-accessibility-config', async () => {
  return configService.getAccessibilityConfig();
});

ipcMain.handle('set-accessibility-config', async (event, accessibilityConfig) => {
  configService.setAccessibilityConfig(accessibilityConfig);
  // 根据配置启动或停止 HTTP server
  httpServerService.qiDong(accessibilityConfig);
  return true;
});

ipcMain.handle('regenerate-accessibility-token', async () => {
  return configService.regenerateAccessibilityToken();
});

// 订阅 httpServerService 状态变更，实时广播给渲染进程
httpServerService.onStatusChange(() => {
  if (mainWindow) {
    mainWindow.webContents.send('http-server-status-change', httpServerService.huoQuZhuangTai());
  }
});
ipcMain.handle('http-server-start', async (event, accessibilityConfig) => {
  return httpServerService.qiDong(accessibilityConfig);
});

ipcMain.handle('http-server-stop', async () => {
  httpServerService.guanBi();
  return true;
});

ipcMain.handle('http-server-status', async () => {
  return httpServerService.huoQuZhuangTai();
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

  const startupConfig = configService.getStartupConfig();
  const lightweightMode = startupConfig.lightweightMode;

  // 轻量模式：窗口关闭后仅显示退出选项；否则显示显示窗口 + 退出
  const menuItems = lightweightMode
    ? [{ label: '退出', click: () => { isQuitting = true; app.quit(); } }]
    : [
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
      ];

  // 轻量模式：根据窗口当前可见性初始化菜单
  let contextMenu;
  if (lightweightMode) {
    const hasWindow = mainWindow !== null;
    const isVisible = hasWindow && mainWindow.isVisible();
    const items = isVisible
      ? [
          { label: '隐藏窗口', click: () => mainWindow.hide() },
          { type: 'separator' },
          { label: '退出', click: () => { isQuitting = true; app.quit(); } }
        ]
      : [
          { label: '显示窗口', click: () => createWindow(false) },
          { type: 'separator' },
          { label: '退出', click: () => { isQuitting = true; app.quit(); } }
        ];
    contextMenu = Menu.buildFromTemplate(items);
  } else {
    contextMenu = Menu.buildFromTemplate(menuItems);
  }
  tray.setToolTip('OOOInterface Update Assistant');
  tray.setContextMenu(contextMenu);

  /**
   * 轻量模式：重新注册窗口事件监听并同步托盘菜单
   */
  function syncTrayMenuListeners() {
    if (!lightweightMode || !mainWindow) return;
    // 注销旧监听，防止窗口重建后残留
    mainWindow.removeAllListeners('show');
    mainWindow.removeAllListeners('hide');
    mainWindow.removeAllListeners('closed');
    mainWindow.on('show', updateTrayMenu);
    mainWindow.on('hide', updateTrayMenu);
    mainWindow.on('closed', () => {
      mainWindow = null;
      updateTrayMenu();
    });
    updateTrayMenu();
  }

  // 轻量模式：首次注册事件监听并同步菜单
  if (lightweightMode) {
    syncTrayMenuListeners();
  }

  if (process.platform !== 'darwin') {
    tray.on('double-click', () => {
      if (lightweightMode) {
        if (mainWindow && mainWindow.isVisible()) {
          // 窗口已显示：仅隐藏
          mainWindow.hide();
        } else if (mainWindow) {
          // 窗口存在但不可见（最小化）：显示并聚焦
          mainWindow.show();
          mainWindow.focus();
        } else {
          // 窗口不存在：新建窗口
          createWindow(false);
          syncTrayMenuListeners();
        }
      } else if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  }

  /**
   * 轻量模式专用：根据窗口可见性动态更新托盘菜单
   */
  function updateTrayMenu() {
    if (!lightweightMode) return;
    const hasWindow = mainWindow !== null;
    const isVisible = hasWindow && mainWindow.isVisible();
    const items = [
      {
        label: hasWindow && isVisible ? '隐藏窗口' : '显示窗口',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isVisible()) {
              mainWindow.hide();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
          } else {
            createWindow(false);
            syncTrayMenuListeners();
          }
        }
      },
      { type: 'separator' },
      { label: '退出', click: () => { isQuitting = true; app.quit(); } }
    ];
    tray.setContextMenu(Menu.buildFromTemplate(items));
  }
}

/**
 * 启动时自动打开已下载的待安装更新包（用户点击「重启并更新」后触发）
 */
function autoOpenPendingUpdate() {
  const pendingPath = configService.getPendingUpdatePath();
  if (!pendingPath || !fs.existsSync(pendingPath)) return;
  logger.info(`检测到待安装更新包，即将打开: ${pendingPath}`);
  // 先关闭窗口再打开安装包，避免文件被锁定
  isRestarting = true;
  if (mainWindow) {
    mainWindow.close();
  }
  setTimeout(() => {
    shell.openPath(pendingPath).catch(err => {
      logger.error(`打开安装包失败: ${err}`);
    });
  }, 500);
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
    relaunchApp();
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

  // 清理残留守护进程（win32），避免与当前实例端口冲突
  qingLiShouHuJinCheng();

  // 清理托盘切换分支的进度残留文件（上次切换可能中断）
  qingLiFenZhiJinDu();

  // 恢复可访问性 HTTP server（如果之前已启用）；重试以覆盖守护进程端口释放窗口
  const accessibilityConfig = configService.getAccessibilityConfig();
  if (accessibilityConfig.enabled) {
    startHttpWithRetry(accessibilityConfig);
  }

  const startupConfig = configService.getStartupConfig();
  const silentMode = process.argv.includes('--silent') && startupConfig.launchOnBoot && startupConfig.minimizeToTray;

  // 轻量模式（仅 win32）：开机自启时直接进入守护进程模式，不创建窗口、不加载 Chromium
  if (silentMode && startupConfig.lightweightMode && process.platform === 'win32') {
    logger.info('轻量模式：开机自启，直接进入守护进程模式');
    isQuitting = true;
    isEnteringDaemon = true;
    httpServerService.guanBi().then(() => {
      qidongShouHuJinCheng();
      app.exit(0);
    }).catch(() => {
      qidongShouHuJinCheng();
      app.exit(0);
    });
    return;
  }

  createWindow(silentMode);

  // 轻量模式（win32）：统一使用 C# 托盘助手（窗口模式与守护模式样式一致），不再创建 Electron 托盘
  const lightweightEnabled = startupConfig.lightweightMode && process.platform === 'win32';
  if (lightweightEnabled) {
    qidongTuoPanZhuShou();
  } else {
    createTray();
  }

  // 检测并自动打开已下载的待安装更新包
  autoOpenPendingUpdate();

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

  // 注册全局热键（打开窗口）。轻量模式（win32）热键由 C# 托盘助手持有，不重复注册避免冲突
  if (!lightweightEnabled) {
    zhuCeQuanJuReJian();
  }

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
  httpServerService.guanBi();
  // 窗口模式退出：结束 C# 托盘助手（守护模式退出时助手已被守护进程接管/清理）
  tingZhiTuoPanZhuShou();
  logger.info('应用退出');
});


