/**
 * Git 服务 - 处理所有 Git 相关操作
 */
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const https = require('https');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');
const logger = require('../utils/logger');
const fileUtils = require('../utils/fileUtils');
const appConfig = require('../config/appConfig');
const configService = require('./configService');
const proxyUtils = require('../utils/proxyUtils');

let currentBranch = appConfig.git.defaultBranch;

/**
 * 为 Promise 添加超时包装
 * @param {Promise} promise - 原始 Promise
 * @param {number} ms - 超时毫秒数
 * @param {string} errorMessage - 超时错误消息
 * @returns {Promise}
 */
function withTimeout(promise, ms, errorMessage = '操作超时') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => clearTimeout(timer));
}

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

  // 用户已关闭代理设置，不使用任何代理
  return null;
}

/**
 * 构建 Git clone 参数
 * @param {string} branch - 分支名称
 * @returns {string[]} clone 参数数组
 */
function buildCloneArgs(branch) {
  return ['--branch', branch, '--depth', '1'];
}

/**
 * 构建代理环境变量
 * @param {object} proxy - 代理配置 {http, https}
 * @returns {object} 环境变量对象
 */
function buildProxyEnv(proxy) {
  const envVars = { ...process.env };
  delete envVars.EDITOR;
  delete envVars.GIT_EDITOR;
  delete envVars.GIT_ASKPASS;
  delete envVars.GIT_PAGER;
  delete envVars.PAGER;
  delete envVars.GIT_SSH;
  delete envVars.GIT_SSH_COMMAND;
  delete envVars.GIT_CONFIG;
  delete envVars.GIT_CONFIG_NOSYSTEM;
  delete envVars.GIT_CONFIG_GLOBAL;

  delete envVars.HTTP_PROXY;
  delete envVars.http_proxy;
  delete envVars.HTTPS_PROXY;
  delete envVars.https_proxy;
  delete envVars.ALL_PROXY;
  delete envVars.all_proxy;
  delete envVars.NO_PROXY;
  delete envVars.no_proxy;

  if (proxy) {
    if (proxy.http) {
      envVars.HTTP_PROXY = proxy.http;
      envVars.http_proxy = proxy.http;
    }
    if (proxy.https) {
      envVars.HTTPS_PROXY = proxy.https;
      envVars.https_proxy = proxy.https;
    }
  }
  return envVars;
}

/**
 * 从 Git 进度字符串中提取百分比
 * @param {string} progress - Git 进度字符串，如 "Receiving objects: 10% (100/1000)"
 * @returns {number|null} 百分比数值
 */
