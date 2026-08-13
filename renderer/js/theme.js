/**
 * 主题管理
 * 通过 html[data-theme] 控制主题
 * 优先级：IPC 消息（主进程 nativeTheme）> 系统 matchMedia 回退
 */
(function() {
  var themeApplied = false;

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeApplied = true;
  }

  // 主进程 ready-to-show 时会主动推送当前主题
  // matchMedia 仅作系统切换前的回退，不用于初始判断
  function getFallbackTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  window.ThemeManager = {
    init: function() {
      // 等待 IPC 消息（由主进程在 ready-to-show 时推送）
      // 超时 500ms 后回退到 matchMedia，防止主进程未就绪时闪烁
      if (window.electronAPI?.theme?.onThemeChanged) {
        var timeout = setTimeout(function() {
          if (!themeApplied) {
            applyTheme(getFallbackTheme());
          }
        }, 500);

        window.electronAPI.theme.onThemeChanged(function(theme) {
          clearTimeout(timeout);
          applyTheme(theme);
        });
      } else if (!themeApplied) {
        // 无 IPC 桥接时直接使用 matchMedia（开发环境或旧版本兼容）
        applyTheme(getFallbackTheme());
      }
    },
    apply: function(theme) {
      applyTheme(theme);
    }
  };
})();
