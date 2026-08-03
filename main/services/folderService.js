/**
 * 文件夹服务 - 处理文件夹检测逻辑
 */
const fs = require('fs');
const path = require('path');
const fileUtils = require('../utils/fileUtils');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');

/**
 * 检查目录是否有写入权限
 * @param {string} dirPath - 目录路径
 * @returns {boolean} 是否有写入权限
 */
function hasWritePermission(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      const parentDir = path.dirname(dirPath);
      fs.accessSync(parentDir, fs.constants.W_OK);
      return true;
    }
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (error) {
    logger.error(`没有写入权限: ${dirPath}, 错误: ${error.message}`);
    return false;
  }
}

/**
 * 检查文件夹结构类型
 * @param {string} dirPath - 文件夹路径
 * @returns {string} 检测结果: 'empty' | 'valid' | 'incomplete' | 'not-ooointerface'
 */
function checkFolderStructure(dirPath) {
  if (!fs.existsSync(dirPath)) {
    logger.info(`目录不存在，视为空目录: ${dirPath}`);
    return 'empty';
  }

  const contents = fileUtils.getDirectoryContents(dirPath);

  if (contents.length === 0) {
    return 'empty';
  }

  const requiredFiles = appConfig.requiredFiles;
  const presentItems = new Set(contents);

  let missingCount = 0;
  for (const item of requiredFiles) {
    if (!presentItems.has(item)) {
      missingCount++;
    }
  }

  if (missingCount === requiredFiles.length) {
    return 'not-ooointerface';
  }

  if (missingCount > 0) {
    return 'incomplete';
  }

  return 'valid';
}

module.exports = {
  checkFolderStructure,
  hasWritePermission
};
