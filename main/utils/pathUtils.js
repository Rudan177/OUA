/**
 * 路径工具函数
 */
const path = require('path');
const { app } = require('electron');

/**
 * 检查应用是否被打包
 * @returns {boolean} 是否被打包
 */
function isPackaged() {
  return app.isPackaged;
}

/**
 * 获取应用根目录
 * @returns {string} 应用根目录路径
 */
function getAppRoot() {
  if (isPackaged()) {
    // 打包后，app.getPath('exe') 返回可执行文件路径，我们需要向上找目录
    // 例如：C:\CRE\OOO\OUA\OUA\OUA\dist\win-unpacked\OOOInterface Update Assistant.exe
    // 父目录就是：C:\CRE\OOO\OUA\OUA\OUA\dist\win-unpacked
    return path.dirname(app.getPath('exe'));
  }
  // 开发环境
  return path.join(__dirname, '..', '..');
}

/**
 * 获取存储目录
 * @returns {string} 存储目录路径
 */
function getStorageDir() {
  if (isPackaged()) {
    // 打包后使用 userData 目录
    return app.getPath('userData');
  }
  // 开发环境
  return path.join(getAppRoot(), 'storage');
}

/**
 * 获取临时目录
 * @returns {string} 临时目录路径
 */
function getTempDir() {
  if (isPackaged()) {
    // 打包后使用系统临时目录或 userData 下的 temp 目录
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
  getAppRoot,
  getStorageDir,
  getTempDir,
  getLogDir,
  getCacheDir,
  getConfigFilePath,
  normalizePath,
  joinPaths
};
