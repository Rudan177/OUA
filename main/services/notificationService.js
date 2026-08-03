/**
 * 通知服务 - 获取和解析通知数据
 * 网络/代理部分统一复用 networkService，避免代理逻辑重复
 */
const { URL } = require('url');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');
const networkService = require('./networkService');

/**
 * 获取远程通知数据
 * @returns {Promise<object|null>} 通知数据或 null
 */
async function fetchNotifications() {
  const url = new URL(appConfig.urls.notifications);
  logger.info(`获取通知: ${url.href}`);

  try {
    const proxy = await networkService.getSystemProxy();

    const response = await networkService.httpsRequest(
      url.hostname,
      parseInt(url.port) || 443,
      url.pathname,
      proxy,
      15000
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      logger.error(`通知请求失败: HTTP ${response.statusCode}`);
      return null;
    }

    const parsed = JSON.parse(response.data.toString('utf8'));
    logger.info('通知获取成功');
    return parsed;
  } catch (error) {
    logger.error(`通知请求失败: ${error.message}`);
    return null;
  }
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
