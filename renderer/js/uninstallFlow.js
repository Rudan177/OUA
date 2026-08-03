/**
 * 卸载流程 - 三步验证卸载：红色警报 → 滑块验证 → 最终确认
 * 从 updatePage.js 中拆出，独立于页面模块状态
 */
window.UninstallFlow = (function() {
  /**
   * 启动卸载流程
   * @param {HTMLElement} uninstallButton - 卸载按钮（用于禁用/恢复状态）
   */
  async function start(uninstallButton) {
    const overlay = document.createElement('div');
    overlay.className = 'RenJi-YanZheng-ZheZhao';
    document.body.appendChild(overlay);

    function onEsc(e) {
      if (e.key === 'Escape' && overlay.classList.contains('JiHuo')) {
        close();
      }
    }
    document.addEventListener('keydown', onEsc);

    const close = () => {
      document.removeEventListener('keydown', onEsc);
      overlay.classList.remove('JiHuo');
      setTimeout(() => {
        if (overlay.parentNode) document.body.removeChild(overlay);
      }, 350);
    };

    // ==== 第一步：红色警报确认 ====
    function step1() {
      overlay.innerHTML = `
        <div class="QueRen-DuiHua" id="uninstall-confirm">
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
            <button class="btn-quxiao" id="uninstall-cancel1">取消</button>
            <button class="btn-queren" id="uninstall-confirm1">确认</button>
          </div>
        </div>
      `;

      requestAnimationFrame(() => overlay.classList.add('JiHuo'));

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      document.getElementById('uninstall-cancel1').addEventListener('click', close);

      document.getElementById('uninstall-confirm1').addEventListener('click', () => {
        const d = document.getElementById('uninstall-confirm');
        if (d) {
          d.style.transform = 'scale(0.92) translateY(20px)';
          d.style.opacity = '0';
        }
        setTimeout(() => step2(), 250);
      });
    }

    // ==== 第二步：滑块验证 ====
    function step2() {
      const pieceSize = 44;
      const imgH = 170;
      const targetY = Math.floor((imgH - pieceSize) / 2);

      overlay.innerHTML = `
        <div class="HuaKuai-DuiHua" id="slider-dialog">
          <div class="HuaKuai-TuPian" id="slider-image">
            <div class="HuaKuai-QueKou" id="slider-hole" style="top:${targetY}px;"></div>
            <div class="HuaKuai-PinTu" id="slider-piece" style="top:${targetY}px;"></div>
          </div>
          <div class="HuaKuai-GuiDao" id="slider-track">
            <div class="HuaKuai-TianChong" id="slider-fill"></div>
            <div class="HuaKuai-HuaKuai" id="slider-thumb">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3L11 8L6 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <div class="HuaKuai-TiShi" id="slider-hint">拖动滑块完成验证</div>
        </div>
      `;

      requestAnimationFrame(() => {
        const d = document.getElementById('slider-dialog');
        const image = document.getElementById('slider-image');
        const imgW = image.offsetWidth;
        const maxPiece = imgW - pieceSize;
        const minTarget = 20;
        const maxTarget = maxPiece - 20;
        const targetX = minTarget + Math.floor(Math.random() * Math.max(1, maxTarget - minTarget));

        document.getElementById('slider-hole').style.left = targetX + 'px';
        const piece = document.getElementById('slider-piece');
        piece.style.left = '0';
        piece.style.background = "url('assets/images/back.png') -" + targetX + "px -" + targetY + "px / " + imgW + "px " + imgH + "px no-repeat";

        if (d) {
          d.style.transform = 'scale(1) translateY(0)';
          d.style.opacity = '1';
        }

        initSlider(targetX, imgW);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    }

    // ---- 滑块拖拽逻辑 ----
    let verified = false;

    function initSlider(targetX, imgW) {
      const track = document.getElementById('slider-track');
      const thumb = document.getElementById('slider-thumb');
      const fill = document.getElementById('slider-fill');
      const piece = document.getElementById('slider-piece');
      const hint = document.getElementById('slider-hint');
      const tolerance = 4;
      let dragging = false;
      let startX = 0;
      let thumbLeft = 0;
      let dragStartTime = 0;

      const halfThumb = 22;
      const maxOffset = track.offsetWidth - 44;
      const maxPiece = imgW - 44;

      thumb.style.left = '0';
      fill.style.width = halfThumb + 'px';
      piece.style.left = '0';

      function updatePos(clientX) {
        let dx = clientX - startX + thumbLeft;
        dx = Math.max(0, Math.min(maxOffset, dx));
        thumb.style.left = dx + 'px';
        fill.style.width = (dx + halfThumb) + 'px';
        const piecePos = (dx / maxOffset) * maxPiece;
        piece.style.left = Math.max(0, Math.min(maxPiece, piecePos)) + 'px';
        return dx;
      }

      function onStart(e) {
        if (verified) return;
        e.preventDefault();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        dragging = true;
        startX = clientX;
        thumbLeft = parseInt(thumb.style.left) || 0;
        thumb.classList.remove('yanZhengShiBai');
        hint.textContent = '拖动滑块完成验证';
        hint.className = 'HuaKuai-TiShi';
        dragStartTime = Date.now();
      }

      function onMove(e) {
        if (!dragging || verified) return;
        e.preventDefault();
        updatePos(e.type === 'touchmove' ? e.touches[0].clientX : e.clientX);
      }

      function onEnd() {
        if (!dragging || verified) return;
        dragging = false;
        const pieceLeft = parseFloat(piece.style.left) || 0;

        // 检查位置偏差
        if (Math.abs(pieceLeft - targetX) > tolerance) {
          thumb.classList.add('yanZhengShiBai');
          hint.textContent = '验证失败，请重试';
          hint.className = 'HuaKuai-TiShi shiBai';
          setTimeout(() => {
            thumb.classList.remove('yanZhengShiBai');
            thumb.style.left = '0';
            fill.style.width = halfThumb + 'px';
            piece.style.left = '0';
          }, 400);
          return;
        }

        // 检查时间限制（1500ms）
        const elapsed = Date.now() - dragStartTime;
        if (elapsed >= 1500) {
          thumb.classList.add('yanZhengShiBai');
          hint.textContent = '验证失败，请重试';
          hint.className = 'HuaKuai-TiShi shiBai';
          setTimeout(() => {
            thumb.classList.remove('yanZhengShiBai');
            thumb.style.left = '0';
            fill.style.width = halfThumb + 'px';
            piece.style.left = '0';
          }, 400);
          return;
        }

        // 验证成功
        verified = true;
        thumb.classList.add('yanZhengChengGong');
        thumb.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        if (elapsed < 1000) {
          hint.textContent = '我操，这么快，简直是神';
          hint.className = 'HuaKuai-TiShi chuanQi';
        } else {
          hint.textContent = '您已超过99.99%的用户';
          hint.className = 'HuaKuai-TiShi zuiJia';
        }

        setTimeout(() => {
          hint.textContent = '';
          hint.className = 'HuaKuai-TiShi';
          step3();
        }, 1000);
      }

      thumb.addEventListener('mousedown', onStart);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      thumb.addEventListener('touchstart', onStart, { passive: false });
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }

    // ==== 第三步：最终确认 ====
    function step3() {
      overlay.innerHTML = `
        <div class="ZuiHou-QueRen-DuiHua" id="final-confirm">
          <div class="QueRen-DuiHua-TuBiao">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
          </div>
          <div class="QueRen-DuiHua-BiaoTi">请确认已知晓</div>
          <div class="QueRen-DuiHua-XiaoXi">此操作不可逆</div>
          <div class="ZuiHou-QueRen-FuXuanKuang">
            <input type="checkbox" id="uninstall-checkbox">
            <label for="uninstall-checkbox">我已知晓此操作不可逆</label>
          </div>
          <div class="QueRen-DuiHua-AnNiu">
            <button class="btn-quxiao" id="uninstall-cancel3">取消</button>
            <button class="btn-queren ZuiHou-QueRen-AnNiu" id="uninstall-confirm3" disabled>确认卸载</button>
          </div>
        </div>
      `;

      requestAnimationFrame(() => {
        const d = document.getElementById('final-confirm');
        if (d) {
          d.style.transform = 'scale(1) translateY(0)';
          d.style.opacity = '1';
        }
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      document.getElementById('uninstall-cancel3').addEventListener('click', close);

      const checkbox = document.getElementById('uninstall-checkbox');
      const okBtn = document.getElementById('uninstall-confirm3');

      checkbox.addEventListener('change', () => {
        okBtn.disabled = !checkbox.checked;
      });

      okBtn.addEventListener('click', async () => {
        if (checkbox.checked) {
          close();
          // 延迟执行卸载，让弹窗关闭动画完成
          setTimeout(async () => {
            await execute();
          }, 400);
        }
      });
    }

    // 实际卸载逻辑
    async function execute() {
      try {
        if (uninstallButton) {
          uninstallButton.disabled = true;
          uninstallButton.title = '正在卸载...';
        }

        await window.electronAPI.app.uninstall();
      } catch (error) {
        console.error('卸载失败:', error);
        await DialogManager.TiShi('错误', '卸载失败: ' + error.message);

        if (uninstallButton) {
          uninstallButton.disabled = false;
          uninstallButton.title = '一键卸载';
        }
      }
    }

    step1();
  }

  return { start };
})();
