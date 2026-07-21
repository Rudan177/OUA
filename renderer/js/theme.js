/**
 * 主题管理
 * 当前主题切换由 CSS @media (prefers-color-scheme: dark) 自动处理
 * 保留此模块以支持未来手动切换主题功能
 */
(function() {
  window.ThemeManager = {
    init: function() {
      // 系统主题变化由 CSS 媒体查询自动处理，无需 JS 干预
    },
    apply: function(theme) {
      // 预留：未来可添加手动主题切换逻辑
      // 需要同时在 CSS 中添加 .dark-theme 和 .light-theme 规则
    }
  };
})();
