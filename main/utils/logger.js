/**
 * 日志工具
 */
const path = require('path');
const fs = require('fs');

let logFilePath = null;
let logEnabled = true;

/**
 * 初始化日志器
 * @param {string} logDir - 日志目录
 */
function initLogger(logDir) {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const date = new Date().toISOString().split('T')[0];
  logFilePath = path.join(logDir, `oua-${date}.log`);
}

/**
 * 写入日志
 * @param {string} level - 日志级别 (INFO, WARN, ERROR)
 * @param {string} message - 日志消息
 */
function log(level, message) {
  if (!logEnabled) return;
  
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  
  console.log(logEntry);
  
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, logEntry + '\n');
    } catch (error) {
      console.error('Failed to write log file:', error.message);
    }
  }
}

/**
 * 信息日志
 * @param {string} message - 日志消息
 */
function info(message) {
  log('INFO', message);
}

/**
 * 警告日志
 * @param {string} message - 日志消息
 */
function warn(message) {
  log('WARN', message);
}

/**
 * 错误日志
 * @param {string} message - 日志消息
 */
function error(message) {
  log('ERROR', message);
}

/**
 * 调试日志
 * @param {string} message - 日志消息
 */
function debug(message) {
  log('DEBUG', message);
}

/**
 * 设置日志启用状态
 * @param {boolean} enabled
 */
function setEnabled(enabled) {
  logEnabled = enabled;
}

module.exports = {
  initLogger,
  info,
  warn,
  error,
  debug,
  setEnabled
};
