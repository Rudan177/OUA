/**
 * 应用主入口 - 初始化所有模块
 */
(function() {
  async function ChuShiHua() {
    ThemeManager.init();

    try {
      // 始终直接进入主程序页面
      UIManager.XianShiZhuPingMu();

      NotificationPage.load();
      AboutPage.init();
      SettingsPage.init();

      const baoCunLuJing = await window.electronAPI.folder.getInstallDir();
      const savedBranch = await window.electronAPI.update.getBranch();

      if (baoCunLuJing) {
        if (savedBranch === 'local') {
          // 本地模式不检查远程更新
          document.getElementById('GengXin-ZhuangTai-WenBen').textContent = '本地模式：可导入 ZIP 压缩包';
        } else {
          // 检查更新前先检查是否有安装目录
          const structure = await window.electronAPI.folder.checkStructure(baoCunLuJing);
          if (structure === 'valid') {
            await UpdatePage.JianChaGengXin();
          } else if (structure === 'empty') {
            document.getElementById('GengXin-ZhuangTai-WenBen').textContent = '安装目录为空，请重新安装';
          } else {
            document.getElementById('GengXin-ZhuangTai-WenBen').textContent = '本地文件不完整，请重新安装';
          }
        }
      } else {
        // 安装目录为空，弹出对话框让用户选择
        const shouldSelect = await DialogManager.QueRen(
          '设置安装目录',
          '尚未设置安装目录，请选择一个安装目录。',
          { QueRenWenBen: '选择目录', QuXiaoWenBen: '稍后' }
        );
        if (shouldSelect) {
          // 调用更换目录逻辑，让用户选择安装目录
          await UpdatePage.ChuLiGengHuanLuJing();
        }
        // 无论用户是否选择了目录，更新状态文本
        const currentDir = await window.electronAPI.folder.getInstallDir();
        if (!currentDir) {
          document.getElementById('GengXin-ZhuangTai-WenBen').textContent = '请先设置安装目录';
        }
      }
    } catch (error) {
      console.error('应用初始化失败:', error);
    }

    // 启动诊断（仅用于调试）
    if (window.electronAPI?.isDev) {
      console.log('开始诊断 Git 环境...');
      window.electronAPI.system.diagnose()
        .then(results => {
          console.log('诊断结果:', results);
          if (!results.gitAvailable) console.error('Git 不可用:', results.gitError);
          if (!results.canAccessRepo) console.error('无法访问仓库:', results.repoAccessError);
        })
        .catch(err => console.error('诊断失败:', err));
    }
  }

  document.addEventListener('DOMContentLoaded', ChuShiHua);
})();