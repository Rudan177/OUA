/**
 * 下载服务 - 从远程 URL 下载 ZIP 压缩包
 */
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const logger = require('../utils/logger');
const networkService = require('./networkService');

/**
 * 获取分支对应的 ZIP 下载 URL
 * @param {string} branch - 分支名称 (LTS / main / test)
 * @returns {string} ZIP 下载 URL
 */
function getZipUrl(branch) {
  const base = 'https://github.com/Rudan177/OOOInterface/archive/refs/heads';
  switch (branch) {
    case 'LTS':
      return `${base}/LTS.zip`;
    case 'main':
      return `${base}/main.zip`;
    case 'test':
      return `${base}/test.zip`;
    default:
      return `${base}/LTS.zip`;
  }
}

/**
 * 下载 ZIP 文件到目标路径
 * @param {string} url - ZIP 下载 URL
 * @param {string} targetPath - 本地保存路径
 * @param {Function} progressCallback - 进度回调 (percent, message)
 * @returns {Promise<string>} 保存路径
 */
async function downloadZip(url, targetPath, progressCallback) {
  const proxy = await networkService.getSystemProxy();
  const parsedUrl = new URL(url);

  logger.info(`开始下载 ZIP: ${url} -> ${targetPath}`);

  return new Promise((resolve, reject) => {
    let req;

    if (proxy && proxy.https) {
      // 通过代理下载
      networkService.httpsRequest(
        parsedUrl.hostname,
        parseInt(parsedUrl.port) || 443,
        parsedUrl.pathname + parsedUrl.search,
        proxy,
        120000
      ).then(response => {
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }
        fs.writeFileSync(targetPath, response.data);
        logger.info(`ZIP 下载完成: ${targetPath} (${response.data.length} bytes)`);
        resolve(targetPath);
      }).catch(reject);
    } else {
      // 直连下载
      const https = require('https');
      req = https.get(url, {
        timeout: 120000,
        headers: { 'User-Agent': 'OUA-Update-Assistant' }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // 重定向
          if (res.headers.location) {
            logger.info(`重定向到: ${res.headers.location}`);
            downloadZip(res.headers.location, targetPath, progressCallback).then(resolve, reject);
            res.resume();
            return;
          }
        }

        if (res.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        const totalSize = parseInt(res.headers['content-length'], 10) || 0;
        let downloadedSize = 0;
        const chunks = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            progressCallback({ percent, message: `下载中 ${percent}%` });
          } else {
            progressCallback({ percent: 0, message: `已下载 ${Math.round(downloadedSize / 1024)} KB` });
          }
        });

        res.on('end', () => {
          const data = Buffer.concat(chunks);
          fs.writeFileSync(targetPath, data);
          logger.info(`ZIP 下载完成: ${targetPath} (${data.length} bytes)`);
          resolve(targetPath);
        });

        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('下载超时，请检查网络连接'));
      });
      req.on('error', reject);
    }
  });
}

module.exports = {
  getZipUrl,
  downloadZip
};
