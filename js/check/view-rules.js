/* ==========================================================
   view-rules.js — 规则配置与数据管理
   ----------------------------------------------------------
   这里的两个阈值直接决定「程序敢不敢自己认门店」：
     自动匹配阈值  低于它就不许自动认定，转人工
     待确认下限    低于它连候选都不给，直接算未匹配
   所以文案要说清「调高更保守」，别让人为了省事往下拉。
   ========================================================== */
(function () {
  'use strict';

  var U = window.CKUtil;
  var UI = window.CKUI;
  var DB = window.CKDB;
  var App = window.CKApp;

  function render() {
    var r = DB.getRules();
    var usage = DB.usage();
    var schemes = DB.listSchemes();

    var h = '';

    /* ---------- 核对规则 ---------- */
    h += '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>核对规则</h2>' +
        '<span class="ck-hint">修改后对下一次核发生效</span></div>' +
      '<div class="ck-card-body">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">' +

          fieldBlock('订货金额门槛（默认值）',
            '门槛核验时，内部表任意一笔订货金额 ≥ 这个数（含等于）就算这家店包邮达标。多笔订货各自判定，不相加。',
            '<div class="ck-row" style="gap:8px">' +
              '<span class="ck-muted">≥</span>' +
              '<input class="ck-input ck-num" type="number" min="0" step="100" data-rule="threshold" value="' + (r.threshold === undefined ? 16000 : r.threshold) + '" style="max-width:140px" />' +
              '<span class="ck-small ck-muted">元</span>' +
            '</div>') +

          fieldBlock('发货日期容差（天）',
            '外部表是「比登记晚一天」的发货表：发货日期 ≈ 登记日期 + 1 天。这里设容差，允许发货日期偏离「晚一天」多少天。例如你 7 号登记、仓库 8 号发货（正常晚 1 天）；若仓库拖到 9 号发货，设 1 才能对上。仅在内部表选了「日期字段」时生效。',
            '<div class="ck-row" style="gap:8px">' +
              '<span class="ck-muted">±</span>' +
              '<input class="ck-input ck-num" type="number" min="0" max="15" step="1" data-rule="dateTolerance" value="' + (r.dateTolerance === undefined ? 1 : r.dateTolerance) + '" style="max-width:100px" />' +
              '<span class="ck-small ck-muted">天</span>' +
            '</div>') +

          fieldBlock('门店自动匹配阈值',
            '相似度达到这个值且明显高于第二名，才允许程序自己认定同一家门店。调高更保守。',
            '<div class="ck-row" style="gap:10px">' +
              '<input type="range" min="0.70" max="0.99" step="0.01" data-range="autoThreshold" value="' + r.autoThreshold + '" style="flex:1" />' +
              '<input class="ck-input ck-num" type="number" min="0.70" max="0.99" step="0.01" data-rule="autoThreshold" value="' + r.autoThreshold + '" style="width:78px" />' +
            '</div>') +

          fieldBlock('待确认下限',
            '相似度低于这个值，连候选都不列，直接算「未匹配」。介于两个阈值之间的交人工确认。',
            '<div class="ck-row" style="gap:10px">' +
              '<input type="range" min="0.30" max="0.85" step="0.01" data-range="softThreshold" value="' + r.softThreshold + '" style="flex:1" />' +
              '<input class="ck-input ck-num" type="number" min="0.30" max="0.85" step="0.01" data-rule="softThreshold" value="' + r.softThreshold + '" style="width:78px" />' +
            '</div>') +
        '</div>' +
      '</div>' +
      '<div class="ck-card-foot">' +
        '<button class="ck-btn is-primary" data-act="saveRules">' + UI.icon('save') + '保存规则</button>' +
        '<button class="ck-btn" data-act="resetRules">恢复默认</button>' +
      '</div>' +
    '</div>';

    /* ---------- 核对方案 ---------- */
    h += '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>核对方案</h2>' +
        '<span class="ck-hint">保存下来的字段配置，下次同类文件可以直接套用</span>' +
        '<div class="ck-head-right">' +
          '<button class="ck-btn is-sm" data-act="goNew">' + UI.icon('plus') + '去新建里保存</button>' +
        '</div></div>';

    if (!schemes.length) {
      h += '<div class="ck-card-body"><div class="ck-small ck-muted">还没有保存过方案。' +
        '在「新建核对」选好字段后点「保存为方案」，下次就能一键套用。</div></div>';
    } else {
      h += '<div style="padding:0">';
      schemes.forEach(function (s) {
        var bMapCount = s.bMaps ? Object.keys(s.bMaps).length : 0;
        var firstSheet = s.bMaps ? Object.keys(s.bMaps)[0] : null;
        var fm = firstSheet ? s.bMaps[firstSheet] : null;
        h += '<div class="ck-recent-item" style="padding:13px 18px">' +
          '<div class="ck-recent-ico">' + UI.icon('books') + '</div>' +
          '<div class="ck-recent-main">' +
            '<div class="ck-recent-title">' + U.esc(s.name) + '</div>' +
            '<div class="ck-recent-sub">' +
              (bMapCount ? (bMapCount + ' 张表 · ') : '') +
              (fm ? ('门店=' + U.esc(fm.nameField || '未设') + ' · ') : '') +
              '门槛 ≥ ' + U.fmtMoney(s.threshold === undefined ? 16000 : s.threshold) + ' · ' +
              (s.lastUsedAt ? '上次使用 ' + U.fmtRelTime(s.lastUsedAt) : '') +
            '</div>' +
          '</div>' +
          '<button class="ck-btn is-xs is-ghost" style="color:var(--bad)" data-del-scheme="' + U.esc(s.id) + '">删除</button>' +
        '</div>';
      });
      h += '</div>';
    }
    h += '</div>';

    /* ---------- 数据管理 ---------- */
    h += '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>数据管理</h2>' +
        '<span class="ck-hint">全部数据都在这台电脑的浏览器里，不上传云端</span></div>' +
      '<div class="ck-card-body">' +
        '<div class="ck-row wrap" style="gap:24px;margin-bottom:16px">' +
          '<div><div class="ck-small ck-muted">占用空间</div>' +
            '<div class="ck-num" style="font-size:17px;font-weight:650">' + U.bytes(usage.bytes) + '</div></div>' +
          '<div><div class="ck-small ck-muted">匹配库</div>' +
            '<div class="ck-num" style="font-size:17px;font-weight:650">' + usage.alias + ' 条</div></div>' +
          '<div><div class="ck-small ck-muted">方案</div>' +
            '<div class="ck-num" style="font-size:17px;font-weight:650">' + usage.scheme + ' 套</div></div>' +
          '<div><div class="ck-small ck-muted">历史</div>' +
            '<div class="ck-num" style="font-size:17px;font-weight:650">' + usage.history + ' 次</div></div>' +
        '</div>' +
        '<div class="ck-small ck-muted" style="margin-bottom:12px">' +
          '浏览器给每个站点的本地空间大约 5MB。历史里只保留非一致明细，就是为了不把空间耗光。' +
          '换电脑或清浏览器缓存都会丢，重要数据请定期导出备份。</div>' +
        '<div class="ck-row wrap" style="gap:10px">' +
          '<button class="ck-btn" data-act="backup">' + UI.icon('download') + '导出备份（JSON）</button>' +
          '<button class="ck-btn" data-act="restore">' + UI.icon('upload') + '导入备份</button>' +
          '<button class="ck-btn is-danger" data-act="wipe">' + UI.icon('trash') + '清空全部数据</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    /* ---------- 说明 ---------- */
    h += '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>核对逻辑说明</h2></div>' +
      '<div class="ck-card-body">' +
        '<dl class="ck-kv" style="grid-template-columns:110px 1fr;gap:10px 14px">' +
          '<dt>门槛核验</dt><dd>以<b>内部表（订货明细）为主</b>：一家内部店一行，外部表（仓库包邮清单）用来核对它。' +
            '任意一笔订货金额 ≥ 门槛，这家店就算包邮达标；一笔都不够就标「未达标」。</dd>' +
          '<dt>多笔订货</dt><dd>一家门店一个月订多次货时，每笔各自对门槛，<b>金额绝不相加</b>。' +
            '每一笔订够门槛的订货单独成一行（含重复）；打开「去掉重复门店」开关，同一家门店就只显示一次。</dd>' +
          '<dt>日期匹配</dt><dd>外部表是「比登记晚一天」的发货表，用发货日期往回推登记日期（发货 − 登记 ≈ 1 天，± 容差）圈订货批次；' +
            '窗口内找不到订货记录时标「没对应上」，请你人工核对。</dd>' +
          '<dt>清单外 / 仓库未对应</dt><dd>内部表订够门槛、外部表清单没有 → 「清单外」（异常）；' +
            '外部表有、内部表没有 → 「仓库未对应」（异常）。两者都会单独列出来给你核对。</dd>' +
          '<dt>金额汇总</dt><dd>同一门店同一天的多行（常温 / 冻品拆行）先合并成一批再判定；不同日期的多笔订货各自判定，不做任何跨笔相加。</dd>' +
          '<dt>重复识别</dt><dd>外部表里同一家门店同一天出现多行 → 重复登记，只判一次，报告里列出全部行号。</dd>' +
          '<dt>门店匹配</dt><dd>先查匹配库（你确认过的关系），再按规范化名称和相似度打分。拿不准的一律转人工，不猜。</dd>' +
          '<dt>原始数据</dt><dd>上传的文件只读。所有人工处理都记在单独的处理记录里，导出报告时一并带上。</dd>' +
        '</dl>' +
      '</div>' +
    '</div>';

    return h;
  }

  function fieldBlock(label, desc, control) {
    return '<div class="ck-field">' +
      '<label class="ck-label">' + U.esc(label) + '</label>' +
      control +
      '<div class="ck-small ck-muted" style="line-height:1.6">' + U.esc(desc) + '</div>' +
    '</div>';
  }

  function bind(el) {
    /* 阈值联动：滑杆 ↔ 数字 */
    var pairs = [['autoThreshold', 0.70, 0.99], ['softThreshold', 0.30, 0.85]];
    pairs.forEach(function (p) {
      var name = p[0];
      var range = el.querySelector('[data-range="' + name + '"]');
      var num = el.querySelector('input[data-rule="' + name + '"]');
      if (!range || !num) return;
      range.oninput = function () { num.value = Number(range.value).toFixed(2); };
      num.onchange = function () {
        var v = Math.min(p[2], Math.max(p[1], Number(num.value) || p[1]));
        v = Math.round(v * 100) / 100;
        num.value = v;
        range.value = v;
      };
    });

    var save = el.querySelector('[data-act="saveRules"]');
    if (save) {
      save.onclick = function () {
        var auto = Number((el.querySelector('input[data-rule="autoThreshold"]') || {}).value);
        var soft = Number((el.querySelector('input[data-rule="softThreshold"]') || {}).value);
        var thrv = Number((el.querySelector('input[data-rule="threshold"]') || {}).value);
        var dateTol = Number((el.querySelector('input[data-rule="dateTolerance"]') || {}).value);

        if (!isFinite(thrv) || thrv < 0) { UI.toast('门槛金额不能是负数', 'warn'); return; }
        if (!isFinite(dateTol) || dateTol < 0 || dateTol > 15) { UI.toast('日期容差请填 0–15 天', 'warn'); return; }
        if (!(auto > soft)) { UI.toast('自动匹配阈值必须高于待确认下限', 'warn'); return; }

        DB.setRules({
          threshold: Math.round(thrv * 100) / 100,
          dateTolerance: Math.round(dateTol),
          autoThreshold: Math.round(auto * 100) / 100,
          softThreshold: Math.round(soft * 100) / 100
        });
        App.state.threshold = Math.round(thrv * 100) / 100;
        App.state.dateTolerance = Math.round(dateTol);
        UI.toast('规则已保存', 'ok');
        App.render();
      };
    }

    var reset = el.querySelector('[data-act="resetRules"]');
    if (reset) {
      reset.onclick = function () {
        UI.confirm({ title: '恢复默认规则？', desc: '门槛 16000、发货比登记晚 1 天（容差 ±1 天）、自动匹配 90%、待确认下限 60%。', okText: '恢复默认' })
          .then(function (ok) {
            if (!ok) return;
            DB.setRules({ threshold: 16000, dateTolerance: 1, autoThreshold: 0.9, softThreshold: 0.6 });
            App.state.threshold = 16000;
            App.state.dateTolerance = 1;
            UI.toast('已恢复默认', 'ok');
            App.render();
          });
      };
    }

    el.querySelectorAll('[data-del-scheme]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-del-scheme');
        var s = DB.getScheme(id);
        UI.confirm({ title: '删除方案？', desc: s ? s.name : '', okText: '删除', danger: true }).then(function (ok) {
          if (!ok) return;
          DB.deleteScheme(id);
          UI.toast('已删除', 'ok');
          App.render();
        });
      };
    });

    var goNew = el.querySelector('[data-act="goNew"]');
    if (goNew) goNew.onclick = function () { App.go('new'); };

    /* 备份 */
    var bk = el.querySelector('[data-act="backup"]');
    if (bk) {
      bk.onclick = function () {
        var data = DB.exportAll();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var name = '包邮核验备份_' + U.todayStr() + '.json';
        U.downloadBlob(blob, name);
        UI.toast('已导出：' + name, 'ok');
      };
    }

    /* 导入 */
    var rs = el.querySelector('[data-act="restore"]');
    if (rs) {
      rs.onclick = function () {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,application/json';
        inp.onchange = function () {
          var f = inp.files && inp.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function () {
            try {
              var obj = JSON.parse(reader.result);
              var al = (obj.aliases || []).length;
              var sc = (obj.schemes || []).length;
              var hs = (obj.history || []).length;
              UI.confirm({
                title: '导入这份备份？',
                desc: '包含 ' + al + ' 条匹配库、' + sc + ' 套方案、' + hs + ' 次历史。',
                body: '<div class="ck-inline-note">' + UI.icon('info') +
                  '<span>选择「合并」不会覆盖现有数据（同一条目自动跳过）；「替换」会先清空再导入。</span></div>',
                okText: '合并导入'
              }).then(function (ok) {
                if (!ok) return;
                DB.importAll(obj, 'merge');
                UI.toast('已导入', 'ok');
                App.render();
                App.refreshBadges();
              });
            } catch (e) {
              UI.toast('这个文件不是有效的备份（' + (e && e.message || '解析失败') + '）', 'bad', 4000);
            }
          };
          reader.readAsText(f);
        };
        inp.click();
      };
    }

    /* 清空 */
    var wipe = el.querySelector('[data-act="wipe"]');
    if (wipe) {
      wipe.onclick = function () {
        UI.confirm({
          title: '清空这台电脑上的全部数据？',
          desc: '匹配库、方案、历史全部删除，无法恢复。建议先导出备份。',
          okText: '确认清空', danger: true
        }).then(function (ok) {
          if (!ok) return;
          DB.clearAll();
          App.state.result = null;
          App.state.resultMeta = null;
          App.state.historyView = null;
          UI.toast('已清空', 'ok');
          App.render();
          App.refreshBadges();
        });
      };
    }
  }

  window.CKPages.rules = {
    title: function () { return '规则配置'; },
    subtitle: function () { return '门槛金额、门店匹配阈值与数据管理'; },
    topActions: function () { return ''; },
    render: render,
    mount: bind
  };
})();
