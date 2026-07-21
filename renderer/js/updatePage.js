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
  const KaiGuanReJian = document.getElementById('KaiGuan-ReJian');
  const ReJianPeiZhiRongQi = document.getElementById('ReJian-PeiZhi-RongQi');
  const ReJianXianShi = document.getElementById('ReJian-XianShi');
  const AnNiuReJianZiDingYi = document.getElementById('AnNiu-ReJian-ZiDingYi');
  const AnNiuReJianChongZhi = document.getElementById('AnNiu-ReJian-ChongZhi');

  let AnZhuangLuJing = null;
  let DangQianFenZhi = 'LTS';
  let ReJianZhuangTai = {
    enabled: false,
    openWindow: 'Ctrl+Shift+O'
  };
  let ReJianLuRuZhong = false;

  /**
   * 初始化安装目录：把已保存的安装目录同步到闭包变量与 UI
   * 解决 Ctrl+R 刷新后 AnZhuangLuJing 被重置为 null、导入流程误判为"未设置"的问题
   * @param {string|null} luJing - 主进程读取到的已保存安装目录
   */
  function ChuShiHuaAnZhuangLuJing(luJing) {
    AnZhuangLuJing = luJing || null;
    GengXinAnZhuangLuJingXianShi();
  }

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
    quXiaoJianTing = window.electronAPI.update.onUpdateProgress((data) => {
      zhenShi = { percent: data.percent || 0, message: data.message || '' };
      if (data.percent >= 100) wanCheng = true;
    });

    const caoZuoPromise = caoZuo()
      .then(() => { wanCheng = true; })
      .catch((err) => { caoZuoCuo = err; });

    try {
      let xianShi = 0;

      // 清除默认提示文字
      GengXinJinDuWenBen.textContent = '';

      // 阶段1: 0~10% 网络检测
      const buChang = jianCeShiJian / 10;
      for (let i = 1; i <= 10; i++) {
        await new Promise(r => setTimeout(r, buChang));
        if (caoZuoCuo) throw caoZuoCuo;
        xianShi = i;
        GengXinJinDu.style.width = xianShi + '%';
      }

      // 阶段2: 10~80% 匀速（即使下载完成也保持此速度）
      while (xianShi < 80) {
        await new Promise(r => setTimeout(r, 1000));
        if (caoZuoCuo) throw caoZuoCuo;
        xianShi = Math.min(80, xianShi + suDu);
        GengXinJinDu.style.width = xianShi + '%';
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
      }

      await caoZuoPromise;
      GengXinJinDu.style.width = '100%';
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
        // 添加 5 秒超时，防止网络不可用时长时间阻塞（最多等待 5s 而不是 30s）
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('获取远程版本超时')), 5000)
        );
        YuanChengBanBenZhi = await Promise.race([
          window.electronAPI.update.getRemoteVersion(DangQianFenZhi),
          timeoutPromise
        ]);
        YuanChengBanBen.textContent = YuanChengBanBenZhi || '未找到远程版本';
      } catch (remoteError) {
        console.error('获取远程版本失败:', remoteError);
        YuanChengBanBen.textContent = '获取失败';
        // 不重新抛出错误，让 UI 使用已有的本地版本信息展示友好提示
        // 后续通过 comparison 判断 null 值展示"无法获取远程版本"
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
          { path: window.electronAPI.path.join(userPaths.desktop, 'OOOInterface'), name: '桌面' },
          { path: window.electronAPI.path.join(userPaths.documents, 'OOOInterface'), name: '文档' },
          { path: window.electronAPI.path.join(userPaths.home, 'OOOInterface'), name: '用户目录' }
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
        await MoNiJinDu(() => window.electronAPI.update.switchBranch(AnZhuangLuJing, fenZhi));

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

      // === 第一步：立即切换前端按钮到远程模式，不等待检测 ===
      // 先让用户看到"远程"按钮高亮、子分支行出现，消除卡顿感
      DangQianFenZhi = 'LTS';
      GengXinTongDaoAnNiu();
      GengXinZhuangTaiWenBen.textContent = '正在检测远程版本...';

      if (!AnZhuangLuJing) {
        // 无安装目录时已在上面切好 UI，直接持久化并返回
        await window.electronAPI.update.setBranch('LTS');
        return;
      }

      // === 第二步：创建检测弹窗 ===
      let jianCeQuXiao = false;   // 用户主动取消标记
      let jianCeWanCheng = false; // 检测已全部完成（防止关闭动画期间误触遮罩回退）
      let BenDiBanBen = null;
      let YuanChengLTS = null;
      let YuanChengMain = null;

      const jianCeZheZhao = document.createElement('div');
      jianCeZheZhao.className = 'JianCe-ZheZhao';
      jianCeZheZhao.innerHTML = `
        <div class="JianCe-DuiHua">
          <div class="DuiHua-TouBu">
            <div class="DuiHua-BiaoTi">检测远程版本</div>
          </div>
          <div class="DuiHua-ZhuTi">
            <div class="DuiHua-XiaoXi" id="jianCe-zhuangTai">正在检测远程版本号...</div>
          </div>
          <div class="DuiHua-DiBu" style="justify-content:center;border-top:none">
            <button class="AnNiu AnNiu-Fu" id="jianCe-quxiao" style="min-width:100px">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(jianCeZheZhao);
      requestAnimationFrame(() => jianCeZheZhao.classList.add('JiHuo'));

      const quXiaoJianCe = () => {
        if (jianCeQuXiao || jianCeWanCheng) return; // 防止重复触发或检测完成后误触
        jianCeQuXiao = true;
        document.removeEventListener('keydown', jianCeEscHandler);
        jianCeZheZhao.classList.remove('JiHuo');
        setTimeout(() => {
          if (jianCeZheZhao.parentNode) document.body.removeChild(jianCeZheZhao);
        }, 350);
        // 回退到本地模式
        DangQianFenZhi = 'local';
        window.electronAPI.update.setBranch('local');
        GengXinTongDaoAnNiu();
        GengXinZhuangTaiWenBen.textContent = '已切换回本地模式';
        AnNiuGengXin.classList.add('YinCang');
      };

      jianCeZheZhao.addEventListener('click', (e) => {
        if (e.target === jianCeZheZhao) quXiaoJianCe();
      });
      document.getElementById('jianCe-quxiao').addEventListener('click', quXiaoJianCe);
      const jianCeEscHandler = (e) => {
        if (e.key === 'Escape' && !jianCeQuXiao) quXiaoJianCe();
      };
      document.addEventListener('keydown', jianCeEscHandler);

      // === 第三步：后台检测版本（依次获取，每一步可取消） ===
      const taiEl = document.getElementById('jianCe-zhuangTai');

      try {
        taiEl.textContent = '正在获取本地版本号...';
        BenDiBanBen = await window.electronAPI.update.getLocalVersion(AnZhuangLuJing);

        if (jianCeQuXiao) return;

        taiEl.textContent = '正在获取长期支持版版本号...';
        YuanChengLTS = await window.electronAPI.update.getRemoteVersion('LTS');

        if (jianCeQuXiao) return;

        taiEl.textContent = '正在获取正式版版本号...';
        YuanChengMain = await window.electronAPI.update.getRemoteVersion('main');

        if (jianCeQuXiao) return;
      } catch (e) {
        console.error('版本检测异常:', e);
      }

      if (jianCeQuXiao) return;

      // === 第四步：检测完成，关闭弹窗 ===
      jianCeWanCheng = true;
      document.removeEventListener('keydown', jianCeEscHandler);
      jianCeZheZhao.classList.remove('JiHuo');
      setTimeout(() => {
        if (jianCeZheZhao.parentNode) document.body.removeChild(jianCeZheZhao);
      }, 350);

      // 智能选择最接近本地版本的远程分支，避免本地高版本被远程低版本覆盖：
      //   本地版本 < LTS          → 切到 LTS
      //   LTS <= 本地版本 < main  → 切到 main
      //   本地版本 >= main        → 切到 test（尝鲜版）
      let shiJiFenZhi = null;

      if (!BenDiBanBen) {
        await DialogManager.TiShi('版本检测失败', '无法读取本地版本号，请手动选择要切换的远程分支。');
      } else if (!YuanChengLTS || !YuanChengMain) {
        const queShi = [];
        if (!YuanChengLTS) queShi.push('长期支持版');
        if (!YuanChengMain) queShi.push('正式版');
        await DialogManager.TiShi(
          '远程版本获取失败',
          `无法获取 ${queShi.join('、')} 的远程版本号（可能是网络或代理问题）。\n\n请手动选择要切换的分支。`
        );
      } else {
        const cmpLTS = await window.electronAPI.update.compareVersions(BenDiBanBen, YuanChengLTS);
        const cmpMain = await window.electronAPI.update.compareVersions(BenDiBanBen, YuanChengMain);

        if (cmpMain >= 0) {
          shiJiFenZhi = 'test';
        } else if (cmpLTS >= 0) {
          shiJiFenZhi = 'main';
        } else {
          shiJiFenZhi = 'LTS';
        }
      }

      // 检测失败或异常时，让用户手动选择分支（三按钮）
      if (!shiJiFenZhi) {
        const xuanZe = await DialogManager.XuanZhe(
          '手动选择分支',
          '请选择要切换到的远程分支：',
          ['长期支持版', '正式版', '尝鲜版']
        );
        if (xuanZe === 0) {
          shiJiFenZhi = 'LTS';
        } else if (xuanZe === 1) {
          shiJiFenZhi = 'main';
        } else if (xuanZe === 2) {
          shiJiFenZhi = 'test';
        } else {
          // 用户取消手动选择，回退到本地
          DangQianFenZhi = 'local';
          await window.electronAPI.update.setBranch('local');
          GengXinTongDaoAnNiu();
          GengXinZhuangTaiWenBen.textContent = '已切换回本地模式';
          AnNiuGengXin.classList.add('YinCang');
          return;
        }
      }

      // 更新 UI 为实际选中的分支
      DangQianFenZhi = shiJiFenZhi;
      GengXinTongDaoAnNiu();
      GengXinZhuangTaiWenBen.textContent = '远程模式';

      const fenZhiMingCheng = shiJiFenZhi === 'test' ? '尝鲜版' : shiJiFenZhi === 'main' ? '正式版' : '长期支持版';

      // 单次确认：仅告知将切换到的分支，不展示版本号细节
      const confirmed = await DialogManager.QueRen(
        '切换通道',
        `将切换到 ${fenZhiMingCheng} 并下载远程分支文件覆盖本地。\n\n是否继续？`
      );
      if (!confirmed) return;

      try {
        AnNiuJianChaGengXin.disabled = true;
        GengXinZhuangTaiWenBen.textContent = `正在切换到${fenZhiMingCheng}...`;

        await window.electronAPI.update.setBranch(shiJiFenZhi);
        DangQianFenZhi = shiJiFenZhi;
        GengXinTongDaoAnNiu();

        GengXinJinDuRongQi.classList.remove('YinCang');
        await MoNiJinDu(() => window.electronAPI.update.switchBranch(AnZhuangLuJing, shiJiFenZhi));

        GengXinJinDuRongQi.classList.add('YinCang');
        await DialogManager.TiShi('切换成功', `已切换到${fenZhiMingCheng}模式`);
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

  // ---- 三步验证卸载：红色警报 → 滑块验证 → 最终确认 ----
  async function ChuLiXieZai() {
    const renJiZheZhao = document.createElement('div');
    renJiZheZhao.className = 'RenJi-YanZheng-ZheZhao';
    document.body.appendChild(renJiZheZhao);

    function onEsc(e) {
      if (e.key === 'Escape' && renJiZheZhao.classList.contains('JiHuo')) {
        close();
      }
    }
    document.addEventListener('keydown', onEsc);

    const close = () => {
      document.removeEventListener('keydown', onEsc);
      renJiZheZhao.classList.remove('JiHuo');
      setTimeout(() => {
        if (renJiZheZhao.parentNode) document.body.removeChild(renJiZheZhao);
      }, 350);
    };

    // ==== 第一步：红色警报确认 ====
    function step1() {
      renJiZheZhao.innerHTML = `
        <div class="QueRen-DuiHua" id="xieZai-queRen">
          <div class="QueRen-DuiHua-TuBiao">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
          </div>
          <div class="QueRen-DuiHua-BiaoTi">确认卸载</div>
          <div class="QueRen-DuiHua-XiaoXi">
            确定要完全卸载 OOOInterface 吗？<br><br>
            这将：<br>
            • 删除所有 OOOInterface 文件<br>
            • 清除所有缓存和临时文件<br>
            • 删除所有配置和设置<br>
            • 关闭应用程序<br><br>
            此操作不可撤销！
          </div>
          <div class="QueRen-DuiHua-AnNiu">
            <button class="btn-quxiao" id="xieZai-quxiao1">取消</button>
            <button class="btn-queren" id="xieZai-queren1">确认</button>
          </div>
        </div>
      `;

      requestAnimationFrame(() => renJiZheZhao.classList.add('JiHuo'));

      renJiZheZhao.addEventListener('click', (e) => {
        if (e.target === renJiZheZhao) close();
      });

      document.getElementById('xieZai-quxiao1').addEventListener('click', close);

      document.getElementById('xieZai-queren1').addEventListener('click', () => {
        const d1 = document.getElementById('xieZai-queRen');
        if (d1) {
          d1.style.transform = 'scale(0.92) translateY(20px)';
          d1.style.opacity = '0';
        }
        setTimeout(() => step2(), 250);
      });
    }

    // ==== 第二步：滑块验证 ====
    function step2() {
      const pieceSize = 44;
      const imgH = 170;
      const targetY = Math.floor((imgH - pieceSize) / 2);

      renJiZheZhao.innerHTML = `
        <div class="HuaKuai-DuiHua" id="huaKuai-duiHua">
          <div class="HuaKuai-TuPian" id="huaKuai-tuPian">
            <div class="HuaKuai-QueKou" id="huaKuai-queKou" style="top:${targetY}px;"></div>
            <div class="HuaKuai-PinTu" id="huaKuai-pinTu" style="top:${targetY}px;"></div>
          </div>
          <div class="HuaKuai-GuiDao" id="huaKuai-guiDao">
            <div class="HuaKuai-TianChong" id="huaKuai-tianChong"></div>
            <div class="HuaKuai-HuaKuai" id="huaKuai-huaKuai">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3L11 8L6 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <div class="HuaKuai-TiShi" id="huaKuai-tiShi">拖动滑块完成验证</div>
        </div>
      `;

      requestAnimationFrame(() => {
        const d = document.getElementById('huaKuai-duiHua');
        const imgContainer = document.getElementById('huaKuai-tuPian');
        const imgW = imgContainer.offsetWidth;
        const maxPiece = imgW - pieceSize;
        const minTarget = 20;
        const maxTarget = maxPiece - 20;
        const targetX = minTarget + Math.floor(Math.random() * Math.max(1, maxTarget - minTarget));

        document.getElementById('huaKuai-queKou').style.left = targetX + 'px';
        const pinTu = document.getElementById('huaKuai-pinTu');
        pinTu.style.left = '0';
        pinTu.style.background = "url('assets/images/back.png') -" + targetX + "px -" + targetY + "px / " + imgW + "px " + imgH + "px no-repeat";

        if (d) {
          d.style.transform = 'scale(1) translateY(0)';
          d.style.opacity = '1';
        }

        initHuaKuaiSlider(targetX, imgW);
      });

      renJiZheZhao.addEventListener('click', (e) => {
        if (e.target === renJiZheZhao) close();
      });
    }

    // ---- 滑块拖拽逻辑 ----
    let huaKuaiVerified = false;

    function initHuaKuaiSlider(targetX, imgW) {
      const guiDao = document.getElementById('huaKuai-guiDao');
      const huaKuai = document.getElementById('huaKuai-huaKuai');
      const tianChong = document.getElementById('huaKuai-tianChong');
      const pinTu = document.getElementById('huaKuai-pinTu');
      const tiShi = document.getElementById('huaKuai-tiShi');
      const tolerance = 4;
      let dragging = false;
      let startX = 0;
      let thumbLeft = 0;
      let dragStartTime = 0;

      const halfThumb = 22;
      const maxOffset = guiDao.offsetWidth - 44;
      const maxPiece = imgW - 44;

      huaKuai.style.left = '0';
      tianChong.style.width = halfThumb + 'px';
      pinTu.style.left = '0';

      function updatePos(clientX) {
        let dx = clientX - startX + thumbLeft;
        dx = Math.max(0, Math.min(maxOffset, dx));
        huaKuai.style.left = dx + 'px';
        tianChong.style.width = (dx + halfThumb) + 'px';
        const piecePos = (dx / maxOffset) * maxPiece;
        pinTu.style.left = Math.max(0, Math.min(maxPiece, piecePos)) + 'px';
        return dx;
      }

      function onStart(e) {
        if (huaKuaiVerified) return;
        e.preventDefault();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        dragging = true;
        startX = clientX;
        thumbLeft = parseInt(huaKuai.style.left) || 0;
        huaKuai.classList.remove('yanZhengShiBai');
        tiShi.textContent = '拖动滑块完成验证';
        tiShi.className = 'HuaKuai-TiShi';
        dragStartTime = Date.now();
      }

      function onMove(e) {
        if (!dragging || huaKuaiVerified) return;
        e.preventDefault();
        updatePos(e.type === 'touchmove' ? e.touches[0].clientX : e.clientX);
      }

      function onEnd() {
        if (!dragging || huaKuaiVerified) return;
        dragging = false;
        const pieceLeft = parseFloat(pinTu.style.left) || 0;

        // 检查位置偏差
        if (Math.abs(pieceLeft - targetX) > tolerance) {
          huaKuai.classList.add('yanZhengShiBai');
          tiShi.textContent = '验证失败，请重试';
          tiShi.className = 'HuaKuai-TiShi shiBai';
          setTimeout(() => {
            huaKuai.classList.remove('yanZhengShiBai');
            huaKuai.style.left = '0';
            tianChong.style.width = halfThumb + 'px';
            pinTu.style.left = '0';
          }, 400);
          return;
        }

        // 检查时间限制（1500ms）
        const elapsed = Date.now() - dragStartTime;
        if (elapsed >= 1500) {
          huaKuai.classList.add('yanZhengShiBai');
          tiShi.textContent = '验证失败，请重试';
          tiShi.className = 'HuaKuai-TiShi shiBai';
          setTimeout(() => {
            huaKuai.classList.remove('yanZhengShiBai');
            huaKuai.style.left = '0';
            tianChong.style.width = halfThumb + 'px';
            pinTu.style.left = '0';
          }, 400);
          return;
        }

        // 验证成功
        huaKuaiVerified = true;
        huaKuai.classList.add('yanZhengChengGong');
        huaKuai.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        if (elapsed < 1000) {
          tiShi.textContent = '我操，这么快，简直是神';
          tiShi.className = 'HuaKuai-TiShi chuanQi';
        } else {
          tiShi.textContent = '您已超过99.99%的用户';
          tiShi.className = 'HuaKuai-TiShi zuiJia';
        }

        setTimeout(() => {
          tiShi.textContent = '';
          tiShi.className = 'HuaKuai-TiShi';
          step3();
        }, 1000);
      }

      huaKuai.addEventListener('mousedown', onStart);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      huaKuai.addEventListener('touchstart', onStart, { passive: false });
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }

    // ==== 第三步：最终确认 ====
    function step3() {
      renJiZheZhao.innerHTML = `
        <div class="ZuiHou-QueRen-DuiHua" id="zuiHou-queRen">
          <div class="QueRen-DuiHua-TuBiao">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
          </div>
          <div class="QueRen-DuiHua-BiaoTi">请确认已知晓</div>
          <div class="QueRen-DuiHua-XiaoXi">此操作不可逆</div>
          <div class="ZuiHou-QueRen-FuXuanKuang">
            <input type="checkbox" id="xieZai-checkbox">
            <label for="xieZai-checkbox">我已知晓此操作不可逆</label>
          </div>
          <div class="QueRen-DuiHua-AnNiu">
            <button class="btn-quxiao" id="xieZai-quxiao3">取消</button>
            <button class="btn-queren ZuiHou-QueRen-AnNiu" id="xieZai-queren3" disabled>确认卸载</button>
          </div>
        </div>
      `;

      requestAnimationFrame(() => {
        const d = document.getElementById('zuiHou-queRen');
        if (d) {
          d.style.transform = 'scale(1) translateY(0)';
          d.style.opacity = '1';
        }
      });

      renJiZheZhao.addEventListener('click', (e) => {
        if (e.target === renJiZheZhao) close();
      });

      document.getElementById('xieZai-quxiao3').addEventListener('click', close);

      const checkbox = document.getElementById('xieZai-checkbox');
      const okBtn = document.getElementById('xieZai-queren3');

      checkbox.addEventListener('change', () => {
        okBtn.disabled = !checkbox.checked;
      });

      okBtn.addEventListener('click', async () => {
        if (checkbox.checked) {
          close();
          // 延迟执行卸载，让弹窗关闭动画完成
          setTimeout(async () => {
            await zhiXingXieZai();
          }, 400);
        }
      });
    }

    // 实际卸载逻辑
    async function zhiXingXieZai() {
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

    // 启动第一步
    step1();
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
      SheDingMianBan.classList.toggle('JiHuo');
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

    // 加载热键配置
    const hotkeyConfig = await window.electronAPI.settings.getHotkeyConfig();
    ReJianZhuangTai = {
      enabled: hotkeyConfig.enabled || false,
      openWindow: hotkeyConfig.openWindow || 'Ctrl+Shift+O'
    };
    if (KaiGuanReJian) {
      KaiGuanReJian.checked = ReJianZhuangTai.enabled;
    }
    GengXinReJianXianShi();
    GengXinReJianPeiZhiKeJian();
    // 根据最小化到托盘状态决定整个热键卡片是否显示
    await GengXinReJianKaPianKeJian();

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
    // 最小化到托盘状态变化时，联动显示/隐藏整个热键卡片
    KaiGuanZuiXiaoHuaTuoPan.addEventListener('change', () => {
      GengXinReJianKaPianKeJian();
    });
  }
  if (KaiGuanZiDongGengXin) {
    KaiGuanZiDongGengXin.addEventListener('change', Baocunqidongshezhi);
  }

  // =============================================
  // 热键功能：开关、ESC 关闭窗口、自定义打开窗口热键
  // =============================================

  /**
   * 更新"打开窗口"热键的显示文本
   */
  function GengXinReJianXianShi() {
    if (ReJianXianShi) {
      ReJianXianShi.textContent = ReJianZhuangTai.openWindow || 'Ctrl+Shift+O';
    }
  }

  /**
   * 根据开关状态展开/收起热键子配置区（CSS max-height 过渡动画）
   */
  function GengXinReJianPeiZhiKeJian() {
    if (!ReJianPeiZhiRongQi) return;
    if (ReJianZhuangTai.enabled) {
      ReJianPeiZhiRongQi.classList.add('ZhanKai');
    } else {
      ReJianPeiZhiRongQi.classList.remove('ZhanKai');
      // 关闭时若正在录入，取消录入状态
      if (ReJianLuRuZhong) {
        QuXiaoLuRu();
      }
    }
  }

  /**
   * 根据最小化到托盘的状态显示/隐藏整个热键卡片
   * 不开启最小化到托盘时整个热键开关都不显示，并自动关闭热键避免脏状态
   */
  async function GengXinReJianKaPianKeJian() {
    const reJianLieBiao = document.getElementById('ReJian-LieBiao');
    if (!reJianLieBiao) return;

    const tuoPanKaiQi = KaiGuanZuiXiaoHuaTuoPan && KaiGuanZuiXiaoHuaTuoPan.checked;

    if (tuoPanKaiQi) {
      reJianLieBiao.classList.remove('YinCang');
    } else {
      reJianLieBiao.classList.add('YinCang');
      // 托盘关闭后自动关闭热键开关，避免 ESC 隐藏后无法唤起
      if (KaiGuanReJian && KaiGuanReJian.checked) {
        KaiGuanReJian.checked = false;
        ReJianZhuangTai.enabled = false;
        GengXinReJianPeiZhiKeJian();
        await BaoCunReJianSheZhi();
      }
    }
  }

  /**
   * 保存热键配置到主进程（主进程会重新注册全局快捷键）
   */
  async function BaoCunReJianSheZhi() {
    await window.electronAPI.settings.setHotkeyConfig({
      enabled: ReJianZhuangTai.enabled,
      openWindow: ReJianZhuangTai.openWindow
    });
  }

  /**
   * 热键开关切换
   */
  if (KaiGuanReJian) {
    KaiGuanReJian.addEventListener('change', async () => {
      ReJianZhuangTai.enabled = KaiGuanReJian.checked;
      GengXinReJianPeiZhiKeJian();
      await BaoCunReJianSheZhi();
    });
  }

  /**
   * 把 KeyboardEvent 转换为 Electron Accelerator 字符串
   * 仅接受带至少一个修饰键（Ctrl/Alt/Shift/Meta）的组合，否则返回 null
   */
  function ZhuanHuanJianZuHe(e) {
    const xiuShiJian = [];
    if (e.ctrlKey) xiuShiJian.push('Ctrl');
    if (e.altKey) xiuShiJian.push('Alt');
    if (e.shiftKey) xiuShiJian.push('Shift');
    if (e.metaKey) xiuShiJian.push('Super');

    if (xiuShiJian.length === 0) return null;

    // 忽略单独按修饰键的情况
    const keyCode = e.key;
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(keyCode)) return null;

    // 数字/字母/功能键
    let anJian;
    if (/^[a-zA-Z]$/.test(keyCode)) {
      anJian = keyCode.toUpperCase();
    } else if (/^[0-9]$/.test(keyCode)) {
      anJian = keyCode;
    } else if (/^F([1-9]|1[0-2])$/.test(keyCode)) {
      anJian = keyCode;
    } else {
      // 其他特殊键不支持
      return null;
    }

    return [...xiuShiJian, anJian].join('+');
  }

  /**
   * 进入自定义热键录入模式
   * 按钮文字"改" → "取消"，kbd 高亮闪烁并显示"按下新组合…"
   */
  function KaiShiLuRu() {
    ReJianLuRuZhong = true;
    if (AnNiuReJianZiDingYi) {
      AnNiuReJianZiDingYi.classList.add('LuRuZhong');
      AnNiuReJianZiDingYi.textContent = '取消';
    }
    if (ReJianXianShi) {
      ReJianXianShi.classList.add('LuRuZhong');
      ReJianXianShi.textContent = '按下新组合…';
    }
  }

  /**
   * 退出录入模式
   * 按钮文字恢复"改"，kbd 恢复显示当前热键
   */
  function QuXiaoLuRu() {
    ReJianLuRuZhong = false;
    if (AnNiuReJianZiDingYi) {
      AnNiuReJianZiDingYi.classList.remove('LuRuZhong');
      AnNiuReJianZiDingYi.textContent = '改';
    }
    if (ReJianXianShi) {
      ReJianXianShi.classList.remove('LuRuZhong');
      ReJianXianShi.textContent = ReJianZhuangTai.openWindow || 'Ctrl+Shift+O';
    }
  }

  if (AnNiuReJianZiDingYi) {
    AnNiuReJianZiDingYi.addEventListener('click', () => {
      if (ReJianLuRuZhong) {
        QuXiaoLuRu();
      } else {
        KaiShiLuRu();
      }
    });
  }

  if (AnNiuReJianChongZhi) {
    AnNiuReJianChongZhi.addEventListener('click', async () => {
      ReJianZhuangTai.openWindow = 'Ctrl+Shift+O';
      GengXinReJianXianShi();
      await BaoCunReJianSheZhi();
      if (ReJianLuRuZhong) QuXiaoLuRu();
    });
  }

  /**
   * 全局键盘监听：
   * 1. 录入模式下：捕获组合键，保存并退出录入
   * 2. 非录入模式下：热键功能启用且窗口可见时，按 ESC 隐藏窗口
   *    （对话框/设置弹窗打开时优先让它们处理 ESC）
   */
  document.addEventListener('keydown', async (e) => {
    // 1. 录入模式
    if (ReJianLuRuZhong) {
      e.preventDefault();
      e.stopPropagation();
      // 按下 ESC 取消录入
      if (e.key === 'Escape') {
        QuXiaoLuRu();
        return;
      }
      const zuHe = ZhuanHuanJianZuHe(e);
      if (zuHe) {
        ReJianZhuangTai.openWindow = zuHe;
        GengXinReJianXianShi();
        await BaoCunReJianSheZhi();
        QuXiaoLuRu();
      }
      return;
    }

    // 2. ESC 关闭窗口（热键功能启用且开启"最小化到托盘"时）
    if (e.key === 'Escape' && ReJianZhuangTai.enabled) {
      // 对话框打开时由 dialog.js 处理
      const duiHuaZheZhao = document.getElementById('DuiHua-ZheZhao');
      if (duiHuaZheZhao && duiHuaZheZhao.classList.contains('JiHuo')) return;
      // 设置弹窗打开时由 settingsPage.js 处理
      const sheZhiZheZhao = document.getElementById('SheZhi-ZheZhao');
      if (sheZhiZheZhao && sheZhiZheZhao.classList.contains('JiHuo')) return;
      // 人机验证遮罩打开时不处理
      const renJiZheZhao = document.querySelector('.RenJi-YanZheng-ZheZhao');
      if (renJiZheZhao && renJiZheZhao.classList.contains('JiHuo')) return;
      // 版本检测弹窗打开时不处理（由检测弹窗内部 ESC 处理）
      const jianCeZheZhao = document.querySelector('.JianCe-ZheZhao');
      if (jianCeZheZhao && jianCeZheZhao.classList.contains('JiHuo')) return;
      // 设置面板（Aa 内嵌）打开时优先关闭面板
      const sheDingMianBan = document.getElementById('SheDing-MianBan');
      if (sheDingMianBan && sheDingMianBan.classList.contains('JiHuo')) {
        sheDingMianBan.classList.remove('JiHuo');
        return;
      }

      // ESC 隐藏窗口依赖"最小化到托盘"：未开启时 ESC 不响应
      // （避免窗口隐藏后无法通过托盘唤起，仅全局热键可唤起不够直观）
      if (!KaiGuanZuiXiaoHuaTuoPan || !KaiGuanZuiXiaoHuaTuoPan.checked) return;

      e.preventDefault();
      await window.electronAPI.app.hideWindow();
    }
  });

  Jiazaiqidongshezhi();

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
    ChuLiShouCiXuanZe,
    ChuShiHuaAnZhuangLuJing
  };
})();
