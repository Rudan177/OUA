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

      // 无条件把已保存的安装目录同步到 updatePage 模块，避免 Ctrl+R 刷新后
      // 闭包变量 AnZhuangLuJing 仍为 null、导入流程误判为"未设置"的问题
      UpdatePage.ChuShiHuaAnZhuangLuJing(baoCunLuJing);

      // 无论什么模式，只要有安装目录就先读取并显示本地版本号
      // 避免 HTML 默认"检测中..."在本地模式/无结构目录等不走 JianChaGengXin 的分支中残留
      if (baoCunLuJing) {
        try {
          const BenDiBanBen = await window.electronAPI.update.getLocalVersion(baoCunLuJing);
          document.getElementById('DangQian-BanBen').textContent = BenDiBanBen || '未找到本地版本';
        } catch (e) {
          console.error('读取本地版本失败:', e);
        }
      }

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
        // 安装目录为空：先选目录，再选远程/本地
        await DialogManager.TiShi('选择安装目录', '请选择或新建一个空目录作为 OOOInterface 的安装位置。');
        const luJing = await window.electronAPI.dialog.selectFolder();
        if (luJing) {
          const hasPermission = await window.electronAPI.folder.hasWritePermission(luJing);
          if (!hasPermission) {
            await DialogManager.TiShi('权限错误', '没有对该目录的写入权限');
          } else {
            const xuanZe = await DialogManager.XuanZhe(
              '选择安装方式',
              '请选择安装方式：',
              ['远程拉取', '本地导入', '取消']
            );

            if (xuanZe === 0) {
              await window.electronAPI.folder.setInstallDir(luJing);
              await UpdatePage.ChuLiShouCiXuanZe(luJing, 'remote');
            } else if (xuanZe === 1) {
              await window.electronAPI.folder.setInstallDir(luJing);
              await UpdatePage.ChuLiShouCiXuanZe(luJing, 'local');
            }
          }
        }

        // 如果仍未设置安装目录，更新状态文本
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
