/**
 * OUA 终端命令行（CLI）
 *
 * 与图形界面共用同一套 service 层（configService / versionService /
 * updateService / zipService / appService 等），因此命令执行结果与桌面端完全一致，
 * 仅交互形式不同。
 *
 * 由 main.js 在检测到 `oua <命令>` 形态的参数时进入：不创建窗口、不申请单实例锁，
 * 执行完命令后立即退出（exitCode 反映成功/失败）。
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const logger = require('./utils/logger');
const branchUtils = require('./utils/branchUtils');
const configService = require('./services/configService');
const versionService = require('./services/versionService');
const updateService = require('./services/updateService');
const zipService = require('./services/zipService');
const appService = require('./services/appService');

// Electron app（CLI 运行于 Electron 主进程内；非 Electron 环境下为 null）
let electronApp = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.app) {
    electronApp = electron.app;
  }
} catch (e) {
  // 非 Electron 环境，忽略
}

// 进度条宽度（字符数）
const PROGRESS_BAR_WIDTH = 30;
// 进度渲染节流：50ms 内不重复刷新，避免高频回调刷屏
const PROGRESS_THROTTLE_MS = 50;

let lastProgressRender = 0;

/**
 * 输出一行结果
 */
function out(line) {
  process.stdout.write((line === undefined || line === null ? '' : String(line)) + '\n');
}

/**
 * 输出进度条（带节流），如 [██████░░░░░░░░] 40%
 * @param {number} percent - 0-100
 * @param {string} [message] - 附加说明
 */
function renderProgress(percent, message) {
  const now = Date.now();
  if (now - lastProgressRender < PROGRESS_THROTTLE_MS) return;
  lastProgressRender = now;

  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const filled = Math.round((p / 100) * PROGRESS_BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(PROGRESS_BAR_WIDTH - filled);
  const suffix = message ? ' ' + message : '';
  process.stdout.write(`\r[${bar}] ${String(p).padStart(3, ' ')}%${suffix}`.slice(0, 100));
}

/**
 * 结束进度条并换行
 */
function finishProgress() {
  process.stdout.write('\n');
  lastProgressRender = 0;
}

/**
 * 获取 Electron 应用路径（用于过滤启动参数中的 app 目录）
 * @returns {string|null}
 */
function getAppPath() {
  if (electronApp) {
    try {
      return path.resolve(electronApp.getAppPath());
    } catch (e) { /* ignore */ }
  }
  return null;
}

/**
 * 是否处于云端模式（非本地导入）
 * @returns {boolean}
 */
function shiFouYunDuanMoShi() {
  return !branchUtils.isLocalBranch(configService.getBranch());
}

/**
 * 读取当前版本的展示信息
 * @returns {Promise<{branch: string, label: string, local: string, remote: string|null}>}
 */
async function duQuBanBenXinXi() {
  const branch = configService.getBranch();
  const installDir = configService.getInstallDir();
  const local = installDir ? versionService.getLocalVersion(installDir) : null;
  let remote = null;
  try {
    remote = await versionService.getRemoteVersion(branch);
  } catch (error) {
    logger.warn(`获取云端版本失败: ${error.message}`);
  }
  return {
    branch,
    label: branchUtils.getBranchLabel(branch),
    local: local || 'Unknown',
    remote: remote || 'Unknown'
  };
}

/**
 * 输出「检查更新」版本块（UPDATE BRANCH / LATEST VERSION / LOCAL VERSION）
 * @param {{label: string, remote: string, local: string}} info
 */
function shuChuBanBenKuai(info) {
  out('UPDATE BRANCH: ' + info.label);
  out('LATEST VERSION: ' + info.remote);
  out('LOCAL VERSION: ' + info.local);
}

/**
 * 输出「更新完成」块（UPDATE BRANCH / LATEST AND LOCAL VERSION）
 * @param {{label: string, remote: string}} info
 */
function shuChuWanChengKuai(info) {
  out('UPDATE BRANCH: ' + info.label);
  out('LATEST AND LOCAL VERSION: ' + info.remote);
}

/**
 * 解析布尔参数：true / false（大小写不敏感）
 * @returns {boolean|null} 无法解析返回 null
 */
function jieXiBuEr(zhi) {
  const v = String(zhi === undefined || zhi === null ? '' : zhi).trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

/**
 * 解析端口号：1-65535 的整数
 * @returns {number|null} 非法返回 null
 */
function jieXiDuanKou(zhi) {
  const v = String(zhi === undefined || zhi === null ? '' : zhi).trim();
  if (!/^\d+$/.test(v)) return null;
  const port = parseInt(v, 10);
  if (port < 1 || port > 65535) return null;
  return port;
}

/**
 * 获取本机局域网 IPv4 地址（无则回退 127.0.0.1）
 * @param {number} port
 * @returns {string} 形如 192.168.x.x:xxxx
 */
function huoQuWaiBuDiZhi(port) {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return `${addr.address}:${port}`;
      }
    }
  }
  return `127.0.0.1:${port}`;
}

