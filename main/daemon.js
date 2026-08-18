/**
 * 轻量模式守护进程（纯 Node，由主程序 exe 以 ELECTRON_RUN_AS_NODE=1 方式运行）
 *
 * 负责 Electron 完全退出后驻留系统：
 *   - 可访问性 HTTP Server（若开启）
 *   - C# 托盘助手（托盘图标 + 全局热键，用于唤醒/退出）
 *   - OOOInterface 自动更新检查（若开启自动更新）
 *
 * 由主进程 main.js spawn 启动，并注入环境变量：
 *   OUA_PACKAGED  / OUA_APP_ROOT / OUA_USER_DATA  —— pathUtils 解析路径
 *   OUA_MAIN_EXE  —— 主程序 exe 完整路径（唤醒时重新拉起）
 *   OUA_HELPER_EXE —— C# 托盘助手 exe 路径
 *   OUA_HELPER_ICON —— 托盘图标路径
 */
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const logger = require('./utils/logger');
const pathUtils = require('./utils/pathUtils');

// 服务模块延迟加载：进入 main() 后 require，任何加载错误都会写入日志而非静默崩溃
let configService = null;
let httpServerService = null;
let accessServerService = null;
let versionService = null;
let updateService = null;

const PID_FILE = () => path.join(pathUtils.getStorageDir(), 'daemon.pid');
const HELPER_PID_FILE = () => path.join(pathUtils.getStorageDir(), 'helper.pid');
const MAIN_EXE = process.env.OUA_MAIN_EXE || '';
const MAIN_ARGS = process.env.OUA_MAIN_ARGS ? JSON.parse(process.env.OUA_MAIN_ARGS) : [];
const HELPER_EXE = process.env.OUA_HELPER_EXE || '';
const HELPER_ICON = process.env.OUA_HELPER_ICON || '';

let helperProcess = null;
let isShuttingDown = false;

/**
 * 写 PID 锁文件，防止守护进程多开
 */
function writePidFile() {
  try {
    fs.mkdirSync(pathUtils.getStorageDir(), { recursive: true });
    fs.writeFileSync(PID_FILE(), String(process.pid), 'utf8');
    logger.info(`守护进程 PID 已写入: ${process.pid}`);
  } catch (error) {
    logger.error(`写入 PID 文件失败: ${error.message}`);
  }
}

/**
 * 删除 PID 锁文件
 */
function removePidFile() {
  try {
    if (fs.existsSync(PID_FILE())) fs.unlinkSync(PID_FILE());
  } catch (error) {
    logger.warn(`删除 PID 文件失败: ${error.message}`);
  }
}

/**
 * 清理启动时残留的旧守护进程（上一次崩溃可能遗留）
 */
function cleanupStaleDaemon() {
  try {
    if (!fs.existsSync(PID_FILE())) return;
    const oldPid = parseInt(fs.readFileSync(PID_FILE(), 'utf8'), 10);
    if (!oldPid || oldPid === process.pid) return;
    // Windows 下 taskkill 结束旧守护进程及其子进程
    execFile('taskkill', ['/PID', String(oldPid), '/T', '/F'], { windowsHide: true }, () => {
      removePidFile();
    });
    logger.info(`已清理残留守护进程: ${oldPid}`);
  } catch (error) {
    logger.warn(`清理残留守护进程失败: ${error.message}`);
  }
}

/**
 * 检查 C# 托盘助手是否已在运行（读 helper.pid 并验证进程存活）
 * @returns {boolean}
 */
