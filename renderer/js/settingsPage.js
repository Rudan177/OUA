window.SettingsPage = {
  init: function() {
    this.bindEvents();
  },

  bindEvents: function() {
    const sheZhiAnNiu = document.getElementById('AnNiu-SheZhi');
    const sheZhiGuanBi = document.getElementById('SheZhi-GuanBi');
    const sheZhiYingYong = document.getElementById('SheZhi-YingYong');
    const menuOptions = document.querySelectorAll('.settings-menu-option');

    if (sheZhiAnNiu) {
      sheZhiAnNiu.addEventListener('click', () => this.daKaiSheZhi());
    }

    if (sheZhiGuanBi) {
      sheZhiGuanBi.addEventListener('click', () => this.guanBiSheZhi());
    }

    if (sheZhiYingYong) {
      sheZhiYingYong.addEventListener('click', () => this.yingYongSheZhi());
    }

    menuOptions.forEach(option => {
      option.addEventListener('click', () => this.zhanKaiXiangQing(option));
    });

    const sheZhiZheZhao = document.getElementById('SheZhi-ZheZhao');
    if (sheZhiZheZhao) {
      sheZhiZheZhao.addEventListener('click', (e) => {
        if (e.target === sheZhiZheZhao) {
          this.guanBiSheZhi();
        }
      });
    }

    // ESC 关闭设置弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const zheZhao = document.getElementById('SheZhi-ZheZhao');
        if (zheZhao && zheZhao.classList.contains('JiHuo')) {
          this.guanBiSheZhi();
        }
      }
    });
  },

  zhanKaiXiangQing: async function(option) {
    const target = option.dataset.target;

    document.querySelectorAll('.settings-menu-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    option.classList.add('selected');

    // 隐藏占位符，显示目标详情面板
    const placeholder = document.querySelector('#right-panel-upper .right-panel-placeholder-container');
    if (placeholder) placeholder.style.display = 'none';

    document.querySelectorAll('.settings-detail-panel').forEach(p => {
      p.classList.remove('active');
    });
    const panelId = target === 'daiLi' ? 'SheZhi-XiangQing-DaiLi' : target === 'keFangWenXing' ? 'SheZhi-XiangQing-KeFangWenXing' : 'SheZhi-XiangQing-XiTong';
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.add('active');
      // 首次展示时绑定事件
      if (!panel.dataset.bound) {
        this.bindPanelEvents(panel, target);
        panel.dataset.bound = '1';
      }
      // 每次打开时实时读取最新配置（避免缓存过期）
      if (target === 'daiLi') {
        const proxyConfig = await window.electronAPI.settings.getProxyConfig();
        this.tianChongDaiLiPeiZhi(proxyConfig);
      } else if (target === 'keFangWenXing') {
        const accessibilityConfig = await window.electronAPI.settings.getAccessibilityConfig();
        this.tianChongKeFangWenXingPeiZhi(accessibilityConfig);
      }
    }
  },

  bindPanelEvents: function(panel, target) {
    if (target === 'daiLi') {
      this._bindDaiLiPanel(panel);
    } else if (target === 'keFangWenXing') {
      this._bindKeFangWenXingPanel(panel);
    }
  },

  _bindDaiLiPanel: function(panel) {
    const autoSwitch = panel.querySelector('#DaiLi-ZiDong-KaiGuan');
    const manualSwitch = panel.querySelector('#DaiLi-KaiGuan');
    const autoTip = panel.querySelector('#DaiLi-ZiDong-TiShi');
    const configBlock = panel.querySelector('#DaiLi-PeiZhi-RongQi');

    // 点击标签或 switch 区域时切换对应开关
    // 点击标签或 switch 区域均可切换开关，但只处理一次
    const handleClick = (e) => {
      // 如果点击的是 switch 容器内的元素，由 .switch handler 处理，跳过 label handler
      if (e.target.closest('.switch') && !e.target.closest('.s-panel-label')) {
        e.stopPropagation();
        const sw = e.target.closest('.switch');
        const cb = sw.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        }
        return;
      }
      // label 区域点击
      const label = e.target.closest('.s-panel-label[data-toggle]');
      if (!label) return;
      e.stopPropagation();
      const cb = panel.querySelector('#' + label.dataset.toggle);
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    };

    panel.querySelectorAll('.s-panel-label[data-toggle], .switch').forEach(el => {
      el.addEventListener('click', handleClick);
    });

    if (autoSwitch) {
      autoSwitch.addEventListener('change', () => {
        const isAuto = autoSwitch.checked;
        if (autoTip) autoTip.classList.toggle('YinCang', !isAuto);
        if (configBlock) configBlock.classList.add('YinCang');
        // 整个手动区一并隐藏
        const manualGroup = panel.querySelector('#DaiLi-ShouDong-RongQi');
        if (manualGroup) manualGroup.classList.toggle('YinCang', isAuto);
      });
    }

    if (manualSwitch) {
      manualSwitch.addEventListener('change', () => {
        if (configBlock) {
          configBlock.classList.toggle('YinCang', !manualSwitch.checked);
        }
      });
    }
  },

  _bindKeFangWenXingPanel: function(panel) {
    const mainSwitch = panel.querySelector('#KeFangWen-XinXi-KaiGuan');
    const tip = panel.querySelector('#KeFangWen-XinXi-TiShi');
    const configBlock = panel.querySelector('#KeFangWen-XinXi-PeiZhi-RongQi');

    const handleClick = (e) => {
      if (e.target.closest('.switch') && !e.target.closest('.s-panel-label')) {
        e.stopPropagation();
        const sw = e.target.closest('.switch');
        const cb = sw.querySelector('input[type="checkbox"]');
        if (cb && !cb.disabled) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        }
        return;
      }
      const label = e.target.closest('.s-panel-label[data-toggle]');
      if (!label) return;
      e.stopPropagation();
      const cb = panel.querySelector('#' + label.dataset.toggle);
      if (cb && !cb.disabled) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    };

    panel.querySelectorAll('.s-panel-label[data-toggle], .switch').forEach(el => {
      el.addEventListener('click', handleClick);
    });

    if (mainSwitch) {
      mainSwitch.addEventListener('change', () => {
        const isOn = mainSwitch.checked;
        if (tip) tip.classList.toggle('YinCang', !isOn);
        if (configBlock) configBlock.classList.toggle('YinCang', !isOn);
      });
    }
  },

  tianChongKeFangWenXingPeiZhi: function(accessibilityConfig) {
    try {
      const panel = document.querySelector('.settings-detail-panel#SheZhi-XiangQing-KeFangWenXing');
      if (!panel) return;

      const mainSwitch = panel.querySelector('#KeFangWen-XinXi-KaiGuan');
      const tip = panel.querySelector('#KeFangWen-XinXi-TiShi');
      const configBlock = panel.querySelector('#KeFangWen-XinXi-PeiZhi-RongQi');
      const portInput = panel.querySelector('#KeFangWen-DuanKou');
      const externalSwitch = panel.querySelector('#KeFangWen-WaiBu-KaiGuan');

      if (mainSwitch) mainSwitch.checked = accessibilityConfig.enabled || false;
      if (portInput) portInput.value = accessibilityConfig.port || 8964;
      if (externalSwitch) externalSwitch.checked = accessibilityConfig.allowExternal || false;

      if (accessibilityConfig.enabled) {
        if (tip) tip.classList.remove('YinCang');
        if (configBlock) configBlock.classList.remove('YinCang');
      } else {
        if (tip) tip.classList.add('YinCang');
        if (configBlock) configBlock.classList.add('YinCang');
      }
    } catch (error) {
      console.error('填充可访问性配置失败:', error);
    }
  },

  zhiXingChongQi: async function() {
    const confirmed = await window.DialogManager.QueRen('确认重启', '确定要关闭并重启应用吗？');
    if (confirmed) {
      await window.electronAPI.app.restart();
    }
  },

  zhiXingChongZhi: async function() {
    const result = await window.DialogManager.QueRen('确认恢复出厂设置', '确定要恢复出厂设置吗？此操作将清除所有用户数据和配置，且不可撤销。', {
      QueRenWenBen: '确定',
      QuXiaoWenBen: '取消'
    });

    if (result) {
      try {
        this.guanBiSheZhi();
        await window.electronAPI.app.reset();
        // reset 会关闭窗口并重启应用，后续代码不会执行
      } catch (error) {
        console.error('恢复出厂设置失败:', error);
        await window.DialogManager.TiShi('错误', '恢复出厂设置失败: ' + error.message);
      }
    }
  },

  daKaiSheZhi: async function() {
    try {
      // 打开设置遮罩层
      const sheZhiZheZhao = document.getElementById('SheZhi-ZheZhao');
      sheZhiZheZhao.classList.remove('YinCang');
      setTimeout(() => {
        sheZhiZheZhao.classList.add('JiHuo');
      }, 10);

      // 自动选中第一个菜单项（代理设置）
      const firstMenuOption = document.querySelector('.settings-menu-option[data-target="daiLi"]');
      if (firstMenuOption) {
        // zhanKaiXiangQing 内部会实时读取最新配置并填充
        await this.zhanKaiXiangQing(firstMenuOption);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  },

  tianChongDaiLiPeiZhi: function(proxyConfig) {
    try {
      // 取当前激活的代理面板（而非已销毁的 clone）
      const panel = document.querySelector('.settings-detail-panel.active');
      if (!panel) return;

      const autoSwitch = panel.querySelector('#DaiLi-ZiDong-KaiGuan');
      const manualSwitch = panel.querySelector('#DaiLi-KaiGuan');
      const autoTip = panel.querySelector('#DaiLi-ZiDong-TiShi');
      const configBlock = panel.querySelector('#DaiLi-PeiZhi-RongQi');
      const ipInput = panel.querySelector('#DaiLi-IP');
      const portInput = panel.querySelector('#DaiLi-DuanKou');

      const autoOn = proxyConfig.autoConfigure || false;

      if (autoSwitch) autoSwitch.checked = autoOn;
      if (manualSwitch) manualSwitch.checked = proxyConfig.enabled || false;

      if (autoOn) {
        if (configBlock) configBlock.classList.add('YinCang');
        if (autoTip) autoTip.classList.remove('YinCang');
        const manualGroup = panel.querySelector('#DaiLi-ShouDong-RongQi');
        if (manualGroup) manualGroup.classList.add('YinCang');
      } else {
        if (autoTip) autoTip.classList.add('YinCang');
        const manualGroup = panel.querySelector('#DaiLi-ShouDong-RongQi');
        if (manualGroup) manualGroup.classList.remove('YinCang');
        if (configBlock) configBlock.classList.toggle('YinCang', !proxyConfig.enabled);
      }

      const proxyUrl = proxyConfig.http || '';
      const parts = proxyUrl.replace(/^https?:\/\//, '').split(':');
      if (ipInput) ipInput.value = parts[0] || '';
      if (portInput) portInput.value = parts[1] || '';
    } catch (error) {
      console.error('填充代理配置失败:', error);
    }
  },

  guanBiSheZhi: function() {
    const sheZhiZheZhao = document.getElementById('SheZhi-ZheZhao');
    sheZhiZheZhao.classList.remove('JiHuo');
    // 等待退出过渡（300ms）完成后再隐藏元素，避免 display:none 打断动画
    setTimeout(() => {
      sheZhiZheZhao.classList.add('YinCang');
    }, 320);

    document.querySelectorAll('.settings-menu-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    // 隐藏所有详情面板，恢复占位符
    document.querySelectorAll('.settings-detail-panel').forEach(p => {
      p.classList.remove('active');
    });
    const placeholder = document.querySelector('#right-panel-upper .right-panel-placeholder-container');
    if (placeholder) placeholder.style.display = '';
  },

  yingYongSheZhi: async function() {
    try {
      const panel = document.querySelector('.settings-detail-panel.active');
      if (!panel) {
        this.guanBiSheZhi();
        return;
      }

      // 处理代理配置
      const autoSwitch = panel.querySelector('#DaiLi-ZiDong-KaiGuan');
      const manualSwitch = panel.querySelector('#DaiLi-KaiGuan');
      const ipInput = panel.querySelector('#DaiLi-IP');
      const portInput = panel.querySelector('#DaiLi-DuanKou');

      const proxyConfig = {
        autoConfigure: autoSwitch ? autoSwitch.checked : false,
        enabled: manualSwitch ? manualSwitch.checked : false,
        http: '',
        https: ''
      };

      const ip = ipInput ? ipInput.value.trim() : '';
      const port = portInput ? portInput.value.trim() : '';
      if (ip && port) {
        proxyConfig.http = 'http://' + ip + ':' + port;
        proxyConfig.https = proxyConfig.http;
      }

      await window.electronAPI.settings.setProxyConfig(proxyConfig);

      // 处理可访问性配置
      const keFangWenPanel = document.querySelector('#SheZhi-XiangQing-KeFangWenXing');
      if (keFangWenPanel && keFangWenPanel.classList.contains('active')) {
        const mainSwitch = keFangWenPanel.querySelector('#KeFangWen-XinXi-KaiGuan');
        const portInput2 = keFangWenPanel.querySelector('#KeFangWen-DuanKou');
        const externalSwitch = keFangWenPanel.querySelector('#KeFangWen-WaiBu-KaiGuan');

        const accessibilityConfig = {
          enabled: mainSwitch ? mainSwitch.checked : false,
          port: portInput2 ? parseInt(portInput2.value, 10) || 8964 : 8964,
          allowExternal: externalSwitch ? externalSwitch.checked : false
        };

        await window.electronAPI.settings.setAccessibilityConfig(accessibilityConfig);
      }

      this.guanBiSheZhi();
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }
};
