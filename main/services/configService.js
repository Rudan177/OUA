/**
 * 配置服务 - 管理应用配置数据
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pathUtils = require('../utils/pathUtils');
const fileUtils = require('../utils/fileUtils');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');

let configData = null;

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  const configDir = pathUtils.getStorageDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * 初始化配置
 */
function initConfig() {
  ensureConfigDir();
  loadConfig();
}

/**
 * 加载配置
 */
function loadConfig() {
  const configPath = pathUtils.getConfigFilePath();

  if (fs.existsSync(configPath)) {
    try {
      configData = fileUtils.readJson(configPath);
      if (!configData || typeof configData !== 'object') {
        logger.warn('配置文件损坏，使用默认配置');
        configData = getDefaultConfig();
        saveConfig();
      } else {
        logger.info('配置加载成功');
        normalizeConfig();
      }
    } catch (error) {
      logger.error(`配置加载失败: ${error.message}`);
      configData = getDefaultConfig();
      saveConfig();
    }
  } else {
    configData = getDefaultConfig();
    saveConfig();
  }
}

/**
 * 获取默认配置
 * @returns {object} 默认配置对象
 */
function getDefaultConfig() {
  return {
    installDir: null,
    branch: appConfig.git.defaultBranch,
    cloudBranch: appConfig.git.defaultBranch,  // 本地模式下记忆的上一个云端分支，供切回 Cloud 使用
    isFirstRun: true,
    theme: 'system',
    proxy: {
      autoConfigure: true,
      enabled: false,
      http: '',
      https: ''
    },
    startup: {
      launchOnBoot: false,
      minimizeToTray: false,
      autoUpdate: false,
      lightweightMode: false
    },
    hotkey: {
      enabled: false,
      openWindow: 'Ctrl+Shift+O'
    },
    accessibility: {
      enabled: false,
      port: 8964,
      allowExternal: false,
      token: null,
      interfaceAccess: false  // OOOInterface 访问：允许 OOOInterface 关于页调用更新接口
    },
    selfUpdate: null,
    pendingUpdate: null  // { path: string } 已下载待安装的更新包路径
  };
}

/**
 * 规范化配置：补齐缺失字段、自动生成缺失的访问令牌
 */
function normalizeConfig() {
  let changed = false;
  if (!configData.accessibility) {
    configData.accessibility = { enabled: false, port: 8964, allowExternal: false, token: null, interfaceAccess: false };
    changed = true;
  }
  if (configData.accessibility.interfaceAccess === undefined) {
    configData.accessibility.interfaceAccess = false;
    changed = true;
  }
  // 补齐云端分支记忆：优先沿用当前分支，本地模式下回退到默认分支
  if (!configData.cloudBranch || typeof configData.cloudBranch !== 'string') {
    configData.cloudBranch = configData.branch && configData.branch !== 'local'
      ? configData.branch
      : appConfig.git.defaultBranch;
    changed = true;
  }
  if (configData.accessibility.enabled && !configData.accessibility.token) {
    configData.accessibility.token = generateAccessibilityToken();
    changed = true;
  }
  if (!configData.startup) {
    configData.startup = { launchOnBoot: false, minimizeToTray: false, autoUpdate: false, lightweightMode: false };
    changed = true;
  } else if (configData.startup.lightweightMode === undefined) {
    configData.startup.lightweightMode = false;
    changed = true;
  }
  if (changed) {
    saveConfig();
  }
}

/**
 * 保存配置
 */
function saveConfig() {
  const configPath = pathUtils.getConfigFilePath();
  fileUtils.writeJson(configPath, configData);
  logger.info('配置已保存');
}

/**
 * 设置安装目录
 * @param {string} installDir - 安装目录路径
 */
function setInstallDir(installDir) {
  configData.installDir = installDir;
  configData.isFirstRun = false;
  saveConfig();
}

/**
 * 获取安装目录
 * @returns {string|null} 安装目录或 null
 */
function getInstallDir() {
  return configData.installDir;
}

/**
 * 设置分支
 * @param {string} branch - 分支名称
 */
function setBranch(branch) {
  configData.branch = branch;
  // 云端分支会被记忆，便于本地模式切回 Cloud 时恢复
  if (branch && branch !== 'local') {
    configData.cloudBranch = branch;
  }
  saveConfig();
}

/**
 * 获取分支
 * @returns {string} 分支名称
 */
function getBranch() {
  return configData.branch || appConfig.git.defaultBranch;
}

/**
 * 获取记忆的云端分支
 * @returns {string} 云端分支名称
 */
function getCloudBranch() {
  const branch = configData && configData.cloudBranch;
  return branch && branch !== 'local' ? branch : appConfig.git.defaultBranch;
}

/**
 * 设置代理配置
 * 只覆盖传入的字段，未传入的字段保留原有值，防止意外清空配置。
 * @param {object} proxyConfig - 代理配置对象
 */
function setProxyConfig(proxyConfig) {
  if (!proxyConfig || typeof proxyConfig !== 'object') return;
  configData.proxy = {
    ...configData.proxy,
    autoConfigure: proxyConfig.autoConfigure ?? configData.proxy.autoConfigure,
    enabled: proxyConfig.enabled ?? configData.proxy.enabled,
    http: proxyConfig.http ?? configData.proxy.http,
    https: proxyConfig.https ?? configData.proxy.https
  };
  saveConfig();
  logger.info('代理配置已保存');
}

