/**
 * 版本号比较工具
 * 支持格式: major.minor.patch 或复杂格式如 0.1.0:01-AS01
 *
 * 版本号结构与判定规则（按用户约定，三个维度分别判定）：
 *   X.Y      主版本号前两段 → 用于判定 LTS 等级
 *            （5.2 与 5.2.1 视为同档 LTS，第三段不参与 LTS 等级比较）
 *   :NN      冒号后数字    → 用于判定正式版(main) 等级
 *   -LSD     横杠后首字母  → 用于判定尝鲜版(test) 等级
 *            R = 正式版 (main)
 *            B = 尝鲜版 (test)，语义上高于正式版
 */

/**
 * 解析版本号为可比较的结构
 * @param {string} version - 版本号字符串
 * @returns {object} 包含 mainParts (主版本数组), build (构建号), suffix (后缀), branchType (分支类型权重)
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') {
    return { mainParts: [0, 0, 0], build: null, suffix: null, branchType: 0 };
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

  // 解析分支类型权重（横杠后首字母 B/R）
  // 语义上: B 尝鲜版 (test) > R 正式版 (main) > 其他未知
  // 字典序恰好相反 (B < R)，所以单独抽出作为比较维度，避免误判
  let branchType = 0;
  if (suffix) {
    const firstChar = suffix.charAt(0).toUpperCase();
    if (firstChar === 'R') {
      branchType = 1;
    } else if (firstChar === 'B') {
      branchType = 2;
    }
  }

  return {
    mainParts,
    build: build,
    suffix: suffix || null,
    branchType
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

  // 1. 比较 LTS 等级：只看主版本号前两段 (X.Y)
  //    第三段及以后不参与 LTS 等级判定（5.2 与 5.2.1 视为同档 LTS）
  for (let i = 0; i < 2; i++) {
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

  // 3. 构建号也相等时，比较分支类型权重（B 尝鲜版 > R 正式版 > 默认）
  //    字典序比较 suffix 会得到错误的 B < R，所以先按 branchType 判定
  if (parsed1.branchType > parsed2.branchType) return 1;
  if (parsed1.branchType < parsed2.branchType) return -1;

  // 4. 分支类型也相同时，比较 suffix 字符串剩余部分（序号等）
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