/**
 * 把用户输入的热键组合转换为 Electron Accelerator
 * ctrl/control/^ → Ctrl；alt/cmd/command → Alt；其余取段名（单字符转大写）
 * @param {string} raw - 形如 ctrl+alt+o 的输入
 * @returns {string|null} 规范化后的组合；必须含修饰键与主键
 */
function guiFanHuaReJian(raw) {
  const parts = String(raw || '').split('+').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const xiuShi = new Set();
  let mainKey = null;

  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === 'ctrl' || p === 'control' || p === '^') {
      xiuShi.add('Ctrl');
    } else if (p === 'alt' || p === 'cmd' || p === 'command') {
      xiuShi.add('Alt');
    } else if (p === 'shift') {
      xiuShi.add('Shift');
    } else if (p === 'super' || p === 'meta' || p === 'win') {
      xiuShi.add('Super');
    } else {
      mainKey = part.length === 1 ? part.toUpperCase() : part;
    }
  }

  if (xiuShi.size === 0 || !mainKey) return null;
  return [...xiuShi, mainKey].join('+');
}

/**
 * 读取可访问性配置、改写后保存（供网关命令复用）
 * @param {object} patch - 需要覆盖的字段
 * @returns {object} 保存后的完整可访问性配置
 */
function gengXinKeFangWenXingPeiZhi(patch) {
  const cfg = configService.getAccessibilityConfig();
  const next = { ...cfg, ...patch };
  configService.setAccessibilityConfig(next);
  return configService.getAccessibilityConfig();
}

// =============================================
// 命令实现
// =============================================

/**
 * oua update — 检查版本
 * 云端模式输出分支/云端/本地版本，有新版本时提示升级；本地模式提示切换
 */
async function cmdUpdate() {
  if (!shiFouYunDuanMoShi()) {
    out('Currently in Local Mode. Enter **oua change mode Cloud** to switch. ');
    return 0;
  }

  const info = await duQuBanBenXinXi();
  shuChuBanBenKuai(info);

  if (info.remote !== 'Unknown' && info.local !== 'Unknown') {
    if (versionService.compareLocalWithRemote(info.local, info.remote) < 0) {
      out('New version availabel. Enter **oua upgrade** to install. ');
    }
  }
  return 0;
}

/**
 * oua upgrade — 下载云端新版本并覆盖安装
 * 未检测到新版本时提示失败
 */
async function cmdUpgrade() {
  if (!shiFouYunDuanMoShi()) {
    out('Currently in Local Mode. Enter **oua change mode Local** to switch.');
    return 0;
  }

  const info = await duQuBanBenXinXi();

  if (info.remote === 'Unknown' || info.local === 'Unknown') {
    out('Failed to load version list. Please try again. ');
    return 1;
  }

  const installDir = configService.getInstallDir();
  if (!installDir || versionService.compareLocalWithRemote(info.local, info.remote) >= 0) {
    out('Failed to load version list. Please try again. ');
    return 1;
  }

  logger.info(`CLI 升级: ${installDir} (分支: ${info.branch})`);
  out(`Updating from ${info.local} to ${info.remote}...`);
  try {
    await updateService.updateApp(installDir, info.branch, (progress) => {
      renderProgress(progress.percent, progress.message);
    });
  } finally {
    finishProgress();
  }

  // 以安装后的实际本地版本为准（正常应与云端版本一致）
  const newLocal = versionService.getLocalVersion(installDir) || info.remote;
  out('Completed.');
  shuChuWanChengKuai({ label: info.label, remote: newLocal });
  return 0;
}

