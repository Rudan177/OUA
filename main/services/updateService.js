/**
 * 更新服务 - 处理应用更新逻辑（ZIP 下载 + 解压模式）
 */
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const pathUtils = require('../utils/pathUtils');
const downloadService = require('./downloadService');
const zipService = require('./zipService');

/**
 * 改进错误消息
 * @param {Error} error - 原始错误
 * @returns {string} 友好的错误消息
 */
function formatError(error) {
  const message = error.message;

  if (message.includes('代理连接超时')) {
    return '代理连接超时。请检查代理是否正常运行，或尝试关闭代理后重试。';
  }
  if (message.includes('代理 TLS 握手失败')) {
    return '代理 TLS 握手失败。代理可能不支持 HTTPS 隧道，请检查代理类型或尝试关闭代理。';
  }
  if (message.includes('代理连接错误')) {
    return '代理连接失败。请检查代理地址和端口是否正确，以及代理软件是否运行。';
  }
  if (message.includes('代理服务器关闭了连接')) {
    return '代理服务器关闭了连接。请检查代理是否支持 CONNECT 隧道。';
  }
  if (message.includes('代理连接失败')) {
    return '代理拒绝了连接请求。请检查代理设置是否正确，或尝试关闭代理后重试。';
  }
  if (message.includes('Permission denied')) {
    return '没有权限访问该目录。请确保您对所选文件夹有写入权限，或以管理员身份运行程序。';
  }
  if (message.includes('timeout') || message.includes('超时')) {
    return '网络连接超时。请检查您的网络连接，或稍后重试。';
  }
  if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
    return '无法解析域名。请检查网络连接或 DNS 设置。';
  }
  if (message.includes('ECONNREFUSED')) {
    return '连接被拒绝。请检查代理设置或防火墙配置。';
  }
  if (message.includes('ECONNRESET')) {
    return '网络连接被重置。请检查网络连接稳定性。';
  }
  if (message.includes('HTTP 403')) {
    return '访问被拒绝（403）。可能是 GitHub API 访问限制，请稍后重试。';
  }
  if (message.includes('HTTP 404')) {
    return '资源未找到（404）。请检查仓库地址和分支是否正确。';
  }
  if (message.includes('HTTP 5')) {
    return 'GitHub 服务器错误。请稍后重试。';
  }
  if (message.includes('SSL') || message.includes('TLS') || message.includes('certificate')) {
    return 'SSL/TLS 连接错误。请检查网络环境或代理设置。';
  }

  return message;
}

/**
 * 从远程下载 ZIP 并解压到目标目录
 * @param {string} targetDir - 目标安装目录
 * @param {string} branch - 分支名称
 * @param {Function} progressCallback - 进度回调
 * @param {object} [options]
 * @param {boolean} [options.clearTarget=false] - 解压前清空目标目录（覆盖安装场景）
 */
async function downloadAndExtract(targetDir, branch, progressCallback, options = {}) {
  const tempDir = pathUtils.getTempDir();
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 生成临时 ZIP 文件路径
  const zipFileName = `oua-download-${branch}-${Date.now()}.zip`;
  const zipPath = path.join(tempDir, zipFileName);

  try {
    // 1. 下载 ZIP
    progressCallback({ percent: 0, message: '开始下载...' });
    const zipUrl = downloadService.getZipUrl(branch);
    await downloadService.downloadZip(zipUrl, zipPath, progressCallback);

    // 2. 覆盖安装场景下先清空目标目录
    if (options.clearTarget) {
      progressCallback({ percent: 70, message: '正在清空目标目录...' });
      clearDirectory(targetDir);
    }

    // 3. 解压到目标目录
    progressCallback({ percent: 80, message: '正在解压...' });
    await zipService.extractAndValidateZip(zipPath, targetDir, (p) => {
      // 将解压进度映射到 80-100 范围
      const mappedPercent = 80 + Math.round(p.percent * 0.2);
      progressCallback({ percent: mappedPercent, message: p.message || '正在解压...' });
    });

    logger.info(`ZIP 下载并解压完成: ${targetDir}`);
    progressCallback({ percent: 100, message: '完成' });
  } finally {
    // 清理临时 ZIP 文件
    try {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    } catch (cleanupError) {
      logger.warn(`清理临时 ZIP 文件失败: ${cleanupError.message}`);
    }
  }
}

/**
 * 清空目录内容（保留目录本身）
 * @param {string} dir - 目录路径
 */
function clearDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  const contents = fs.readdirSync(dir);
  for (const item of contents) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      fs.rmSync(itemPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(itemPath);
    }
  }
}

/**
 * 首次安装 - 下载并解压 ZIP 到空目录
 * @param {string} targetDir - 目标目录
 * @param {Function} progressCallback - 进度回调
 * @returns {Promise<boolean>} 是否成功
 */
async function firstInstall(targetDir, progressCallback) {
  try {
    logger.info(`首次安装到: ${targetDir}`);
    await downloadAndExtract(targetDir, 'LTS', progressCallback);
    logger.info('首次安装完成');
    return true;
  } catch (error) {
    logger.error(`首次安装失败: ${error.message}`);
    const friendlyError = new Error(formatError(error));
    throw friendlyError;
  }
}

/**
 * 强制覆盖更新（清空目标目录后重新安装）
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 分支名称
 * @param {Function} progressCallback - 进度回调
 * @returns {Promise<boolean>} 是否成功
 */
async function forceOverwrite(targetDir, branch, progressCallback) {
  try {
    logger.info(`强制覆盖更新: ${targetDir} (分支: ${branch})`);
    await downloadAndExtract(targetDir, branch, progressCallback, { clearTarget: true });
    logger.info('强制覆盖更新完成');
    return true;
  } catch (error) {
    logger.error(`强制覆盖更新失败: ${error.message}`);
    const friendlyError = new Error(formatError(error));
    throw friendlyError;
  }
}

/**
 * 更新应用 - 下载 ZIP 并覆盖安装
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 分支名称
 * @param {Function} progressCallback - 进度回调
 * @returns {Promise<boolean>} 是否成功
 */
async function updateApp(targetDir, branch, progressCallback) {
  try {
    logger.info(`更新应用: ${targetDir} (分支: ${branch})`);
    await downloadAndExtract(targetDir, branch, progressCallback);
    logger.info('应用更新完成');
    return true;
  } catch (error) {
    logger.error(`应用更新失败: ${error.message}`);
    const friendlyError = new Error(formatError(error));
    throw friendlyError;
  }
}

/**
 * 切换分支 - 下载目标分支 ZIP 并覆盖
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 目标分支
 * @param {Function} progressCallback - 进度回调
 * @returns {Promise<boolean>} 是否成功
 */
async function switchBranch(targetDir, branch, progressCallback) {
  try {
    logger.info(`切换到分支: ${branch}`);
    const result = await updateApp(targetDir, branch, progressCallback);
    return result;
  } catch (error) {
    logger.error(`切换分支失败: ${error.message}`);
    const friendlyError = new Error(formatError(error));
    throw friendlyError;
  }
}

module.exports = {
  firstInstall,
  forceOverwrite,
  updateApp,
  switchBranch
};
