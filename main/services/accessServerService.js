/**
 * 可访问性 HTTP API 服务
 *
 * 在 Electron 主进程内起一个 HTTP 服务，把桌面端全部 IPC 后端能力镜像到网页端：
 *   - 静态文件：托管 renderer/ 前端页面
 *   - POST /api/invoke/<channel>：调用后端操作（与 IPC channel 同名同参）
 *   - POST /api/upload：上传 ZIP/文件到临时目录，返回临时路径
 *   - GET  /api/events：SSE 推送进度（update-progress / self-update-progress）
 *
 * 鉴权：本机（127.0.0.1/::1/localhost）免令牌；非本机请求需携带
 *   ?token= 或 Authorization: Bearer <token>，匹配 config.accessibility.token。
 * 静态页放开；/api/* 与 /api/events 受控。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

// Electron 对象：守护进程模式（ELECTRON_RUN_AS_NODE）下 require('electron') 会抛 MODULE_NOT_FOUND，
// 此时各变量保持 null；Electron 专属接口已由 daemonMode 守卫拦截，不会访问到这些对象。
let app = null;
let dialog = null;
let shell = null;
let BrowserWindow = null;
let globalShortcut = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object') {
    app = electron.app;
    dialog = electron.dialog;
    shell = electron.shell;
    BrowserWindow = electron.BrowserWindow;
    globalShortcut = electron.globalShortcut;
  }
} catch (e) {
  // 守护进程模式：无 Electron
}

const configService = require('./configService');
const folderService = require('./folderService');
const versionService = require('./versionService');
const updateService = require('./updateService');
const selfUpdateService = require('./selfUpdateService');
const notificationService = require('./notificationService');
const appService = require('./appService');
const zipService = require('./zipService');
const pathUtils = require('../utils/pathUtils');
const appConfigModule = require('../config/appConfig');
const logger = require('../utils/logger');

let httpServer = null;
let currentConfig = null;
let serveDir = null;

// SSE 客户端集合
const sseClients = new Set();

// 由 httpServerService 注入：用于重启/停止服务（避免循环依赖）
let controlHandlers = {
  onRestart: null,
  onStop: null
};

// 守护进程模式：true 时 Electron 专属接口返回 needWindow，由守护进程接管
let daemonMode = false;
// 守护进程注入：唤醒 / 退出 控制回调
let daemonCallbacks = {
  onWake: null,
  onExit: null
};

/**
 * 设置守护进程模式
 * @param {boolean} enabled
 */
function setDaemonMode(enabled) {
  daemonMode = !!enabled;
}

/**
 * 注入守护进程控制回调（唤醒主程序 / 退出守护进程）
 * @param {{onWake?: Function, onExit?: Function}} callbacks
 */
function setDaemonCallbacks(callbacks) {
  if (callbacks) {
    if (typeof callbacks.onWake === 'function') daemonCallbacks.onWake = callbacks.onWake;
    if (typeof callbacks.onExit === 'function') daemonCallbacks.onExit = callbacks.onExit;
  }
}

/**
 * 守护模式下 Electron 专属接口的统一返回：提示需打开主界面
 */
function needWindowError() {
  return { ok: false, needWindow: true, error: '此操作需要在主界面中执行，请先打开主界面' };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function isLocalAddress(remoteAddress) {
  if (!remoteAddress) return false;
  const a = String(remoteAddress).replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || a === 'localhost';
}

function extractToken(req) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const q = u.searchParams.get('token');
    if (q) return q;
  } catch (_) { /* 忽略解析失败 */ }
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (auth && auth.indexOf('Bearer ') === 0) return auth.slice(7);
  return null;
}

function isAuthorized(req) {
  // 本机免令牌
  if (isLocalAddress(req.socket.remoteAddress)) return true;
  const cfg = configService.getAccessibilityConfig();
  if (!cfg.token) return false;
  const token = extractToken(req);
  return token === cfg.token;
}

function writeJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function sendError(res, status, message) {
  writeJson(res, status, { ok: false, error: message });
}

/**
 * 广播 SSE 事件给所有客户端
 */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

/**
 * 进度回调 → SSE 广播
 */
function makeProgressBroadcaster(channel) {
  return (progress) => {
    broadcast('progress', {
      channel,
      percent: progress && progress.percent,
      message: progress && progress.message
    });
  };
}

function relaunchAndExit(delayMs) {
  setTimeout(() => {
    try {
      app.relaunch({ execPath: process.execPath });
    } catch (e) {
      logger.warn('relaunch 失败: ' + e.message);
    }
    app.exit(0);
  }, delayMs || 300);
}

/**
 * channel → handler 注册表，与 preload 的 IPC channel 一一对应。
 * 每个 handler 形如 async (args) => 任意可 JSON 序列化的返回值；抛错则由上层包装为 { ok:false, error }。
 */
