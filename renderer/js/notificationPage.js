/**
 * 通知页面逻辑
 */
(function() {
  const BbList = document.getElementById('Bb-LieBiao');

  async function loadNotifications() {
    try {
      const notifications = await window.electronAPI.dialog.fetchNotifications();
      
      if (!notifications || notifications.length === 0) {
        BbList.innerHTML = '<p class="Bb-JiaZaiZhong">暂无通知</p>';
        return;
      }
      
      BbList.innerHTML = '';
      
      notifications.forEach((notification, index) => {
        const item = document.createElement('div');
        item.className = 'Bb-XiangMu';
        item.style.animationDelay = `${index * 0.1}s`;
        
        let html = `<div class="Bb-BiaoTi">${escapeHtml(notification.title)}</div>`;
        html += `<div class="Bb-WenBen">${escapeHtml(notification.text)}</div>`;
        
        if (notification.link) {
          html += `<a href="${escapeHtml(notification.link)}" class="Bb-LianJie" target="_blank" rel="noopener">相关链接</a>`;
        }
        
        item.innerHTML = html;
        BbList.appendChild(item);
      });
    } catch (error) {
      BbList.innerHTML = '<p class="Bb-JiaZaiZhong">通知加载失败</p>';
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.NotificationPage = {
    load: loadNotifications
  };
})();