/**
 * oua load <zip路径> — 本地模式下导入 ZIP
 */
async function cmdLoad(zipPath) {
  if (shiFouYunDuanMoShi()) {
    out('Currently in Cloud Mode. Enter **oua change mode Local** to switch. ');
    return 0;
  }

  const installDir = configService.getInstallDir();
  const resolved = zipPath ? path.resolve(zipPath) : '';
  const zipOk = resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  if (!zipOk || !installDir) {
    out('Invalid path. Pelase chek files. ');
    return 1;
  }

  logger.info(`CLI 本地导入: ${resolved} -> ${installDir}`);
  try {
    await zipService.extractAndValidateZip(resolved, installDir, (progress) => {
      renderProgress(progress.percent, progress.message);
    });
  } finally {
    finishProgress();
  }

  const local = versionService.getLocalVersion(installDir);
  out('Completed.');
  out('UPDATE BRANCH: ' + branchUtils.getBranchLabel(configService.getBranch()));
  out('LOCAL VERSION: ' + (local || 'Unknown'));
  return 0;
}

/**
 * oua change branch <分支名> — 切换云端分支（下载覆盖安装）
 */
async function cmdChangeBranch(branchName) {
  const branch = branchUtils.resolveBranchName(branchName);
  if (!branch) {
    out('Invalid branch. Enter LTS, Release or Beta.');
    return 1;
  }

  const installDir = configService.getInstallDir();
  if (!installDir) {
    out('Invalid path. Pelase chek files. ');
    return 1;
  }

  logger.info(`CLI 切换分支: ${branch}`);
  configService.setBranch(branch);

  try {
    await updateService.switchBranch(installDir, branch, (progress) => {
      renderProgress(progress.percent, progress.message);
    });
  } finally {
    finishProgress();
  }

  out('Completed.');
  out('UPDATE BRANCH: ' + branchUtils.getBranchLabel(branch));
  return 0;
}

/**
 * oua change mode <Cloud|Local> — 切换更新模式
 * 仅切换模式标记：Local 等待 oua load 导入；Cloud 恢复记忆的云端分支，
 * 后续通过 oua update / oua upgrade 同步（与 oua change branch 的下载行为区分开）。
 */
async function cmdChangeMode(modeName) {
  const mode = String(modeName || '').trim().toLowerCase();
  if (mode !== 'cloud' && mode !== 'local') {
    out('Invalid mode. Enter Cloud or Local.');
    return 1;
  }

  if (mode === 'local') {
    configService.setBranch('local');
    logger.info('CLI 切换到本地模式');
    out('Completed.');
    out('UPDATE MODE: Local');
    return 0;
  }

  const cloudBranch = configService.getCloudBranch();
  configService.setBranch(cloudBranch);
  logger.info(`CLI 切换到云端模式: ${cloudBranch}`);
  out('Completed.');
  out('UPDATE MODE: Cloud');
  return 0;
}

/**
 * oua change dir <安装目录> — 更换安装目录
 * 目录须为空（不存在或空文件夹）或已是有效的 OOOInterface 目录
 */
async function cmdChangeDir(dirPath) {
  if (!dirPath) {
    out('Invalid path. Pelase chek files. ');
    return 1;
  }

  const resolved = path.resolve(dirPath);
  const folderService = require('./services/folderService');

  if (fs.existsSync(resolved)) {
    if (!fs.statSync(resolved).isDirectory()) {
      out('Invalid path. Pelase chek files. ');
      return 1;
    }
    const structure = folderService.checkFolderStructure(resolved);
    if (structure !== 'empty' && structure !== 'valid') {
      out('Invalid path. Pelase chek files. ');
      return 1;
    }
  } else {
    // 目录不存在时尝试创建（与桌面端选择目录能力一致）
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch (error) {
      logger.warn(`创建安装目录失败: ${error.message}`);
      out('Invalid path. Pelase chek files. ');
      return 1;
    }
  }

  if (!folderService.hasWritePermission(resolved)) {
    out('Invalid path. Pelase chek files. ');
    return 1;
  }

  configService.setInstallDir(resolved);
  logger.info(`CLI 更换安装目录: ${resolved}`);

  out('Completed.');
  out('DIRECTORY: ' + resolved);
  return 0;
}

