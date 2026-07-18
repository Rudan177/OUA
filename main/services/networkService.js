/**
 * 网络服务 - 处理 HTTP 请求、代理隧道和远程版本检测
 */
const https = require('https');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');
const logger = require('../utils/logger');
const configService = require('./configService');
const proxyUtils = require('../utils/proxyUtils');

/**
 * 获取系统代理设置
 * @returns {Promise<object|null>} 代理配置 {http, https} 或 null
 */
async function getSystemProxy() {
  const appProxy = configService.getProxyConfig();

  if (appProxy.autoConfigure) {
    logger.info('自动配置代理模式，检测系统代理...');
    const proxyUrl = await proxyUtils.detectSystemProxyUrlAsync();
    if (proxyUrl) {
      return { http: proxyUrl, https: proxyUrl };
    }
    return null;
  }

  if (appProxy.enabled) {
    logger.info('使用应用配置的代理');
    return {
      http: appProxy.http || null,
      https: appProxy.https || appProxy.http || null
    };
  }

  return null;
}

/**
 * 通过代理建立 HTTPS 隧道（HTTP CONNECT）
 * @param {string} proxyUrl - 代理 URL
 * @param {string} host - 目标主机
 * @param {number} port - 目标端口
 * @returns {Promise<import('tls').TLSSocket>}
 */
function connectThroughProxy(proxyUrl, host, port, connectTimeoutMs = 15000, tlsTimeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn) => (...args) => {
      if (settled) return;
      settled = true;
      fn(...args);
    };

    const proxy = new URL(proxyUrl);
    let authHeader = '';
    if (proxy.username || proxy.password) {
      const credentials = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
      authHeader = `Proxy-Authorization: Basic ${credentials}\r\n`;
    }

    const connSocket = net.connect(parseInt(proxy.port) || 80, proxy.hostname);

    const connectTimer = setTimeout(done(() => {
      connSocket.destroy();
      reject(new Error(`代理连接超时: 无法在 ${connectTimeoutMs}ms 内连接到代理 ${proxy.hostname}:${proxy.port}`));
    }), connectTimeoutMs);

    connSocket.on('connect', () => {
      clearTimeout(connectTimer);
      connSocket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${authHeader}\r\n`);

      const responseTimer = setTimeout(done(() => {
        connSocket.destroy();
        reject(new Error(`代理连接超时: 代理未在 ${connectTimeoutMs}ms 内响应 CONNECT 请求`));
      }), connectTimeoutMs);

      let responseData = '';
      const onData = (data) => {
        responseData += data.toString();
        if (responseData.includes('\r\n\r\n')) {
          clearTimeout(responseTimer);
          connSocket.removeListener('data', onData);
          connSocket.removeListener('error', onError);
          connSocket.removeListener('close', onClose);

          const statusLine = responseData.split('\r\n')[0];
          const match = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
          if (match && parseInt(match[1]) === 200) {
            const tlsTimer = setTimeout(done(() => {
              connSocket.destroy();
              reject(new Error(`代理连接超时: TLS 握手在 ${tlsTimeoutMs}ms 内未完成`));
            }), tlsTimeoutMs);

            const tlsSocket = tls.connect({ socket: connSocket, servername: host });
            tlsSocket.on('secureConnect', done(() => {
              clearTimeout(tlsTimer);
              resolve(tlsSocket);
            }));
            tlsSocket.on('error', done((err) => {
              clearTimeout(tlsTimer);
              reject(new Error(`代理 TLS 握手失败: ${err.message}`));
            }));
          } else {
            connSocket.destroy();
            reject(new Error(`代理连接失败: ${statusLine}`));
          }
        }
      };
      const onError = (err) => {
        clearTimeout(responseTimer);
        connSocket.removeListener('data', onData);
        connSocket.removeListener('close', onClose);
        done(() => reject(new Error(`代理连接错误: ${err.message}`)))();
      };
      const onClose = () => {
        clearTimeout(responseTimer);
        connSocket.removeListener('data', onData);
        connSocket.removeListener('error', onError);
        done(() => reject(new Error('代理连接失败: 代理服务器关闭了连接')))();
      };

      connSocket.on('data', onData);
      connSocket.on('error', onError);
      connSocket.on('close', onClose);
    });

    connSocket.on('error', done((err) => {
      clearTimeout(connectTimer);
      reject(new Error(`代理连接错误: ${err.message}`));
    }));
  });
}

/**
 * 创建带代理的 HTTPS 请求
 * @param {string} host - 目标主机
 * @param {number} port - 目标端口
 * @param {string} pathWithQuery - 请求路径
 * @param {object} proxy - 代理配置
 * @param {number} timeoutMs - 超时毫秒数
 * @returns {Promise<object>} 响应对象 (data, statusCode, headers)
 */
function httpsRequest(host, port, pathWithQuery, proxy, timeoutMs) {
  return new Promise((resolve, reject) => {
    let req;

    if (proxy && proxy.https) {
      connectThroughProxy(proxy.https, host, port).then((tlsSocket) => {
        req = https.request({
          createConnection: () => tlsSocket,
          host, port,
          path: pathWithQuery,
          method: 'GET',
          timeout: timeoutMs,
          headers: { 'User-Agent': 'OUA-Update-Assistant' }
        }, handleResponse);
        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时，请检查网络连接')); });
        req.on('error', reject);
        req.end();
      }).catch(reject);
    } else {
      req = https.get({
        host, port,
        path: pathWithQuery,
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'OUA-Update-Assistant' }
      }, handleResponse);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时，请检查网络连接')); });
      req.on('error', reject);
    }

    function handleResponse(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = new URL(res.headers.location);
        httpsRequest(redirectUrl.hostname, parseInt(redirectUrl.port) || 443, redirectUrl.pathname + redirectUrl.search, proxy, timeoutMs)
          .then(resolve, reject);
        res.resume();
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          data: Buffer.concat(chunks),
          statusCode: res.statusCode,
          headers: res.headers
        });
      });
      res.on('error', reject);
    }
  });
}

/**
 * 获取远程版本（通过 GitHub raw 文件直接读取）
 * @param {string} branch - 分支名称
 * @returns {Promise<string|null>} 版本号或 null
 */
async function getRemoteVersion(branch) {
  try {
    logger.info(`获取远程版本 (分支: ${branch})`);
    const proxy = await getSystemProxy();

    const baseUrl = `https://raw.githubusercontent.com/Rudan177/OOOInterface/${branch}/`;

    const versionPaths = [
      'main/Script/version.js',
      'main/version.js'
    ];

    // 并行尝试所有路径，任一成功即返回；全部失败则返回 null
    const results = await Promise.allSettled(
      versionPaths.map(async (vp) => {
        const url = new URL(vp, baseUrl);
        logger.info(`尝试获取版本文件: ${url.href}`);

        const response = await httpsRequest(
          url.hostname,
          parseInt(url.port) || 443,
          url.pathname,
          proxy,
          15000
        );

        if (response.statusCode === 200) {
          const content = response.data.toString('utf8');
          const match = content.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
          if (match) {
            logger.info(`获取到远程版本: ${match[1]} (来自: ${vp})`);
            return match[1];
          }
        }
        logger.info(`版本文件 ${vp} 获取失败: HTTP ${response.statusCode}`);
        throw new Error(`HTTP ${response.statusCode}`);
      })
    );

    // 遍历结果，返回第一个成功的版本号
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }

    logger.warn('远程版本文件不存在');
    return null;
  } catch (error) {
    logger.error(`获取远程版本失败: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getSystemProxy,
  getRemoteVersion,
  httpsRequest
};
