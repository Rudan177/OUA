/**
 * 进度管理器 - 模拟进度条
 * 三阶段模拟：网络检测 → 匀速 → 跟随真实进度
 * 从 updatePage.js 中拆出，通过真实进度事件更新
 */
window.ProgressManager = (function() {
  const ProgressBar = document.getElementById('GengXin-JinDu');
  const ProgressText = document.getElementById('GengXin-JinDu-WenBen');

  /**
   * 模拟进度条
   * @param {Function} action - 返回 Promise 的实际操作
   * @param {object} [opts]
   * @param {number} [opts.jianCeShiJian=1500] - 网络检测阶段总时长(ms)
   * @param {number} [opts.suDu=5] - 匀速阶段每秒增加的百分比
   */
  async function start(action, opts = {}) {
    const { jianCeShiJian = 1500, suDu = 5 } = opts;
    let unsubscribe = null;
    let real = { percent: 0, message: '' };
    let done = false;
    let actionError = null;

    // 监听真实进度
    unsubscribe = window.electronAPI.update.onUpdateProgress((data) => {
      real = { percent: data.percent || 0, message: data.message || '' };
      if (data.percent >= 100) done = true;
    });

    const actionPromise = action()
      .then(() => { done = true; })
      .catch((err) => { actionError = err; });

    try {
      let shown = 0;

      // 清除默认提示文字
      if (ProgressText) ProgressText.textContent = '';

      // 阶段1: 0~10% 网络检测
      const stepMs = jianCeShiJian / 10;
      for (let i = 1; i <= 10; i++) {
        await new Promise(r => setTimeout(r, stepMs));
        if (actionError) throw actionError;
        shown = i;
        ProgressBar.style.width = shown + '%';
      }

      // 阶段2: 10~80% 匀速（即使下载完成也保持此速度）
      while (shown < 80) {
        await new Promise(r => setTimeout(r, 1000));
        if (actionError) throw actionError;
        shown = Math.min(80, shown + suDu);
        ProgressBar.style.width = shown + '%';
      }

      // 阶段3: 80~100% 跟随真实进度
      while (shown < 100) {
        await new Promise(r => setTimeout(r, 300));
        if (actionError) throw actionError;
        if (done) { shown = 100; break; }

        // 真实进度 0~100 映射到 80~100 区间
        const target = 80 + (real.percent / 100) * 20;
        if (target > shown) {
          shown = Math.min(99, target);
        }
        ProgressBar.style.width = shown + '%';
      }

      await actionPromise;
      ProgressBar.style.width = '100%';
    } finally {
      if (unsubscribe) unsubscribe();
    }
  }

  return { start };
})();
