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
   * 检查拖放的文件是否为 ZIP
   */
  function ShiFouWeiZip(ge) {
    if (ge && ge.length > 0) {
      const wenJian = ge[0];
      // 检查文件后缀或 MIME 类型
      if (wenJian.name && wenJian.name.toLowerCase().endsWith('.zip')) {
        return wenJian.path || wenJian.name;
      }
    }
    return null;
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

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    YinCangTuoZhua();

    const wenJian = e.dataTransfer.files;
    const zipLuJing = ShiFouWeiZip(wenJian);

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