function buildHandlers() {
  return {
    // ---- 文件/文件夹 ----
    'check-folder-structure': (args) => folderService.checkFolderStructure(args[0]),
    'has-write-permission': (args) => folderService.hasWritePermission(args[0]),
    'ensure-directory': (args) => {
      const dirPath = args[0];
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return true;
    },
    'get-install-dir': () => configService.getInstallDir(),
    'set-install-dir': (args) => {
      configService.setInstallDir(args[0]);
      return true;
    },
    'get-user-paths': () => {
      if (daemonMode) return needWindowError();
      return {
        documents: app.getPath('documents'),
        desktop: app.getPath('desktop'),
        home: app.getPath('home'),
        appData: app.getPath('appData')
      };
    },
    'import-local-zip': async (args) => {
      const zipPath = args[0];
      const installDir = configService.getInstallDir();
      if (!installDir) {
        throw new Error('未设置安装目录，请先在设置中先选择安装目录');
      }
      logger.info(`[可访问性] 开始本地导入: ${zipPath} -> ${installDir}`);
      return zipService.extractAndValidateZip(zipPath, installDir, makeProgressBroadcaster('update-progress'));
    },

    // ---- 系统/诊断 ----
    'diagnose-git': () => {
      const results = {
        tempDir: pathUtils.getTempDir(),
        tempDirExists: false,
        tempDirWritable: false
      };
      try {
        if (!fs.existsSync(results.tempDir)) {
          fs.mkdirSync(results.tempDir, { recursive: true });
        }
        results.tempDirExists = fs.existsSync(results.tempDir);
        const testFile = path.join(results.tempDir, 'test-write-' + Date.now() + '.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        results.tempDirWritable = true;
      } catch (error) {
        results.tempDirError = error.message;
      }
      return results;
    },
    'app-reset': async () => {
      if (daemonMode) return needWindowError();
      logger.info('[可访问性] 开始恢复出厂设置...');
      appService.cleanUserData();
      logger.info('[可访问性] 恢复出厂设置完成，准备重启...');
      relaunchAndExit(500);
      return true;
    },
    'app-restart': async () => {
      if (daemonMode) return needWindowError();
      logger.info('[可访问性] 开始完全关闭并重启应用...');
      relaunchAndExit(0);
      return true;
    },
    'app-uninstall': async () => {
      if (daemonMode) return needWindowError();
      logger.info('[可访问性] 开始一键卸载...');
      appService.removeInstallDir();
      appService.cleanUserData();
      logger.info('[可访问性] 一键卸载完成，准备退出...');
      relaunchAndExit(500);
      return true;
    },
    'window-hide': () => {
      if (daemonMode) return needWindowError();
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.hide();
      return true;
    },

    // ---- 设置/配置 ----
    'get-proxy-config': () => configService.getProxyConfig(),
    'set-proxy-config': (args) => {
      configService.setProxyConfig(args[0]);
      return true;
    },
    'get-startup-config': () => configService.getStartupConfig(),
    'set-startup-config': (args) => {
      const startupConfig = args[0];
      configService.setStartupConfig(startupConfig);
      if (daemonMode) {
        // 守护进程无 Electron：仅保存配置，开机自启注册由主界面打开时重新应用
        return true;
      }
      if (startupConfig.launchOnBoot) {
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: false,
          path: process.execPath,
          args: startupConfig.minimizeToTray ? ['--silent'] : []
        });
      } else {
        app.setLoginItemSettings({
          openAtLogin: false,
          path: process.execPath
        });
      }
      return true;
    },
    'get-app-config': () => ({
      fullVersion: appConfigModule.app.fullVersion,
      name: appConfigModule.app.name
    }),
    'get-hotkey-config': () => configService.getHotkeyConfig(),
    'set-hotkey-config': (args) => {
      configService.setHotkeyConfig(args[0]);
      if (daemonMode) {
        // 守护进程热键由 C# 托盘助手持有，新配置在下次启动守护进程时生效
        logger.info('[可访问性] 热键配置已保存，守护进程热键将在下次进入轻量模式时生效');
        return true;
      }
      reRegisterHotkey();
      return true;
    },
    'get-lan-ip': () => {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const addr of interfaces[name]) {
          if (addr.family === 'IPv4' && !addr.internal) return addr.address;
        }
      }
      return null;
    },

    // ---- 可访问性 ----
    'get-accessibility-config': () => configService.getAccessibilityConfig(),
    'set-accessibility-config': (args) => {
      configService.setAccessibilityConfig(args[0]);
      // 响应发出后再重启服务，避免打断当前请求
      if (controlHandlers.onRestart) {
        setTimeout(() => controlHandlers.onRestart(configService.getAccessibilityConfig()), 50);
      }
      return true;
    },
    'regenerate-accessibility-token': () => configService.regenerateAccessibilityToken(),
    'http-server-start': (args) => {
      if (controlHandlers.onRestart) {
        setTimeout(() => controlHandlers.onRestart(args[0]), 50);
      }
      return { ok: true };
    },
    'http-server-stop': () => {
      if (controlHandlers.onStop) {
        setTimeout(() => controlHandlers.onStop(), 50);
      }
      return true;
    },
    'http-server-status': () => getStatus(),

    // ---- 更新 ----
    'get-local-version': (args) => versionService.getLocalVersion(args[0]),
    'get-remote-version': (args) => versionService.getRemoteVersion(args[0]),
    'compare-versions': (args) => versionService.compareLocalWithRemote(args[0], args[1]),
    'get-branch': () => configService.getBranch(),
    'set-branch': (args) => {
      configService.setBranch(args[0]);
      return true;
    },
    'first-install': (args) => updateService.firstInstall(args[0], makeProgressBroadcaster('update-progress')),
    'force-overwrite': (args) => updateService.forceOverwrite(args[0], args[1], makeProgressBroadcaster('update-progress')),
    'update-app': (args) => updateService.updateApp(args[0], args[1], makeProgressBroadcaster('update-progress')),
    'switch-branch': (args) => updateService.switchBranch(args[0], args[1], makeProgressBroadcaster('update-progress')),

    // ---- 对话框 ----
    'select-folder': async () => {
      if (daemonMode) return needWindowError();
      const win = BrowserWindow.getAllWindows()[0] || null;
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: '选择 OOOInterface 安装目录'
      });
      return (!result.canceled && result.filePaths.length > 0) ? result.filePaths[0] : null;
    },
    'select-zip-file': async () => {
      if (daemonMode) return needWindowError();
      const win = BrowserWindow.getAllWindows()[0] || null;
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'ZIP 文件', extensions: ['zip'] }],
        title: '选择 OOOInterface 压缩包'
      });
      return (!result.canceled && result.filePaths.length > 0) ? result.filePaths[0] : null;
    },
    'fetch-notifications': async () => {
      const raw = await notificationService.fetchNotifications();
      return notificationService.formatNotifications(raw);
    },

    // ---- 自更新 ----
    'self-update-check': () => selfUpdateService.checkUpdate(),
    'self-update-download': () => selfUpdateService.downloadUpdate(makeProgressBroadcaster('self-update-progress')),
    'self-update-open': async (args) => {
      if (daemonMode) return needWindowError();
      const filePath = args[0];
      if (!filePath || typeof filePath !== 'string') {
        return { ok: false, message: '无效的文件路径' };
      }
      const error = await shell.openPath(filePath);
      if (error) {
        logger.error(`[可访问性] 打开更新文件失败: ${error}`);
        return { ok: false, message: error };
      }
      return { ok: true };
    },
    'self-update-clear-pending': () => {
      configService.setSelfUpdate(null);
      return true;
    }
  };
}

