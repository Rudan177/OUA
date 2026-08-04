/**
 * 配置服务 - 管理应用配置数据
 */
const path = require('path');
const fs = require('fs');
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
      autoUpdate: false
    },
    hotkey: {
      enabled: false,
      openWindow: 'Ctrl+Shift+O'
    },
    selfUpdate: null
  };
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
 * 设置代理配置
 * @param {object} proxyConfig - 代理配置对象
 */
function setProxyConfig(proxyConfig) {
  configData.proxy = {
    autoConfigure: proxyConfig.autoConfigure || false,
    enabled: proxyConfig.enabled || false,
    http: proxyConfig.http || '',
    https: proxyConfig.https || ''
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
    autoUpdate: startupConfig.autoUpdate || false
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
    autoUpdate: false
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

module.exports = {
  initConfig,
  loadConfig,
  saveConfig,
  setInstallDir,
  getInstallDir,
  setBranch,
  getBranch,
  setProxyConfig,
  getProxyConfig,
  setStartupConfig,
  getStartupConfig,
  setHotkeyConfig,
  getHotkeyConfig,
  getSelfUpdate,
  setSelfUpdate
};
