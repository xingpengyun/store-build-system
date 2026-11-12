/* ==========================================================
   view-alias.js — 门店匹配库
   ----------------------------------------------------------
   这就是需求里说的「别名库」：人工确认过的门店对应关系。
   匹配时它优先级最高 —— 只要命中，就不再走相似度计算。
   ========================================================== */
(function () {
  'use strict';

  var U = window.CKUtil;
  var UI = window.CKUI;
  var DB = window.CKDB;
  var App = window.CKApp;

  var q = '';

  function filtered() {
    var list = DB.listAliases();
    if (!q) return list;
    var k = q.toLowerCase();
    return list.filter(function (a) {
      return (a.variant || '').toLowerCase().indexOf(k) >= 0 ||
        (a.canonical || '').toLowerCase().indexOf(k) >= 0 ||
        (a.note || '').toLowerCase().indexOf(k) >= 0;
    });
  }

  function render() {
    var all = DB.listAliases();
    var list = filtered();
    var h = '';

    if (!all.length) {
      return '<div class="ck-card"><div class="ck-card-head"><h2>门店匹配库</h2>' +
        '<span class="ck-hint">人工确认过的门店对应关系，核对时优先使用</span>' +
        '<div class="ck-head-right"><button class="ck-btn is-sm is-primary" data-act="add">' + UI.icon('plus') + '手动添加</button></div>' +
        '</div><div class="ck-card-body">' + UI.empty({
          title: '匹配库还是空的',
          text: '在核对结果里遇到「上海 环球港店 = 上海环球港」这类对应关系时，点一下就能存进来。' +
            '以后每次核对，相同写法会自动沿用，不用再确认。',
          action: '<button class="ck-btn is-primary" data-act="goResult">' + UI.icon('arrowRight') + '去核对结果看看</button>'
        }) + '</div></div>';
    }

    var manual = all.filter(function (a) { return a.source !== 'history'; }).length;
    var fromCheck = all.length - manual;

    h += '<div class="ck-kpis" style="margin-bottom:16px">' +
      UI.kpi({ label: '匹配库条目', value: U.fmtInt(all.length), sub: '每种写法一条' }) +
      UI.kpi({ label: '核对时确认', value: U.fmtInt(fromCheck), tone: 'ok', sub: '从结果页存进来' }) +
      UI.kpi({ label: '手动添加', value: U.fmtInt(manual), tone: 'wait', sub: '直接录入' }) +
    '</div>';

    h += '<div class="ck-card">' +
      '<div class="ck-toolbar">' +
        '<div class="ck-search" style="width:280px">' + UI.icon('search') +
          '<input class="ck-input" type="text" placeholder="搜索写法或标准门店名" data-q value="' + U.esc(q) + '" /></div>' +
        '<span class="ck-small ck-muted">共 ' + list.length + ' 条</span>' +
        '<div class="ck-toolbar-right">' +
          '<button class="ck-btn is-sm" data-act="export">' + UI.icon('download') + '导出 CSV</button>' +
          '<button class="ck-btn is-sm is-primary" data-act="add">' + UI.icon('plus') + '手动添加</button>' +
        '</div>' +
      '</div>';

    h += '<div class="ck-table-wrap"><table class="ck-table"><thead><tr>' +
      '<th style="min-width:200px">外部表里的写法</th>' +
      '<th style="min-width:200px">对应的标准门店</th>' +
      '<th style="min-width:96px">来源</th>' +
      '<th style="min-width:74px" class="ck-cell-num">用到</th>' +
      '<th style="min-width:160px">备注</th>' +
      '<th style="min-width:120px">建立时间</th>' +
      '<th style="min-width:96px"></th>' +
      '</tr></thead><tbody>';

    if (!list.length) {
      h += '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--t3)">没有匹配「' + U.esc(q) + '」的条目</td></tr>';
    }

    list.slice(0, 300).forEach(function (a) {
      h += '<tr>' +
        '<td class="ck-cell-strong ck-cell-wrap" style="max-width:280px">' + U.esc(a.variant) + '</td>' +
        '<td class="ck-cell-wrap" style="max-width:280px">' + U.esc(a.canonical) + '</td>' +
        '<td>' + (a.source === 'history'
          ? '<span class="ck-tag is-info">核对确认</span>'
          : '<span class="ck-tag">手动</span>') + '</td>' +
        '<td class="ck-cell-num ck-num ck-cell-muted">' + (a.hits || 1) + '</td>' +
        '<td class="ck-cell-muted ck-cell-clip" title="' + U.esc(a.note || '') + '">' + U.esc(a.note || '—') + '</td>' +
        '<td class="ck-cell-muted" style="font-size:12px">' + U.esc(U.fmtDateTime(a.createdAt)) + '</td>' +
        '<td><button class="ck-btn is-xs is-ghost" data-edit="' + U.esc(a.id) + '">编辑</button>' +
          '<button class="ck-btn is-xs is-ghost" style="color:var(--bad)" data-del="' + U.esc(a.id) + '">删除</button></td>' +
      '</tr>';
    });

    h += '</tbody></table></div>';
    if (list.length > 300) {
      h += '<div class="ck-card-foot"><span class="ck-small ck-muted">只显示前 300 条，用搜索缩小范围</span></div>';
    }
    h += '</div>';

    h += '<div class="ck-inline-note" style="margin-top:16px">' + UI.icon('info') +
      '<span>匹配库是「写法 → 标准门店」的对照。核对时如果 外部表的门店写法命中这里，会直接按你确认过的关系处理，' +
      '不再走相似度判断，也不会再问一次。</span></div>';

    return h;
  }

  function addDialog() {
    var m = UI.modal(
      '<div class="ck-modal-head">' +
        '<div style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:var(--brand-l);color:var(--brand)">' +
          UI.icon('link') + '</div>' +
        '<div><h3>手动添加门店对应</h3><p>左边是 外部表里的写法，右边是 内部表（或你认可的标准）门店名</p></div>' +
      '</div>' +
      '<div class="ck-modal-body">' +
        '<div class="ck-field" style="margin-bottom:12px"><label class="ck-label">外部表里的写法 <span class="ck-req">*</span></label>' +
          '<input class="ck-input" id="alVariant" placeholder="例如：上海 环球港店" /></div>' +
        '<div class="ck-field" style="margin-bottom:12px"><label class="ck-label">对应的标准门店 <span class="ck-req">*</span></label>' +
          '<input class="ck-input" id="alCanon" placeholder="例如：上海环球港" /></div>' +
        '<div class="ck-field"><label class="ck-label">备注</label>' +
          '<input class="ck-input" id="alNote" placeholder="可选，例如：同一家，只是写法不同" /></div>' +
      '</div>' +
      '<div class="ck-modal-foot">' +
        '<button class="ck-btn" data-close>取消</button>' +
        '<button class="ck-btn is-primary" id="alSave">保存</button>' +
      '</div>'
    );
    m.el.querySelector('#alSave').onclick = function () {
      var v = m.el.querySelector('#alVariant').value.trim();
      var c = m.el.querySelector('#alCanon').value.trim();
      var n = m.el.querySelector('#alNote').value.trim();
      if (!v || !c) { UI.toast('两个名称都要填', 'warn'); return; }
      if (U.normText(v) === U.normText(c)) { UI.toast('两边写法一样，不需要建立对应', 'warn'); return; }
      DB.upsertAlias(v, c, { note: n, source: 'manual' });
      m.close();
      UI.toast('已添加', 'ok');
      App.render();
      App.refreshBadges();
    };
  }

  function editDialog(id) {
    var a = DB.listAliases().filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    UI.prompt({
      title: '修改对应的标准门店',
      label: '标准门店名',
      value: a.canonical,
      hint: '改的是右边的标准名，左边的写法不变'
    }).then(function (v) {
      if (!v) return;
      DB.updateAlias(id, { canonical: v });
      UI.toast('已更新', 'ok');
      App.render();
    });
  }

  window.CKPages.alias = {
    title: function () { return '门店匹配库'; },
    subtitle: function () {
      var n = DB.listAliases().length;
      return n ? ('已积累 ' + n + ' 条对应关系，核对时会自动沿用') : '人工确认过的门店对应关系';
    },
    topActions: function () {
      return '<button class="ck-btn is-sm" data-top="add">' + UI.icon('plus') + '添加</button>';
    },
    render: render,
    mount: function (el) {
      var search = el.querySelector('[data-q]');
      if (search) {
        var t = null;
        search.oninput = function () {
          if (t) clearTimeout(t);
          var v = search.value;
          t = setTimeout(function () { q = v.trim(); App.render(); }, 220);
        };
        if (q) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
      }

      el.querySelectorAll('[data-edit]').forEach(function (b) {
        b.onclick = function () { editDialog(b.getAttribute('data-edit')); };
      });

      el.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-del');
          var a = DB.listAliases().filter(function (x) { return x.id === id; })[0];
          UI.confirm({
            title: '删除这条对应关系？',
            desc: (a ? a.variant + ' → ' + a.canonical : '') + '，删除后下次核对会重新判断。',
            okText: '删除', danger: true
          }).then(function (ok) {
            if (!ok) return;
            DB.deleteAlias(id);
            UI.toast('已删除', 'ok');
            App.render();
            App.refreshBadges();
          });
        };
      });

      el.querySelectorAll('[data-act="add"]').forEach(function (b) { b.onclick = addDialog; });

      var ex = el.querySelector('[data-act="export"]');
      if (ex) ex.onclick = function () {
        var name = window.CKExport.downloadAliasesCsv(DB.listAliases());
        UI.toast('已导出：' + name, 'ok');
      };

      var goResult = el.querySelector('[data-act="goResult"]');
      if (goResult) goResult.onclick = function () { App.go('result'); };

      var topAdd = document.querySelector('[data-top="add"]');
      if (topAdd) topAdd.onclick = addDialog;
    }
  };
})();