/**
 * 重新注册全局热键（与 main.js 的 zhuCeQuanJuReJian 逻辑一致）
 */
function reRegisterHotkey() {
  const hotkeyConfig = configService.getHotkeyConfig();
  globalShortcut.unregisterAll();
  if (!hotkeyConfig.enabled || !hotkeyConfig.openWindow) {
    return;
  }
  try {
    globalShortcut.register(hotkeyConfig.openWindow, () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isVisible() && !win.isMinimized()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      }
    });
  } catch (error) {
    logger.error(`[可访问性] 全局热键注册失败: ${error.message}`);
  }
}

/**
 * 静态文件服务（防目录穿越）
 */
function serveStatic(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    sendError(res, 400, 'Bad Request');
    return;
  }

  if (decoded === '/' || decoded === '') decoded = '/index.html';

  const resolved = path.resolve(serveDir, '.' + decoded);
  if (resolved !== serveDir && !resolved.startsWith(serveDir + path.sep)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  fs.stat(resolved, (err, stat) => {
    if (err) {
      sendError(res, 404, 'Not Found');
      return;
    }
    let filePath = resolved;
    if (stat.isDirectory()) {
      filePath = path.join(resolved, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        sendError(res, 404, 'Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  });
}

/**
 * 读取请求体（JSON）
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 20 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('无效的 JSON 请求体'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 处理 /api/invoke/<channel>
 */
async function handleInvoke(req, res, channel, handlers) {
  const handler = handlers[channel];
  if (!handler) {
    sendError(res, 404, '未知接口: ' + channel);
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    sendError(res, 400, e.message);
    return;
  }

  const args = Array.isArray(body.args) ? body.args : [];
  try {
    const data = await handler(args);
    writeJson(res, 200, { ok: true, data: data === undefined ? null : data });
  } catch (error) {
    logger.error(`[可访问性] ${channel} 调用失败: ${error.message}`);
    writeJson(res, 500, { ok: false, error: error.message || String(error) });
  }
}

/**
 * 处理 /api/upload（原始文件体，文件名走 query）
 */
function handleUpload(req, res, urlObj) {
  let fileName = urlObj.searchParams.get('filename') || ('upload-' + Date.now());
  fileName = path.basename(String(fileName)).replace(/[\\/:*?"<>|]/g, '_');
  if (!fileName) fileName = 'upload-' + Date.now();

  const tempDir = pathUtils.getTempDir();
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const targetPath = path.join(tempDir, fileName);

  const ws = fs.createWriteStream(targetPath);
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > 2 * 1024 * 1024 * 1024) {
      ws.destroy();
      req.destroy();
      return;
    }
    ws.write(c);
  });
  req.on('end', () => {
    ws.end(() => {
      writeJson(res, 200, { ok: true, path: targetPath });
    });
  });
  req.on('error', () => {
    try { ws.destroy(); } catch (_) {}
  });
  ws.on('error', () => {
    sendError(res, 500, '文件写入失败');
  });
}

function handleRequest(req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // API 需鉴权
  if (pathname.startsWith('/api/')) {
    if (!isAuthorized(req)) {
      sendError(res, 401, '未授权：非本机访问需要携带访问令牌');
      return;
    }

    if (pathname === '/api/events') {
      // SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      handleUpload(req, res, urlObj);
      return;
    }

    // 守护进程控制端点：唤醒主程序 / 退出守护进程（仅本机访问，已被上方鉴权）
    if (pathname === '/api/daemon/wake' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      if (daemonCallbacks.onWake) {
        setTimeout(() => daemonCallbacks.onWake(), 100);
      } else if (BrowserWindow) {
        // Electron 窗口模式兜底：聚焦现有窗口
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.show();
          win.focus();
        }
      }
      return;
    }
    if (pathname === '/api/daemon/exit' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      if (daemonCallbacks.onExit) {
        setTimeout(() => daemonCallbacks.onExit(), 100);
      } else if (app) {
        // Electron 窗口模式兜底：退出应用
        setTimeout(() => app.quit(), 100);
      }
      return;
    }

    const m = pathname.match(/^\/api\/invoke\/([A-Za-z0-9_-]+)$/);
    if (m && req.method === 'POST') {
      handleInvoke(req, res, m[1], buildHandlers());
      return;
    }

    sendError(res, 404, 'Not Found');
    return;
  }

  // 静态文件
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(res, pathname);
    return;
  }

  sendError(res, 405, 'Method Not Allowed');
}

/**
 * 启动 HTTP 服务
 * @param {object} accessibilityConfig - { enabled, port, allowExternal, token }
 * @param {object} options - { serveDir }
 */
function start(accessibilityConfig, options) {
  stop();

  const port = parseInt(accessibilityConfig.port, 10) || 8964;
  const host = accessibilityConfig.allowExternal ? '0.0.0.0' : '127.0.0.1';
  serveDir = options && options.serveDir ? options.serveDir : path.join(__dirname, '..', '..', 'renderer');
  currentConfig = accessibilityConfig;

  if (!fs.existsSync(serveDir)) {
    logger.error(`可访问性：服务器根目录不存在: ${serveDir}`);
    return { ok: false, error: '服务器根目录不存在' };
  }

  httpServer = http.createServer(handleRequest);

  return new Promise((resolve) => {
    httpServer.on('error', (err) => {
      logger.error(`可访问性：HTTP 服务启动失败: ${err.message}`);
      httpServer = null;
      currentConfig = null;
      resolve({ ok: false, error: err.message });
    });

    httpServer.listen(port, host, () => {
      logger.info(`可访问性：HTTP API 服务已启动，端口=${port}，host=${host}，root=${serveDir}`);
      resolve({ ok: true, port, host });
    });
  });
}

/**
 * 停止 HTTP 服务
 */
function stop() {
  if (httpServer) {
    try {
      httpServer.close();
    } catch (_) {}
    httpServer = null;
  }
  for (const client of sseClients) {
    try { client.end(); } catch (_) {}
  }
  sseClients.clear();
  currentConfig = null;
}

/**
 * 获取当前服务状态
 */
function getStatus() {
  return {
    enabled: !!httpServer,
    port: currentConfig ? currentConfig.port : 8964,
    host: currentConfig && currentConfig.allowExternal ? '0.0.0.0' : '127.0.0.1'
  };
}

/**
 * 注入控制回调（由 httpServerService 调用，避免循环依赖）
 */
function setControlHandlers(handlers) {
  controlHandlers = handlers;
}

module.exports = {
  start,
  stop,
  getStatus,
  setControlHandlers,
  setDaemonMode,
  setDaemonCallbacks
};
