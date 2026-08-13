/**
 * 浏览器桥接层
 *
 * 在纯浏览器环境（无 window.electronAPI，即通过可访问性 HTTP 服务打开页面）下，
 * 用 fetch + SSE 构造一个与 preload 同构的 window.electronAPI，
 * 让现有的 updatePage.js / app.js / settingsPage.js 等前端代码无需改动即可在浏览器中运行。
 *
 * 桌面版 Electron 环境已有 preload 注入的 window.electronAPI，本文件直接返回，不做任何覆盖。
 */
(function () {
  'use strict';

  // 桌面版已有 preload 注入的 electronAPI，直接跳过
  if (window.electronAPI) {
    return;
  }

  var platform = detectPlatform();
  var _tokenModalOpen = false;
  var _pendingInvoke = null; // { channel, args, resolve, reject }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    if (/Windows/i.test(ua)) return 'win32';
    if (/Mac/i.test(ua)) return 'darwin';
    if (/Linux/i.test(ua)) return 'linux';
    return 'unknown';
  }

  var pathSep = platform === 'win32' ? '\\' : '/';

  function joinPath() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] && arguments[i].length > 0) parts.push(arguments[i]);
    }
    if (parts.length === 0) return '.';
    var result = parts[0];
    for (var j = 1; j < parts.length; j++) {
      var part = parts[j];
      if (result.slice(-1) === pathSep || part.charAt(0) === pathSep) {
        result += part;
      } else {
        result += pathSep + part;
      }
    }
    return result;
  }

  /**
   * 从当前 URL 查询参数中读取 token（?token=xxx）
   */
  function getTokenFromUrl() {
    try {
      var u = new URL(window.location.href);
      return u.searchParams.get('token') || null;
    } catch (_) { return null; }
  }

  /**
   * 读取存储的访问令牌（localStorage）
   */
  function getStoredToken() {
    return localStorage.getItem('oua-accessibility-token') || null;
  }

  /**
   * 保存访问令牌到 localStorage
   */
  function setStoredToken(token) {
    if (token) {
      localStorage.setItem('oua-accessibility-token', token);
    } else {
      localStorage.removeItem('oua-accessibility-token');
    }
  }

  /**
   * 弹出令牌输入模态框
   * @returns {Promise<string|null>} 用户输入的令牌，或 null（取消）
   */
  function showTokenModal() {
    return new Promise(function (resolve) {
      if (_tokenModalOpen) return;
      _tokenModalOpen = true;

      var overlay = document.createElement('div');
      overlay.id = 'OuA-Token-Modal';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:100000;display:flex;align-items:center;justify-content:center;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#1e1e1e;color:#eee;border-radius:12px;padding:24px;width:380px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
      var title = document.createElement('div');
      title.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:6px;';
      title.textContent = '需要访问令牌';
      var desc = document.createElement('div');
      desc.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:14px;line-height:1.5;';
      desc.textContent = '局域网访问 OUA 后端接口需要验证身份，请输入下方令牌后继续。';
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '请输入访问令牌…';
      input.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #444;border-radius:6px;background:#2a2a2a;color:#eee;font-size:14px;margin-bottom:14px;';
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
      var okBtn = document.createElement('button');
      okBtn.textContent = '确认';
      okBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:#0aa800;color:#fff;cursor:pointer;font-size:14px;';
      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #555;border-radius:6px;background:transparent;color:#ccc;cursor:pointer;font-size:14px;';

      var close = function () {
        try { document.body.removeChild(overlay); } catch (_) {}
        _tokenModalOpen = false;
      };
      okBtn.onclick = function () {
        var t = input.value.trim();
        close();
        resolve(t || null);
      };
      cancelBtn.onclick = function () { close(); resolve(null); };
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { okBtn.click(); }
        if (e.key === 'Escape') { cancelBtn.click(); }
      });

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      box.appendChild(title);
      box.appendChild(desc);
      box.appendChild(input);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(function () { input.focus(); }, 30);
    });
  }

  /**
   * 统一调用后端接口，自动附加令牌并在 401 时弹窗提示
   * @param {string} channel - 与 IPC channel 同名
   * @param {...*} args - 参数数组
   * @returns {Promise<any>} 后端返回值
   */
  function invoke(channel, args) {
    // 收集所有可用的 token（URL 优先，其次 localStorage）
    function buildToken() {
      return getTokenFromUrl() || getStoredToken();
    }
    var token = buildToken();
    var url = '/api/invoke/' + channel;
    if (token) url += '?token=' + encodeURIComponent(token);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: args || [] })
    }).then(function (res) {
      if (res.status === 401 && channel !== 'regenerate-accessibility-token') {
        // 未授权：只在非本机环境下弹窗（本机请求不应返回 401）
        var hostname = window.location.hostname || '';
        var isLocal = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
        if (!isLocal) {
          return showTokenModal().then(function (userToken) {
            if (!userToken) throw new Error('已取消授权');
            setStoredToken(userToken);
            // 重试一次，带上新用户令牌
            var retryUrl = url.split('?')[0] + '?token=' + encodeURIComponent(userToken);
            return fetch(retryUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ args: args || [] })
            }).then(function (retryRes) {
              return retryRes.json().then(function (payload) {
                if (!retryRes.ok || !payload.ok) {
                  throw new Error(payload.error || ('HTTP ' + retryRes.status));
                }
                return payload.data;
              });
            });
          });
        }
      }
      return res.json().then(function (payload) {
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error || ('HTTP ' + res.status));
        }
        return payload.data;
      });
    });
  }

  /**
   * 上传文件到临时目录，返回临时路径
   */
  function uploadFile(file) {
    return new Promise(function (resolve, reject) {
      var name = (file && file.name) ? file.name : ('upload-' + Date.now());
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload?filename=' + encodeURIComponent(name));
      xhr.onload = function () {
        try {
          var payload = JSON.parse(xhr.responseText);
          if (xhr.status === 200 && payload.ok) {
            resolve(payload.path);
          } else {
            reject(new Error(payload.error || '上传失败'));
          }
        } catch (e) {
          reject(new Error('上传响应解析失败'));
        }
      };
      xhr.onerror = function () {
        reject(new Error('上传失败'));
      };
      xhr.send(file);
    });
  }

  /**
   * 用原生文件输入框选择 ZIP 文件，上传后返回临时路径
   */
  function pickZipFile() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip,application/x-zip-compressed';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = function () {
        var file = input.files && input.files[0];
        document.body.removeChild(input);
        if (!file) {
          resolve(null);
          return;
        }
        uploadFile(file).then(resolve, reject);
      };
      input.oncancel = function () {
        document.body.removeChild(input);
        resolve(null);
      };
      input.click();
    });
  }

  /**
   * 轻量路径输入框（Promise 返回字符串或 null）
   * @param {string} title
   * @param {string} placeholder
   * @param {Function} [onNative] - 可选的本机原生选择框回调
   */
  function promptForPath(title, placeholder, onNative) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#222;border-radius:10px;padding:20px;width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:sans-serif;';
      var titleEl = document.createElement('div');
      titleEl.textContent = title;
      titleEl.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:12px;';
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder || '';
      input.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ccc;border-radius:6px;font-size:14px;';
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;justify-content:flex-end;';
      var okBtn = document.createElement('button');
      okBtn.textContent = '确定';
      okBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:#1a73e8;color:#fff;cursor:pointer;font-size:14px;';
      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#333;cursor:pointer;font-size:14px;';

      var done = function (val) {
        try { document.body.removeChild(overlay); } catch (_) {}
        resolve(val);
      };
      okBtn.onclick = function () { done(input.value.trim() || null); };
      cancelBtn.onclick = function () { done(null); };
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') done(input.value.trim() || null);
        if (e.key === 'Escape') done(null);
      });

      if (typeof onNative === 'function') {
        var nativeBtn = document.createElement('button');
        nativeBtn.textContent = '本机原生选择框';
        nativeBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:#4caf50;color:#fff;cursor:pointer;font-size:14px;margin-right:auto;';
        nativeBtn.onclick = function () {
          onNative().then(function (p) { done(p || null); }, function () { done(null); });
        };
        btnRow.appendChild(nativeBtn);
      }

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      box.appendChild(titleEl);
      box.appendChild(input);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(function () { input.focus(); }, 30);
    });
  }

  function isLocalHost() {
    var host = window.location.hostname || '';
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  }

  /**
   * 选择安装目录：本机优先走主进程原生目录框；远端/取消时回退手动输入路径
   */
  function selectFolder() {
    if (isLocalHost()) {
      // 本机：直接弹主进程原生目录选择框，体验与桌面版一致
      return invoke('select-folder', []).then(function (p) {
        if (p) return p;
        // 用户取消，回退手动输入
        return promptForPath('请输入安装目录绝对路径', '例如 C:\\NEXT\\111', function () {
          return invoke('select-folder', []);
        });
      });
    }
    // 远端设备：原生框会弹在宿主机器上，远端看不到，默认手动输入 + 原生框按钮兜底
    return promptForPath('请输入安装目录绝对路径', '例如 C:\\NEXT\\111', function () {
      return invoke('select-folder', []);
    });
  }

  // ---------- SSE 进度订阅 ----------
  var es = null;
  var subscribers = {
    'update-progress': [],
    'self-update-progress': [],
    'http-server-status-change': []
  };

  function ensureEventSource() {
    if (es && es.readyState !== EventSource.CLOSED) return es;
    es = new EventSource('/api/events');
    es.addEventListener('progress', function (e) {
      var data;
      try { data = JSON.parse(e.data); } catch (_) { return; }
      var list = subscribers[data.channel] || [];
      list.forEach(function (cb) {
        try { cb({ percent: data.percent, message: data.message }); } catch (_) {}
      });
    });
    es.addEventListener('http-server-status-change', function (e) {
      var data;
      try { data = JSON.parse(e.data); } catch (_) { return; }
      (subscribers['http-server-status-change'] || []).forEach(function (cb) {
        try { cb(data); } catch (_) {}
      });
    });
    return es;
  }

  function subscribe(channel, callback) {
    var list = subscribers[channel] || (subscribers[channel] = []);
    list.push(callback);
    ensureEventSource();
    return function unsubscribe() {
      var idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  // ---------- 构造同构 electronAPI ----------
  window.electronAPI = {
    isDev: false,
    platform: platform,
    path: {
      join: joinPath,
      sep: pathSep
    },
    getFilePath: function (file) {
      return uploadFile(file);
    },
    folder: {
      checkStructure: function (dirPath) { return invoke('check-folder-structure', [dirPath]); },
      hasWritePermission: function (dirPath) { return invoke('has-write-permission', [dirPath]); },
      ensureDirectory: function (dirPath) { return invoke('ensure-directory', [dirPath]); },
      getInstallDir: function () { return invoke('get-install-dir', []); },
      setInstallDir: function (dirPath) { return invoke('set-install-dir', [dirPath]); },
      getUserPaths: function () { return invoke('get-user-paths', []); }
    },
    system: {
      diagnose: function () { return invoke('diagnose-git', []); }
    },
    update: {
      getLocalVersion: function (installDir) { return invoke('get-local-version', [installDir]); },
      getRemoteVersion: function (branch) { return invoke('get-remote-version', [branch]); },
      compareVersions: function (a, b) { return invoke('compare-versions', [a, b]); },
      firstInstall: function (targetDir) { return invoke('first-install', [targetDir]); },
      forceOverwrite: function (targetDir, branch) { return invoke('force-overwrite', [targetDir, branch]); },
      updateApp: function (targetDir, branch) { return invoke('update-app', [targetDir, branch]); },
      switchBranch: function (targetDir, branch) { return invoke('switch-branch', [targetDir, branch]); },
      importLocalZip: function (zipPath) { return invoke('import-local-zip', [zipPath]); },
      getBranch: function () { return invoke('get-branch', []); },
      setBranch: function (branch) { return invoke('set-branch', [branch]); },
      onUpdateProgress: function (callback) { return subscribe('update-progress', callback); }
    },
    dialog: {
      selectFolder: selectFolder,
      selectZipFile: pickZipFile,
      fetchNotifications: function () { return invoke('fetch-notifications', []); }
    },
    app: {
      reset: function () { return invoke('app-reset', []); },
      restart: function () { return invoke('app-restart', []); },
      uninstall: function () { return invoke('app-uninstall', []); },
      hideWindow: function () { return invoke('window-hide', []); }
    },
    settings: {
      getProxyConfig: function () { return invoke('get-proxy-config', []); },
      setProxyConfig: function (config) { return invoke('set-proxy-config', [config]); },
      getStartupConfig: function () { return invoke('get-startup-config', []); },
      setStartupConfig: function (config) { return invoke('set-startup-config', [config]); },
      getHotkeyConfig: function () { return invoke('get-hotkey-config', []); },
      setHotkeyConfig: function (config) { return invoke('set-hotkey-config', [config]); },
      getAccessibilityConfig: function () { return invoke('get-accessibility-config', []); },
      setAccessibilityConfig: function (config) { return invoke('set-accessibility-config', [config]); },
      regenerateAccessibilityToken: function () { return invoke('regenerate-accessibility-token', []); }
    },
    httpServer: {
      start: function (config) { return invoke('http-server-start', [config]); },
      stop: function () { return invoke('http-server-stop', []); },
      getStatus: function () { return invoke('http-server-status', []); },
      onStatusChange: function (callback) { return subscribe('http-server-status-change', callback); }
    },
    appConfig: {
      getAppInfo: function () { return invoke('get-app-config', []); }
    },
    selfUpdate: {
      check: function () { return invoke('self-update-check', []); },
      download: function () { return invoke('self-update-download', []); },
      openDownload: function (filePath) { return invoke('self-update-open', [filePath]); },
      clearPending: function () { return invoke('self-update-clear-pending', []); },
      onProgress: function (callback) { return subscribe('self-update-progress', callback); }
    }
  };
})();
