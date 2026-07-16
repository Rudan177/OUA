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
            // 空目录弹出 3 选项对话框
            await UpdatePage.ChuLiKongMuLu(baoCunLuJing);
          } else {
            document.getElementById('GengXin-ZhuangTai-WenBen').textContent = '本地文件不完整，请重新安装';
          }
        }
      } else {
        // 安装目录为空，弹出 3 选项对话框
        const xuanZe = await DialogManager.XuanZhe(
          '设置安装目录',
          '尚未设置安装目录，请选择操作方式：',
          ['远程拉取', '本地导入', '稍后']
        );

        if (xuanZe === 0) {
          // 远程拉取：选择目录后首次安装
          await UpdatePage.ChuLiGengHuanLuJing();
        } else if (xuanZe === 1) {
          // 本地导入：选择目录后弹出 ZIP 文件选择器
          const luJing = await window.electronAPI.dialog.selectFolder();
          if (luJing) {
            const hasPermission = await window.electronAPI.folder.hasWritePermission(luJing);
            if (!hasPermission) {
              await DialogManager.TiShi('权限错误', '没有对该目录的写入权限');
            } else {
              await window.electronAPI.folder.setInstallDir(luJing);
              const zipLuJing = await window.electronAPI.dialog.selectZipFile();
              if (zipLuJing) {
                await UpdatePage.ChuLiBenDiDaoRu(zipLuJing);
              }
            }
          }
        }
        // xuanZe === 2（稍后）不做任何事

        // 如果用户仍然没有选择目录，更新状态文本
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
      console.log('开始诊断环境...');
      window.electronAPI.system.diagnose()
        .then(results => {
          console.log('诊断结果:', results);
        })
        .catch(err => console.error('诊断失败:', err));
    }
  }

  document.addEventListener('DOMContentLoaded', ChuShiHua);
})();