/**
 * oua setting <项> [值] — 修改各项设置开关
 * @param {string[]} tokens - 命令后参数（已按空格拆分）
 */
async function cmdSetting(tokens) {
  const t = (tokens || []).map(s => String(s));
  const low = t.map(s => s.toLowerCase());
  const startupConfig = configService.getStartupConfig();

  // oua setting start on boot <true|false>
  if (low[0] === 'start' && low[1] === 'on' && low[2] === 'boot') {
    const flag = jieXiBuEr(t[3]);
    if (flag === null) { out('Invalid value. Enter true or false.'); return 1; }
    startupConfig.launchOnBoot = flag;
    configService.setStartupConfig(startupConfig);
    out('Completed.');
    return 0;
  }

  // oua setting mini to tray <true|false>
  if (low[0] === 'mini' && low[1] === 'to' && low[2] === 'tray') {
    const flag = jieXiBuEr(t[3]);
    if (flag === null) { out('Invalid value. Enter true or false.'); return 1; }
    startupConfig.minimizeToTray = flag;
    // 关闭最小化到托盘时，联动关闭依赖它的轻量模式与热键（与桌面端一致）
    if (!flag) {
      startupConfig.lightweightMode = false;
      const hotkeyConfig = configService.getHotkeyConfig();
      hotkeyConfig.enabled = false;
      configService.setHotkeyConfig(hotkeyConfig);
    }
    configService.setStartupConfig(startupConfig);
    out('Completed.');
    return 0;
  }

  // oua setting auto update <true|false>
  if (low[0] === 'auto' && low[1] === 'update') {
    const flag = jieXiBuEr(t[2]);
    if (flag === null) { out('Invalid value. Enter true or false.'); return 1; }
    startupConfig.autoUpdate = flag;
    configService.setStartupConfig(startupConfig);
    out('Completed.');
    return 0;
  }

  // oua setting lite mode <true|false>
  if (low[0] === 'lite' && low[1] === 'mode') {
    const flag = jieXiBuEr(t[2]);
    if (flag === null) { out('Invalid value. Enter true or false.'); return 1; }
    if (!startupConfig.minimizeToTray) {
      out('Failed. Enter **oua setting mini to tray** and retry. ');
      return 1;
    }
    startupConfig.lightweightMode = flag;
    configService.setStartupConfig(startupConfig);
    out('Completed.');
    return 0;
  }

  // oua setting hotkey open as <组合键>
  if (low[0] === 'hotkey' && low[1] === 'open' && low[2] === 'as') {
    const hotkeyConfig = configService.getHotkeyConfig();
    if (!hotkeyConfig.enabled) {
      out('Failed. Enter **oua setting hotkey** and retry. ');
      return 1;
    }
    const accelerator = guiFanHuaReJian(t.slice(3).join('+'));
    if (!accelerator) {
      out('Invalid hotkey. Enter a combination such as ctrl+alt+o.');
      return 1;
    }
    hotkeyConfig.openWindow = accelerator;
    configService.setHotkeyConfig(hotkeyConfig);
    out('Completed.');
    return 0;
  }

  // oua setting hotkey <true|false>
  if (low[0] === 'hotkey') {
    const flag = jieXiBuEr(t[1]);
    if (flag === null) { out('Invalid value. Enter true or false.'); return 1; }
    if (!startupConfig.minimizeToTray) {
      out('Failed. Enter **oua setting mini to tray** and retry. ');
      return 1;
    }
    const hotkeyConfig = configService.getHotkeyConfig();
    hotkeyConfig.enabled = flag;
    configService.setHotkeyConfig(hotkeyConfig);
    out('Completed.');
    return 0;
  }

  out('Unknown setting. Enter **oua setting** to see available options.');
  return 1;
}

/**
 * oua delete — 卸载 OOOInterface（二次确认）
 * @param {string[]} rest - 后置参数，可含 Y/N 直接确认（跳过交互）
 */
