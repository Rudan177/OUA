/**
 * HTTP Server 服务 - 管理可访问性 HTTP API 服务
 * 用于可访问性功能：在指定端口提供 OUA 前端 + 完整后端 API（进程内，不再 spawn 子进程）
 */
const path = require('path');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');
const accessServerService = require('./accessServerService');
const configService = require('./configService');

const emitter = new EventEmitter();

let config = null;

// 注入控制回调，让 accessServerService 能触发本服务的重启/停止
accessServerService.setControlHandlers({
  onRestart: (cfg) => qiDong(cfg),
  onStop: () => guanBi()
});

/**
 * 订阅 server 状态变更事件
 */
function onStatusChange(callback) {
  emitter.on('status-change', callback);
}

/**
 * 取消订阅
 */
function offStatusChange(callback) {
  emitter.removeListener('status-change', callback);
}

/**
 * 推送状态变更
 */
function emitStatusChange() {
  emitter.emit('status-change', huoQuZhuangTai());
}

/**
 * 获取要服务的目录路径：OUA 自己的 renderer 前端目录
 */
function getServeDir() {
  return path.join(__dirname, '..', '..', 'renderer');
}

/**
 * 启动 HTTP API 服务
 * @param {object} accessibilityConfig - { enabled, port, allowExternal, token }
 */
async function qiDong(accessibilityConfig) {
  await guanBi();

  // 始终从 configService 读取权威配置，确保包含自动生成的 token
  config = accessibilityConfig && accessibilityConfig.enabled
    ? configService.getAccessibilityConfig()
    : accessibilityConfig;

  if (!config || !config.enabled) {
    logger.info('可访问性：未启用，不启动 server');
    return { ok: true };
  }

  const result = await accessServerService.start(config, {
    serveDir: getServeDir()
  });

  emitStatusChange();
  return result;
}

/**
 * 停止 HTTP API 服务
 */
async function guanBi() {
  accessServerService.stop();
  config = null;
  emitStatusChange();
}

/**
 * 获取当前 server 状态
 */
function huoQuZhuangTai() {
  return accessServerService.getStatus();
}

module.exports = {
  qiDong,
  guanBi,
  huoQuZhuangTai,
  onStatusChange,
  offStatusChange
};
