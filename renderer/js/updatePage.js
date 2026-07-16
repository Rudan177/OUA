/**
 * 更新页面逻辑
 */
(function () {
  const DangQianBanBen = document.getElementById('DangQian-BanBen');
  const YuanChengBanBen = document.getElementById('YuanCheng-BanBen');
  const YuanChengBanBenHang = document.getElementById('YuanCheng-BanBen-Hang');
  const GengXinZhuangTaiWenBen = document.getElementById('GengXin-ZhuangTai-WenBen');
  const GengXinJinDuRongQi = document.getElementById('GengXin-JinDu-RongQi');
  const GengXinJinDu = document.getElementById('GengXin-JinDu');
  const GengXinJinDuWenBen = document.getElementById('GengXin-JinDu-WenBen');
  const AnNiuJianChaGengXin = document.getElementById('AnNiu-JianCha-GengXin');
  const AnNiuGengXin = document.getElementById('AnNiu-GengXin');
  const AnNiuXieZai = document.getElementById('AnNiu-XieZai');
  const AnNiuYuanCheng = document.getElementById('AnNiu-YuanCheng');
  const AnNiuBenDi = document.getElementById('AnNiu-BenDi');
  const AnZhuangLuJingXianShi = document.getElementById('AnZhuang-LuJing-XianShi');
  const AnNiuGengHuanLuJing = document.getElementById('AnNiu-GengHuan-LuJing');
  const KaiGuanKaiJiQiDong = document.getElementById('KaiGuan-KaiJiQiDong');
  const KaiGuanZuiXiaoHuaTuoPan = document.getElementById('KaiGuan-ZuiXiaoHua-TuoPan');
  const KaiGuanZiDongGengXin = document.getElementById('KaiGuan-ZiDong-GengXin');

  let AnZhuangLuJing = null;
  let DangQianFenZhi = 'remote';
  // 远程模式实际使用的 Git 分支
  const NEI_BU_FEN_ZHI = 'LTS';

  function GengXinAnZhuangLuJingXianShi() {
    if (AnZhuangLuJing) {
      AnZhuangLuJingXianShi.textContent = AnZhuangLuJing;
      AnZhuangLuJingXianShi.title = AnZhuangLuJing;
    } else {
      AnZhuangLuJingXianShi.textContent = '未设置';
      AnZhuangLuJingXianShi.title = '';
    }
  }

  async function JianChaGengXin() {
    try {
      if (!AnZhuangLuJing) {
        AnZhuangLuJing = await window.electronAPI.folder.getInstallDir();
        GengXinAnZhuangLuJingXianShi();
        if (!AnZhuangLuJing) {
          GengXinZhuangTaiWenBen.textContent = '请先设置安装目录';
          return;
        }
      }

      AnNiuJianChaGengXin.disabled = true;
      DangQianBanBen.textContent = '检测中...';
      GengXinZhuangTaiWenBen.textContent = '正在检查更新...';

      // 本地版本检查不需要超时
      const BenDiBanBen = await window.electronAPI.update.getLocalVersion(AnZhuangLuJing);
      DangQianBanBen.textContent = BenDiBanBen || '未找到本地版本';

      GengXinTongDaoAnNiu();

      // 远程版本检查添加较长超时（Git 克隆可能需要较长时间）
      GengXinZhuangTaiWenBen.textContent = '正在连接 GitHub...';

      let YuanChengBanBenZhi = null;

      try {
        YuanChengBanBenZhi = await window.electronAPI.update.getRemoteVersion(NEI_BU_FEN_ZHI);
        YuanChengBanBen.textContent = YuanChengBanBenZhi || '未找到远程版本';
      } catch (remoteError) {
        console.error('获取远程版本失败:', remoteError);
        YuanChengBanBen.textContent = '获取失败';
        throw remoteError;
      }

      if (BenDiBanBen && YuanChengBanBenZhi) {
        const comparison = await window.electronAPI.update.compareVersions(BenDiBanBen, YuanChengBanBenZhi);

        if (comparison < 0) {
          GengXinZhuangTaiWenBen.textContent = '检测到新版本，是否立即更新？';
          AnNiuGengXin.classList.remove('YinCang');
          AnNiuGengXin.textContent = '立即更新';
        } else {
          GengXinZhuangTaiWenBen.textContent = '当前已是最新版本';
          AnNiuGengXin.classList.add('YinCang');
        }
      } else {
        if (!BenDiBanBen) {
          GengXinZhuangTaiWenBen.textContent = '未检测到本地版本，请先安装';
        } else if (!YuanChengBanBenZhi) {
          GengXinZhuangTaiWenBen.textContent = '无法获取远程版本，请检查网络';
        } else {
          GengXinZhuangTaiWenBen.textContent = '版本检测完成';
        }
        AnNiuGengXin.classList.add('YinCang');
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      const errorMessage = error.message || '';
      if (errorMessage.includes('代理连接超时')) {
        GengXinZhuangTaiWenBen.textContent = '代理连接超时，请检查代理是否正常运行';
      } else if (errorMessage.includes('代理 TLS')) {
        GengXinZhuangTaiWenBen.textContent = '代理 TLS 握手失败，请检查代理类型';
      } else if (errorMessage.includes('代理连接错误')) {
        GengXinZhuangTaiWenBen.textContent = '代理连接失败，请检查代理地址和端口';
      } else if (errorMessage.includes('代理服务器关闭')) {
        GengXinZhuangTaiWenBen.textContent = '代理关闭了连接，请检查代理设置';
      } else if (errorMessage.includes('代理连接失败') || errorMessage.includes('proxy') || errorMessage.includes('代理')) {
        GengXinZhuangTaiWenBen.textContent = '代理连接失败，请检查代理设置';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('超时') || errorMessage.includes('ETIMEDOUT')) {
        GengXinZhuangTaiWenBen.textContent = '网络超时，请重试或检查网络连接';
      } else if (errorMessage.includes('ECONNREFUSED')) {
        GengXinZhuangTaiWenBen.textContent = '连接被拒绝，请检查网络代理设置';
      } else if (errorMessage.includes('ECONNRESET')) {
        GengXinZhuangTaiWenBen.textContent = '网络连接被重置，请重试';
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
        GengXinZhuangTaiWenBen.textContent = '无法解析域名，请检查网络连接';
      } else if (errorMessage.includes('HTTP 403')) {
        GengXinZhuangTaiWenBen.textContent = 'GitHub API 访问受限，请稍后重试';
      } else if (errorMessage.includes('HTTP 404')) {
        GengXinZhuangTaiWenBen.textContent = '资源未找到，请检查分支设置';
      } else if (errorMessage.includes('HTTP 5')) {
        GengXinZhuangTaiWenBen.textContent = 'GitHub 服务器错误，请稍后重试';
      } else if (errorMessage.includes('SSL') || errorMessage.includes('TLS') || errorMessage.includes('certificate')) {
        GengXinZhuangTaiWenBen.textContent = 'SSL 连接错误，请检查网络环境';
      } else {
        GengXinZhuangTaiWenBen.textContent = '检查更新失败: ' + error.message;
      }
      AnNiuGengXin.classList.add('YinCang');
    } finally {
      AnNiuJianChaGengXin.disabled = false;
    }
  }

  async function KaiShiShouCiAnZhuang(muBiaoLuJing) {
    try {
      GengXinJinDuRongQi.classList.remove('YinCang');
      GengXinZhuangTaiWenBen.textContent = '正在首次安装...';
      AnNiuJianChaGengXin.disabled = true;
      AnNiuGengHuanLuJing.disabled = true;

      await window.electronAPI.update.firstInstall(muBiaoLuJing);

      GengXinJinDu.style.width = '100%';
      GengXinJinDuWenBen.textContent = '安装完成';
      GengXinZhuangTaiWenBen.textContent = '安装完成，正在加载...';

      setTimeout(() => {
        GengXinJinDuRongQi.classList.add('YinCang');
        JianChaGengXin();
        AnNiuGengHuanLuJing.disabled = false;
      }, 1500);
    } catch (error) {
      GengXinJinDuRongQi.classList.add('YinCang');
      GengXinZhuangTaiWenBen.textContent = '安装失败: ' + error.message;
      AnNiuJianChaGengXin.disabled = false;
      AnNiuGengHuanLuJing.disabled = false;
    }
  }

  async function KaiShiQiangZhiFuGai(muBiaoLuJing) {
    try {
      GengXinJinDuRongQi.classList.remove('YinCang');
      GengXinZhuangTaiWenBen.textContent = '正在覆盖安装...';
      AnNiuJianChaGengXin.disabled = true;
      AnNiuGengHuanLuJing.disabled = true;

      await window.electronAPI.update.forceOverwrite(muBiaoLuJing, NEI_BU_FEN_ZHI);

      GengXinJinDu.style.width = '100%';
      GengXinJinDuWenBen.textContent = '覆盖安装完成';
      GengXinZhuangTaiWenBen.textContent = '覆盖安装完成，正在加载...';

      setTimeout(() => {
        GengXinJinDuRongQi.classList.add('YinCang');
        JianChaGengXin();
        AnNiuGengHuanLuJing.disabled = false;
      }, 1500);
    } catch (error) {
      GengXinJinDuRongQi.classList.add('YinCang');
      GengXinZhuangTaiWenBen.textContent = '覆盖安装失败: ' + error.message;
      AnNiuJianChaGengXin.disabled = false;
      AnNiuGengHuanLuJing.disabled = false;
    }
  }

  async function ZhiXingGengXin() {
    if (!AnZhuangLuJing) return;

    try {
      const BenDiBanBen = await window.electronAPI.update.getLocalVersion(AnZhuangLuJing);
      const YuanChengBanBenZhi = await window.electronAPI.update.getRemoteVersion(NEI_BU_FEN_ZHI);

      if (!YuanChengBanBenZhi) {
        GengXinZhuangTaiWenBen.textContent = '无法获取远程版本，请检查网络';
        return;
      }

      const comparison = await window.electronAPI.update.compareVersions(BenDiBanBen, YuanChengBanBenZhi);

      if (comparison < 0) {
        const shouldUpdate = await DialogManager.QueRen('确认更新', '检测到新版本，是否立即更新？');
        if (!shouldUpdate) return;
      } else {
        GengXinZhuangTaiWenBen.textContent = '当前已是最新版本';
        return;
      }

      GengXinJinDuRongQi.classList.remove('YinCang');
      GengXinZhuangTaiWenBen.textContent = '正在更新...';
      AnNiuJianChaGengXin.disabled = true;
      AnNiuGengXin.classList.add('YinCang');
      AnNiuGengHuanLuJing.disabled = true;

      await window.electronAPI.update.updateApp(AnZhuangLuJing, NEI_BU_FEN_ZHI);

      GengXinJinDu.style.width = '100%';
      GengXinJinDuWenBen.textContent = '更新完成';
      GengXinZhuangTaiWenBen.textContent = '更新完成，正在重新检测...';

      setTimeout(() => {
        GengXinJinDuRongQi.classList.add('YinCang');
        JianChaGengXin();
        AnNiuGengHuanLuJing.disabled = false;
      }, 1500);
    } catch (error) {
      GengXinJinDuRongQi.classList.add('YinCang');
      GengXinZhuangTaiWenBen.textContent = '更新失败: ' + error.message;
      AnNiuJianChaGengXin.disabled = false;
      AnNiuGengHuanLuJing.disabled = false;
    }
  }

  async function ChuLiGengHuanLuJing() {
    try {
      const luJing = await window.electronAPI.dialog.selectFolder();

      if (!luJing) return;

      const hasPermission = await window.electronAPI.folder.hasWritePermission(luJing);

      if (!hasPermission) {
        // 权限不足，尝试推荐用户目录
        const userPaths = await window.electronAPI.folder.getUserPaths();

        // 尝试几个常用的路径
        const keNengLuJing = [
          { path: userPaths.desktop + '\\OOOInterface', name: '桌面' },
          { path: userPaths.documents + '\\OOOInterface', name: '文档' },
          { path: userPaths.home + '\\OOOInterface', name: '用户目录' }
        ];

        let tuiJianLuJing = null;
        for (const l of keNengLuJing) {
          const hasPerm = await window.electronAPI.folder.hasWritePermission(l.path);
          if (hasPerm) {
            tuiJianLuJing = l;
            break;
          }
        }

        if (tuiJianLuJing) {
          const shiYongTuiJian = await DialogManager.QueRen(
            '权限不足',
            `没有对该目录的写入权限！\n\n推荐您使用 ${tuiJianLuJing.name} 目录：\n${tuiJianLuJing.path}\n\n是否使用推荐路径？`,
            { QueRenWenBen: '使用推荐路径', QuXiaoWenBen: '继续选择' }
          );

          if (shiYongTuiJian) {
            await window.electronAPI.folder.ensureDirectory(tuiJianLuJing.path);
            await GengHuanLuJingDaiLuJing(tuiJianLuJing.path);
            return;
          }
          // 用户拒绝推荐路径，返回让用户重新选择
          return;
        } else {
          await DialogManager.TiShi(
            '权限错误',
            '没有对该目录的写入权限！\n\n建议选择：\n- 桌面\n- 文档\n- 用户目录\n\n或者以管理员身份运行程序。'
          );
          return;
        }
      }

      await GengHuanLuJingDaiLuJing(luJing);
    } catch (error) {
      await DialogManager.TiShi('错误', '更换目录时发生错误: ' + error.message);
    }
  }

  async function ChuLiKongMuLu(luJing) {
    const xuanZe = await DialogManager.XuanZhe(
      '空目录',
      '新目录是空的，请选择操作方式：',
      ['从远程拉取', '从本地导入', '取消']
    );

    if (xuanZe === 0) {
      // 从远程拉取
      await window.electronAPI.folder.setInstallDir(luJing);
      AnZhuangLuJing = luJing;
      GengXinAnZhuangLuJingXianShi();
      // 如果当前是本地模式，切回远程模式
      if (DangQianFenZhi === 'local') {
        DangQianFenZhi = 'remote';
        await window.electronAPI.update.setBranch(NEI_BU_FEN_ZHI);
        GengXinTongDaoAnNiu();
      }
      KaiShiShouCiAnZhuang(luJing);
    } else if (xuanZe === 1) {
      // 从本地导入
      const zipLuJing = await window.electronAPI.dialog.selectZipFile();
      if (!zipLuJing) return;
      await window.electronAPI.folder.setInstallDir(luJing);
      AnZhuangLuJing = luJing;
      GengXinAnZhuangLuJingXianShi();
      // 切换到本地模式
      if (DangQianFenZhi !== 'local') {
        DangQianFenZhi = 'local';
        await window.electronAPI.update.setBranch('local');
        GengXinTongDaoAnNiu();
      }
      await ChuLiBenDiDaoRu(zipLuJing);
    }
    // xuanZe === 2 或 -1：取消，不做任何事
  }

  async function GengHuanLuJingDaiLuJing(luJing) {
    try {
      const structure = await window.electronAPI.folder.checkStructure(luJing);

      if (structure === 'empty') {
        await ChuLiKongMuLu(luJing);
      } else if (structure === 'not-ooointerface') {
        await DialogManager.TiShi('选择错误', '请选择空目录或已包含 OOOInterface 的目录');
      } else if (structure === 'incomplete') {
        const shouldOverwrite = await DialogManager.QueRen('文件不完整', '检测到 OOOInterface 文件不完整，是否重新下载覆盖？');
        if (shouldOverwrite) {
          await window.electronAPI.folder.setInstallDir(luJing);
          AnZhuangLuJing = luJing;
          GengXinAnZhuangLuJingXianShi();
          KaiShiQiangZhiFuGai(luJing);
        }
      } else if (structure === 'valid') {
        const confirm = await DialogManager.QueRen('更换目录', '确认要将安装目录更换到此位置吗？');
        if (confirm) {
          await window.electronAPI.folder.setInstallDir(luJing);
          AnZhuangLuJing = luJing;
          GengXinAnZhuangLuJingXianShi();
          await DialogManager.TiShi('成功', '安装目录已更换！');
          JianChaGengXin();
        }
      }
    } catch (error) {
      await DialogManager.TiShi('错误', '更换目录时发生错误: ' + error.message);
    }
  }

  function GengXinTongDaoAnNiu() {
    AnNiuYuanCheng.classList.toggle('JiHuo', DangQianFenZhi === 'remote');
    AnNiuBenDi.classList.toggle('JiHuo', DangQianFenZhi === 'local');

    // 本地模式隐藏远程版本行
    if (YuanChengBanBenHang) {
      YuanChengBanBenHang.classList.toggle('YinCang', DangQianFenZhi === 'local');
    }

    // 更新主按钮文本
    GengXinAnNiuZhuWenBen();
  }

  function GengXinAnNiuZhuWenBen() {
    if (DangQianFenZhi === 'local') {
      AnNiuJianChaGengXin.textContent = '导入';
      AnNiuGengXin.classList.add('YinCang');
    } else {
      AnNiuJianChaGengXin.textContent = '检查更新';
    }
  }

  async function QieHuanFenZhi(fenZhi) {
    if (fenZhi === DangQianFenZhi) {
      await DialogManager.TiShi('提示', `当前已是${fenZhi === 'local' ? '本地导入' : '远程'}模式`);
      return;
    }

    if (fenZhi === 'local') {
      // 切换到本地模式
      DangQianFenZhi = 'local';
      await window.electronAPI.update.setBranch('local');
      GengXinTongDaoAnNiu();

      GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
      AnNiuGengXin.classList.add('YinCang');

      // 如果已有安装目录，显示当前版本
      if (AnZhuangLuJing) {
        try {
          const BenDiBanBen = await window.electronAPI.update.getLocalVersion(AnZhuangLuJing);
          DangQianBanBen.textContent = BenDiBanBen || '未找到本地版本';
        } catch (e) {
          DangQianBanBen.textContent = '检测失败';
        }
      }
      return;
    }

    // 切换到远程模式
    if (!AnZhuangLuJing) {
      await DialogManager.TiShi('提示', '请先设置安装目录');
      return;
    }

    const confirmed = await DialogManager.QueRen('切换通道', '确定要切换到远程模式吗？将下载远程分支的文件覆盖本地文件。');
    if (!confirmed) return;

    try {
      AnNiuJianChaGengXin.disabled = true;
      GengXinZhuangTaiWenBen.textContent = '正在切换到远程模式...';

      await window.electronAPI.update.setBranch(NEI_BU_FEN_ZHI);
      DangQianFenZhi = 'remote';
      GengXinTongDaoAnNiu();

      GengXinJinDuRongQi.classList.remove('YinCang');
      await window.electronAPI.update.switchBranch(AnZhuangLuJing, NEI_BU_FEN_ZHI);

      GengXinJinDuRongQi.classList.add('YinCang');
      await DialogManager.TiShi('切换成功', '已切换到远程模式');
      JianChaGengXin();
    } catch (error) {
      console.error('切换通道失败:', error);
      GengXinJinDuRongQi.classList.add('YinCang');
      GengXinZhuangTaiWenBen.textContent = '切换失败: ' + error.message;
      AnNiuJianChaGengXin.disabled = false;
    }
  }

  async function ChuLiXieZai() {
    const confirmed = await DialogManager.QueRen(
      '⚠️ 确认卸载',
      '确定要完全卸载 OOOInterface 吗？\n\n这将：\n- 删除所有 OOOInterface 文件\n- 清除所有缓存和临时文件\n- 删除所有配置和设置\n- 关闭应用程序\n\n此操作不可撤销！'
    );

    if (confirmed) {
      try {
        if (AnNiuXieZai) {
          AnNiuXieZai.disabled = true;
          AnNiuXieZai.title = '正在卸载...';
        }

        await window.electronAPI.app.uninstall();
      } catch (error) {
        console.error('卸载失败:', error);
        await DialogManager.TiShi('错误', '卸载失败: ' + error.message);

        if (AnNiuXieZai) {
          AnNiuXieZai.disabled = false;
          AnNiuXieZai.title = '一键卸载';
        }
      }
    }
  }

  /**
   * 处理本地 ZIP 导入
   */
  async function ChuLiBenDiDaoRu(zipLuJing) {
    if (!zipLuJing) return;

    // 检查是否有安装目录
    if (!AnZhuangLuJing) {
      const luJing = await window.electronAPI.dialog.selectFolder();
      if (!luJing) return;
      AnZhuangLuJing = luJing;
      await window.electronAPI.folder.setInstallDir(luJing);
      GengXinAnZhuangLuJingXianShi();
    }

    // 确认导入
    const confirmed = await DialogManager.QueRen(
      '确认导入',
      `确定要从以下 ZIP 文件导入吗？\n\n${zipLuJing}\n\n这将覆盖安装目录中的现有文件。`,
      { QueRenWenBen: '导入', QuXiaoWenBen: '取消' }
    );
    if (!confirmed) return;

    try {
      GengXinJinDuRongQi.classList.remove('YinCang');
      GengXinZhuangTaiWenBen.textContent = '正在导入...';
      AnNiuJianChaGengXin.disabled = true;
      AnNiuGengHuanLuJing.disabled = true;

      await window.electronAPI.update.importLocalZip(zipLuJing);

      GengXinJinDu.style.width = '100%';
      GengXinJinDuWenBen.textContent = '导入完成';
      GengXinZhuangTaiWenBen.textContent = '导入完成，正在刷新...';

      setTimeout(async () => {
        GengXinJinDuRongQi.classList.add('YinCang');
        AnNiuJianChaGengXin.disabled = false;
        AnNiuGengHuanLuJing.disabled = false;

        // 刷新本地版本显示
        try {
          const BenDiBanBen = await window.electronAPI.update.getLocalVersion(AnZhuangLuJing);
          DangQianBanBen.textContent = BenDiBanBen || '未找到本地版本';
        } catch (e) {
          DangQianBanBen.textContent = '检测失败';
        }
        GengXinZhuangTaiWenBen.textContent = '导入成功！';
      }, 1500);
    } catch (error) {
      GengXinJinDuRongQi.classList.add('YinCang');
      GengXinZhuangTaiWenBen.textContent = '导入失败: ' + error.message;
      AnNiuJianChaGengXin.disabled = false;
      AnNiuGengHuanLuJing.disabled = false;
    }
  }

  /**
   * 处理拖放导入
   */
  function ChuLiTuoZhuaDaoRu(zipLuJing) {
    // 如果当前不是本地模式，自动切换到本地模式
    if (DangQianFenZhi !== 'local') {
      DangQianFenZhi = 'local';
      window.electronAPI.update.setBranch('local');
      GengXinTongDaoAnNiu();
      GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
      AnNiuGengXin.classList.add('YinCang');
    }
    ChuLiBenDiDaoRu(zipLuJing);
  }

  /**
   * 处理点击主按钮（检查更新/导入）
   */
  async function ChuLiAnNiuZhu() {
    if (DangQianFenZhi !== 'local') {
      await JianChaGengXin();
      return;
    }

    try {
      const zipLuJing = await window.electronAPI.dialog.selectZipFile();
      if (zipLuJing) {
        await ChuLiBenDiDaoRu(zipLuJing);
      }
    } catch (error) {
      console.error('选择 ZIP 文件失败:', error);
    }
  }

  AnNiuJianChaGengXin.addEventListener('click', ChuLiAnNiuZhu);
  AnNiuGengXin.addEventListener('click', ZhiXingGengXin);
  AnNiuXieZai.addEventListener('click', ChuLiXieZai);

  // 设置按钮点击事件
  const AnNiuSheDing = document.getElementById('AnNiu-SheDing');
  const SheDingMianBan = document.getElementById('SheDing-MianBan');
  if (AnNiuSheDing && SheDingMianBan) {
    AnNiuSheDing.addEventListener('click', () => {
      SheDingMianBan.classList.toggle('YinCang');
    });
  }

  AnNiuYuanCheng.addEventListener('click', () => QieHuanFenZhi('remote'));
  AnNiuBenDi.addEventListener('click', () => QieHuanFenZhi('local'));
  AnNiuGengHuanLuJing.addEventListener('click', ChuLiGengHuanLuJing);

  async function Jiazaiqidongshezhi() {
    const startupConfig = await window.electronAPI.settings.getStartupConfig();
    if (KaiGuanKaiJiQiDong) {
      KaiGuanKaiJiQiDong.checked = startupConfig.launchOnBoot || false;
    }
    if (KaiGuanZuiXiaoHuaTuoPan) {
      KaiGuanZuiXiaoHuaTuoPan.checked = startupConfig.minimizeToTray || false;
    }
    if (KaiGuanZiDongGengXin) {
      KaiGuanZiDongGengXin.checked = startupConfig.autoUpdate || false;
    }

    // 恢复保存的分支状态
    const savedBranch = await window.electronAPI.update.getBranch();
    if (savedBranch === 'local') {
      DangQianFenZhi = 'local';
      GengXinTongDaoAnNiu();
      GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
      AnNiuGengXin.classList.add('YinCang');
    } else {
      // 非 local 统一视为远程模式
      DangQianFenZhi = 'remote';
      GengXinTongDaoAnNiu();
    }
  }

  async function Baocunqidongshezhi() {
    const startupConfig = {
      launchOnBoot: KaiGuanKaiJiQiDong ? KaiGuanKaiJiQiDong.checked : false,
      minimizeToTray: KaiGuanZuiXiaoHuaTuoPan ? KaiGuanZuiXiaoHuaTuoPan.checked : false,
      autoUpdate: KaiGuanZiDongGengXin ? KaiGuanZiDongGengXin.checked : false
    };
    await window.electronAPI.settings.setStartupConfig(startupConfig);
  }

  if (KaiGuanKaiJiQiDong) {
    KaiGuanKaiJiQiDong.addEventListener('change', Baocunqidongshezhi);
  }
  if (KaiGuanZuiXiaoHuaTuoPan) {
    KaiGuanZuiXiaoHuaTuoPan.addEventListener('change', Baocunqidongshezhi);
  }
  if (KaiGuanZiDongGengXin) {
    KaiGuanZiDongGengXin.addEventListener('change', Baocunqidongshezhi);
  }

  Jiazaiqidongshezhi();

  if (window.electronAPI && window.electronAPI.update) {
    window.electronAPI.update.onUpdateProgress((data) => {
      if (data && data.percent !== undefined) {
        GengXinJinDu.style.width = data.percent + '%';
        GengXinJinDuWenBen.textContent = data.message || `进度: ${Math.round(data.percent)}%`;
      }
    });
  }

  window.UpdatePage = {
    JianChaGengXin,
    KaiShiShouCiAnZhuang,
    KaiShiQiangZhiFuGai,
    ChuLiGengHuanLuJing,
    ChuLiTuoZhuaDaoRu,
    ChuLiKongMuLu
  };
})();