async function cmdDelete(rest) {
  const answer = (rest || []).find(a => /^[yn]$/i.test(String(a).trim()));

  let confirmed;
  if (answer) {
    confirmed = String(answer).trim().toLowerCase() === 'y';
  } else if (process.stdin.isTTY) {
    confirmed = await askConfirm('You are about to uninstall OOOInterface. Please confirm again.(Y/N)');
  } else {
    // 无交互终端（如 GUI 子系统进程）：提示确认方式，默认取消避免静默挂起
    out('You are about to uninstall OOOInterface. Please confirm again.(Y/N)');
    out('(No interactive terminal detected. Run "oua delete Y" to confirm.)');
    return 0;
  }

  if (!confirmed) {
    out('Canceled. ');
    return 0;
  }

  logger.info('CLI 卸载 OOOInterface');
  appService.removeInstallDir();
  appService.cleanUserData();
  out('Completed. ');
  return 0;
}

/**
 * 交互式读取 Y/N 确认
 * @param {string} question - 提示语
 * @returns {Promise<boolean>}
 */
function askConfirm(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const onData = (chunk) => {
      const text = chunk.toString().trim().toLowerCase();
      if (!text) return; // 忽略空行
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
      resolve(text.startsWith('y'));
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

/**
 * oua gateway ... — 可访问性（网关）相关开关
 *
 * 仅持久化配置；实际服务由正在运行的 OUA（主界面或守护进程）监听配置变更后启停，
 * 与托盘助手直接改写 config.json 的产品行为保持一致。
 * @param {string[]} args - 子命令参数
 */
async function cmdGateway(args) {
  const sub = String(args[0] || '').trim().toLowerCase();

  switch (sub) {
    case 'start': {
      const cfg = gengXinKeFangWenXingPeiZhi({ enabled: true });
      logger.info('CLI 开启可访问性');
      out('Completed.');
      out(`127.0.0.1:${cfg.port}`);
      return 0;
    }
    case 'close': {
      const cfg = gengXinKeFangWenXingPeiZhi({ enabled: false });
      logger.info('CLI 关闭可访问性');
      out('Completed.');
      out(`127.0.0.1:${cfg.port}`);
      return 0;
    }
    case 'port': {
      const newPort = jieXiDuanKou(args[1]);
      if (newPort === null) {
        out('Invalid port number');
        return 1;
      }
      const cfg = gengXinKeFangWenXingPeiZhi({ port: newPort });
      logger.info(`CLI 修改可访问性端口: ${cfg.port}`);
      out('Completed.');
      out(`127.0.0.1:${cfg.port}`);
      return 0;
    }
    case 'ooo': {
      const flag = jieXiBuEr(args[1]);
      if (flag === null) { out('Invalid value. Enter true or false.'); return 1; }
      gengXinKeFangWenXingPeiZhi({ interfaceAccess: flag });
      logger.info(`CLI OOOInterface 访问: ${flag}`);
      out('Completed.');
      return 0;
    }
    case 'ext': {
      // oua gateway ext token <值> 或 oua gateway ext <true|false>
      let cfg;
      if (String(args[1] || '').trim().toLowerCase() === 'token') {
        if (args[2] === undefined || String(args[2]).trim() === '') {
          out('Invalid port number');
          return 1;
        }
        cfg = gengXinKeFangWenXingPeiZhi({ token: String(args[2]).trim() });
      } else {
        const flag = jieXiBuEr(args[1]);
        if (flag === null) { out('Invalid value. Enter true or false.'); return 1; }
        cfg = gengXinKeFangWenXingPeiZhi({ allowExternal: flag });
      }
      logger.info('CLI 修改外部访问配置');
      out('Completed.');
      out(huoQuWaiBuDiZhi(cfg.port));
      return 0;
    }
    default:
      out('Unknown gateway command. Enter oua gateway start|close|port|ooo|ext.');
      return 1;
  }
}

// =============================================
// 命令解析与分发
// =============================================

/**
 * 是否同一路径（Windows 盘符/大小写不敏感）
 */
function samePath(a, b) {
  if (!a || !b) return false;
  try {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  } catch (e) {
    return false;
  }
}

/**
 * 是否为 CLI 调用
 *
 * 判定只看命令参数的首个位置：先去掉可能出现在最前或最后的应用目录参数
 * （开发环境 `electron .` 把项目目录放在最前，`npm start` 放在最后），
 * 若其后仍是普通词（非 `-` 开头的内部标志）则视为 CLI 调用。
 * 这样 `--quit` / `--toggle` / `--switch-branch <x>` / `--silent` 等内部启动
 * 参数不会被误判，而拼错的命令也会走 CLI 教程而非弹出图形界面。
 * @param {string[]} argv - process.argv
 * @returns {boolean}
 */
function isCliInvocation(argv) {
  // 显式帮助参数也视为 CLI 调用
  if (argv.includes('--help') || argv.includes('-h')) return true;

  const appPath = getAppPath();
  const args = argv.slice(1).filter(a => !appPath || !samePath(a, appPath));

  // 内部标志（--quit/--toggle/--switch-branch 等）驱动的是正常启动流程
  if (args.length === 0) return false;
  if (args[0].startsWith('-')) return false;
  return true;
}

/**
 * 输出 CLI 教程：逐条命令的用法、行为与示例
 */
function shuChuBangZhu() {
  const L = [
    '',
    'OUA - OOOInterface Update Assistant CLI',
    'Usage: oua <command> [args]   (run "oua cli" anytime to show this tutorial)',
    '============================================================',
    '',
    '[ VERSION ]',
    '',
    '  oua update',
    '      Check version info.',
    '      Cloud Mode : prints',
    '                     UPDATE BRANCH: <LTS|Release|Beta>',
    '                     LATEST VERSION: <cloud version>',
    '                     LOCAL VERSION: <local version>',
    '                   and, if the cloud version is newer,',
    '                     New version availabel. Enter **oua upgrade** to install.',
    '      Local Mode : Currently in Local Mode. Enter **oua change mode Cloud** to switch.',
    '',
    '  oua upgrade',
    '      Download and install the newest version (Cloud Mode only).',
    '      Only downloads when a newer version is available (run "oua update" first).',
    '      Shows a progress bar, then prints',
    '                     Completed.',
    '                     UPDATE BRANCH: <branch>',
    '                     LATEST AND LOCAL VERSION: <version>',
    '      If no newer version is found:',
    '                     Failed to load version list. Please try again.',
    '',
    '  oua load <zip path>',
    '      Import a local ZIP package (Local Mode only).',
    '      Prints Completed. / UPDATE BRANCH: / LOCAL VERSION:',
    '      In Cloud Mode: Currently in Cloud Mode. Enter **oua change mode Local** to switch.',
    '',
    '[ MODE & BRANCH ]',
    '',
    '  oua change mode <Cloud|Local>',
    '      Switch between Cloud Mode and Local Mode.',
    '      Cloud reuses the last cloud branch; Local waits for "oua load".',
    '      Prints Completed. / UPDATE MODE: <Cloud|Local>',
    '',
    '  oua change branch <LTS|Release|Beta>',
    '      Switch cloud branch and download that branch over the install dir.',
    '      Prints Completed. / UPDATE BRANCH: <branch>',
    '',
    '  oua change dir <path>',
    '      Change the install directory. The folder must be empty or a valid',
    '      OOOInterface folder, otherwise: Invalid path. Pelase chek files.',
    '      Prints Completed. / DIRECTORY: <path>',
    '',
    '[ SETTINGS ]  (value is true or false)',
    '',
    '  oua setting start on boot <true|false>     Launch on boot',
    '  oua setting mini to tray  <true|false>     Minimize to tray',
    '  oua setting auto update   <true|false>     Auto update',
    '  oua setting lite mode     <true|false>     Lightweight mode',
    '        Requires "mini to tray"; otherwise:',
    '        Failed. Enter **oua setting mini to tray** and retry.',
    '  oua setting hotkey        <true|false>     Hotkey switch',
    '        Requires "mini to tray"; otherwise:',
    '        Failed. Enter **oua setting mini to tray** and retry.',
    '  oua setting hotkey open as <combination>   Custom hotkey',
    '        combo uses "+" of ctrl(=control=^), alt(=cmd=command), shift',
    '        e.g.  oua setting hotkey open as ctrl+alt+o',
    '        Requires the hotkey switch on; otherwise:',
    '        Failed. Enter **oua setting hotkey** and retry.',
    '',
    '[ DELETE ]',
    '',
    '  oua delete',
    '      Uninstall OOOInterface after confirmation:',
    '        You are about to uninstall OOOInterface. Please confirm again.(Y/N)',
    '      Y -> Completed.    N -> Canceled.',
    '      Non-interactive shells: run "oua delete Y" to confirm.',
    '',
    '[ GATEWAY ]  (accessibility service)',
    '',
    '  oua gateway start            Enable   -> Completed. / 127.0.0.1:<port>',
    '  oua gateway close            Disable  -> Completed. / 127.0.0.1:<port>',
    '  oua gateway port <number>    Set port -> Completed. / 127.0.0.1:<port>',
    '                               invalid  -> Invalid port number',
    '  oua gateway ooo <true|false> OOOInterface access -> Completed.',
    '  oua gateway ext <true|false> External access -> Completed. / <lan-ip>:<port>',
    '  oua gateway ext token <value> Set external token -> Completed. / <lan-ip>:<port>',
    '',
    '[ EXAMPLES ]',
    '',
    '  oua update                       Check whether an update exists',
    '  oua upgrade                      Install the detected update',
    '  oua change mode Local            Switch to Local Mode',
    '  oua load "D:\\pkg\\OOO.zip"        Import a local ZIP',
    '  oua change branch Beta           Switch to the Beta branch',
    '  oua setting auto update true     Enable auto update',
    '  oua setting hotkey open as ctrl+alt+o',
    '  oua delete Y                     Uninstall without prompting',
    '',
    'Exit code: 0 = success, 1 = failure.',
    ''
  ];
  for (const line of L) out(line);
}

/**
 * oua change 子命令分发
 * @param {string[]} args
 */
async function cmdChange(args) {
  const sub = String(args[0] || '').trim().toLowerCase();
  if (sub === 'branch') {
    return await cmdChangeBranch(args.slice(1).join(' '));
  }
  if (sub === 'mode') {
    return await cmdChangeMode(args[1]);
  }
  if (sub === 'dir') {
    return await cmdChangeDir(args.slice(1).join(' '));
  }
  out('Unknown change command. Enter oua change branch|mode|dir.');
  return 1;
}

/**
 * 解析并执行 CLI 命令
 * @param {string[]} argv - process.argv
 * @returns {Promise<number>} 退出码
 */
async function run(argv) {
  // CLI 模式：关闭控制台日志，避免污染命令输出；文件日志照常写入
  logger.setConsoleEnabled(false);

  const appPath = getAppPath();
  const args = argv.slice(1).filter(a => {
    if (a.startsWith('-')) return false;
    if (path.resolve(a) === path.resolve(process.execPath)) return false;
    if (appPath && path.resolve(a) === appPath) return false;
    return true;
  });

  const command = String(args[0] || '').trim().toLowerCase();
  const rest = args.slice(1);

  // 显式帮助参数（oua --help / oua -h）直接显示教程
  if (argv.includes('--help') || argv.includes('-h')) {
    shuChuBangZhu();
    return 0;
  }

  try {
    switch (command) {
      case 'update':
        return await cmdUpdate();
      case 'upgrade':
        return await cmdUpgrade();
      case 'load':
        return await cmdLoad(rest.join(' '));
      case 'change':
        return await cmdChange(rest);
      case 'setting':
        return await cmdSetting(rest);
      case 'delete':
        return await cmdDelete(rest);
      case 'gateway':
        return await cmdGateway(rest);
      case 'help':
      case 'cli':
      case 'tutorial':
        shuChuBangZhu();
        return 0;
      default:
        shuChuBangZhu();
        return command ? 1 : 0;
    }
  } catch (error) {
    logger.error(`CLI 命令失败 (${command}): ${error.stack || error.message}`);
    finishProgress();
    out('Failed: ' + (error.message || String(error)));
    return 1;
  }
}

module.exports = {
  isCliInvocation,
  run
};
