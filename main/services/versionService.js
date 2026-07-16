/**
 * 版本服务 - 处理版本检测与比较
 */
const path = require('path');
const fs = require('fs');
const compareVersion = require('../utils/compareVersion');
const logger = require('../utils/logger');
const gitService = require('./gitService');
const appConfig = require('../config/appConfig');

/**
 * 从本地目录读取版本号
 * @param {string} installDir - 安装目录
 * @returns {string|null} 版本号或 null
 */
function getLocalVersion(installDir) {
  try {
    const versionPaths = [
      path.join(installDir, 'main', 'Script', 'version.js'),
      path.join(installDir, 'main', 'version.js')
    ];

    let versionFilePath = null;
    for (const vp of versionPaths) {
      if (fs.existsSync(vp)) {
        versionFilePath = vp;
        break;
      }
    }

    if (!versionFilePath) {
      logger.warn('版本文件不存在 (检查了 main/Script/version.js 和 main/version.js)');
      return null;
    }
    
    const content = fs.readFileSync(versionFilePath, 'utf8');
    const match = content.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
    
    logger.info(`读取本地版本: ${match ? match[1] : 'null'} (来自: ${path.relative(installDir, versionFilePath)})`);
    return match ? match[1] : null;
  } catch (error) {
    logger.error(`读取本地版本失败: ${error.message}`);
    return null;
  }
}

/**
 * 获取远程版本
 * @param {string} tempDir - 临时目录
 * @param {string} branch - 分支名称（可选）
 * @returns {Promise<string|null>} 远程版本号或 null
 */
async function getRemoteVersion(tempDir, branch) {
  const targetBranch = branch || gitService.getCurrentBranch();
  return gitService.getRemoteVersion(appConfig.git.repoUrl, targetBranch, tempDir);
}

/**
 * 比较本地版本与远程版本
 * @param {string} localVersion - 本地版本
 * @param {string} remoteVersion - 远程版本
 * @returns {number} 1: 本地更高, -1: 远程更高, 0: 相同
 */
function compareLocalWithRemote(localVersion, remoteVersion) {
  return compareVersion.compareVersion(localVersion, remoteVersion);
}

/**
 * 获取版本状态
 * @param {string} localVersion - 本地版本
 * @param {string} remoteVersion - 远程版本
 * @returns {string} 状态描述
 */
function getVersionStatus(localVersion, remoteVersion) {
  const comparison = compareLocalWithRemote(localVersion, remoteVersion);
  
  if (comparison > 0) {
    return 'newer';
  } else if (comparison < 0) {
    return 'older';
  } else {
    return 'same';
  }
}

module.exports = {
  getLocalVersion,
  getRemoteVersion,
  compareLocalWithRemote,
  getVersionStatus
};
