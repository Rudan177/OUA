/**
 * 进度管理器 - 模拟进度条
 * 两阶段：0~80% 匀速平滑动画 → 80~100% 跟随真实进度
 * 从 updatePage.js 中拆出，通过真实进度事件更新
 */
window.ProgressManager = (function() {
  const ProgressBar = document.getElementById('GengXin-JinDu');

  /**
   * 模拟进度条
   * @param {Function} action - 返回 Promise 的实际操作
   * @param {object} [opts]
   * @param {number} [opts.duration=5000] - 0~80% 阶段总时长(ms)
   * @param {number} [opts.checkMs=100] - 轮询间隔(ms)
   */
  async function start(action, opts = {}) {
    const { duration = 5000, checkMs = 100 } = opts;
    let unsubscribe = null;
    let real = { percent: 0, message: '' };
    let done = false;
    let actionError = null;
    let cancelled = false;

    // 重置进度条
    if (ProgressBar) ProgressBar.style.transform = 'scaleX(0)';

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

      // 阶段1: 0~80% 匀速平滑动画
      const startTime = performance.now();
      const maxShown = 80;

      while (shown < maxShown && !cancelled) {
        await new Promise(r => setTimeout(r, checkMs));
        if (actionError) throw actionError;
        if (done) break;

        const elapsed = performance.now() - startTime;
        shown = Math.min(maxShown, (elapsed / duration) * maxShown);
        ProgressBar.style.transform = 'scaleX(' + (shown / 100) + ')';
      }

      // 阶段2: 80~100% 跟随真实进度
      while (shown < 100) {
        await new Promise(r => setTimeout(r, checkMs));
        if (actionError) throw actionError;
        if (done) { shown = 100; break; }

        // 真实进度 0~100 映射到 80~100 区间
        const target = 80 + (real.percent / 100) * 20;
        if (target > shown) {
          shown = Math.min(99, target);
        }
        ProgressBar.style.transform = 'scaleX(' + (shown / 100) + ')';
      }

      await actionPromise;
      ProgressBar.style.transform = 'scaleX(1)';
      // 跑满后短暂停留，再平滑复位（颜色变回去）
      await new Promise(r => setTimeout(r, 300));
      ProgressBar.style.transform = 'scaleX(0)';
    } finally {
      if (unsubscribe) unsubscribe();
    }
  }

  return { start };
})();
