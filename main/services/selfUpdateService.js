/**
 * 自更新服务 - 检查 OUA 自身更新并下载对应系统的发布版本
 *
 * 更新来源:
 *   - 远程版本: GitHub 上项目的 renderer/js/version.js
 *   - 下载链接: GitHub 上项目的 README.md（手动维护各系统最新发布地址）
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');
const networkService = require('./networkService');
const downloadService = require('./downloadService');
const configService = require('./configService');
const compareVersion = require('../utils/compareVersion');

const LOCAL_VERSION_FILE = path.join(__dirname, '..', '..', 'renderer', 'js', 'version.js');

/**
 * 解析 version.js 内容，提取版本号
 * 支持格式: window.OUA_VERSION = { version: "...", fullVersion: "..." }
 * @param {string} content - 文件内容
 * @returns {string|null} 完整版本号或 null
 */
function parseVersionContent(content) {
  if (!content) return null;
  const fullMatch = content.match(/window\.OUA_VERSION\s*=\s*\{[\s\S]*?fullVersion\s*:\s*["']([^"']+)["']/);
  if (fullMatch) return fullMatch[1];
  const shortMatch = content.match(/window\.OUA_VERSION\s*=\s*\{[\s\S]*?version\s*:\s*["']([^"']+)["']/);
  return shortMatch ? shortMatch[1] : null;
}

/**
 * 读取本地（打包内）版本号
 * @returns {string|null}
 */
function getLocalVersion() {
  try {
    if (!fs.existsSync(LOCAL_VERSION_FILE)) {
      logger.warn('本地版本文件不存在: ' + LOCAL_VERSION_FILE);
      return null;
    }
    const content = fs.readFileSync(LOCAL_VERSION_FILE, 'utf8');
    return parseVersionContent(content);
  } catch (error) {
    logger.error(`读取本地版本失败: ${error.message}`);
    return null;
  }
}

/**
 * 获取远程版本号（GitHub raw renderer/js/version.js）
 * @returns {Promise<string|null>}
 */
async function getRemoteVersion() {
  const rawBase = `https://raw.githubusercontent.com/Rudan177/OUA/${appConfig.selfUpdate.branch}/`;
  const url = new URL(appConfig.selfUpdate.versionPath, rawBase);
  const proxy = await networkService.getSystemProxy();

  logger.info(`获取远程版本: ${url.href}`);
  const response = await networkService.httpsRequest(
    url.hostname,
    parseInt(url.port) || 443,
    url.pathname,
    proxy,
    15000
  );

  if (response.statusCode === 200) {
    const version = parseVersionContent(response.data.toString('utf8'));
    if (version) {
      logger.info(`获取到远程版本: ${version}`);
      return version;
    }
    throw new Error('远程版本文件格式无法识别');
  }
  throw new Error(`HTTP ${response.statusCode}`);
}

/**
 * 解析下载链接列表
 * 每行格式: 系统 类型 下载地址（空格分隔）
 * @param {string} content - README 内容
 * @returns {Array<{system: string, type: string, portable: boolean, url: string}>}
 */
function parseDownloadLinks(content) {
  const links = [];
  for (const line of String(content).split('\n')) {
    const m = line.match(/^[-*+]?\s*(Windows|Linux)\s+(免安装|安装|portable|setup)\s+(https?:\/\/\S+)/i);
    if (!m) continue;
    const system = m[1].trim();
    const type = m[2].trim();
    const url = m[3].trim();
    const portable = /免安装|portable/i.test(type);
    links.push({ system, type, portable, url });
  }
  return links;
}

/**
 * 获取下载链接列表（GitHub raw README.md）
 * @returns {Promise<Array>}
 */
async function getDownloadLinks() {
  const rawBase = `https://raw.githubusercontent.com/Rudan177/OUA/${appConfig.selfUpdate.branch}/`;
  const url = new URL(appConfig.selfUpdate.readmePath, rawBase);
  const proxy = await networkService.getSystemProxy();

  logger.info(`获取下载链接: ${url.href}`);
  const response = await networkService.httpsRequest(
    url.hostname,
    parseInt(url.port) || 443,
    url.pathname,
    proxy,
    15000
  );

  if (response.statusCode === 200) {
    const links = parseDownloadLinks(response.data.toString('utf8'));
    logger.info(`解析到 ${links.length} 条下载链接`);
    return links;
  }
  throw new Error(`HTTP ${response.statusCode}`);
}

/**
 * 检测当前 OUA 的运行类型（免安装 / 安装）
 * Windows: Program Files 下为安装版，否则为免安装版
 * Linux: .AppImage 或 /tmp/.mount_ 为免安装版，否则为安装版
 * @returns {'portable'|'installed'}
 */
function getCurrentInstallType() {
  const exePath = process.execPath;
  if (process.platform === 'win32') {
    return exePath.includes('Program Files') ? 'installed' : 'portable';
  }
  if (process.platform === 'linux') {
    return exePath.endsWith('.AppImage') || exePath.startsWith('/tmp/.mount_') ? 'portable' : 'installed';
  }
  return 'portable';
}

/**
 * 为当前系统挑选下载项（跟随当前运行类型的 OUA）
 * @param {Array} links - 下载链接列表
 * @returns {{system: string, type: string, portable: boolean, url: string}|null}
 */
function pickDownloadForOS(links) {
  const osKey = process.platform === 'win32' ? 'Windows' : (process.platform === 'linux' ? 'Linux' : null);
  if (!osKey) return null;

  const candidates = links.filter(link => link.system.toLowerCase() === osKey.toLowerCase());
  if (candidates.length === 0) return null;

  const currentType = getCurrentInstallType();
  const matching = candidates.find(link =>
    (currentType === 'portable' && link.portable) ||
    (currentType === 'installed' && !link.portable)
  );
  return matching || candidates[0];
}

/**
 * 检查更新
 * @returns {Promise<object>} { local, remote, updateAvailable, os, download, pendingPath }
 */
async function checkUpdate() {
  const local = getLocalVersion();

  let remote = null;
  let links = [];
  try {
    remote = await getRemoteVersion();
  } catch (error) {
    logger.error(`检查远程版本失败: ${error.message}`);
  }
  try {
    links = await getDownloadLinks();
  } catch (error) {
    logger.warn(`获取下载链接失败: ${error.message}`);
  }

  const osName = process.platform === 'win32' ? 'Windows' : (process.platform === 'linux' ? 'Linux' : process.platform);
  const download = pickDownloadForOS(links);

  let updateAvailable = false;
  if (local && remote) {
    updateAvailable = compareVersion.compareVersion(remote, local) > 0;
  }

  let pendingPath = null;
  if (updateAvailable) {
    const pending = configService.getSelfUpdate();
    if (pending && pending.version === remote && pending.path && fs.existsSync(pending.path)) {
      pendingPath = pending.path;
      logger.info(`检测到已下载的新版本文件: ${pendingPath}`);
    }
  }

  return {
    local,
    remote,
    updateAvailable,
    os: osName,
    installType: getCurrentInstallType(),
    download: download || null,
    pendingPath
  };
}

/**
 * 下载对应系统的发布文件到下载目录
 * @param {Function} progressCallback - 进度回调
 * @returns {Promise<object>} { path, type, portable }
 */
async function downloadUpdate(progressCallback) {
  const links = await getDownloadLinks();
  const download = pickDownloadForOS(links);
  if (!download) {
    throw new Error('README.md 中未找到当前系统 (Windows/Linux) 的下载地址');
  }

  const fileName = decodeURIComponent(path.basename(new URL(download.url).pathname)) || 'OUA-latest';
  const targetPath = path.join(app.getPath('downloads'), fileName);

  logger.info(`开始下载更新: ${download.url} -> ${targetPath}`);
  progressCallback({ percent: 0, message: '开始下载...' });
  await downloadService.downloadZip(download.url, targetPath, progressCallback);

  logger.info(`更新文件下载完成: ${targetPath}`);

  let remote = null;
  try {
    remote = await getRemoteVersion();
  } catch (error) {
    logger.warn(`下载后获取远程版本失败: ${error.message}`);
  }
  if (remote) {
    configService.setSelfUpdate({ version: remote, path: targetPath });
  }

  return {
    path: targetPath,
    type: download.type,
    portable: download.portable,
    system: download.system
  };
}

module.exports = {
  parseVersionContent,
  parseDownloadLinks,
  getLocalVersion,
  getRemoteVersion,
  getDownloadLinks,
  getCurrentInstallType,
  pickDownloadForOS,
  checkUpdate,
  downloadUpdate
};
