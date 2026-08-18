/**
 * 关于页面逻辑
 * 默认只显示短版本号，单击展开完整版本、操作系统与更新按钮；
 * 每次打开自动检查更新，有新版本自动下载，版本号处圆点提示，
 * 更新按钮可打开已下载的新版本文件完成安装。
 */
(function() {
  function getOSName() {
    const platform = window.electronAPI && window.electronAPI.platform;
    if (platform === 'win32') return 'Windows';
    if (platform === 'darwin') return 'macOS';
    if (platform === 'linux') return 'Linux';
    return platform || '未知';
  }

  let DaiXiaZaiLuJing = null;
  let XiaZaiJinXingZhong = false;

  function YuanJianShi(id) {
    return document.getElementById(id);
  }

  function XianShiYuanDian(show) {
    const dot = YuanJianShi('BanBen-YuanDian');
    if (dot) dot.classList.toggle('YinCang', !show);
  }

  function SheZhiZhuangTai(text) {
    const status = YuanJianShi('GengXin-ZhuangTai-Cc');
    if (status) status.textContent = text || '-';
  }

  function SheZhiAnNiuWenZi(text, disabled) {
    const btn = YuanJianShi('AnNiu-Cc-GengXin');
    if (btn) {
      btn.textContent = text || '检查更新';
      if (typeof disabled === 'boolean') btn.disabled = disabled;
    }
  }

  async function XiaZaiXinBan() {
    if (XiaZaiJinXingZhong) return;
    XiaZaiJinXingZhong = true;
    SheZhiAnNiuWenZi('下载中...', true);

    const stop = window.electronAPI.selfUpdate.onProgress((p) => {
      SheZhiAnNiuWenZi(`下载中 ${p.percent}%`, true);
    });

    try {
      const res = await window.electronAPI.selfUpdate.download();
      stop();
      DaiXiaZaiLuJing = res.path;
      XianShiYuanDian(true);
      SheZhiZhuangTai('新版本已下载');
      SheZhiAnNiuWenZi('更新', false);
    } catch (e) {
      stop();
      XianShiYuanDian(false);
      SheZhiZhuangTai('下载失败');
      SheZhiAnNiuWenZi('检查更新', false);
      throw e;
    } finally {
      XiaZaiJinXingZhong = false;
    }
  }

  async function ShiYongDaiXiaZai() {
    if (!DaiXiaZaiLuJing) return;
    try {
      const res = await window.electronAPI.selfUpdate.openAndRelaunch(DaiXiaZaiLuJing);
      if (!res.ok) {
        await DialogManager.TiShi('更新失败', res.message || '无法打开新版本文件。');
        return;
      }
      // 应用即将重启，清空状态
      DaiXiaZaiLuJing = null;
      XianShiYuanDian(false);
      SheZhiZhuangTai('-');
      SheZhiAnNiuWenZi('检查更新', false);
    } catch (e) {
      await DialogManager.TiShi('更新失败', e.message || '无法打开新版本文件。');
    }
  }

  async function JianChaGengXin() {
    if (XiaZaiJinXingZhong) return;

    if (DaiXiaZaiLuJing) {
      await ShiYongDaiXiaZai();
      return;
    }

    SheZhiAnNiuWenZi('检查中...', true);
    try {
      const result = await window.electronAPI.selfUpdate.check();

      if (!result.remote) {
        SheZhiAnNiuWenZi('检查更新', false);
        SheZhiZhuangTai('-');
        await DialogManager.TiShi('检查更新', '无法获取远程版本，请检查网络连接后重试。');
        return;
      }

      if (!result.updateAvailable) {
        SheZhiAnNiuWenZi('检查更新', false);
        SheZhiZhuangTai('-');
        await DialogManager.TiShi('检查更新', `当前已是最新版本：${result.local || '未知'}。`);
        return;
      }

      if (result.pendingPath) {
        DaiXiaZaiLuJing = result.pendingPath;
        XianShiYuanDian(true);
        SheZhiZhuangTai('新版本已就绪');
        SheZhiAnNiuWenZi('重启并更新', false);
        return;
      }

      if (!result.download) {
        SheZhiAnNiuWenZi('检查更新', false);
        SheZhiZhuangTai('-');
        await DialogManager.TiShi('发现新版本',
          `本地版本：${result.local}\n最新版本：${result.remote}` +
          `\n\nREADME.md 中尚未配置 ${result.os || '当前系统'} 的下载地址。`);
        return;
      }

      await XiaZaiXinBan();
      if (DaiXiaZaiLuJing) {
        XianShiYuanDian(true);
        SheZhiAnNiuWenZi('重启并更新', false);
        SheZhiZhuangTai('新版本已就绪');
      }
    } catch (e) {
      SheZhiAnNiuWenZi('检查更新', false);
      await DialogManager.TiShi('检查更新', e.message || '检查更新失败，请稍后重试。');
    }
  }

  async function ZiDongJianCha() {
    try {
      const result = await window.electronAPI.selfUpdate.check();
      if (!result.updateAvailable) return;

      if (result.pendingPath) {
        DaiXiaZaiLuJing = result.pendingPath;
        XianShiYuanDian(true);
        SheZhiZhuangTai('新版本已就绪');
        SheZhiAnNiuWenZi('重启并更新', false);
        return;
      }

      if (!result.download) {
        XianShiYuanDian(true);
        SheZhiZhuangTai('新版本可用');
        SheZhiAnNiuWenZi('检查更新', false);
        return;
      }

      // 弹窗提示有新版本，不自动下载
      XianShiYuanDian(true);
      SheZhiZhuangTai('新版本可用');
      SheZhiAnNiuWenZi('检查更新', false);
      await DialogManager.TiShi('发现新版本',
        `当前版本：${result.local}\n最新版本：${result.remote}\n\n请点击「检查更新」按钮进行下载。`);
    } catch (e) {
      console.error('自动检查更新失败:', e);
    }
  }

  window.AboutPage = {
    init: function() {
      const v = (window.OUA_VERSION && window.OUA_VERSION.version) ?
        window.OUA_VERSION : { version: '0.0.0', fullVersion: '0.0.0:00-BS000' };

      const banBenHao = YuanJianShi('BanBen-Hao');
      const banBenQuanCheng = YuanJianShi('BanBen-QuanCheng');
      const xiTongMing = YuanJianShi('XiTong-Ming');
      const xiangQing = YuanJianShi('BanBen-XiangQing');
      const anNiuGengXin = YuanJianShi('AnNiu-Cc-GengXin');

      if (banBenHao) banBenHao.textContent = v.version;
      if (banBenQuanCheng) banBenQuanCheng.textContent = v.fullVersion;
      if (xiTongMing) xiTongMing.textContent = getOSName();

      // 单击版本号：展开/收起详情
      if (banBenHao && xiangQing) {
        banBenHao.addEventListener('click', () => {
          xiangQing.classList.toggle('YinCang');
        });
      }

      if (anNiuGengXin) {
        anNiuGengXin.addEventListener('click', JianChaGengXin);
      }

      const anNiuCcSheZhi = YuanJianShi('AnNiu-Cc-SheZhi');
      if (anNiuCcSheZhi) {
        anNiuCcSheZhi.addEventListener('click', () => window.SettingsPage.daKaiSheZhi());
      }

      // 打开即自动检查更新
      ZiDongJianCha();
    }
  };
})();
