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
    }
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
 * 获取配置
 * @returns {object} 配置数据
 */
function getConfig() {
  return { ...configData };
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
 * 检查是否首次运行
 * @returns {boolean}
 */
function isFirstRun() {
  return configData.isFirstRun;
}

/**
 * 设置主题
 * @param {string} theme - 主题 (system, light, dark)
 */
function setTheme(theme) {
  configData.theme = theme;
  saveConfig();
}

/**
 * 获取主题设置
 * @returns {string} 主题设置
 */
function getTheme() {
  return configData.theme || 'system';
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
 * 检查配置是否完整
 * @returns {boolean}
 */
function isConfigComplete() {
  return configData.installDir !== null;
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

module.exports = {
  initConfig,
  loadConfig,
  saveConfig,
  getConfig,
  setInstallDir,
  getInstallDir,
  setBranch,
  getBranch,
  isFirstRun,
  setTheme,
  getTheme,
  setProxyConfig,
  getProxyConfig,
  isConfigComplete,
  setStartupConfig,
  getStartupConfig
};
