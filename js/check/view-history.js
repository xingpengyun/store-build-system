/* ==========================================================
   view-history.js — 核对历史
   ----------------------------------------------------------
   每次核对都会留一条：时间、两边文件名、用了哪些表、字段配置、
   统计、人工处理痕迹。原始 Excel 行内容不存（localStorage 放不下），
   但统计和「非一致明细」都留着，可以回看、可以再导出报告。
   ========================================================== */
(function () {
  'use strict';

  var U = window.CKUtil;
  var UI = window.CKUI;
  var DB = window.CKDB;
  var App = window.CKApp;

  function render() {
    var list = DB.listHistory();

    if (!list.length) {
      return '<div class="ck-card"><div class="ck-card-head"><h2>核对历史</h2>' +
        '<span class="ck-hint">每次核对都会自动留档</span></div>' +
        '<div class="ck-card-body">' + UI.empty({
          title: '还没有核对记录',
          text: '完成一次核对后，这里会保存那次的统计、字段配置和需要跟进的明细，随时可以回来看。',
          action: '<button class="ck-btn is-primary" data-act="new">' + UI.icon('plus') + '开始第一次核对</button>'
        }) + '</div></div>';
    }

    var h = '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>全部记录</h2>' +
        '<span class="ck-hint">最近 ' + list.length + ' 次 · 最多保留 ' + DB.MAX_HISTORY + ' 次</span>' +
        '<div class="ck-head-right">' +
          '<button class="ck-btn is-sm is-danger" data-act="clear">' + UI.icon('trash') + '清空历史</button>' +
        '</div></div>';

    h += '<div style="padding:0">';
    list.forEach(function (r) {
      var s = r.stats || {};
      /* 早先的「金额对账」记录还留在本地，用 pass/fail 有没有来判断是哪一种，别把老记录显示成 0 */
      var isThr = r.mode === 'threshold' || s.pass !== undefined || s.fail !== undefined;
      var bad = isThr
        ? (s.fail || 0) + (s.needConfirm || 0) + (s.unmatchedB || 0)
        : (s.amountDiff || 0) + (s.needConfirm || 0) + (s.unmatched || 0);
      var okAll = bad === 0 && (s.total || 0) > 0;

      h += '<div class="ck-recent-item" style="padding:14px 18px;align-items:flex-start" data-hid="' + U.esc(r.id) + '">' +
        '<div class="ck-recent-ico" style="margin-top:2px">' + UI.icon('file') + '</div>' +
        '<div class="ck-recent-main">' +
          '<div class="ck-row" style="gap:8px">' +
            '<div class="ck-recent-title">' + U.esc(r.title || (r.aFileName + ' × ' + r.bFileName)) + '</div>' +
            (okAll ? '<span class="ck-tag is-ok"><i></i>' + (isThr ? '全部达标' : '全部一致') + '</span>'
                   : '<span class="ck-tag is-diff"><i></i>' + bad + ' 项待跟进</span>') +
            (r.rowsTrimmed ? '<span class="ck-pill" title="历史只保留非一致明细">已精简</span>' : '') +
          '</div>' +
          '<div class="ck-recent-sub" style="margin-top:4px">' +
            U.fmtDateTime(r.at) + ' · A：' + U.esc(U.truncate(r.aFileName || '', 26)) +
            ' · B：' + U.esc(U.truncate(r.bFileName || '', 26)) +
          '</div>' +
          '<div class="ck-row wrap" style="gap:14px;margin-top:8px">' +
            (isThr
              ? statPill('门店', s.total) + statPill('达标', s.pass, 'ok') + statPill('未达标', s.fail, 'diff') +
                statPill('未找到', s.unmatchedB, 'miss') + statPill('待确认', s.needConfirm, 'wait') +
                (s.dup ? statPill('重复', s.dup, 'dup') : '')
              : statPill('门店', s.stores) + statPill('一致', s.amountOk, 'ok') + statPill('差异', s.amountDiff, 'diff') +
                statPill('未匹配', s.unmatched, 'miss') + statPill('待确认', s.needConfirm, 'wait') +
                (s.dup ? statPill('重复', s.dup, 'dup') : '')) +
          '</div>' +
          '<div class="ck-small ck-muted" style="margin-top:6px">' +
            '参与核对的表：' + U.esc((r.bSheets || []).join('、') || '—') +
            (isThr ? ' · 门槛 ≥ ' + U.fmtMoney(r.threshold === undefined ? 16000 : r.threshold) : '') +
          '</div>' +
        '</div>' +
        '<div class="ck-recent-right" style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">' +
          '<button class="ck-btn is-xs is-soft" data-view="' + U.esc(r.id) + '">查看</button>' +
          '<button class="ck-btn is-xs is-ghost" data-exp="' + U.esc(r.id) + '">导出</button>' +
          '<button class="ck-btn is-xs is-ghost" style="color:var(--bad)" data-del="' + U.esc(r.id) + '">删除</button>' +
        '</div>' +
      '</div>';
    });
    h += '</div></div>';

    h += '<div class="ck-inline-note" style="margin-top:16px">' + UI.icon('info') +
      '<span>历史保存在这台电脑的浏览器里（不上云）。为了省空间，只保留统计和「非一致」的明细行，' +
      '一致的行只记数量 —— 需要完整明细时导出 Excel 报告存档。</span></div>';

    return h;
  }

  function statPill(label, v, tone) {
    var color = tone === 'ok' ? 'var(--ok)' : tone === 'diff' ? '#d97706' : tone === 'miss' ? 'var(--bad)' : tone === 'wait' ? 'var(--wait)' : tone === 'dup' ? 'var(--dup)' : 'var(--t1)';
    return '<span class="ck-small ck-muted" style="display:inline-flex;align-items:center;gap:4px">' +
      U.esc(label) + ' <b class="ck-num" style="color:' + color + '">' + U.fmtInt(v || 0) + '</b></span>';
  }

  window.CKPages.history = {
    title: function () { return '核对历史'; },
    subtitle: function () {
      var n = DB.listHistory().length;
      return n ? ('共 ' + n + ' 次核对记录') : '每次核对都会自动留档';
    },
    topActions: function () {
      return '<button class="ck-btn is-sm is-primary" data-top="new">' + UI.icon('plus') + '新建核对</button>';
    },
    render: render,
    mount: function (el) {
      el.querySelectorAll('[data-view]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          App.openHistory(b.getAttribute('data-view'));
        };
      });

      el.querySelectorAll('[data-hid]').forEach(function (row) {
        row.onclick = function () { App.openHistory(row.getAttribute('data-hid')); };
      });

      el.querySelectorAll('[data-exp]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var h = DB.getHistory(b.getAttribute('data-exp'));
          if (!h) return;
          try {
            var name = window.CKExport.download(
              { rows: h.rows || [], stats: h.stats || {}, mode: h.mode, threshold: h.threshold },
              {
                title: h.title, aFileName: h.aFileName, bFileName: h.bFileName,
                aSheets: h.aSheets, bSheets: h.bSheets, aMap: h.aMap,
                mode: h.mode, threshold: h.threshold
              }
            );
            UI.toast('已导出：' + name, 'ok');
          } catch (err) {
            UI.toast('导出失败：' + (err && err.message || '未知错误'), 'bad');
          }
        };
      });

      el.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var id = b.getAttribute('data-del');
          var h = DB.getHistory(id);
          UI.confirm({
            title: '删除这条核对记录？',
            desc: h ? (h.title || '') + ' · ' + U.fmtDateTime(h.at) : '',
            okText: '删除', danger: true
          }).then(function (ok) {
            if (!ok) return;
            DB.deleteHistory(id);
            if (App.state.resultMeta && App.state.resultMeta.historyId === id) {
              App.state.resultMeta.historyId = null;
            }
            UI.toast('已删除', 'ok');
            App.render();
          });
        };
      });

      var clear = el.querySelector('[data-act="clear"]');
      if (clear) {
        clear.onclick = function () {
          UI.confirm({
            title: '清空全部核对历史？',
            desc: '方案和门店匹配库不受影响，但历史记录无法恢复。',
            okText: '全部清空', danger: true
          }).then(function (ok) {
            if (!ok) return;
            DB.clearHistory();
            UI.toast('已清空', 'ok');
            App.render();
          });
        };
      }

      el.querySelectorAll('[data-act="new"]').forEach(function (b) {
        b.onclick = function () { App.go('new'); };
      });
      var topNew = document.querySelector('[data-top="new"]');
      if (topNew) topNew.onclick = function () { App.go('new'); };
    }
  };
})();