function extractPercent(progress) {
  if (progress == null) return null;
  if (typeof progress === 'number') return progress;
  const str = String(progress);
  const match = str.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 获取 Git 实例
 * @param {string} targetDir - 目标目录
 * @param {Function} progressCallback - 进度回调函数

 * @returns {object} simple-git 实例
 */
function getGit(targetDir, progressCallback) {
  const options = {
    config: [
      'safe.directory=*',
      'http.sslBackend=openssl',
      'http.proxy=',
      'https.proxy='
    ],
    unsafe: {
      allowUnsafeEditor: true,
      allowUnsafePager: true,
      allowUnsafeAskPass: true
    }
  };
  if (progressCallback) {
    options.progress = ({ method, stage, progress }) => {
      const percent = extractPercent(progress);
      progressCallback({
        percent: percent !== null ? percent : 0,
        message: `${stage}`,
        detail: progress || ''
      });
    };
  }

  const git = simpleGit(targetDir, options);
  return git;
}

/**
 * 克隆仓库到指定目录
 * @param {string} repoUrl - 仓库 URL
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 分支名称
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<boolean>} 是否成功
 */
async function cloneRepo(repoUrl, targetDir, branch, progressCallback) {
  try {
    logger.info(`开始克隆仓库: ${repoUrl} -> ${targetDir} (分支: ${branch})`);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 先检查目标目录是否是一个有效的 git 仓库
    try {
      const git = getGit(targetDir, progressCallback);
      await git.status();
      logger.info('目标目录是有效的 git 仓库，执行拉取更新');
      return await pullUpdates(targetDir, branch, progressCallback);
    } catch (notGitRepo) {
      // 不是 git 仓库，清空目录后执行克隆
      logger.info('目标目录不是 git 仓库，清空目录后执行克隆');
      const contents = fs.readdirSync(targetDir);
      for (const item of contents) {
        const itemPath = path.join(targetDir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(itemPath);
        }
      }
    }

    const proxy = await getSystemProxy();
    const cloneArgs = buildCloneArgs(branch);
    const envVars = buildProxyEnv(proxy);

    const git = getGit('.', progressCallback).env(envVars);
    await withTimeout(git.clone(repoUrl, targetDir, cloneArgs), 120000, '克隆仓库超时，请检查网络连接');

    logger.info('仓库克隆完成');
    return true;
  } catch (error) {
    logger.error(`克隆仓库失败: ${error.message}`);
    throw error;
  }
}

/**
 * 拉取远程更新
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 分支名称
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<boolean>} 是否成功
 */
async function pullUpdates(targetDir, branch, progressCallback) {
  try {
    logger.info(`开始拉取更新 (分支: ${branch})`);

    // 设置代理（通过环境变量）
    const proxy = await getSystemProxy();
    const envVars = buildProxyEnv(proxy);

    const git = getGit(targetDir, progressCallback).env(envVars);

    // 检查是否是 git 仓库
    try {
      await git.status();
    } catch (error) {
      logger.error(`目标目录不是有效的 git 仓库: ${targetDir}`);
      throw new Error('目标目录不是有效的 git 仓库，请重新安装');
    }

    // 检查 origin 远程是否存在，不存在则添加
    try {
      await git.getRemotes(true);
      const remotes = await git.getRemotes(true);
      const hasOrigin = remotes.some(r => r.name === 'origin');
      if (!hasOrigin) {
        logger.info('origin 远程仓库不存在，添加 origin');
        await git.addRemote('origin', appConfig.git.repoUrl);
      }
    } catch (error) {
      logger.warn(`检查远程仓库失败: ${error.message}，尝试添加 origin`);
      try {
        await git.addRemote('origin', appConfig.git.repoUrl);
      } catch (addError) {
        logger.error(`添加 origin 失败: ${addError.message}`);
      }
    }

    // 修改远程配置以获取所有分支，解决浅克隆只跟踪初始分支的问题
    await git.addConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');

    // 先 fetch 所有远程分支，让 git 知道所有远程分支的存在
    await withTimeout(git.fetch('origin', ['--all', '--force']), 120000, '拉取远程更新超时，请检查网络连接');

    // 清理本地改动和未跟踪文件，防止切换分支时冲突
    const gitClean = getGit(targetDir, progressCallback).env(envVars);
    await gitClean.reset(['--hard', 'HEAD']);
    await gitClean.raw(['clean', '-fdx']);
    logger.info('已清理本地改动和未跟踪文件');

    // 检查本地分支列表
    const branches = await git.branchLocal();

    if (!branches.all.includes(branch)) {
      // 本地不存在该分支，创建本地分支并跟踪远程分支
      logger.info(`本地不存在分支 ${branch}，创建并跟踪远程分支`);
      // 使用 raw 执行 checkout -b，环境变量通过 .env() 传递
      const gitCheckout = getGit(targetDir, progressCallback).env(envVars);
      await gitCheckout.raw(['checkout', '-b', branch, `origin/${branch}`]);
      logger.info(`分支 ${branch} 创建完成`);
    } else {
      // 分支存在，切换分支需要更新工作目录，使用带代理的 git 实例
      const gitCheckout2 = getGit(targetDir, progressCallback).env(envVars);
      await gitCheckout2.checkout(branch);
    }

    // 使用 reset --hard 确保工作目录与远程分支完全一致，使用带代理的 git 实例
    const gitReset = getGit(targetDir, progressCallback).env(envVars);
    await gitReset.reset(['--hard', `origin/${branch}`]);

    logger.info('更新拉取完成');
    return true;
  } catch (error) {
    logger.error(`拉取更新失败: ${error.message}`);
    throw error;
  }
}

/**
 * 从 git 仓库 URL 中提取 owner/repo 路径
 * @param {string} repoUrl - 仓库 URL，如 https://github.com/Rudan177/OOOInterface.git
 * @returns {string} owner/repo 路径
 */
function extractRepoPath(repoUrl) {
  return repoUrl.replace(/^https?:\/\/[^/]+\/|\.git$/g, '');
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
 * 通过 GitHub API 获取单个文件内容（带重试机制）
 * @param {string} url - GitHub API URL
 * @param {object} proxy - 代理配置
 * @param {number} timeoutMs - 超时毫秒数
 * @param {number} maxRetries - 最大重试次数，默认3次
 * @returns {Promise<string>} 文件内容
 */
async function fetchRawFile(url, proxy, timeoutMs = 30000, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchRawFileOnce(url, proxy, timeoutMs);
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || '';

      // 判断是否可重试的错误
      const isRetryable = errorMsg.includes('timeout') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ENOTFOUND') ||
        errorMsg.includes('502') ||
        errorMsg.includes('503') ||
        errorMsg.includes('504') ||
        errorMsg.includes('代理连接超时') ||
        errorMsg.includes('代理连接错误') ||
        errorMsg.includes('代理 TLS 握手失败');

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // 递增等待：1秒、2秒、4秒
      const delay = Math.pow(2, attempt - 1) * 1000;
      logger.info(`请求失败，${delay}ms 后重试 (${attempt}/${maxRetries}): ${errorMsg}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 单次 HTTP 请求获取文件内容
 */
function fetchRawFileOnce(url, proxy, timeoutMs) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const host = targetUrl.hostname;
    const port = 443;
    const pathWithQuery = targetUrl.pathname + targetUrl.search;

    let req;

    if (proxy && proxy.https) {
      // 通过代理：先建立 CONNECT 隧道，再发 HTTPS 请求
      connectThroughProxy(proxy.https, host, port).then((tlsSocket) => {
        req = https.request({
          createConnection: () => tlsSocket,
          host: host,
          port: port,
          path: pathWithQuery,
          method: 'GET',
          timeout: timeoutMs,
          headers: {
            'User-Agent': 'OUA-Update-Assistant'
          }
        }, handleResponse);

        req.on('timeout', () => { req.destroy(); reject(new Error('获取远程版本超时，请检查网络连接')); });
        req.on('error', reject);
        req.end();
      }).catch(reject);
    } else {
      // 直连
      req = https.get({
        host: host,
        port: port,
        path: pathWithQuery,
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'OUA-Update-Assistant'
        }
      }, handleResponse);

      req.on('timeout', () => { req.destroy(); reject(new Error('获取远程版本超时，请检查网络连接')); });
      req.on('error', reject);
    }

    function handleResponse(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchRawFileOnce(res.headers.location, proxy, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.content && json.encoding === 'base64') {
            const content = Buffer.from(json.content, 'base64').toString('utf8');
            resolve(content);
          } else {
            reject(new Error('API 返回格式错误'));
          }
        } catch (e) {
          reject(new Error('解析 JSON 失败'));
        }
      });
      res.on('error', reject);
    }
  });
}

/**
 * 获取远程仓库版本（通过 GitHub API 直接读取文件，无需 git clone）
 * @param {string} repoUrl - 仓库 URL
 * @param {string} branch - 分支名称
 * @param {string} tempDir - 临时目录（保留参数以兼容调用方）
 * @returns {Promise<string|null>} 版本号或 null
 */
async function getRemoteVersion(repoUrl, branch, tempDir) {
  try {
    logger.info(`获取远程版本: ${repoUrl} (分支: ${branch})`);

    const targetBranch = branch || currentBranch;
    const repoPath = extractRepoPath(repoUrl);
    const baseUrl = `https://api.github.com/repos/${repoPath}/contents`;

    const proxy = await getSystemProxy();

    // 尝试多个可能的版本文件路径
    const versionPaths = [
      'main/Script/version.js',
      'main/version.js'
    ];

    // 用 withTimeout 包裹整个操作，确保 30 秒后一定超时
    const fetchWithTimeout = (url) => withTimeout(
      fetchRawFile(url, proxy),
      30000,
      '获取远程版本超时，请检查网络连接'
    );

    for (const vp of versionPaths) {
      const url = `${baseUrl}/${vp}?ref=${targetBranch}`;
      try {
        const content = await fetchWithTimeout(url);
        const match = content.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);

        logger.info(`获取到远程版本: ${match ? match[1] : 'null'} (来自: ${vp})`);
        return match ? match[1] : null;
      } catch (e) {
        logger.info(`版本文件 ${vp} 获取失败: ${e.message}，尝试下一个路径`);
      }
    }

    logger.warn('远程版本文件不存在 (检查了 main/Script/version.js 和 main/version.js)');
    return null;
  } catch (error) {
    logger.error(`获取远程版本失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取当前设置的分支
 * @returns {string} 当前分支
 */
function getCurrentBranch() {
  return currentBranch;
}

/**
 * 设置当前分支
 * @param {string} branch - 分支名称
 */
function setCurrentBranch(branch) {
  currentBranch = branch;
  logger.info(`更新分支设置为: ${branch}`);
}

module.exports = {
  cloneRepo,
  pullUpdates,
  getRemoteVersion,
  getCurrentBranch,
  setCurrentBranch,
  getSystemProxy
};
