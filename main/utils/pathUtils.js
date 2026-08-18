/**
 * 路径工具函数
 *
 * 兼容两种运行环境：
 * - Electron 主进程：require('electron') 返回模块，使用 app 的路径 API
 * - 纯 Node 守护进程（ELECTRON_RUN_AS_NODE）：require('electron') 返回二进制路径字符串，
 *   此时使用守护进程注入的环境变量解析路径（OUA_PACKAGED / OUA_APP_ROOT / OUA_USER_DATA）
 */
const path = require('path');
const os = require('os');

let electronApp = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.app) {
    electronApp = electron.app;
  }
} catch (e) {
  // 非 Electron 环境，忽略
}

/**
 * 是否为 Electron 主进程环境
 * @returns {boolean}
 */
function isElectron() {
  return !!electronApp;
}

/**
 * 是否为守护进程模式（纯 Node）
 * @returns {boolean}
 */
function isDaemon() {
  return !electronApp;
}

/**
 * 检查应用是否被打包
 * @returns {boolean} 是否被打包
 */
function isPackaged() {
  if (electronApp) {
    return electronApp.isPackaged;
  }
  // 守护进程：由主进程注入
  return process.env.OUA_PACKAGED === '1';
}

/**
 * 获取应用根目录
 * @returns {string} 应用根目录路径
 */
function getAppRoot() {
  if (electronApp) {
    if (isPackaged()) {
      // 打包后，app.getPath('exe') 返回可执行文件路径，我们需要向上找目录
      return path.dirname(electronApp.getPath('exe'));
    }
    return path.join(__dirname, '..', '..');
  }
  // 守护进程：由主进程注入；未注入时回退到项目根
  if (process.env.OUA_APP_ROOT) {
    return process.env.OUA_APP_ROOT;
  }
  return path.join(__dirname, '..', '..');
}

/**
 * 获取存储目录（userData / 配置根目录）
 * @returns {string} 存储目录路径
 */
function getStorageDir() {
  if (electronApp) {
    if (isPackaged()) {
      return electronApp.getPath('userData');
    }
    return path.join(getAppRoot(), 'storage');
  }
  // 守护进程：由主进程注入，确保与主进程共享同一份配置
  if (process.env.OUA_USER_DATA) {
    return process.env.OUA_USER_DATA;
  }
  return path.join(getAppRoot(), 'storage');
}

/**
 * 获取临时目录
 * @returns {string} 临时目录路径
 */
function getTempDir() {
  if (isPackaged()) {
    // 打包后使用存储目录下的 temp 目录
    return path.join(getStorageDir(), 'temp');
  }
  // 开发环境
  return path.join(getAppRoot(), 'temp');
}

/**
 * 获取日志目录
 * @returns {string} 日志目录路径
 */
function getLogDir() {
  return path.join(getStorageDir(), 'logs');
}

/**
 * 获取缓存目录
 * @returns {string} 缓存目录路径
 */
function getCacheDir() {
  return path.join(getStorageDir(), 'cache');
}

/**
 * 获取配置文件路径
 * @returns {string} 配置文件路径
 */
function getConfigFilePath() {
  return path.join(getStorageDir(), 'config.json');
}

/**
 * 获取下载目录（自更新下载目标）
 * @returns {string} 下载目录路径
 */
function getDownloadsDir() {
  if (electronApp) {
    return electronApp.getPath('downloads');
  }
  // 守护进程：Windows 用 %USERPROFILE%\Downloads，其余用家目录
  return process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'Downloads')
    : path.join(os.homedir(), 'Downloads');
}

/**
 * 规范化路径
 * @param {string} filePath - 文件路径
 * @returns {string} 规范化后的路径
 */
function normalizePath(filePath) {
  return path.normalize(filePath);
}

/**
 * 连接路径
 * @param  {...string} paths - 路径片段
 * @returns {string} 连接后的路径
 */
function joinPaths(...paths) {
  return path.join(...paths);
}

module.exports = {
  isElectron,
  isDaemon,
  isPackaged,
  getAppRoot,
  getStorageDir,
  getTempDir,
  getLogDir,
  getCacheDir,
  getConfigFilePath,
  getDownloadsDir,
  normalizePath,
  joinPaths
};
