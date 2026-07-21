/**
 * ZIP 服务 - 处理本地压缩包导入与校验
 */
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const logger = require('../utils/logger');
const fileUtils = require('../utils/fileUtils');
const pathUtils = require('../utils/pathUtils');

/**
 * 必需文件列表
 */
const REQUIRED_ITEMS = ['README.md', 'manifest.json', 'main', 'images'];

/**
 * 可接受的文件/目录列表（不会报错）
 */
const ACCEPTABLE_ITEMS = [...REQUIRED_ITEMS, '.gitignore'];

/**
 * 查找真正的源目录（处理压缩包内层文件夹）
 * @param {string} extractDir - 解压后的目录
 * @returns {string} 源目录路径
 */
function findSourceDir(extractDir) {
  const contents = fs.readdirSync(extractDir);

  // 检查必需文件是否直接在解压根目录
  const contentsSet = new Set(contents);
  const hasAllRequired = REQUIRED_ITEMS.every(item => contentsSet.has(item));

  if (hasAllRequired) return extractDir;

  // 检查是否只有一个子目录且其中包含必需文件
  const dirs = contents.filter(item => {
    const itemPath = path.join(extractDir, item);
    try {
      return fs.statSync(itemPath).isDirectory();
    } catch {
      return false;
    }
  });

  if (dirs.length === 1) {
    const subDir = path.join(extractDir, dirs[0]);
    const subContents = fs.readdirSync(subDir);
    const subSet = new Set(subContents);
    const hasAllInSub = REQUIRED_ITEMS.every(item => subSet.has(item));

    if (hasAllInSub) return subDir;
  }

  throw new Error(
    '压缩包结构不符合要求。\n' +
    '请确保压缩包内直接包含：\n' +
    '  - README.md\n  - manifest.json\n  - main/ 文件夹\n  - images/ 文件夹\n' +
    '（如果压缩包内有一个文件夹包含这些文件，也会被自动识别）'
  );
}

/**
 * 解压并校验 ZIP 文件，然后复制到目标目录
 * @param {string} zipPath - ZIP 文件路径
 * @param {string} targetDir - 目标安装目录
 * @param {Function} progressCallback - 进度回调
 * @returns {Promise<boolean>}
 */
async function extractAndValidateZip(zipPath, targetDir, progressCallback) {
  if (!fs.existsSync(zipPath)) {
    throw new Error('压缩包文件不存在');
  }

  const tempDir = path.join(pathUtils.getTempDir(), `zip-import-${Date.now()}`);

  try {
    // 1. 解压到临时目录
    progressCallback({ percent: 10, message: '正在解压文件...' });
    logger.info(`开始解压: ${zipPath} -> ${tempDir}`);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);

    logger.info('解压完成');

    // 2. 查找源目录（处理内层文件夹）
    progressCallback({ percent: 35, message: '正在校验文件结构...' });
    const sourceDir = findSourceDir(tempDir);
    logger.info(`源目录: ${sourceDir}`);

    // 3. 检查是否有意外文件（警告但不阻止）
    const sourceContents = fs.readdirSync(sourceDir);
    const unknownFiles = sourceContents.filter(item => !ACCEPTABLE_ITEMS.includes(item));
    if (unknownFiles.length > 0) {
      logger.warn(`发现未预期的文件/目录: ${unknownFiles.join(', ')}，将继续导入`);
    }

    // 4. 确认目标目录存在
    progressCallback({ percent: 50, message: '准备安装目录...' });
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 5. 复制文件到目标目录（覆盖模式）
    progressCallback({ percent: 65, message: '正在复制文件...' });
    logger.info(`开始复制文件到: ${targetDir}`);

    for (const item of sourceContents) {
      // 跳过不在接受列表中的文件
      if (!ACCEPTABLE_ITEMS.includes(item)) {
        logger.info(`跳过文件: ${item}`);
        continue;
      }

      const srcPath = path.join(sourceDir, item);
      const destPath = path.join(targetDir, item);

      // 删除目标位置的已有文件/目录
      if (fs.existsSync(destPath)) {
        fileUtils.removeDirectory(destPath);
      }

      if (fs.statSync(srcPath).isDirectory()) {
        fileUtils.copyDirectory(srcPath, destPath);
        logger.info(`已复制目录: ${item}`);
      } else {
        fs.copyFileSync(srcPath, destPath);
        logger.info(`已复制文件: ${item}`);
      }
    }

    progressCallback({ percent: 90, message: '正在清理临时文件...' });
    logger.info('开始清理临时目录');

    // 6. 清理临时目录
    fileUtils.removeDirectory(tempDir);
    logger.info('临时目录已清理');

    progressCallback({ percent: 100, message: '导入完成' });
    logger.info('本地导入完成');

    return true;
  } catch (error) {
    logger.error(`本地导入失败: ${error.message}`);

    // 清理临时目录
    try {
      if (fs.existsSync(tempDir)) {
        fileUtils.removeDirectory(tempDir);
      }
    } catch (cleanupError) {
      logger.warn(`清理临时目录失败: ${cleanupError.message}`);
    }

    throw error;
  }
}

module.exports = {
  extractAndValidateZip
};
