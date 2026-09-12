/**
 * 分支工具 - 分支显示名与分支标识之间的映射
 *
 * 产品约定三种云端分支：
 *   LTS   → 长期支持版
 *   main  → 正式版（Release）
 *   test  → 尝鲜版（Beta）
 * 另有本地导入模式以 branch = 'local' 表示。
 */

/**
 * 分支标识 → 显示名
 * @param {string} branch - 分支标识（LTS / main / test / local）
 * @returns {string} 显示名
 */
function getBranchLabel(branch) {
  switch (branch) {
    case 'LTS':
      return 'LTS';
    case 'main':
      return 'Release';
    case 'test':
      return 'Beta';
    case 'local':
      return 'Local';
    default:
      return branch || '未知';
  }
}

/**
 * 用户输入 → 分支标识（大小写不敏感，兼容显示名与分支名）
 * @param {string} name - 用户输入（LTS / Release / Beta / main / test）
 * @returns {string|null} 分支标识，无法识别时返回 null
 */
function resolveBranchName(name) {
  const value = String(name || '').trim().toLowerCase();
  if (value === 'lts' || value === '长期支持版') return 'LTS';
  if (value === 'release' || value === 'main' || value === '正式版') return 'main';
  if (value === 'beta' || value === 'test' || value === '尝鲜版') return 'test';
  return null;
}

/**
 * 是否为本地导入模式
 * @param {string} branch - 分支标识
 * @returns {boolean}
 */
function isLocalBranch(branch) {
  return branch === 'local';
}

module.exports = {
  getBranchLabel,
  resolveBranchName,
  isLocalBranch
};