/**
 * 获取代理配置
 * @returns {object} 代理配置对象
 */
function getProxyConfig() {
  return configData.proxy || {
    autoConfigure: true,
    enabled: false,
    http: '',
    https: ''
  };
}

/**
 * 设置启动配置
 * @param {object} startupConfig - 启动配置对象
 */
function setStartupConfig(startupConfig) {
  configData.startup = {
    launchOnBoot: startupConfig.launchOnBoot || false,
    minimizeToTray: startupConfig.minimizeToTray || false,
    autoUpdate: startupConfig.autoUpdate || false,
    lightweightMode: startupConfig.lightweightMode || false
  };
  saveConfig();
  logger.info('启动配置已保存');
}

/**
 * 获取启动配置
 * @returns {object} 启动配置对象
 */
function getStartupConfig() {
  return configData.startup || {
    launchOnBoot: false,
    minimizeToTray: false,
    autoUpdate: false,
    lightweightMode: false
  };
}

/**
 * 设置热键配置
 * @param {object} hotkeyConfig - 热键配置对象 { enabled: boolean, openWindow: string }
 */
function setHotkeyConfig(hotkeyConfig) {
  configData.hotkey = {
    enabled: hotkeyConfig.enabled || false,
    openWindow: hotkeyConfig.openWindow || 'Ctrl+Shift+O'
  };
  saveConfig();
  logger.info('热键配置已保存');
}

/**
 * 获取热键配置
 * @returns {object} 热键配置对象
 */
function getHotkeyConfig() {
  return configData.hotkey || {
    enabled: false,
    openWindow: 'Ctrl+Shift+O'
  };
}

/**
 * 获取自更新待安装状态
 * @returns {object|null} { version, path } 或 null
 */
function getSelfUpdate() {
  return configData.selfUpdate || null;
}

/**
 * 设置自更新待安装状态
 * @param {object|null} selfUpdate - { version, path } 或 null
 */
function setSelfUpdate(selfUpdate) {
  configData.selfUpdate = selfUpdate || null;
  saveConfig();
  logger.info('自更新待安装状态已保存');
}

/**
 * 获取待安装的更新包路径
 * @returns {string|null} 文件路径或 null
 */
function getPendingUpdatePath() {
  return configData && configData.pendingUpdate ? configData.pendingUpdate.path : null;
}

/**
 * 保存待安装的更新包路径
 * @param {string|null} filePath - 安装包路径，为 null 时清除
 */
function setPendingUpdatePath(filePath) {
  configData = configData || getDefaultConfig();
  configData.pendingUpdate = filePath ? { path: filePath } : null;
  saveConfig();
  logger.info(filePath ? `待安装更新包已记录: ${filePath}` : '待安装更新包已清除');
}

/**
 * 生成随机访问令牌
 * @returns {string} 32 位十六进制随机令牌
 */
function generateAccessibilityToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 获取可访问性配置
 * @returns {object} 可访问性配置对象
 */
function getAccessibilityConfig() {
  return configData && configData.accessibility ? configData.accessibility : {
    enabled: false,
    port: 8964,
    allowExternal: false,
    token: null,
    interfaceAccess: false
  };
}

/**
 * 设置可访问性配置
 * @param {object} accessibilityConfig - 可访问性配置对象
 */
function setAccessibilityConfig(accessibilityConfig) {
  if (!accessibilityConfig || typeof accessibilityConfig !== 'object') return;
  if (!configData) configData = getDefaultConfig();
  configData.accessibility = {
    enabled: accessibilityConfig.enabled ?? (configData.accessibility?.enabled ?? false),
    port: accessibilityConfig.port ?? (configData.accessibility?.port ?? 8964),
    allowExternal: accessibilityConfig.allowExternal ?? (configData.accessibility?.allowExternal ?? false),
    token: accessibilityConfig.token ?? (configData.accessibility?.token ?? null),
    interfaceAccess: accessibilityConfig.interfaceAccess ?? (configData.accessibility?.interfaceAccess ?? false)
  };
  // 启用时若尚无令牌则自动生成，保证局域网远程访问有凭据可用
  if (configData.accessibility.enabled && !configData.accessibility.token) {
    configData.accessibility.token = generateAccessibilityToken();
  }
  saveConfig();
  logger.info('可访问性配置已保存');
}

/**
 * 重新生成可访问性访问令牌
 * @returns {object} 更新后的可访问性配置
 */
function regenerateAccessibilityToken() {
  if (!configData) configData = getDefaultConfig();
  if (!configData.accessibility) {
    configData.accessibility = { enabled: false, port: 8964, allowExternal: false, token: null, interfaceAccess: false };
  }
  configData.accessibility.token = generateAccessibilityToken();
  saveConfig();
  logger.info('可访问性访问令牌已重新生成');
  return configData.accessibility;
}

module.exports = {
  initConfig,
  loadConfig,
  saveConfig,
  setInstallDir,
  getInstallDir,
  setBranch,
  getBranch,
  getCloudBranch,
  setProxyConfig,
  getProxyConfig,
  setStartupConfig,
  getStartupConfig,
  setHotkeyConfig,
  getHotkeyConfig,
  getSelfUpdate,
  setSelfUpdate,
  getPendingUpdatePath,
  setPendingUpdatePath,
  getAccessibilityConfig,
  setAccessibilityConfig,
  regenerateAccessibilityToken
};
