/**
 * 通知服务 - 获取和解析通知数据
 */
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');
const configService = require('./configService');
const proxyUtils = require('../utils/proxyUtils');

/**
 * 获取代理 agent
 * @returns {Promise<HttpsProxyAgent|null>}
 */
async function getProxyAgent() {
  const proxyConfig = configService.getProxyConfig();

  let proxyUrl = null;

  if (proxyConfig.autoConfigure) {
    logger.info('自动配置代理模式，检测系统代理...');
    proxyUrl = await proxyUtils.detectSystemProxyUrlAsync();
  } else if (proxyConfig.enabled) {
    proxyUrl = proxyConfig.http || proxyConfig.https;
  }

  if (!proxyUrl) {
    return null;
  }

  try {
    logger.info(`通知请求使用代理: ${proxyUrl}`);
    return new HttpsProxyAgent(proxyUrl);
  } catch (error) {
    logger.warn(`创建代理 agent 失败: ${error.message}`);
    return null;
  }
}

/**
 * 获取远程通知数据
 * @returns {Promise<object|null>} 通知数据或 null
 */
async function fetchNotifications() {
  const url = appConfig.urls.notifications;
  logger.info(`获取通知: ${url}`);

  const agent = await getProxyAgent();
  
  return new Promise((resolve) => {
    const req = https.get(url, { agent }, (res) => {
      // 检查 HTTP 状态码
      if (res.statusCode < 200 || res.statusCode >= 300) {
        logger.error(`通知请求失败: HTTP ${res.statusCode}`);
        resolve(null);
        return;
      }
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          logger.info('通知获取成功');
          resolve(parsed);
        } catch (error) {
          logger.error(`通知解析失败: ${error.message}`);
          resolve(null);
        }
      });
    });
    
    req.on('error', (error) => {
      logger.error(`通知请求失败: ${error.message}`);
      resolve(null);
    });
    
    req.setTimeout(15000, () => {
      req.destroy();
      logger.error('通知请求超时');
      resolve(null);
    });
  });
}

/**
 * 格式化通知数据为数组，按数字倒序排列
 * @param {object} notifications - 原始通知对象
 * @returns {Array} 格式化的通知数组
 */
function formatNotifications(notifications) {
  if (!notifications) return [];
  
  const entries = Object.entries(notifications);
  
  const parsed = entries.map(([key, value]) => {
    if (!value || typeof value !== 'object') {
      return { id: key, sortKey: 0, title: '', link: null, text: '' };
    }
    return {
      id: key,
      sortKey: parseInt(key.replace(/\D/g, ''), 10) || 0,
      title: value.title || '',
      link: value.link || null,
      text: value.text || ''
    };
  });
  
  parsed.sort((a, b) => b.sortKey - a.sortKey);
  
  return parsed;
}

module.exports = {
  fetchNotifications,
  formatNotifications
};
