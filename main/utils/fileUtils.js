/**
 * 文件系统工具函数
 */
const fs = require('fs');
const path = require('path');

/**
 * 递归复制目录
 * @param {string} src - 源目录
 * @param {string} dest - 目标目录
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 安全删除目录或文件（递归）
 * @param {string} targetPath - 要删除的路径
 */
function removeDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) return;

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    fs.unlinkSync(targetPath);
    return;
  }

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      removeDirectory(fullPath);
    }
    fs.rmdirSync(targetPath);
  }
}

/**
 * 检查路径是否存在
 * @param {string} filePath - 文件/目录路径
 * @returns {boolean}
 */
function exists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @param {string} encoding - 编码格式，默认 'utf8'
 * @returns {string|null} 文件内容或 null
 */
function readFile(filePath, encoding = 'utf8') {
  try {
    return fs.readFileSync(filePath, encoding);
  } catch (error) {
    return null;
  }
}

/**
 * 写入文件
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @param {string} encoding - 编码格式，默认 'utf8'
 */
function writeFile(filePath, content, encoding = 'utf8') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, encoding);
}

/**
 * 读取 JSON 文件
 * @param {string} filePath - JSON 文件路径
 * @returns {object|null} 解析后的对象或 null
 */
function readJson(filePath) {
  const content = readFile(filePath);
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * 写入 JSON 文件（带重试机制处理 EPERM/EBUSY）
 * @param {string} filePath - JSON 文件路径
 * @param {object} data - 要写入的数据
 */
function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(data, null, 2);
  let lastError = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) {
      // 递增等待：100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 6400ms
      const delay = Math.pow(2, attempt - 1) * 100;
      const start = Date.now();
      while (Date.now() - start < delay) { /* spin wait */ }
    }

    try {
      // 如果文件存在，先清除只读属性
      if (fs.existsSync(filePath)) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.mode & 0o400) {
            fs.chmodSync(filePath, 0o666);
          }
        } catch (e) { /* ignore */ }
      }

      // 直接覆盖写入
      fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o666 });
      return; // 成功则返回
    } catch (error) {
      lastError = error;

      if (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES') {
        // 文件被锁定（杀毒软件等），继续重试
        continue;
      }

      // 其他错误直接抛出
      throw error;
    }
  }

  throw lastError;
}

/**
 * 获取目录下所有文件和子目录
 * @param {string} dirPath - 目录路径
 * @returns {string[]} 文件和目录列表
 */
function getDirectoryContents(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath);
}

/**
 * 检查目录是否为空
 * @param {string} dirPath - 目录路径
 * @returns {boolean}
 */
function isDirectoryEmpty(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return true;
  }
  const contents = getDirectoryContents(dirPath);
  return contents.length === 0;
}

module.exports = {
  copyDirectory,
  removeDirectory,
  exists,
  readFile,
  writeFile,
  readJson,
  writeJson,
  getDirectoryContents,
  isDirectoryEmpty
};
