/**
 * UI 管理 - 处理屏幕切换和通用 UI 逻辑
 */
(function() {
  const ZhuPingMu = document.getElementById('Zhu-PingMu');
  const TuoZhuaZhaoCeng = document.getElementById('TuoZhua-ZhaoCeng');

  let tuoZhuaTimer = null;

  function XianShiZhuPingMu() {
    ZhuPingMu.classList.add('JiHuo');
  }

  /**
   * 显示拖放遮罩层
   */
  function XianShiTuoZhua() {
    if (tuoZhuaTimer) {
      clearTimeout(tuoZhuaTimer);
      tuoZhuaTimer = null;
    }
    TuoZhuaZhaoCeng.classList.remove('YinCang');
    // 使用 requestAnimationFrame 确保 display 切换后过渡生效
    requestAnimationFrame(() => {
      TuoZhuaZhaoCeng.classList.add('TuoZhua-HuoYue');
    });
  }

  /**
   * 隐藏拖放遮罩层
   */
  function YinCangTuoZhua() {
    TuoZhuaZhaoCeng.classList.remove('TuoZhua-HuoYue');
    tuoZhuaTimer = setTimeout(() => {
      TuoZhuaZhaoCeng.classList.add('YinCang');
      tuoZhuaTimer = null;
    }, 300);
  }

  /**
   * 获取拖放文件的真实路径（通过 webUtils 可靠获取）
   */
  async function HuoQuWenJianLuJing(wenJian) {
    if (!wenJian || wenJian.length === 0) return null;
    const file = wenJian[0];
    if (!file.name || !file.name.toLowerCase().endsWith('.zip')) return null;
    try {
      return await window.electronAPI.getFilePath(file);
    } catch {
      return file.path || null;
    }
  }

  // 全局拖放事件
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    XianShiTuoZhua();
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 防止遮罩闪烁（拖拽子元素时仍保持显示）
    if (tuoZhuaTimer) {
      clearTimeout(tuoZhuaTimer);
      tuoZhuaTimer = null;
    }
    TuoZhuaZhaoCeng.classList.add('TuoZhua-HuoYue');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开到文档外部时才隐藏
    if (e.relatedTarget === null) {
      YinCangTuoZhua();
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    YinCangTuoZhua();

    const zipLuJing = await HuoQuWenJianLuJing(e.dataTransfer.files);

    if (zipLuJing && typeof window.UpdatePage !== 'undefined') {
      window.UpdatePage.ChuLiTuoZhuaDaoRu(zipLuJing);
    }
  });

  window.UIManager = {
    XianShiZhuPingMu,
    XianShiTuoZhua,
    YinCangTuoZhua
  };
})();
