/* ==========================================================
   view-home.js — 核对首页
   ----------------------------------------------------------
   首页只回答三件事：
     上次核对得怎么样 / 现在要不要开始 / 我手上有哪些资料
   所以结构是「最近一次结果的统计」+「两个上传入口」+「最近记录」，
   没有数据时整页退化成「第一次用」的引导，不摆空图表。
   ========================================================== */
(function () {
  'use strict';

  var U = window.CKUtil;
  var UI = window.CKUI;
  var DB = window.CKDB;
  var App = window.CKApp;

  function parseInto(slot, file) {
    var view = document.getElementById('ckView');
    var loader = document.createElement('div');
    loader.className = 'ck-loading';
    loader.innerHTML = '<span class="ck-spin"></span><span>正在解析 ' + U.esc(file.name) + ' …</span>';
    view.appendChild(loader);
    UI.toast('正在解析 ' + file.name + ' …', 'loading', 0, 'parse');
    window.CKExcel.parseFile(file).then(function (parsed) {
      loader.remove();
      if (slot === 'a') {
        App.state.aFile = parsed;
        App.state.aSheets = parsed.sheets.filter(function (s) { return s.kind === 'detail'; }).map(function (s) { return s.name; });
        if (!App.state.aSheets.length) App.state.aSheets = parsed.sheets.filter(function (s) { return s.dataRowCount > 0; }).map(function (s) { return s.name; });
      } else {
        App.state.bFile = parsed;
        App.state.bSelected = parsed.sheets
          .filter(function (s) { return s.kind === 'detail'; })
          .map(function (s) { return s.name; });
        App.state.bMaps = {};
        App.state.activeBIdx = 0;
      }
      UI.toast(slot === 'a' ? '内部表已读取' : '外部表已读取', 'ok', 2800, 'parse');
      App.go('new');
    }).catch(function (err) {
      if (loader.parentNode) loader.remove();
      UI.toast(err.message || '解析失败', 'bad', 5000, 'parse');
    });
  }

  function render() {
    var h = DB.latestHistory();
    var aliases = DB.listAliases();
    var schemes = DB.listSchemes();
    var histCount = DB.listHistory().length;

    var html = '<div class="ck-home">';

    /* ---------- hero ---------- */
    html += '<div class="ck-hero" style="margin-bottom:16px">' +
      '<div class="ck-hero-txt">' +
        '<span class="ck-hero-eyebrow">' + UI.icon('spark') + '包邮门店智能核验</span>' +
        '<h2>外部表里的门店，订够门槛</h2>' +
        '<p>外部表是这次要核实包邮的门店，内部表是含包邮与不包邮的订货明细。系统自动读全部工作表、' +
          '认出两边写法不同的同一家店，逐家算清楚订货金额够不够门槛，把未达标的挑出来。' +
          '金额一律由程序计算，原始数据只读不改。</p>' +
        '<div class="ck-hero-acts">' +
          '<button class="ck-btn is-primary is-lg" data-act="new">' + UI.icon('plus') + '开始核对</button>' +
          (h ? '<button class="ck-btn is-line is-lg" data-act="last">' + UI.icon('eye') + '看上次结果</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ck-hero-art">' + UI.mascot({ size: 148 }) + '</div>' +
    '</div>';

    if (!h) {
      /* ---------- 第一次使用 ---------- */
      html += '<div class="ck-card">' +
        '<div class="ck-card-head"><h2>直接开始：拖两个文件进来</h2>' +
          '<span class="ck-hint">支持 .xlsx / .xls / .csv，文件不离开这台电脑</span></div>' +
        '<div class="ck-card-body">' +
          '<div class="ck-uploads">' +
            '<label class="ck-drop" id="homeDropA">' +
              '<input type="file" accept=".xlsx,.xls,.xlsm,.csv" data-slot="a" />' +
              '<div class="ck-drop-icon">' + UI.icon('table') + '</div>' +
              '<div class="ck-drop-title">内部表 · 订货明细</div>' +
              '<div class="ck-drop-sub">含包邮与不包邮，拖进来或 <b>点击选择文件</b></div>' +
            '</label>' +
            '<label class="ck-drop" id="homeDropB">' +
              '<input type="file" accept=".xlsx,.xls,.xlsm,.csv" data-slot="b" />' +
              '<div class="ck-drop-icon">' + UI.icon('layers') + '</div>' +
              '<div class="ck-drop-title">外部表 · 包邮门店清单</div>' +
              '<div class="ck-drop-sub">多张工作表会<b>自动全部读取</b></div>' +
            '</label>' +
          '</div>' +
          '<div class="ck-inline-note" style="margin-top:14px">' + UI.icon('info') +
            '<span>第一次用建议走「新建核对」：会带你确认工作表、逐张选字段，过程更清楚。' +
            '这里上传只是图快。</span></div>' +
        '</div>' +
      '</div>';

      html += '<div class="ck-card">' +
        '<div class="ck-card-head"><h2>它是怎么对的</h2></div>' +
        '<div class="ck-card-body">' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px">' +
            stepCard('1', '读全表', '外部表里有多少张工作表就读多少张，自动分辨明细表、汇总表、空白表和说明页。') +
            stepCard('2', '你定字段', '门店名称用哪一列、内部表的订货金额用哪一列，全部由你从真实列名里选，系统只做推荐。') +
            stepCard('3', '认门店', '「上海环球港」和「上海 环球港店」会认成同一家；拿不准的绝不硬凑，交给你确认。') +
            stepCard('4', '比门槛', '内部表这家店的订货金额合计 ≥ 门槛就算达标，欠多少由程序算；没进清单的门店按不包邮处理。') +
          '</div>' +
        '</div>' +
      '</div>';
      html += '</div>';
      return html;
    }

    /* ---------- 有历史：最近一次核对 ---------- */
    var s = h.stats || {};
    var isThr = (h.mode || 'recon') === 'threshold';
    html += '<div class="ck-kpis" style="margin-bottom:16px">' +
      (isThr
        ? UI.kpi({ label: '参与核验', value: U.fmtInt(s.total || 0), tone: 'brand', sub: '内部表原始行数' }) +
          UI.kpi({ label: '达标', value: U.fmtInt(s.pass || 0), tone: 'ok', sub: '订够门槛' }) +
          UI.kpi({ label: '异常', value: U.fmtInt(Math.max(0, (s.total || 0) - (s.pass || 0))), tone: 'diff', sub: '未达标 / 未对应 / 待确认等' })
        : UI.kpi({ label: '总门店数', value: U.fmtInt(s.stores || 0), tone: 'brand', sub: '去重后' }) +
          UI.kpi({ label: '金额一致', value: U.fmtInt(s.amountOk || 0), tone: 'ok', sub: '误差范围内' }) +
          UI.kpi({ label: '金额差异', value: U.fmtInt(s.amountDiff || 0), tone: 'diff', sub: '需要跟进' }) +
          UI.kpi({ label: '未匹配', value: U.fmtInt(s.unmatched || 0), tone: 'miss', sub: '一边有一边没有' }) +
          UI.kpi({ label: '待人工确认', value: U.fmtInt(s.needConfirm || 0), tone: 'wait', sub: '门店没认准' })) +
    '</div>';

    html += '<div class="ck-grid-2">';

    /* 左：最近一次 */
    html += '<div class="ck-card">' +
      '<div class="ck-card-head">' +
        '<h2>最近一次核对</h2>' +
        '<span class="ck-hint">' + U.esc(U.fmtRelTime(h.at)) + '</span>' +
        '<div class="ck-head-right">' +
          '<button class="ck-btn is-sm" data-act="openLast">查看结果</button>' +
        '</div>' +
      '</div>' +
      '<div class="ck-card-body">' +
        '<div class="ck-row" style="margin-bottom:14px;gap:12px">' +
          '<div style="width:38px;height:38px;border-radius:11px;background:var(--brand-l);color:var(--brand);display:grid;place-items:center;flex:0 0 auto">' + UI.icon('file') + '</div>' +
          '<div style="min-width:0;flex:1">' +
            '<div style="font-size:13px;font-weight:600;word-break:break-all;line-height:1.5">' +
              U.esc(h.title || (h.aFileName + ' × ' + h.bFileName)) + '</div>' +
            '<div class="ck-small ck-muted" style="margin-top:2px">外部表 ' + (h.bSheets || []).length + ' 张表：' +
              U.esc((h.bSheets || []).slice(0, 4).join('、') || '—') +
              ((h.bSheets || []).length > 4 ? ' 等' : '') + '</div>' +
          '</div>' +
        '</div>' +
        (isThr
          ? UI.diffBar({
              total: (s.pass || 0) + (s.fail || 0) + (s.needConfirm || 0) + (s.unmatched || 0),
              ok: s.pass, diff: s.fail, confirm: s.needConfirm, miss: s.unmatched,
              labels: { ok: '达标', diff: '未达标', confirm: '待确认', miss: '未找到' }
            })
          : UI.diffBar({
              total: (s.amountOk || 0) + (s.amountDiff || 0) + (s.needConfirm || 0) + (s.unmatched || 0),
              ok: s.amountOk, diff: s.amountDiff, confirm: s.needConfirm, miss: s.unmatched
            })) +
        '<div class="ck-divider"></div>' +
        '<div class="ck-row wrap" style="gap:20px">' +
          (isThr
            ? '<div><div class="ck-small ck-muted">达标订货金额</div>' +
                '<div class="ck-num" style="font-size:16px;font-weight:650;color:var(--ok)">' + U.fmtMoney(s.passAmount) + '</div></div>' +
              '<div><div class="ck-small ck-muted">未达标金额</div>' +
                '<div class="ck-num" style="font-size:16px;font-weight:650;color:var(--bad)">' + U.fmtMoney(s.failAmount) + '</div></div>' +
              '<div><div class="ck-small ck-muted">距门槛合计还差</div>' +
                '<div class="ck-num" style="font-size:16px;font-weight:650">' + U.fmtMoney(s.shortSum) + '</div></div>'
            : '<div><div class="ck-small ck-muted">内部表金额合计</div>' +
                '<div class="ck-num" style="font-size:16px;font-weight:650">' + U.fmtMoney(s.aTotal) + '</div></div>' +
              '<div><div class="ck-small ck-muted">外部表金额合计</div>' +
                '<div class="ck-num" style="font-size:16px;font-weight:650">' + U.fmtMoney(s.bTotal) + '</div></div>' +
              '<div><div class="ck-small ck-muted">差额合计</div>' +
                '<div class="ck-num" style="font-size:16px;font-weight:650;color:' + ((s.diffSum || 0) > 0 ? 'var(--bad)' : (s.diffSum || 0) < 0 ? 'var(--ok)' : 'var(--t1)') + '">' +
                  U.fmtDiff(s.diffSum) + '</div></div>') +
        '</div>' +
      '</div>' +
    '</div>';

    /* 右：资料概览 + 最近记录 */
    var recents = DB.listHistory().slice(0, 8);
    html += '<div class="ck-home-aside">' +
      '<div class="ck-card" style="margin-bottom:16px">' +
        '<div class="ck-card-head"><h2>手上的资料</h2></div>' +
        '<div class="ck-card-body" style="padding:14px 18px">' +
          '<div class="ck-row" style="justify-content:space-between;padding:5px 0">' +
            '<span class="ck-small ck-muted">门店匹配库</span>' +
            '<span class="ck-num" style="font-weight:600">' + aliases.length + ' 条</span></div>' +
          '<div class="ck-row" style="justify-content:space-between;padding:5px 0">' +
            '<span class="ck-small ck-muted">核对方案</span>' +
            '<span class="ck-num" style="font-weight:600">' + schemes.length + ' 套</span></div>' +
          '<div class="ck-row" style="justify-content:space-between;padding:5px 0">' +
            '<span class="ck-small ck-muted">历史核对</span>' +
            '<span class="ck-num" style="font-weight:600">' + histCount + ' 次</span></div>' +
          '<div class="ck-divider" style="margin:10px 0"></div>' +
          '<button class="ck-btn is-soft is-sm is-block" data-act="new">' + UI.icon('plus') + '新建一次核对</button>' +
        '</div>' +
      '</div>' +
      '<div class="ck-card">' +
        '<div class="ck-card-head"><h2>最近核对</h2>' +
          '<div class="ck-head-right"><a class="ck-small" href="#/check/history">全部</a></div></div>' +
        '<div style="padding:0">' +
          (recents.length ? recents.map(function (r) {
            var st = r.stats || {};
            var rthr = (r.mode || 'recon') === 'threshold';
            var bad = rthr
              ? (st.fail || 0) + (st.needConfirm || 0) + (st.unmatchedB || 0)
              : (st.amountDiff || 0) + (st.needConfirm || 0);
            return '<div class="ck-recent-item" data-hist="' + U.esc(r.id) + '">' +
              '<div class="ck-recent-ico">' + UI.icon('file') + '</div>' +
              '<div class="ck-recent-main">' +
                '<div class="ck-recent-title">' + U.esc(r.title || (r.aFileName + ' × ' + r.bFileName)) + '</div>' +
                '<div class="ck-recent-sub">' + U.fmtRelTime(r.at) + ' · ' + (r.bSheets || []).length + ' 张表' +
                  (rthr ? ' · 门槛 ' + U.fmtThreshold(r.threshold) : '') + '</div>' +
              '</div>' +
              '<div class="ck-recent-right">' +
                (bad
                  ? '<span class="ck-tag is-diff"><i></i>' + bad + ' 项待跟</span>'
                  : '<span class="ck-tag is-ok"><i></i>' + (rthr ? '全部达标' : '无差异') + '</span>') +
              '</div>' +
            '</div>';
          }).join('') : UI.empty({ art: false, title: '还没有核对记录', text: '完成一次核对后，这里会列出历史。' })) +
        '</div>' +
      '</div>' +
    '</div>';

    html += '</div>';
    html += '</div>';
    return html;
  }

  function stepCard(no, title, text) {
    return '<div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="width:22px;height:22px;border-radius:7px;background:var(--brand-l);color:var(--brand-d);font-size:11.5px;font-weight:700;display:grid;place-items:center">' + no + '</span>' +
        '<span style="font-size:13px;font-weight:600">' + U.esc(title) + '</span>' +
      '</div>' +
      '<div class="ck-small ck-muted" style="line-height:1.65">' + U.esc(text) + '</div>' +
    '</div>';
  }

  window.CKPages.home = {
    title: function () { return '核对首页'; },
    subtitle: function () { return '内部表 × 外部表 · 包邮门槛核验'; },
    topActions: function () {
      return '<button class="ck-btn is-primary" data-act="new">' + UI.icon('plus') + '新建核对</button>';
    },
    render: render,
    mount: function (el) {
      /* 顶栏与页面里的动作 */
      document.querySelectorAll('[data-act]').forEach(function (btn) {
        var act = btn.getAttribute('data-act');
        if (act === 'new') btn.onclick = function () { App.go('new'); };
        if (act === 'last') btn.onclick = function () {
          var h = DB.latestHistory();
          if (h) App.openHistory(h.id);
        };
        if (act === 'openLast') btn.onclick = function () {
          var h = DB.latestHistory();
          if (h) App.openHistory(h.id);
        };
      });

      /* 最近记录跳转 */
      el.querySelectorAll('[data-hist]').forEach(function (row) {
        row.onclick = function () { App.openHistory(row.getAttribute('data-hist')); };
      });

      /* 首页快速上传 */
      el.querySelectorAll('input[type="file"]').forEach(function (inp) {
        inp.onchange = function () {
          var f = inp.files && inp.files[0];
          if (f) parseInto(inp.getAttribute('data-slot'), f);
          inp.value = '';
        };
      });

      /* 拖拽 */
      ['homeDropA', 'homeDropB'].forEach(function (id) {
        var box = document.getElementById(id);
        if (!box) return;
        ['dragenter', 'dragover'].forEach(function (ev) {
          box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('is-over'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
          box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('is-over'); });
        });
        box.addEventListener('drop', function (e) {
          var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (f) parseInto(box.querySelector('input').getAttribute('data-slot'), f);
        });
      });
    }
  };
})();