function isHelperRunning() {
  try {
    if (!fs.existsSync(HELPER_PID_FILE())) return false;
    const pid = parseInt(fs.readFileSync(HELPER_PID_FILE(), 'utf8'), 10);
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 拉起 C# 托盘助手（托盘图标 + 全局热键）
 * 独立常驻（detached），不随守护进程退出；写 helper.pid 供主进程/守护进程共享管理。
 */
function startHelper() {
  if (!HELPER_EXE || !fs.existsSync(HELPER_EXE)) {
    logger.warn(`托盘助手不存在: ${HELPER_EXE}`);
    return;
  }
  if (isHelperRunning()) {
    logger.info('托盘助手已在运行，跳过拉起');
    return;
  }
  const hotkeyConfig = configService.getHotkeyConfig();

  const args = [
    '--main-exe', MAIN_EXE,
    '--main-args', JSON.stringify(MAIN_ARGS),
    '--storage', pathUtils.getStorageDir(),
    '--hotkey', hotkeyConfig.enabled ? (hotkeyConfig.openWindow || 'Ctrl+Shift+O') : 'disabled'
  ];
  if (HELPER_ICON && fs.existsSync(HELPER_ICON)) {
    args.push('--icon', HELPER_ICON);
  }

  try {
    helperProcess = spawn(HELPER_EXE, args, { windowsHide: true, detached: true, stdio: 'ignore' });
    helperProcess.unref();
    helperProcess.on('error', (err) => logger.warn(`托盘助手启动失败: ${err.message}`));
    // 写 helper.pid（等进程真正创建）
    setTimeout(() => {
      if (helperProcess && helperProcess.pid) {
        try {
          fs.writeFileSync(HELPER_PID_FILE(), String(helperProcess.pid), 'utf8');
        } catch (e) { logger.warn(`写入 helper.pid 失败: ${e.message}`); }
      }
    }, 300);
    logger.info(`托盘助手已启动: ${HELPER_EXE} ${args.join(' ')}`);
  } catch (error) {
    logger.warn(`托盘助手启动异常: ${error.message}`);
  }
}

/**
 * 结束 C# 托盘助手（读 helper.pid 精确结束；兜底 taskkill 按进程名）
 */
function stopHelper() {
  try {
    if (fs.existsSync(HELPER_PID_FILE())) {
      const pid = parseInt(fs.readFileSync(HELPER_PID_FILE(), 'utf8'), 10);
      if (pid) {
        try { process.kill(pid); } catch (e) { /* 进程已退出 */ }
        fs.unlinkSync(HELPER_PID_FILE());
      }
    }
  } catch (e) { /* ignore */ }
  // 兜底：按名称结束（防止 PID 文件缺失但有残留实例）
  if (HELPER_EXE) {
    const name = path.basename(HELPER_EXE);
    execFile('taskkill', ['/IM', name, '/F'], { windowsHide: true }, () => {});
  }
}

/**
 * 唤醒：停止 HTTP → 重新拉起主程序 → 退出守护进程
 * 注意：不结束 C# 托盘助手（常驻，由主程序接管托盘响应）
 */
function wake() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('收到唤醒请求，启动主程序...');

  httpServerService.guanBi().then(() => {
    try {
      spawn(MAIN_EXE, MAIN_ARGS, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      logger.info(`已拉起主程序: ${MAIN_EXE} ${MAIN_ARGS.join(' ')}`);
    } catch (error) {
      logger.error(`拉起主程序失败: ${error.message}`);
    }
    removePidFile();
    setTimeout(() => process.exit(0), 300);
  }).catch(() => {
    removePidFile();
    setTimeout(() => process.exit(0), 300);
  });
}

/**
 * 退出：停止 HTTP + 结束托盘助手 + 清理 PID
 */
function exit() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('收到退出请求，守护进程退出');

  stopHelper();
  httpServerService.guanBi().then(() => {
    removePidFile();
    setTimeout(() => process.exit(0), 200);
  }).catch(() => {
    removePidFile();
    setTimeout(() => process.exit(0), 200);
  });
}

/**
 * OOOInterface 自动更新检查与下载（仅当开启自动更新）
 */
async function checkAndUpdate() {
  try {
    const installDir = configService.getInstallDir();
    if (!installDir) {
      logger.info('自动更新跳过：未设置安装目录');
      return;
    }
    const branch = configService.getBranch();
    if (branch === 'local') {
      logger.info('自动更新跳过：当前为本地导入模式');
      return;
    }
    const localVersion = await versionService.getLocalVersion(installDir);
    const remoteVersion = await versionService.getRemoteVersion(branch);
    const comparison = versionService.compareLocalWithRemote(localVersion, remoteVersion);
    if (comparison >= 0) {
      logger.info(`自动更新跳过：当前已是最新版本 (${localVersion})`);
      return;
    }
    logger.info(`自动更新：发现新版本 ${remoteVersion}，当前 ${localVersion}，开始下载...`);
    await updateService.updateApp(installDir, branch, (progress) => {
      logger.info(`自动更新进度: ${progress.percent}% - ${progress.message}`);
    });
    logger.info('自动更新完成，待主界面确认后重启生效');
  } catch (error) {
    logger.error(`自动更新失败: ${error.message}`);
  }
}

/**
 * 守护进程入口
 */
async function main() {
  logger.initLogger(pathUtils.getLogDir());
  logger.info('========== OUA 守护进程启动 ==========');
  logger.info(`PID=${process.pid} 平台=${process.platform} 打包=${pathUtils.isPackaged()}`);
  logger.info(`存储目录: ${pathUtils.getStorageDir()}`);

  try {
    // 延迟加载服务模块，加载错误写入日志
    configService = require('./services/configService');
    httpServerService = require('./services/httpServerService');
    accessServerService = require('./services/accessServerService');
    versionService = require('./services/versionService');
    updateService = require('./services/updateService');
  } catch (error) {
    logger.error('守护进程加载服务模块失败: ' + (error && error.stack || error));
    process.exit(1);
  }

  cleanupStaleDaemon();

  configService.initConfig();
  writePidFile();

  // 注册守护进程控制端点（/api/daemon/wake | /api/daemon/exit）
  accessServerService.setDaemonMode(true);
  accessServerService.setDaemonCallbacks({ onWake: wake, onExit: exit });

  // 启动可访问性 HTTP Server
  const accessibilityConfig = configService.getAccessibilityConfig();
  if (accessibilityConfig.enabled) {
    const result = await httpServerService.qiDong(accessibilityConfig);
    logger.info(`HTTP Server 启动结果: ${JSON.stringify(result)}`);
  } else {
    logger.info('可访问性未启用，HTTP Server 不启动');
  }

  // 拉起托盘助手
  startHelper();

  // 自动更新检查
  const startupConfig = configService.getStartupConfig();
  if (startupConfig.autoUpdate) {
    setTimeout(() => { checkAndUpdate(); }, 3000);
  }

  // 信号清理
  process.on('SIGINT', () => exit());
  process.on('SIGTERM', () => exit());
}

main();
