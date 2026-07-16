/**
 * 对话框管理
 */
(function() {
  const DuiHuaZheZhao = document.getElementById('DuiHua-ZheZhao');
  const DuiHuaBiaoTi = document.getElementById('DuiHua-BiaoTi');
  const DuiHuaXiaoXi = document.getElementById('DuiHua-XiaoXi');
  const DuiHuaQueRen = document.getElementById('DuiHua-QueRen');
  const DuiHuaQuXiao = document.getElementById('DuiHua-QuXiao');
  
  let JieJueChengNuo = null;

  function XianShiDuiHua(biaoTi, xiaoXi, xuanXiang = {}) {
    return new Promise((resolve) => {
      // 如果已有未关闭的对话框，先关闭旧对话框防止 Promise 永远不 resolve
      if (JieJueChengNuo) {
        const jiuDeChengNuo = JieJueChengNuo;
        JieJueChengNuo = null;
        jiuDeChengNuo(undefined);
      }

      DuiHuaBiaoTi.textContent = biaoTi;
      DuiHuaXiaoXi.textContent = xiaoXi;
      
      const { XianShiQuXiao = false, QueRenWenBen = '确定', QuXiaoWenBen = '取消' } = xuanXiang;
      
      if (XianShiQuXiao) {
        DuiHuaQuXiao.classList.remove('YinCang');
        DuiHuaQuXiao.textContent = QuXiaoWenBen;
      } else {
        DuiHuaQuXiao.classList.add('YinCang');
      }
      DuiHuaQueRen.textContent = QueRenWenBen;
      
      DuiHuaZheZhao.classList.remove('YinCang');
      requestAnimationFrame(() => {
        DuiHuaZheZhao.classList.add('JiHuo');
      });
      
      JieJueChengNuo = resolve;
    });
  }

  function YinCangDuiHua(jieGuo) {
    DuiHuaZheZhao.classList.remove('JiHuo');
    const dangQianJieJue = JieJueChengNuo;
    setTimeout(() => {
      DuiHuaZheZhao.classList.add('YinCang');
      if (dangQianJieJue) {
        dangQianJieJue(jieGuo);
        if (JieJueChengNuo === dangQianJieJue) {
          JieJueChengNuo = null;
        }
      }
    }, 300);
  }

  DuiHuaQueRen.addEventListener('click', () => {
    YinCangDuiHua(true);
  });

  DuiHuaQuXiao.addEventListener('click', () => {
    YinCangDuiHua(false);
  });

  DuiHuaZheZhao.addEventListener('click', (e) => {
    if (e.target === DuiHuaZheZhao && !DuiHuaQuXiao.classList.contains('YinCang')) {
      YinCangDuiHua(false);
    }
  });

  window.DialogManager = {
    XianShi: XianShiDuiHua,
    TiShi: function(biaoTi, xiaoXi, xuanXiang = {}) {
      return XianShiDuiHua(biaoTi, xiaoXi, { ...xuanXiang, XianShiQuXiao: false });
    },
    QueRen: function(biaoTi, xiaoXi, xuanXiang = {}) {
      return XianShiDuiHua(biaoTi, xiaoXi, { ...xuanXiang, XianShiQuXiao: true });
    }
  };
})();
