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
      if (JieJueChengNuo) {
        const jiuDeChengNuo = JieJueChengNuo;
        JieJueChengNuo = null;
        jiuDeChengNuo(undefined);
      }

      DuiHuaBiaoTi.textContent = biaoTi;
      DuiHuaXiaoXi.textContent = xiaoXi;

      if (xuanXiang.SanAnNiu && xuanXiang.SanAnNiu.length >= 3) {
        DuiHuaDiSan.textContent = xuanXiang.SanAnNiu[0];
        DuiHuaDiSan.classList.remove('YinCang', 'AnNiu-Fu');
        DuiHuaDiSan.classList.add('AnNiu-Zhu');
        DuiHuaQuXiao.textContent = xuanXiang.SanAnNiu[1];
        DuiHuaQuXiao.classList.remove('YinCang', 'AnNiu-Fu');
        DuiHuaQuXiao.classList.add('AnNiu-Zhu');
        DuiHuaQueRen.textContent = xuanXiang.SanAnNiu[2];
        DuiHuaQueRen.classList.remove('AnNiu-Zhu');
        DuiHuaQueRen.classList.add('AnNiu-Fu');
        DuiHuaZheZhao.querySelector('.DuiHua-DiBu').classList.add('ChuiZhi');
      } else {
        DuiHuaZheZhao.querySelector('.DuiHua-DiBu').classList.remove('ChuiZhi');
        DuiHuaQueRen.classList.remove('AnNiu-Fu');
        DuiHuaQueRen.classList.add('AnNiu-Zhu');
        const { XianShiQuXiao = false, QueRenWenBen = '确定', QuXiaoWenBen = '取消' } = xuanXiang;

        DuiHuaDiSan.classList.add('YinCang');

        if (XianShiQuXiao) {
          DuiHuaQuXiao.classList.remove('YinCang');
          DuiHuaQuXiao.classList.add('AnNiu-Fu');
          DuiHuaQuXiao.classList.remove('AnNiu-Zhu');
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
    YinCangDuiHua(ShiFouSanAnNiuMoShi() ? 2 : true);
  });

  DuiHuaQuXiao.addEventListener('click', () => {
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DuiHuaZheZhao.classList.contains('JiHuo')) {
      if (ShiFouSanAnNiuMoShi()) {
        YinCangDuiHua(-1);
      } else if (!DuiHuaQuXiao.classList.contains('YinCang')) {
        YinCangDuiHua(false);
      } else {
        YinCangDuiHua(true);
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
    XuanZhe: function(biaoTi, xiaoXi, anNiu = ['选项一', '选项二', '选项三']) {
      return XianShiDuiHua(biaoTi, xiaoXi, { SanAnNiu: anNiu });
    }
  };
})();
