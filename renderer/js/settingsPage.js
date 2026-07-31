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

  zhanKaiXiangQing: function(option) {
    const target = option.dataset.target;

    document.querySelectorAll('.settings-menu-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    option.classList.add('selected');

    const rightPanelUpper = document.getElementById('right-panel-upper');

    if (target === 'daiLi') {
      const xiangQingPanel = document.getElementById('SheZhi-XiangQing-DaiLi');
      const clone = xiangQingPanel.cloneNode(true);
      clone.classList.remove('YinCang');
      clone.classList.add('active');
      clone.id = 'right-panel-content';

      rightPanelUpper.innerHTML = '';
      rightPanelUpper.appendChild(clone);

      const daiLiZiDongKaiGuan = clone.querySelector('#DaiLi-ZiDong-KaiGuan');
      const daiLiShouDongRongQi = clone.querySelector('#DaiLi-ShouDong-RongQi');
      const daiLiZiDongTiShi = clone.querySelector('#DaiLi-ZiDong-TiShi');
      const daiLiKaiGuan = clone.querySelector('#DaiLi-KaiGuan');
      const daiLiPeiZhiRongQi = clone.querySelector('#DaiLi-PeiZhi-RongQi');

      // 点击文字区域切换开关
      const switchLabels = clone.querySelectorAll('.switch-label[data-toggle]');
      switchLabels.forEach(label => {
        label.addEventListener('click', (e) => {
          // 如果点击的是 checkbox 本身，不重复处理
          if (e.target.tagName === 'INPUT') return;
          const targetId = label.getAttribute('data-toggle');
          const checkbox = clone.querySelector('#' + targetId);
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
          }
        });
      });

      if (daiLiZiDongKaiGuan) {
        daiLiZiDongKaiGuan.addEventListener('change', () => {
          if (daiLiZiDongKaiGuan.checked) {
            daiLiShouDongRongQi.classList.add('YinCang');
            daiLiZiDongTiShi.classList.remove('YinCang');
          } else {
            daiLiShouDongRongQi.classList.remove('YinCang');
            daiLiZiDongTiShi.classList.add('YinCang');
          }
        });
      }

      if (daiLiKaiGuan) {
        daiLiKaiGuan.addEventListener('change', () => {
          if (daiLiKaiGuan.checked) {
            daiLiPeiZhiRongQi.classList.remove('YinCang');
          } else {
            daiLiPeiZhiRongQi.classList.add('YinCang');
          }
        });
      }
    } else if (target === 'xitong') {
      const xiangQingPanel = document.getElementById('SheZhi-XiangQing-XiTong');
      const clone = xiangQingPanel.cloneNode(true);
      clone.classList.remove('YinCang');
      clone.classList.add('active');
      clone.id = 'right-panel-content';

      rightPanelUpper.innerHTML = '';
      rightPanelUpper.appendChild(clone);

      const chongQiBtn = clone.querySelector('#SheZhi-ChongQi');
      if (chongQiBtn) {
        chongQiBtn.addEventListener('click', () => this.zhiXingChongQi());
      }

      const chongZhiBtn = clone.querySelector('#SheZhi-ChongZhi');
      if (chongZhiBtn) {
        chongZhiBtn.addEventListener('click', () => this.zhiXingChongZhi());
      }
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
      // 先获取代理配置
      const proxyConfig = await window.electronAPI.settings.getProxyConfig();

      // 打开设置遮罩层
      const sheZhiZheZhao = document.getElementById('SheZhi-ZheZhao');
      sheZhiZheZhao.classList.remove('YinCang');
      setTimeout(() => {
        sheZhiZheZhao.classList.add('JiHuo');
      }, 10);

      // 自动选中第一个菜单项（代理设置）
      const firstMenuOption = document.querySelector('.settings-menu-option[data-target="daiLi"]');
      if (firstMenuOption) {
        // 选中菜单并展开面板
        this.zhanKaiXiangQing(firstMenuOption);

        // 等待 DOM 更新后再设置值
        setTimeout(() => {
          this.tianChongDaiLiPeiZhi(proxyConfig);
        }, 50);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  },

  tianChongDaiLiPeiZhi: function(proxyConfig) {
    try {
      const rightPanelContent = document.getElementById('right-panel-content');
      if (!rightPanelContent) return;

      const daiLiZiDongKaiGuan = rightPanelContent.querySelector('#DaiLi-ZiDong-KaiGuan');
      const daiLiShouDongRongQi = rightPanelContent.querySelector('#DaiLi-ShouDong-RongQi');
      const daiLiZiDongTiShi = rightPanelContent.querySelector('#DaiLi-ZiDong-TiShi');
      const daiLiKaiGuan = rightPanelContent.querySelector('#DaiLi-KaiGuan');
      const daiLiIP = rightPanelContent.querySelector('#DaiLi-IP');
      const daiLiDuanKou = rightPanelContent.querySelector('#DaiLi-DuanKou');
      const daiLiPeiZhiRongQi = rightPanelContent.querySelector('#DaiLi-PeiZhi-RongQi');

      const autoConfigure = proxyConfig.autoConfigure || false;

      if (daiLiZiDongKaiGuan) {
        daiLiZiDongKaiGuan.checked = autoConfigure;
      }

      if (autoConfigure) {
        if (daiLiShouDongRongQi) daiLiShouDongRongQi.classList.add('YinCang');
        if (daiLiZiDongTiShi) daiLiZiDongTiShi.classList.remove('YinCang');
      } else {
        if (daiLiShouDongRongQi) daiLiShouDongRongQi.classList.remove('YinCang');
        if (daiLiZiDongTiShi) daiLiZiDongTiShi.classList.add('YinCang');
      }

      if (daiLiKaiGuan) {
        daiLiKaiGuan.checked = proxyConfig.enabled;
      }

      const proxyUrl = proxyConfig.http || '';
      const urlWithoutProtocol = proxyUrl.replace(/^https?:\/\//, '');
      const parts = urlWithoutProtocol.split(':');

      if (daiLiIP) {
        daiLiIP.value = parts[0] || '';
      }
      if (daiLiDuanKou) {
        daiLiDuanKou.value = parts[1] || '';
      }

      if (daiLiPeiZhiRongQi) {
        if (proxyConfig.enabled) {
          daiLiPeiZhiRongQi.classList.remove('YinCang');
        } else {
          daiLiPeiZhiRongQi.classList.add('YinCang');
        }
      }
    } catch (error) {
      console.error('填充代理配置失败:', error);
    }
  },

  guanBiSheZhi: function() {
    const sheZhiZheZhao = document.getElementById('SheZhi-ZheZhao');
    sheZhiZheZhao.classList.remove('JiHuo');
    setTimeout(() => {
      sheZhiZheZhao.classList.add('YinCang');
    }, 300);

    document.querySelectorAll('.settings-menu-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    const rightPanelUpper = document.getElementById('right-panel-upper');
    rightPanelUpper.innerHTML = '<div class="right-panel-placeholder-container"><div class="right-panel-placeholder">选择设置项查看详情</div></div>';
  },

  yingYongSheZhi: async function() {
    try {
      const rightPanelContent = document.getElementById('right-panel-content');
      if (!rightPanelContent) {
        this.guanBiSheZhi();
        return;
      }

      const daiLiZiDongKaiGuan = rightPanelContent.querySelector('#DaiLi-ZiDong-KaiGuan');
      const daiLiKaiGuan = rightPanelContent.querySelector('#DaiLi-KaiGuan');
      const daiLiIP = rightPanelContent.querySelector('#DaiLi-IP');
      const daiLiDuanKou = rightPanelContent.querySelector('#DaiLi-DuanKou');

      const autoConfigure = daiLiZiDongKaiGuan ? daiLiZiDongKaiGuan.checked : false;

      const ip = daiLiIP ? daiLiIP.value.trim() : '';
      const port = daiLiDuanKou ? daiLiDuanKou.value.trim() : '';

      let proxyUrl = '';
      if (ip && port) {
        proxyUrl = 'http://' + ip + ':' + port;
      }

      const proxyConfig = {
        autoConfigure: autoConfigure,
        enabled: daiLiKaiGuan ? daiLiKaiGuan.checked : false,
        http: proxyUrl,
        https: proxyUrl
      };

      await window.electronAPI.settings.setProxyConfig(proxyConfig);

      this.guanBiSheZhi();
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }
};
