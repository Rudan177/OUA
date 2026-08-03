/**
 * 应用服务 - 用户数据清理、卸载等业务逻辑
 * 从 main.js 中抽出，保持主进程入口只负责 IPC 转发与窗口生命周期
 */
const fs = require('fs');
const pathUtils = require('../utils/pathUtils');
const fileUtils = require('../utils/fileUtils');
const configService = require('./configService');
const logger = require('../utils/logger');

/**
 * 清空指定目录并重建（保留目录本身）
 * @param {Function} getPath - 返回目录路径的函数
 * @param {string} label - 日志描述
 */
function clearDirectoryPreserving(getPath, label) {
  const dir = getPath();
  try {
    if (fs.existsSync(dir)) {
      fileUtils.removeDirectory(dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    logger.info(`${label}已清除`);
  } catch (error) {
    logger.warn(`清除${label}失败: ${error.message}`);
  }
}

/**
 * 删除配置文件（恢复出厂设置 / 卸载的关键步骤）
 */
function deleteConfigFile() {
  const configPath = pathUtils.getConfigFilePath();
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      logger.info('配置文件已删除');
    }
  } catch (error) {
    logger.warn(`删除配置文件失败: ${error.message}`);
  }
}

/**
 * 清理用户数据：临时目录、日志、缓存、配置文件
 */
function cleanUserData() {
  clearDirectoryPreserving(pathUtils.getTempDir, '临时目录');
  clearDirectoryPreserving(pathUtils.getLogDir, '日志目录');
  clearDirectoryPreserving(pathUtils.getCacheDir, '缓存目录');
  deleteConfigFile();
}

/**
 * 删除已配置的 OOOInterface 安装目录
 */
function removeInstallDir() {
  const installDir = configService.getInstallDir();
  if (!installDir || !fs.existsSync(installDir)) {
    logger.info('卸载跳过：安装目录不存在或未设置');
    return;
  }
  try {
    fileUtils.removeDirectory(installDir);
    logger.info(`安装目录已删除: ${installDir}`);
  } catch (error) {
    logger.warn(`删除安装目录失败: ${error.message}`);
  }
}

module.exports = {
  cleanUserData,
  removeInstallDir
};
