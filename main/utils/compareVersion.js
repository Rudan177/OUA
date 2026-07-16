/**
 * 版本号比较工具
 * 支持格式: major.minor.patch 或复杂格式如 0.1.0:01-AS01
 */

/**
 * 解析版本号为可比较的结构
 * @param {string} version - 版本号字符串
 * @returns {object} 包含 mainParts (主版本数组), build (构建号), suffix (后缀)
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') {
    return { mainParts: [0, 0, 0], build: null, suffix: null };
  }

  const cleaned = version.replace(/^[vV]/, '').trim();
  
  // 分离主版本和元数据
  let mainPart = cleaned;
  let metadata = '';
  
  // 先处理冒号后的部分
  if (cleaned.includes(':')) {
    const colonIndex = cleaned.indexOf(':');
    mainPart = cleaned.substring(0, colonIndex);
    metadata = cleaned.substring(colonIndex + 1);
  }
  
  // 处理横杠后的部分（从主版本中分离）
  let suffix = '';
  if (mainPart.includes('-')) {
    const dashIndex = mainPart.indexOf('-');
    suffix = mainPart.substring(dashIndex + 1);
    mainPart = mainPart.substring(0, dashIndex);
  }
  
  // 解析主版本号为数字数组
  const segments = mainPart.split('.');
  const mainParts = segments.map(part => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });
  
  // 解析构建号（冒号后的数字部分）
  let build = null;
  if (metadata) {
    // 构建号可能包含横杠，如 "01-AS01"
    const buildMatch = metadata.match(/^(\d+)/);
    if (buildMatch) {
      build = parseInt(buildMatch[1], 10);
    }
    // 提取后缀（横杠后的部分）
    if (metadata.includes('-')) {
      const dashIndex = metadata.indexOf('-');
      suffix = metadata.substring(dashIndex + 1);
    }
  }
  
  return { 
    mainParts, 
    build: build, 
    suffix: suffix || null 
  };
}

/**
 * 比较两个版本号
 * @param {string} v1 - 第一个版本号
 * @param {string} v2 - 第二个版本号
 * @returns {number} 1 表示 v1 > v2, -1 表示 v1 < v2, 0 表示相等
 */
function compareVersion(v1, v2) {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);
  
  // 1. 比较主版本号 (major.minor.patch)
  const maxLength = Math.max(parsed1.mainParts.length, parsed2.mainParts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const p1 = parsed1.mainParts[i] || 0;
    const p2 = parsed2.mainParts[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  // 2. 主版本号相等时，比较构建号（冒号后的数字）
  const build1 = parsed1.build;
  const build2 = parsed2.build;
  
  if (build1 !== null && build2 !== null) {
    if (build1 > build2) return 1;
    if (build1 < build2) return -1;
  } else if (build1 !== null && build2 === null) {
    // 有构建号的版本高于没有构建号的版本
    return 1;
  } else if (build1 === null && build2 !== null) {
    return -1;
  }
  
  // 3. 构建号也相等时，比较后缀（横杠后的字符串）
  const suffix1 = parsed1.suffix;
  const suffix2 = parsed2.suffix;
  
  if (suffix1 !== null && suffix2 !== null) {
    if (suffix1 > suffix2) return 1;
    if (suffix1 < suffix2) return -1;
  } else if (suffix1 !== null && suffix2 === null) {
    // 有后缀的版本高于没有后缀的版本
    return 1;
  } else if (suffix1 === null && suffix2 !== null) {
    return -1;
  }
  
  return 0;
}

module.exports = {
  parseVersion,
  compareVersion
};
