/**
 * 关于页面逻辑
 * 系统操作按钮（重启、恢复出厂设置）已移至设置页面
 */
(function() {
  window.AboutPage = {
    init: async function() {
      // 动态加载版本号
      try {
        const appInfo = await window.electronAPI.appConfig.getAppInfo();
        const banBenHao = document.getElementById('BanBen-Hao');
        if (banBenHao && appInfo) {
          banBenHao.textContent = appInfo.fullVersion;
        }
      } catch (e) {
        console.error('加载版本号失败:', e);
      }
      
      // 三击版本号切换设置入口（显示/隐藏）
      const banBenHao = document.getElementById('BanBen-Hao');
      const ccCaoZuo = document.getElementById('Cc-CaoZuo');
      
      if (banBenHao && ccCaoZuo) {
        let clickCount = 0;
        let clickTimer = null;
        
        banBenHao.addEventListener('click', () => {
          clickCount++;
          
          // 点击反馈：短暂高亮
          banBenHao.style.color = 'var(--primary-color)';
          banBenHao.style.fontWeight = '700';
          setTimeout(() => {
            banBenHao.style.color = '';
            banBenHao.style.fontWeight = '';
          }, 150);
          
          if (clickCount === 3) {
            // 三击，切换设置入口显示/隐藏
            ccCaoZuo.classList.toggle('YinCang');
            clickCount = 0;
            clearTimeout(clickTimer);
          } else {
            // 等待下一次点击
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
              clickCount = 0;
            }, 400);
          }
        });
      }
    }
  };
})();