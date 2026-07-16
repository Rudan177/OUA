/**
 * 更新页面逻辑
 */
(function () {
  const DangQianBanBen = document.getElementById('DangQian-BanBen');
  const YuanChengBanBen = document.getElementById('YuanCheng-BanBen');
  const YuanChengBanBenHang = document.getElementById('YuanCheng-BanBen-Hang');
  const YuanChengFenZhiHang = document.getElementById('YuanCheng-FenZhi-Hang');
  const GengXinZhuangTaiWenBen = document.getElementById('GengXin-ZhuangTai-WenBen');
  const GengXinJinDuRongQi = document.getElementById('GengXin-JinDu-RongQi');
  const GengXinJinDu = document.getElementById('GengXin-JinDu');
  const GengXinJinDuWenBen = document.getElementById('GengXin-JinDu-WenBen');
  const AnNiuJianChaGengXin = document.getElementById('AnNiu-JianCha-GengXin');
  const AnNiuGengXin = document.getElementById('AnNiu-GengXin');
  const AnNiuXieZai = document.getElementById('AnNiu-XieZai');
  const AnNiuYuanCheng = document.getElementById('AnNiu-YuanCheng');
  const AnNiuBenDi = document.getElementById('AnNiu-BenDi');
  const AnNiuChangQiZhiChiBan = document.getElementById('AnNiu-ChangQiZhiChiBan');
  const AnNiuZhengShiBan = document.getElementById('AnNiu-ZhengShiBan');
  const AnNiuChangXianBan = document.getElementById('AnNiu-ChangXianBan');
  const AnZhuangLuJingXianShi = document.getElementById('AnZhuang-LuJing-XianShi');
  const AnNiuGengHuanLuJing = document.getElementById('AnNiu-GengHuan-LuJing');
  const KaiGuanKaiJiQiDong = document.getElementById('KaiGuan-KaiJiQiDong');
  const KaiGuanZuiXiaoHuaTuoPan = document.getElementById('KaiGuan-ZuiXiaoHua-TuoPan');
  const KaiGuanZiDongGengXin = document.getElementById('KaiGuan-ZiDong-GengXin');

  let AnZhuangLuJing = null;
  let DangQianFenZhi = 'LTS';

  function GengXinAnZhuangLuJingXianShi() {
    if (AnZhuangLuJing) {
      AnZhuangLuJingXianShi.textContent = AnZhuangLuJing;
      AnZhuangLuJingXianShi.title = AnZhuangLuJing;
    } else {
      AnZhuangLuJingXianShi.textContent = '未设置';
      AnZhuangLuJingXianShi.title = '';
    }
    // 异步更新按钮文字
    GengXinAnNiuZhuangTaiDangQianLuJing();
  }

  function ShiFouLocal() {
    return DangQianFenZhi === 'local';
  }

  /**
   * 根据当前目录结构更新主按钮文字
   * 空目录/不完整 → "安装"，有效目录 → "检查更新"
   */
  async function GengXinAnNiuZhuangTaiDangQianLuJing() {
    if (ShiFouLocal() || !AnZhuangLuJing) return;
    try {
      const jieGou = await window.electronAPI.folder.checkStructure(AnZhuangLuJing);
      if (jieGou === 'empty' || jieGou === 'incomplete') {
        AnNiuJianChaGengXin.textContent = '安装';
      } else {
        AnNiuJianChaGengXin.textContent = '检查更新';
      }
    } catch {
      // 忽略错误，保持当前文字
    }
  }

  /**
   * 模拟进度条 - 三阶段模拟：网络检测→匀速→跟随真实进度
   * @param {Function} caoZuo - 返回 Promise 的实际操作
   * @param {object} [opts]
   * @param {number} [opts.jianCeShiJian=1500] - 网络检测阶段总时长(ms)
   * @param {number} [opts.suDu=5] - 匀速阶段每秒增加的百分比
   */
  async function MoNiJinDu(caoZuo, opts = {}) {
    const { jianCeShiJian = 1500, suDu = 5 } = opts;
    let quXiaoJianTing = null;
    let zhenShi = { percent: 0, message: '' };
    let wanCheng = false;
    let caoZuoCuo = null;

    // 监听真实进度
    quXiaoJianTing = window.electronAPI.update.onProgress((data) => {
      zhenShi = { percent: data.percent || 0, message: data.message || '' };
      if (data.percent >= 100) wanCheng = true;
    });

    const caoZuoPromise = caoZuo()
      .then(() => { wanCheng = true; })
      .catch((err) => { caoZuoCuo = err; });

    try {
      let xianShi = 0;

      // 阶段1: 0~10% 网络检测
      const buChang = jianCeShiJian / 10;
      for (let i = 1; i <= 10; i++) {
        await new Promise(r => setTimeout(r, buChang));
        if (caoZuoCuo) throw caoZuoCuo;
        xianShi = i;
        GengXinJinDu.style.width = xianShi + '%';
        GengXinJinDuWenBen.textContent = `网络检测 ${xianShi}%`;
      }

      // 阶段2: 10~80% 匀速（即使下载完成也保持此速度）
      while (xianShi < 80) {
        await new Promise(r => setTimeout(r, 1000));
        if (caoZuoCuo) throw caoZuoCuo;
        xianShi = Math.min(80, xianShi + suDu);
        GengXinJinDu.style.width = xianShi + '%';
        GengXinJinDuWenBen.textContent = `下载中 ${xianShi}%`;
      }

      // 阶段3: 80~100% 跟随真实进度
      while (xianShi < 100) {
        await new Promise(r => setTimeout(r, 300));
        if (caoZuoCuo) throw caoZuoCuo;
        if (wanCheng) { xianShi = 100; break; }

        // 真实进度 0~100 映射到 80~100 区间
        const muBiao = 80 + (zhenShi.percent / 100) * 20;
        if (muBiao > xianShi) {
          xianShi = Math.min(99, muBiao);
        }
        // 若 muBiao ≤ xianShi 则自然降速，不做额外跳动

        GengXinJinDu.style.width = xianShi + '%';
        GengXinJinDuWenBen.textContent = zhenShi.message || `进度: ${Math.round(xianShi)}%`;
      }

      await caoZuoPromise;
      GengXinJinDu.style.width = '100%';
      GengXinJinDuWenBen.textContent = '完成';
    } finally {
      if (quXiaoJianTing) quXiaoJianTing();
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

      // 恢复当前分支并刷新按钮
      DangQianFenZhi = await window.electronAPI.update.getBranch();
      GengXinTongDaoAnNiu();

      // 如果当前是本地模式，不查远程版本
      if (ShiFouLocal()) {
        GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
        AnNiuGengXin.classList.add('YinCang');
        return;
      }

      // 远程版本检查添加较长超时（Git 克隆可能需要较长时间）
      GengXinZhuangTaiWenBen.textContent = '正在连接 GitHub...';

      let YuanChengBanBenZhi = null;

      try {
        YuanChengBanBenZhi = await window.electronAPI.update.getRemoteVersion(DangQianFenZhi);
        YuanChengBanBen.textContent = YuanChengBanBenZhi || '未找到远程版本';
      } catch (remoteError) {
        console.error('获取远程版本失败:', remoteError);
        YuanChengBanBen.textContent = '获取失败';
        throw remoteError;
      }

      if (BenDiBanBen && YuanChengBanBenZhi) {
        const comparison = await window.electronAPI.update.compareVersions(BenDiBanBen, YuanChengBanBenZhi);

        if (comparison > 0) {
          GengXinZhuangTaiWenBen.textContent = '当前版本高于正式版，是否加入尝鲜版？';
          AnNiuGengXin.classList.remove('YinCang');
          AnNiuGengXin.textContent = '加入尝鲜版';
        } else if (comparison < 0) {
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

      await MoNiJinDu(() => window.electronAPI.update.firstInstall(muBiaoLuJing));

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

      await MoNiJinDu(() => window.electronAPI.update.forceOverwrite(muBiaoLuJing, DangQianFenZhi));

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
    if (!AnZhuangLuJing || ShiFouLocal()) return;

    try {
      const BenDiBanBen = await window.electronAPI.update.getLocalVersion(AnZhuangLuJing);
      const YuanChengBanBenZhi = await window.electronAPI.update.getRemoteVersion(DangQianFenZhi);

      if (!YuanChengBanBenZhi) {
        GengXinZhuangTaiWenBen.textContent = '无法获取远程版本，请检查网络';
        return;
      }

      const comparison = await window.electronAPI.update.compareVersions(BenDiBanBen, YuanChengBanBenZhi);

      if (comparison > 0) {
        if (DangQianFenZhi === 'test') {
          GengXinZhuangTaiWenBen.textContent = '当前已是最新尝鲜版本';
          AnNiuGengXin.classList.add('YinCang');
          return;
        }
        const switchToTest = await DialogManager.QueRen('加入尝鲜版', '是否切换到尝鲜版通道？');
        if (switchToTest) {
          await window.electronAPI.update.setBranch('test');
          DangQianFenZhi = 'test';
          GengXinTongDaoAnNiu();

          await window.electronAPI.update.switchBranch(AnZhuangLuJing, 'test');

          await DialogManager.TiShi('切换成功', '已成功切换到尝鲜版通道');
          JianChaGengXin();
          return;
        }
        return;
      }

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

      await MoNiJinDu(() => window.electronAPI.update.updateApp(AnZhuangLuJing, DangQianFenZhi));

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
      await DialogManager.TiShi('选择安装目录', '请选择 OOOInterface 的安装目录。');
      const luJing = await window.electronAPI.dialog.selectFolder();

      if (!luJing) return;

      const hasPermission = await window.electronAPI.folder.hasWritePermission(luJing);

      if (!hasPermission) {
        const userPaths = await window.electronAPI.folder.getUserPaths();

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
      if (ShiFouLocal()) {
        DangQianFenZhi = 'LTS';
        await window.electronAPI.update.setBranch('LTS');
        GengXinTongDaoAnNiu();
      }
      KaiShiShouCiAnZhuang(luJing);
    } else if (xuanZe === 1) {
      // 从本地导入
      await DialogManager.TiShi('导入 ZIP 文件', '请选择需要导入的 ZIP 压缩包。');
      const zipLuJing = await window.electronAPI.dialog.selectZipFile();
      if (!zipLuJing) return;
      await window.electronAPI.folder.setInstallDir(luJing);
      AnZhuangLuJing = luJing;
      GengXinAnZhuangLuJingXianShi();
      if (!ShiFouLocal()) {
        DangQianFenZhi = 'local';
        await window.electronAPI.update.setBranch('local');
        GengXinTongDaoAnNiu();
      }
      await ChuLiBenDiDaoRu(zipLuJing);
    }
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
    const shiLocal = ShiFouLocal();

    // 顶层通道按钮
    AnNiuYuanCheng.classList.toggle('JiHuo', !shiLocal);
    AnNiuBenDi.classList.toggle('JiHuo', shiLocal);

    // 远程子分支按钮容器
    if (YuanChengFenZhiHang) {
      YuanChengFenZhiHang.classList.toggle('YinCang', shiLocal);
    }

    // 远程版本行
    if (YuanChengBanBenHang) {
      YuanChengBanBenHang.classList.toggle('YinCang', shiLocal);
    }

    // 子分支按钮高亮
    if (!shiLocal && AnNiuChangQiZhiChiBan && AnNiuZhengShiBan && AnNiuChangXianBan) {
      AnNiuChangQiZhiChiBan.classList.toggle('JiHuo', DangQianFenZhi === 'LTS');
      AnNiuZhengShiBan.classList.toggle('JiHuo', DangQianFenZhi === 'main');
      AnNiuChangXianBan.classList.toggle('JiHuo', DangQianFenZhi === 'test');
    }

    GengXinAnNiuZhuWenBen();
  }

  function GengXinAnNiuZhuWenBen() {
    if (ShiFouLocal()) {
      AnNiuJianChaGengXin.textContent = '导入';
      AnNiuGengXin.classList.add('YinCang');
    } else {
      AnNiuJianChaGengXin.textContent = '检查更新';
    }
  }

  async function QieHuanFenZhi(fenZhi) {
    // 切换远程子分支
    if (fenZhi === 'LTS' || fenZhi === 'main' || fenZhi === 'test') {
      if (ShiFouLocal()) {
        await DialogManager.TiShi('提示', '当前是本地模式，请先切换到远程模式');
        return;
      }

      if (fenZhi === DangQianFenZhi) {
        await DialogManager.TiShi('提示', `当前已经是${fenZhi === 'test' ? '尝鲜版' : fenZhi === 'main' ? '正式版' : '长期支持版'}通道`);
        return;
      }

      if (!AnZhuangLuJing) {
        await DialogManager.TiShi('提示', '请先设置安装目录');
        return;
      }

      const fenZhiMingCheng = fenZhi === 'test' ? '尝鲜版' : fenZhi === 'main' ? '正式版' : '长期支持版';
      const confirmed = await DialogManager.QueRen('切换通道', `确定要切换到${fenZhiMingCheng}通道吗？将下载对应分支的文件。`);
      if (!confirmed) return;

      try {
        AnNiuJianChaGengXin.disabled = true;
        GengXinZhuangTaiWenBen.textContent = `正在切换到${fenZhiMingCheng}...`;

        await window.electronAPI.update.setBranch(fenZhi);
        DangQianFenZhi = fenZhi;
        GengXinTongDaoAnNiu();

        GengXinJinDuRongQi.classList.remove('YinCang');
        await window.electronAPI.update.switchBranch(AnZhuangLuJing, fenZhi);

        GengXinJinDuRongQi.classList.add('YinCang');
        await DialogManager.TiShi('切换成功', `已切换到${fenZhiMingCheng}通道`);
        JianChaGengXin();
      } catch (error) {
        console.error('切换通道失败:', error);
        GengXinJinDuRongQi.classList.add('YinCang');
        GengXinZhuangTaiWenBen.textContent = '切换失败: ' + error.message;
        AnNiuJianChaGengXin.disabled = false;
      }
      return;
    }

    // 切换顶层通道（远程 / 本地）
    if (fenZhi === 'remote') {
      if (!ShiFouLocal()) {
        await DialogManager.TiShi('提示', '当前已是远程模式');
        return;
      }

      if (!AnZhuangLuJing) {
        // 无安装目录时直接切换模式，不切分支
        DangQianFenZhi = 'LTS';
        await window.electronAPI.update.setBranch('LTS');
        GengXinTongDaoAnNiu();
        GengXinZhuangTaiWenBen.textContent = '远程模式';
        return;
      }

      const confirmed = await DialogManager.QueRen('切换通道', '确定要切换到远程模式吗？将下载远程分支的文件覆盖本地文件。');
      if (!confirmed) return;

      try {
        AnNiuJianChaGengXin.disabled = true;
        GengXinZhuangTaiWenBen.textContent = '正在切换到远程模式...';

        const shiJiFenZhi = 'LTS';
        await window.electronAPI.update.setBranch(shiJiFenZhi);
        DangQianFenZhi = shiJiFenZhi;
        GengXinTongDaoAnNiu();

        GengXinJinDuRongQi.classList.remove('YinCang');
        await window.electronAPI.update.switchBranch(AnZhuangLuJing, shiJiFenZhi);

        GengXinJinDuRongQi.classList.add('YinCang');
        await DialogManager.TiShi('切换成功', '已切换到远程模式');
        JianChaGengXin();
      } catch (error) {
        console.error('切换通道失败:', error);
        GengXinJinDuRongQi.classList.add('YinCang');
        GengXinZhuangTaiWenBen.textContent = '切换失败: ' + error.message;
        AnNiuJianChaGengXin.disabled = false;
      }
      return;
    }

    // 切换到本地模式
    if (fenZhi === 'local') {
      if (ShiFouLocal()) {
        await DialogManager.TiShi('提示', '当前已是本地导入模式');
        return;
      }

      DangQianFenZhi = 'local';
      await window.electronAPI.update.setBranch('local');
      GengXinTongDaoAnNiu();

      GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
      AnNiuGengXin.classList.add('YinCang');

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

    if (!AnZhuangLuJing) {
      await DialogManager.TiShi('选择安装目录', '请选择 OOOInterface 的安装目录。');
      const luJing = await window.electronAPI.dialog.selectFolder();
      if (!luJing) return;
      AnZhuangLuJing = luJing;
      await window.electronAPI.folder.setInstallDir(luJing);
      GengXinAnZhuangLuJingXianShi();
    }

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
    if (!ShiFouLocal()) {
      DangQianFenZhi = 'local';
      window.electronAPI.update.setBranch('local');
      GengXinTongDaoAnNiu();
      GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
      AnNiuGengXin.classList.add('YinCang');
    }
    ChuLiBenDiDaoRu(zipLuJing);
  }

  /**
   * 处理点击主按钮（检查更新/安装/导入）
   */
  async function ChuLiAnNiuZhu() {
    if (!ShiFouLocal()) {
      // 远程模式：检查目录状态
      if (AnZhuangLuJing) {
        try {
          const jieGou = await window.electronAPI.folder.checkStructure(AnZhuangLuJing);
          if (jieGou === 'empty') {
            // 空目录 → 安装（首次安装默认用 LTS，安装完成后可切换分支）
            KaiShiShouCiAnZhuang(AnZhuangLuJing);
            return;
          }
          if (jieGou === 'incomplete') {
            // 不完整目录 → 覆盖安装（使用当前分支）
            KaiShiQiangZhiFuGai(AnZhuangLuJing);
            return;
          }
        } catch {
          // 检查失败，继续执行原有的更新检查
        }
      }
      await JianChaGengXin();
      return;
    }

    try {
      await DialogManager.TiShi('导入 ZIP 文件', '请选择需要导入的 ZIP 压缩包。');
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

  // 顶层通道切换
  AnNiuYuanCheng.addEventListener('click', () => QieHuanFenZhi('remote'));
  AnNiuBenDi.addEventListener('click', () => QieHuanFenZhi('local'));
  // 远程子分支切换
  AnNiuChangQiZhiChiBan.addEventListener('click', () => QieHuanFenZhi('LTS'));
  AnNiuZhengShiBan.addEventListener('click', () => QieHuanFenZhi('main'));
  AnNiuChangXianBan.addEventListener('click', () => QieHuanFenZhi('test'));
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
    } else {
      // LTS / main / test 等视为远程模式，保留具体分支值
      DangQianFenZhi = savedBranch || 'LTS';
    }
    GengXinTongDaoAnNiu();

    if (ShiFouLocal()) {
      GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
      AnNiuGengXin.classList.add('YinCang');
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

  /**
   * 首次安装：目录已选定，根据模式执行后续操作
   * @param {string} luJing - 已选定的安装目录
   * @param {'remote'|'local'} moShi - 安装模式
   */
  async function ChuLiShouCiXuanZe(luJing, moShi) {
    AnZhuangLuJing = luJing;
    GengXinAnZhuangLuJingXianShi();

    if (moShi === 'local') {
      DangQianFenZhi = 'local';
      await window.electronAPI.update.setBranch('local');
      GengXinTongDaoAnNiu();
      GengXinZhuangTaiWenBen.textContent = '本地模式：可导入 ZIP 压缩包';
      AnNiuGengXin.classList.add('YinCang');

      await DialogManager.TiShi('导入 ZIP 文件', '请选择需要导入的 ZIP 压缩包。');
      const zipLuJing = await window.electronAPI.dialog.selectZipFile();
      if (zipLuJing) {
        await ChuLiBenDiDaoRu(zipLuJing);
      }
    } else {
      DangQianFenZhi = 'LTS';
      await window.electronAPI.update.setBranch('LTS');
      GengXinTongDaoAnNiu();
      KaiShiShouCiAnZhuang(luJing);
    }
  }

  window.UpdatePage = {
    JianChaGengXin,
    KaiShiShouCiAnZhuang,
    KaiShiQiangZhiFuGai,
    ChuLiGengHuanLuJing,
    ChuLiTuoZhuaDaoRu,
    ChuLiKongMuLu,
    ChuLiBenDiDaoRu,
    ChuLiShouCiXuanZe
  };
})();
