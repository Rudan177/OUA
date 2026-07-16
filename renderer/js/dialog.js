/**
 * 对话框管理
 */
(function() {
  const DuiHuaZheZhao = document.getElementById('DuiHua-ZheZhao');
  const DuiHuaBiaoTi = document.getElementById('DuiHua-BiaoTi');
  const DuiHuaXiaoXi = document.getElementById('DuiHua-XiaoXi');
  const DuiHuaQueRen = document.getElementById('DuiHua-QueRen');
  const DuiHuaQuXiao = document.getElementById('DuiHua-QuXiao');
  const DuiHuaDiSan = document.getElementById('DuiHua-DiSan');

  let JieJueChengNuo = null;

  function ShiFouSanAnNiuMoShi() {
    return !DuiHuaDiSan.classList.contains('YinCang');
  }

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

      // 三按钮模式：SanAnNiu = [按钮0, 按钮1, 按钮2]
      // 返回对应索引 0, 1, 2（点击遮罩关闭返回 -1）
      if (xuanXiang.SanAnNiu && xuanXiang.SanAnNiu.length >= 3) {
        DuiHuaDiSan.textContent = xuanXiang.SanAnNiu[0];
        DuiHuaDiSan.classList.remove('YinCang');
        DuiHuaQuXiao.textContent = xuanXiang.SanAnNiu[1];
        DuiHuaQuXiao.classList.remove('YinCang');
        DuiHuaQueRen.textContent = xuanXiang.SanAnNiu[2];
        // 三按钮模式竖向全宽排列
        DuiHuaZheZhao.querySelector('.DuiHua-DiBu').classList.add('ChuiZhi');
      } else {
        // 标准双按钮模式
        DuiHuaZheZhao.querySelector('.DuiHua-DiBu').classList.remove('ChuiZhi');
        const { XianShiQuXiao = false, QueRenWenBen = '确定', QuXiaoWenBen = '取消' } = xuanXiang;

        DuiHuaDiSan.classList.add('YinCang');

        if (XianShiQuXiao) {
          DuiHuaQuXiao.classList.remove('YinCang');
          DuiHuaQuXiao.textContent = QuXiaoWenBen;
        } else {
          DuiHuaQuXiao.classList.add('YinCang');
        }
        DuiHuaQueRen.textContent = QueRenWenBen;
      }

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
    // 三按钮模式返回 2，标准模式返回 true
    YinCangDuiHua(ShiFouSanAnNiuMoShi() ? 2 : true);
  });

  DuiHuaQuXiao.addEventListener('click', () => {
    // 三按钮模式返回 1，标准模式返回 false
    YinCangDuiHua(ShiFouSanAnNiuMoShi() ? 1 : false);
  });

  DuiHuaDiSan.addEventListener('click', () => {
    YinCangDuiHua(0);
  });

  DuiHuaZheZhao.addEventListener('click', (e) => {
    if (e.target === DuiHuaZheZhao) {
      if (ShiFouSanAnNiuMoShi()) {
        YinCangDuiHua(-1);
      } else if (!DuiHuaQuXiao.classList.contains('YinCang')) {
        YinCangDuiHua(false);
      }
    }
  });

  window.DialogManager = {
    XianShi: XianShiDuiHua,
    TiShi: function(biaoTi, xiaoXi, xuanXiang = {}) {
      return XianShiDuiHua(biaoTi, xiaoXi, { ...xuanXiang, XianShiQuXiao: false });
    },
    QueRen: function(biaoTi, xiaoXi, xuanXiang = {}) {
      return XianShiDuiHua(biaoTi, xiaoXi, { ...xuanXiang, XianShiQuXiao: true });
    },
    /** 三按钮选择对话框，返回 0(左)/1(中)/2(右)/-1(遮罩) */
    XuanZhe: function(biaoTi, xiaoXi, anNiu = ['选项一', '选项二', '选项三']) {
      return XianShiDuiHua(biaoTi, xiaoXi, { SanAnNiu: anNiu });
    }
  };
})();
