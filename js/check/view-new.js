/* ==========================================================
   view-new.js — 新建核对（上传 → 选 Sheet → 选字段 → 核对）
   ----------------------------------------------------------
   这一页的每一步都在解决一个具体的失败模式：
     step1 传错文件 / 文件损坏 → 解析失败要说得清楚
     step2 汇总表混进明细 → 默认只勾明细，勾了汇总给警告
     step3 字段选错 → 下拉里只有真实列名，推荐只是建议，必须用户确认
     step4 核对 → 门槛程序判，原始数据只读
   ========================================================== */
(function () {
  'use strict';

  var U = window.CKUtil;
  var UI = window.CKUI;
  var DB = window.CKDB;
  var App = window.CKApp;

  var K = 'ck.rec.';   /* 记住上次的字段偏好，下次自动预选 */

  function st() { return App.state; }

  /* 步骤只能「显式前进」，不能自动跳过：
     两个文件都解析完只代表可以进入第 2 步，是否去第 3 步由用户点「下一步」决定 ——
     否则默认勾选直接把「确认工作表」这一步跳过去，用户永远看不到汇总表被排除的过程。 */
  function stepOf() {
    var s = st();
    if (!s.aFile || !s.bFile) return 1;
    if (s.stepOverride) return s.stepOverride;
    return 2;
  }

  /* ---------------- 步骤条 ---------------- */
  function stepsHtml() {
    var cur = stepOf();
    var items = [
      { n: 1, t: '上传文件' },
      { n: 2, t: '确认工作表' },
      { n: 3, t: '选择字段' },
      { n: 4, t: '核对结果' }
    ];
    var h = '<div class="ck-steps">';
    items.forEach(function (it, i) {
      var cls = it.n === cur ? 'is-on' : (it.n < cur ? 'is-done' : '');
      h += '<div class="ck-step ' + cls + '">' +
        '<span class="ck-step-no">' + (it.n < cur ? '✓' : it.n) + '</span>' +
        '<span class="ck-step-txt">' + it.t + '</span></div>';
      if (i < items.length - 1) h += '<div class="ck-step-bar ' + (it.n < cur ? 'is-done' : '') + '"></div>';
    });
    return h + '</div>';
  }

  /* ---------------- step 1：上传 ---------------- */
  function fileCardHtml(parsed, slot) {
    var totalRows = parsed.sheets.reduce(function (a, s) { return a + s.dataRowCount; }, 0);
    var valid = parsed.sheets.filter(function (s) { return s.dataRowCount > 0; }).length;
    return '<div class="ck-filecard" style="padding:4px 0">' +
      '<div class="ck-filecard-ico">' + UI.icon('file') + '</div>' +
      '<div class="ck-filecard-meta">' +
        '<div class="ck-filecard-name">' + U.esc(parsed.fileName) + '</div>' +
        '<div class="ck-filecard-info">' +
          parsed.sheets.length + ' 张工作表 · ' + valid + ' 张有数据 · 共 ' + U.fmtInt(totalRows) + ' 行 · ' + U.bytes(parsed.fileSize) +
        '</div>' +
      '</div>' +
      '<button class="ck-btn is-sm" data-reset="' + slot + '">重新选择</button>' +
    '</div>';
  }

  function dropHtml(slot, title, sub) {
    return '<label class="ck-drop" data-drop="' + slot + '">' +
      '<input type="file" accept=".xlsx,.xls,.xlsm,.csv" data-file="' + slot + '" />' +
      '<div class="ck-drop-icon">' + UI.icon(slot === 'a' ? 'table' : 'layers') + '</div>' +
      '<div class="ck-drop-title">' + U.esc(title) + '</div>' +
      '<div class="ck-drop-sub">' + sub + '</div>' +
    '</label>';
  }

  function uploadHtml() {
    var s = st();
    var h = '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>第一步：把两个文件放进来</h2>' +
        '<span class="ck-hint">支持 .xlsx / .xls / .csv，文件只在这台电脑里解析</span></div>' +
      '<div class="ck-card-body">' +
        '<div class="ck-uploads">';

    h += '<div>' +
      '<div class="ck-label" style="margin-bottom:8px">内部表 <span class="ck-tip" style="font-weight:400">含包邮和不包邮的门店</span></div>' +
      (s.aFile ? fileCardHtml(s.aFile, 'a') : dropHtml('a', '选择内部表', '订货明细，拖进来或 <b>点击选择文件</b>')) +
      '</div>';

    h += '<div>' +
      '<div class="ck-label" style="margin-bottom:8px">外部表 <span class="ck-tip" style="font-weight:400">这次要核实包邮的门店</span></div>' +
      (s.bFile ? fileCardHtml(s.bFile, 'b') : dropHtml('b', '选择外部表', '多张工作表会<b>自动全部读取</b>')) +
      '</div>';

    h += '</div>';

    /* 已解析的提示 */
    if (s.aFile || s.bFile) {
      var msgs = [];
      [['a', s.aFile], ['b', s.bFile]].forEach(function (pair) {
        if (!pair[1]) return;
        var kinds = {};
        pair[1].sheets.forEach(function (sh) { kinds[sh.kind] = (kinds[sh.kind] || 0) + 1; });
        var label = pair[0] === 'a' ? '内部表' : '外部表';
        var parts = [];
        if (kinds.detail) parts.push(kinds.detail + ' 张明细');
        if (kinds.summary) parts.push(kinds.summary + ' 张汇总');
        if (kinds.note) parts.push(kinds.note + ' 张说明');
        if (kinds.blank) parts.push(kinds.blank + ' 张空白');
        msgs.push(label + '：识别出 ' + parts.join('、'));
        (pair[1].warnings || []).forEach(function (w) { msgs.push(label + '：' + w); });
      });
      h += '<div class="ck-inline-note" style="margin-top:14px">' + UI.icon('info') +
        '<span>' + msgs.map(U.esc).join('<br>') + '</span></div>';
    }

    h += '</div></div>';

    if (s.aFile && s.bFile) {
      h += '<div class="ck-row" style="justify-content:flex-end;margin-top:16px">' +
        '<button class="ck-btn is-primary is-lg" data-act="toStep2">下一步：确认工作表 ' + UI.icon('arrowRight') + '</button></div>';
    }

    return h;
  }

  /* ---------------- step 2：选工作表 ---------------- */
  function kindTag(kind) {
    var map = {
      detail: ['is-info', '明细'],
      summary: ['is-diff', '汇总'],
      note: ['is-dup', '说明'],
      blank: ['is-dup', '空白']
    };
    var m = map[kind] || ['', kind];
    return '<span class="ck-tag ' + m[0] + '">' + m[1] + '</span>';
  }

  function sheetCardHtml(sh, checked, side) {
    var isOn = checked;
    var invalid = sh.kind === 'blank' || sh.kind === 'note' || sh.dataRowCount === 0;
    var cols = sh.headers.slice(0, 5).join('、');
    if (sh.headers.length > 5) cols += ' 等 ' + sh.headers.length + ' 列';
    return '<div class="ck-sheet ' + (isOn ? 'is-on' : 'is-off') + (invalid ? ' is-invalid' : '') + '" ' +
      'data-sheet="' + U.esc(sh.name) + '" data-side="' + side + '">' +
      '<div class="ck-sheet-top">' +
        '<input type="checkbox" class="ck-check" ' + (isOn ? 'checked' : '') + ' tabindex="-1" />' +
        '<span class="ck-sheet-name" title="' + U.esc(sh.name) + '">' + U.esc(sh.name) + '</span>' +
        kindTag(sh.kind) +
      '</div>' +
      '<div class="ck-sheet-meta">' + U.fmtInt(sh.dataRowCount) + ' 行 · ' + sh.headers.length + ' 列' +
        (sh.headerRowNum ? ' · 表头在第 ' + sh.headerRowNum + ' 行' : '') + '</div>' +
      '<div class="ck-sheet-cols">' + U.esc(cols || '未识别到列名') + '</div>' +
      (sh.kindReason ? '<div class="ck-small" style="color:var(--t3);font-size:11px">' + U.esc(sh.kindReason) + '</div>' : '') +
    '</div>';
  }

  function sheetsHtml() {
    var s = st();
    var h = '';
    var asel = s.aSheets;
    var bsel = s.bSelected;

    /* 内部表 */
    var aDetail = s.aFile.sheets.filter(function (x) { return x.dataRowCount > 0; });
    var aAllOn = aDetail.length > 0 && aDetail.every(function (sh) { return asel.indexOf(sh.name) >= 0; });
    h += '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>内部表 · 参与核对的工作表</h2>' +
        '<span class="ck-hint">' + U.esc(s.aFile.fileName) + '</span>' +
        '<div class="ck-head-right">' +
          '<button class="ck-btn is-sm" data-pick-a="' + (aAllOn ? 'none' : 'all') + '">' +
            (aAllOn ? '取消全选' : '全选') + '</button>' +
          '<button class="ck-btn is-sm" data-pick-a="detail">只选明细</button>' +
        '</div></div>' +
      '<div class="ck-card-body">' +
        (aDetail.length
          ? '<div class="ck-sheets">' + aDetail.map(function (sh) {
              return sheetCardHtml(sh, asel.indexOf(sh.name) >= 0, 'a');
            }).join('') + '</div>'
          : '<div class="ck-inline-note is-warn">' + UI.icon('alert') + '<span>这个文件里没有能读出数据的表</span></div>') +
      '</div>' +
    '</div>';

    /* 外部表 */
    var bHasSummary = s.bFile.sheets.some(function (x) { return x.kind === 'summary'; });
    var bWithData = s.bFile.sheets.filter(function (x) { return x.dataRowCount > 0; });
    var bAllOn = bWithData.length > 0 && bWithData.every(function (sh) { return bsel.indexOf(sh.name) >= 0; });
    h += '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>外部表 · 参与核对的工作表</h2>' +
        '<span class="ck-hint">' + U.esc(s.bFile.fileName) + ' · 共 ' + s.bFile.sheets.length + ' 张</span>' +
        '<div class="ck-head-right">' +
          '<button class="ck-btn is-sm" data-pick-b="' + (bAllOn ? 'none' : 'all') + '">' +
            (bAllOn ? '取消全选' : '全选有数据') + '</button>' +
          '<button class="ck-btn is-sm" data-pick-b="detail">只选明细</button>' +
        '</div></div>' +
      '<div class="ck-card-body">' +
        (bHasSummary ? '<div class="ck-inline-note is-warn" style="margin-bottom:14px">' + UI.icon('alert') +
          '<span>检测到汇总类工作表。默认只勾选明细表 —— 汇总表和明细表一起参与核对会把同一家门店算两次。' +
          '如果某张「汇总」其实是门店清单，可以手动勾上（重复出现的门店会被标成「重复登记」，不影响结论）。</span></div>' : '') +
        '<div class="ck-sheets">' + s.bFile.sheets.map(function (sh) {
          return sheetCardHtml(sh, bsel.indexOf(sh.name) >= 0, 'b');
        }).join('') + '</div>' +
        '<div class="ck-small ck-muted" style="margin-top:12px">已选 ' + bsel.length + ' 张：' +
          U.esc(bsel.join('、') || '（还没选）') + '</div>' +
      '</div>' +
    '</div>';

    /* 汇总 + 明细同时勾选 */
    var hasSum = bsel.some(function (n) {
      var sh = s.bFile.sheets.filter(function (x) { return x.name === n; })[0];
      return sh && sh.kind === 'summary';
    });
    var hasDet = bsel.some(function (n) {
      var sh = s.bFile.sheets.filter(function (x) { return x.name === n; })[0];
      return sh && sh.kind === 'detail';
    });
    if (hasSum && hasDet) {
      h += '<div class="ck-inline-note is-bad" style="margin-top:16px">' + UI.icon('alert') +
        '<span>你同时勾选了汇总表和明细表，同一笔金额可能被核对两次。如果这是有意为之请忽略这条提示，' +
        '否则建议只保留明细表。</span></div>';
    }

    h += '<div class="ck-row" style="justify-content:space-between;margin-top:16px">' +
      '<button class="ck-btn" data-act="toStep1">' + UI.icon('back') + '上一步</button>' +
      '<button class="ck-btn is-primary is-lg" data-act="toStep3">下一步：选择字段 ' + UI.icon('arrowRight') + '</button>' +
    '</div>';

    return h;
  }

  /* ---------------- step 3：字段映射 ---------------- */

  function colsOf(sheets) {
    var out = [];
    var seen = {};
    sheets.forEach(function (sh) {
      sh.headers.forEach(function (h, i) {
        if (seen[h]) {
          /* 同名但类型不同，标记为 mixed */
          if (out[seen[h] - 1].type !== (sh.colTypes[i] && sh.colTypes[i].type)) out[seen[h] - 1].type = 'mixed';
          return;
        }
        seen[h] = out.length + 1;
        out.push({ name: h, type: (sh.colTypes[i] && sh.colTypes[i].type) || 'mixed' });
      });
    });
    return out;
  }

  function aSelectedSheets() {
    var s = st();
    return s.aFile.sheets.filter(function (x) { return s.aSheets.indexOf(x.name) >= 0; });
  }

  function bSelectedSheets() {
    var s = st();
    return s.bFile.sheets.filter(function (x) { return s.bSelected.indexOf(x.name) >= 0; });
  }

  /* 字段推荐：只看列名关键词 + 推断出的列类型，纯本地规则，不上模型。
     名称列分三档 —— 「门店」这种明确列永远赢过「备注」这种可能列；
     单号/编号类一律排除（它们像文本列，但不是门店名）。 */
  var NAME_STRONG = /(门店|店名|店铺|store|网点)/i;
  var NAME_MID = /(客户|收货|收件|商家|单位名称|destination)/i;
  var NAME_WEAK = /(备注|寄件)/i;
  var ID_LIKE = /(单号|编号|序号|代码|账号|id)$/i;
  var AMOUNT_RE = /(金额|应付|应收|实付|实收|合计|小计|总额|费用|运费|报价|结算|单价|价格|amount|total|price)/i;
  var DATE_RE = /(日期|时间|账期|月份|年月|date|time)/i;
  /* 单号列：A 表订单单号 / B 表物流单号（同一单号）。比 ID_LIKE 更聚焦「订单/物流/运单」。 */
  var ORDER_RE = /(订单|物流|运单|快递|发货)?单号|订单编号|运单编号|物流编号|发货单号|^单号$|order/i;
  /* A 表单号可能按品类分列，列名叫「常温」「冻品」等品类名但存的是单号。
     这些列名不带"单号"字样，需要单独识别。 */
  var CATEGORY_ORDER_RE = /^(常温|冻品|冷藏|冷冻|熟食|生鲜|烘焙|日配|冷链|恒温)$/;

  function recommend(sheet) {
    var best = { nameField: '', amountField: '', dateField: '', orderField: '', orderFields: [] };
    var scores = { nameField: 0, amountField: 0, dateField: 0, orderField: 0 };

    sheet.headers.forEach(function (h, i) {
      var t = (sheet.colTypes[i] && sheet.colTypes[i].type) || 'mixed';
      var idLike = ID_LIKE.test(h);

      if (!idLike && t !== 'number' && t !== 'date') {
        var sc = 0;
        if (NAME_STRONG.test(h)) sc = 22;
        else if (NAME_MID.test(h)) sc = 14;
        else if (NAME_WEAK.test(h)) sc = 7;
        if (sc > scores.nameField) { scores.nameField = sc; best.nameField = h; }
      }
      if (!idLike && AMOUNT_RE.test(h) && (t === 'number' || t === 'mixed')) {
        var sc2 = 10 + (/(金额|应付|应收|实付|实收)/.test(h) ? 8 : 0) - (/(单价|价格)/.test(h) ? 4 : 0);
        if (sc2 > scores.amountField) { scores.amountField = sc2; best.amountField = h; }
      }
      if (DATE_RE.test(h) && (t === 'date' || t === 'mixed' || t === 'text')) {
        var sc3 = 10 + (/日期/.test(h) ? 6 : 0);
        if (sc3 > scores.dateField) { scores.dateField = sc3; best.dateField = h; }
      }
      /* 单号列识别：文本/数字型，命中订单/物流/运单/单号关键词 */
      if (ORDER_RE.test(h) && (t === 'text' || t === 'mixed' || t === 'number')) {
        var sc4 = 12 + (/单号/.test(h) ? 6 : 0);
        if (sc4 > scores.orderField) { scores.orderField = sc4; best.orderField = h; }
        best.orderFields.push(h);
      }
      /* 品类列（常温/冻品等）也作为单号候选 —— A 表特有场景 */
      if (CATEGORY_ORDER_RE.test(h) && (t === 'text' || t === 'mixed' || t === 'number')) {
        if (best.orderFields.indexOf(h) < 0) best.orderFields.push(h);
        if (!best.orderField) best.orderField = h;
      }
    });

    /* 兜底：金额列没有名字线索，就找唯一一个数值型的列 */
    if (!best.amountField) {
      var nums = [];
      sheet.headers.forEach(function (h, i) {
        var t = sheet.colTypes[i] && sheet.colTypes[i].type;
        if (t === 'number') nums.push(h);
      });
      if (nums.length === 1) best.amountField = nums[0];
    }
    /* 兜底：门店列 = 第一个非单号类的文本列 */
    if (!best.nameField) {
      for (var i = 0; i < sheet.headers.length; i++) {
        if (ID_LIKE.test(sheet.headers[i])) continue;
        var tt = sheet.colTypes[i] && sheet.colTypes[i].type;
        if (tt === 'text' || tt === 'mixed') { best.nameField = sheet.headers[i]; break; }
      }
    }
    return best;
  }

  function typeHint(t) {
    return { number: '数字', date: '日期', text: '文本', mixed: '混合', empty: '空' }[t] || '';
  }

  function selField(scope, sheetName, key, label, cols, value, required) {
    var opts = '<option value="">— 不选择 —</option>';
    cols.forEach(function (c) {
      opts += '<option value="' + U.esc(c.name) + '"' + (c.name === value ? ' selected' : '') + '>' +
        U.esc(c.name) + (c.type ? '（' + typeHint(c.type) + '）' : '') + '</option>';
    });
    return '<div class="ck-field">' +
      '<label class="ck-label">' + U.esc(label) + (required ? ' <span class="ck-req">*</span>' : '') + '</label>' +
      '<select class="ck-select' + (required && !value ? ' is-warn' : '') + '" ' +
        'data-scope="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '" data-key="' + key + '">' +
        opts + '</select></div>';
  }

  function extraFieldsHtml(scope, sheetName, cols, list, locked) {
    var avail = cols.filter(function (c) { return locked.indexOf(c.name) < 0 && list.indexOf(c.name) < 0; });
    var h = '<div class="ck-field">' +
      '<label class="ck-label">其他对比字段 <span class="ck-tip">' +
        (list.length ? '这些字段也要求一致' : '可选，不填就只比金额') + '</span></label>';

    if (list.length) {
      h += '<div class="ck-row wrap" style="gap:6px;margin-bottom:6px">';
      list.forEach(function (f) {
        h += '<span class="ck-tag is-info" style="height:24px">' + U.esc(f) +
          '<button data-rm-extra="' + U.esc(f) + '" data-scope="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '" ' +
          'style="margin-left:2px;color:inherit;opacity:.6;font-size:13px;line-height:1" title="移除">×</button></span>';
      });
      h += '</div>';
    }

    if (avail.length) {
      h += '<div class="ck-row" style="gap:8px">' +
        '<select class="ck-select" data-extra-pick="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '" style="flex:1">' +
          '<option value="">选择要一起比对的字段…</option>' +
          avail.map(function (c) { return '<option value="' + U.esc(c.name) + '">' + U.esc(c.name) + '</option>'; }).join('') +
        '</select>' +
        '<button class="ck-btn is-sm" data-add-extra="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '">添加</button>' +
      '</div>';
    }
    return h + '</div>';
  }

  /* A 表订单单号可能按品类分多列（常温/冻品），用添加/移除模式选多个 */
  function orderFieldsHtml(scope, sheetName, cols, list, locked) {
    var avail = cols.filter(function (c) { return locked.indexOf(c.name) < 0 && list.indexOf(c.name) < 0; });
    var h = '<div class="ck-field">' +
      '<label class="ck-label">订单单号字段 <span class="ck-tip">' +
        (list.length ? '已选 ' + list.length + ' 列，按行取第一个非空值作为单号' : '可选；A 表单号可能叫「常温」「冻品」等品类名，可多选') + '</span></label>';

    if (list.length) {
      h += '<div class="ck-row wrap" style="gap:6px;margin-bottom:6px">';
      list.forEach(function (f) {
        h += '<span class="ck-tag is-info" style="height:24px">' + U.esc(f) +
          '<button data-rm-order="' + U.esc(f) + '" data-scope="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '" ' +
          'style="margin-left:2px;color:inherit;opacity:.6;font-size:13px;line-height:1" title="移除">×</button></span>';
      });
      h += '</div>';
    }

    if (avail.length) {
      h += '<div class="ck-row" style="gap:8px">' +
        '<select class="ck-select" data-order-pick="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '" style="flex:1">' +
          '<option value="">选择单号所在列…（可多选）</option>' +
          avail.map(function (c) { return '<option value="' + U.esc(c.name) + '">' + U.esc(c.name) + '</option>'; }).join('') +
        '</select>' +
        '<button class="ck-btn is-sm" data-add-order="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '">添加</button>' +
      '</div>';
    }
    return h + '</div>';
  }

  function recommendBar(rec, scope, sheetName) {
    var items = [];
    /* B 表不看金额（B 表是仓库发货表，没有金额列），但要看日期和单号 */
    var skipAmount = (scope === 'b');
    if (rec.nameField) items.push('门店名称 = ' + rec.nameField);
    if (rec.amountField && !skipAmount) items.push('金额 = ' + rec.amountField);
    if (rec.dateField) items.push((scope === 'a' ? '下单日期' : '发货日期') + ' = ' + rec.dateField);
    if (rec.orderField) items.push((scope === 'a' ? '订单单号' : '物流单号') + ' = ' + rec.orderField);
    if (scope === 'a' && rec.orderFields && rec.orderFields.length > 1) {
      items[items.length - 1] = '订单单号 = ' + rec.orderFields.join('、') + '（多列取首个非空）';
    }
    if (!items.length) return '';
    return '<div class="ck-inline-note" style="margin-bottom:12px;align-items:center">' + UI.icon('wand') +
      '<span style="flex:1">系统建议：' + U.esc(items.join('，')) + '（只是建议，需要你确认）</span>' +
      '<button class="ck-btn is-xs is-soft" data-use-rec="' + scope + '" data-sheet="' + U.esc(sheetName || '') + '">采用</button></div>';
  }

  /* ---------------- 核验门槛 ----------------
     门槛只有一个地方能改：规则配置页。这一页只读显示当前值 ——
     核对过程中随手改门槛，回头对不上是哪次用的哪个数，所以把入口收敛掉了。 */

  function curThreshold() {
    var v = Number(DB.getRules().threshold);
    return isFinite(v) && v >= 0 ? v : 16000;
  }

  function thresholdCardHtml() {
    var thr = curThreshold();
    return '<div class="ck-card">' +
      '<div class="ck-card-head"><h2>核验门槛</h2>' +
        '<span class="ck-hint">统一在「规则配置」里改</span>' +
        '<div class="ck-head-right">' +
          '<button class="ck-btn is-sm" data-act="goRules">' + UI.icon('settings') + '去改门槛</button>' +
        '</div></div>' +
      '<div class="ck-card-body">' +
        '<div class="ck-row wrap" style="gap:20px;align-items:flex-start">' +
          '<div class="ck-num" style="font-size:22px;font-weight:700;letter-spacing:-.01em;line-height:1.3">' +
            '≥ ' + U.fmtThreshold(thr) + ' <span style="font-size:13px;font-weight:500;color:var(--t3)">元</span>' +
          '</div>' +
          '<div class="ck-small ck-muted" style="flex:1;min-width:260px;line-height:1.75">' +
            '外部表 = 该包邮的门店清单，内部表 = 含包邮与不包邮的订货明细。逐家算内部表这家门店的订货金额合计，≥ 门槛就算达标（含等于）。<br>' +
            '内部表里没出现在外部表清单的门店，按「不包邮」处理，不参与核验，也不会上明细。' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function mapHtml() {
    var s = st();
    var aSheets = aSelectedSheets();
    var aCols = colsOf(aSheets);
    if (!s.aMap) s.aMap = { nameField: '', amountField: '', dateField: '', orderField: '', orderFields: [], extraFields: [] };
    if (!s.aMap.extraFields) s.aMap.extraFields = [];
    if (!s.aMap.orderField) s.aMap.orderField = '';
    if (!s.aMap.orderFields) s.aMap.orderFields = s.aMap.orderField ? [s.aMap.orderField] : [];

    var h = thresholdCardHtml();

    /* --- 内部表 --- */
    var aRec = aSheets.length === 1 ? recommend(aSheets[0]) : { nameField: '', amountField: '', dateField: '', orderField: '', orderFields: [] };
    h += '<div class="ck-card" style="margin-top:16px">' +
      '<div class="ck-card-head"><h2>内部表字段</h2>' +
        '<span class="ck-hint">' + U.esc(s.aFile.fileName) + ' · ' + aSheets.length + ' 张表</span></div>' +
      '<div class="ck-card-body">' +
        (aSheets.length > 1 ? '<div class="ck-inline-note is-warn" style="margin-bottom:12px">' + UI.icon('alert') +
          '<span>内部表选了 ' + aSheets.length + ' 张工作表，字段是从这些表的列名合并出来的。' +
          '如果各表列名不一致，建议只保留一张，避免取到空列。</span></div>' : '') +
        (aRec.nameField ? recommendBar(aRec, 'a', '') : '') +
        '<div class="ck-map-row">' +
          '<span class="ck-map-name">必填</span>' +
          selField('a', '', 'nameField', '门店名称字段', aCols, s.aMap.nameField, true) +
          selField('a', '', 'amountField', '订货金额字段', aCols, s.aMap.amountField, true) +
        '</div>' +
        '<div class="ck-map-row">' +
          '<span class="ck-map-name">日期</span>' +
          selField('a', '', 'dateField', '下单日期字段', aCols, s.aMap.dateField, false) +
          '<div></div>' +
        '</div>' +
        '<div style="padding-top:10px">' + orderFieldsHtml('a', '', aCols, s.aMap.orderFields,
          [s.aMap.nameField, s.aMap.amountField, s.aMap.dateField].filter(Boolean)) + '</div>' +
        '<div style="padding-top:10px">' + extraFieldsHtml('a', '', aCols, s.aMap.extraFields,
          [s.aMap.nameField, s.aMap.amountField, s.aMap.dateField].concat(s.aMap.orderFields).filter(Boolean)) + '</div>' +
      '</div>' +
    '</div>';

    /* --- 外部表 --- */
    var bSheets = bSelectedSheets();
    if (!bSheets.length) {
      h += '<div class="ck-card"><div class="ck-card-body">' + UI.empty({
        title: '还没有勾选 外部表工作表', text: '回到上一步勾选要参与核对的工作表。',
        action: '<button class="ck-btn is-primary" data-act="toStep2">去选工作表</button>'
      }) + '</div></div>';
      return h;
    }

    var idx = Math.min(s.activeBIdx || 0, bSheets.length - 1);
    var cur = bSheets[idx];
    if (!s.bMaps[cur.name]) s.bMaps[cur.name] = { nameField: '', amountField: '', dateField: '', orderField: '', logisticsCompany: '', extraFields: [] };
    var curMap = s.bMaps[cur.name];
    if (!curMap.extraFields) curMap.extraFields = [];
    if (!curMap.orderField) curMap.orderField = '';
    if (curMap.logisticsCompany === undefined) curMap.logisticsCompany = '';
    var curCols = colsOf([cur]);
    var curRec = recommend(cur);

    h += '<div class="ck-card" style="margin-top:16px">' +
      '<div class="ck-card-head"><h2>外部表字段</h2>' +
        '<span class="ck-hint">每张工作表可以独立配置 · 不同 Sheet 可代表不同物流公司</span>' +
        '<div class="ck-head-right">' +
          '<button class="ck-btn is-sm" data-act="applyAll">' + UI.icon('copy') + '把这套配置应用到所有表</button>' +
        '</div></div>';

    /* Sheet 标签 */
    h += '<div class="ck-sheet-tabs">';
    bSheets.forEach(function (sh, i) {
      var m = s.bMaps[sh.name] || {};
      var ready = !!m.nameField;   /* 门槛核验只要门店名，金额可选 */
      var hasOrder = !!m.orderField;
      h += '<button class="ck-stab ' + (i === idx ? 'is-on' : '') + '" data-btab="' + i + '">' +
        U.esc(sh.name) + (ready ? ' <span style="color:var(--ok);font-size:11px">●</span>' : '') +
        (hasOrder ? ' <span style="color:var(--info);font-size:11px" title="已配单号">号</span>' : '') +
        '</button>';
    });
    h += '</div>';

    h += '<div class="ck-card-body" style="border-top:1px solid var(--line)">' +
      '<div class="ck-row" style="margin-bottom:12px">' +
        '<span class="ck-tag is-info">' + U.esc(cur.name) + '</span>' +
        '<span class="ck-small ck-muted">' + U.fmtInt(cur.dataRowCount) + ' 行 · ' + cur.headers.length + ' 列</span>' +
        (cur.kind !== 'detail' ? '<span class="ck-tag is-diff"><i></i>' + (cur.kind === 'summary' ? '汇总表' : '非明细表') + '</span>' : '') +
      '</div>' +
      recommendBar(curRec, 'b', cur.name) +
      '<div class="ck-map-row">' +
        '<span class="ck-map-name">必填</span>' +
        selField('b', cur.name, 'nameField', '门店名称字段', curCols, curMap.nameField, true) +
        '<div></div>' +
      '</div>' +
      '<div class="ck-map-row">' +
        '<span class="ck-map-name">单号 / 日期</span>' +
        selField('b', cur.name, 'orderField', '物流单号字段（没有则走门店+日期备用匹配）', curCols, curMap.orderField, false) +
        selField('b', cur.name, 'dateField', '发货日期字段', curCols, curMap.dateField, false) +
      '</div>' +
      '<div style="padding-top:10px">' + extraFieldsHtml('b', cur.name, curCols, curMap.extraFields,
        [curMap.nameField, curMap.dateField, curMap.orderField].filter(Boolean)) + '</div>' +
    '</div></div>';

    /* --- 底部动作 --- */
    h += '<div class="ck-row wrap" style="justify-content:space-between;margin-top:16px;gap:10px">' +
      '<div class="ck-row wrap" style="gap:8px">' +
        '<button class="ck-btn" data-act="toStep2">' + UI.icon('back') + '上一步</button>' +
        '<button class="ck-btn" data-act="pickScheme" title="把保存过的字段配置一键填进来">' + UI.icon('books') + '套用方案</button>' +
        '<button class="ck-btn" data-act="saveScheme">' + UI.icon('save') + '保存为方案</button>' +
        (s.schemeName ? '<span class="ck-tag is-ok" style="align-self:center">当前方案：' + U.esc(s.schemeName) + '</span>' : '') +
      '</div>' +
      '<button class="ck-btn is-primary is-lg" data-act="run" id="ckRunBtn">' + UI.icon('check') + '开始核对</button>' +
    '</div>';

    return h;
  }

  /* ---------------- 渲染 ---------------- */

  function bodyHtml() {
    var step = stepOf();
    if (step === 1) return uploadHtml();
    if (step === 2) return sheetsHtml();
    return mapHtml();
  }

  /* ---------------- 动作 ---------------- */

  function loadFile(slot, file) {
    /* 进度提示常驻（ms=0），解析结束后被同 key 的结果提示替换掉 ——
       不会出现「已经读完了，正在解析还挂在那儿」 */
    UI.toast('正在解析 ' + file.name + ' …', 'loading', 0, 'parse');
    window.CKExcel.parseFile(file).then(function (parsed) {
      st().stepOverride = null;
      if (slot === 'a') {
        st().aFile = parsed;
        st().aSheets = parsed.sheets.filter(function (x) { return x.kind === 'detail'; }).map(function (x) { return x.name; });
        if (!st().aSheets.length) {
          st().aSheets = parsed.sheets.filter(function (x) { return x.dataRowCount > 0; }).map(function (x) { return x.name; });
        }
        st().aMap = null;
      } else {
        st().bFile = parsed;
        st().bSelected = parsed.sheets.filter(function (x) { return x.kind === 'detail'; }).map(function (x) { return x.name; });
        st().bMaps = {};
        st().activeBIdx = 0;
      }
      var empty = parsed.sheets.every(function (x) { return x.dataRowCount === 0; });
      if (empty) UI.toast('这个文件里没有读出任何数据行，请检查文件', 'warn', 4000, 'parse');
      else UI.toast((slot === 'a' ? '内部表' : '外部表') + '已读取：' + parsed.sheets.length + ' 张工作表', 'ok', 2800, 'parse');

      /* 两个文件都齐了、且上次套用过方案 → 自动套用一次，别让用户每次重新选。
         applyScheme 内部会按列名匹配、对不上的跳过，最后自己 render，这里不再重复 render。 */
      if (st().aFile && st().bFile && st().schemeId && !st().schemeApplied) {
        st().schemeApplied = true;
        applyScheme(st().schemeId);
        return;
      }
      App.render();
    }).catch(function (err) {
      UI.toast(err.message || '解析失败', 'bad', 5000, 'parse');
    });
  }

  function ensureMap(scope, sheetName) {
    var s = st();
    if (scope === 'a') {
      if (!s.aMap) s.aMap = { nameField: '', amountField: '', dateField: '', orderField: '', orderFields: [], extraFields: [] };
      if (!s.aMap.extraFields) s.aMap.extraFields = [];
      if (!s.aMap.orderField) s.aMap.orderField = '';
      if (!s.aMap.orderFields) s.aMap.orderFields = s.aMap.orderField ? [s.aMap.orderField] : [];
      return s.aMap;
    }
    if (!s.bMaps[sheetName]) s.bMaps[sheetName] = { nameField: '', amountField: '', dateField: '', orderField: '', logisticsCompany: '', extraFields: [] };
    if (!s.bMaps[sheetName].extraFields) s.bMaps[sheetName].extraFields = [];
    if (!s.bMaps[sheetName].orderField) s.bMaps[sheetName].orderField = '';
    if (s.bMaps[sheetName].logisticsCompany === undefined) s.bMaps[sheetName].logisticsCompany = '';
    return s.bMaps[sheetName];
  }

  function validate() {
    var s = st();
    var errs = [];
    if (!s.aMap || !s.aMap.nameField) errs.push('内部表还没选「门店名称字段」');
    if (!s.aMap || !s.aMap.amountField) errs.push('内部表还没选「订货金额字段」');
    if (s.aMap && s.aMap.nameField && s.aMap.amountField && s.aMap.nameField === s.aMap.amountField) {
      errs.push('内部表的门店名称字段和金额字段不能是同一列');
    }
    bSelectedSheets().forEach(function (sh) {
      var m = s.bMaps[sh.name] || {};
      if (!m.nameField) errs.push('外部表「' + sh.name + '」还没选门店名称字段');
    });
    return errs;
  }

  function doRun(btn) {
    var s = st();
    var errs = validate();
    if (errs.length) {
      UI.modal(
        '<div class="ck-modal-head">' +
          '<div style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:var(--warn-l);color:#b45309">' +
            UI.icon('alert') + '</div>' +
          '<div><h3>还差几步才能核对</h3><p>下面这些必须补齐：</p></div>' +
        '</div>' +
        '<div class="ck-modal-body"><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.9">' +
          errs.map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') +
        '</ul></div>' +
        '<div class="ck-modal-foot"><button class="ck-btn is-primary" data-close>知道了</button></div>'
      );
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ck-spin"></span> 正在核对…'; }

    setTimeout(function () {
      try {
        /* 模式自动选择：配了单号字段（A 订单单号[可多列] 或 任一 B 表物流单号）→ shipping 包邮发货核查；
           否则退回 threshold 门槛核验（向后兼容旧的外部表只有门店名的场景）。 */
        var hasOrderField = !!(s.aMap && (s.aMap.orderFields && s.aMap.orderFields.length || s.aMap.orderField)) ||
          bSelectedSheets().some(function (sh) { var m = s.bMaps[sh.name]; return m && m.orderField; });

        var input = {
          aFile: s.aFile,
          bFile: s.bFile,
          aSheets: s.aSheets,
          aMap: s.aMap,
          bSheets: bSelectedSheets().map(function (sh) {
            return { sheetName: sh.name, map: s.bMaps[sh.name] };
          }),
          mode: hasOrderField ? 'shipping' : 'threshold',
          threshold: curThreshold(),  /* 门槛只在规则配置里改，这里读当前值 */
          dateTolerance: Number(DB.getRules().dateTolerance) >= 0 ? Number(DB.getRules().dateTolerance) : 1,
          aliases: DB.listAliases(),
          overrides: s.overrides || {},
          autoThreshold: DB.getRules().autoThreshold,
          softThreshold: DB.getRules().softThreshold
        };

        var result = window.CKRecon.run(input);

        var title = (s.aFile.fileName.replace(/\.[^.]+$/, '')) + ' × ' + (s.bFile.fileName.replace(/\.[^.]+$/, ''));
        var meta = {
          title: title,
          mode: result.mode,
          threshold: result.threshold,
          dateTolerance: result.dateTolerance,
          aFileName: s.aFile.fileName,
          bFileName: s.bFile.fileName,
          aSheets: s.aSheets.slice(),
          bSheets: s.bSelected.slice(),
          aMap: U.clone(s.aMap),
          bMaps: U.clone(s.bMaps),
          at: Date.now()
        };

        var hist = DB.addHistory({
          title: title,
          mode: meta.mode,
          threshold: meta.threshold,
          dateTolerance: meta.dateTolerance,
          aFileName: meta.aFileName,
          bFileName: meta.bFileName,
          aSheets: meta.aSheets,
          bSheets: meta.bSheets,
          aMap: meta.aMap,
          bMaps: meta.bMaps,
          schemeId: s.schemeId,
          schemeName: s.schemeName,
          stats: result.stats,
          rows: result.rows || (result.rowsB || []),
          rowsB: result.rowsB || null,
          rowsA: result.rowsA || null,
          sheetStats: result.sheetStats || null,
          overrides: s.overrides,
          aliasesUsed: result.matchStats ? result.matchStats.alias : 0,
          elapsed: result.elapsed
        });
        meta.historyId = hist.id;

        /* 排序项跟着模式给一个合理的默认 */
        App.state.resultSort = 'gapDesc';

        App.setResult(result, meta);
        App.state.resultSaved = true;
        App.state.historyView = null;

        var countMsg = result.mode === 'shipping'
          ? result.rowsB.length + ' 条发货记录 / ' + result.rowsA.length + ' 条应包邮订单'
          : result.rows.length + ' 条记录';
        UI.toast('核对完成：' + countMsg + '，用时 ' + result.elapsed + 'ms', 'ok', 3200);
        /* 记住这一步：从结果页点回「新建核对」时停在第 3 步，方便改配置重跑 */
        st().stepOverride = 3;
        App.go('result');
      } catch (e) {
        console.error('[recon]', e);
        UI.toast('核对失败：' + (e && e.message || '未知错误'), 'bad', 5000);
        if (btn) { btn.disabled = false; btn.innerHTML = UI.icon('check') + '开始核对'; }
      }
    }, 40);
  }

  function applyRecommend(scope, sheetName) {
    var s = st();
    var sheet = null;
    if (scope === 'a') sheet = aSelectedSheets()[0];
    else sheet = bSelectedSheets().filter(function (x) { return x.name === sheetName; })[0];
    if (!sheet) return;
    var rec = recommend(sheet);
    var m = ensureMap(scope, sheetName);
    /* B 表不看金额（仓库发货表无金额列） */
    var skipAmount = (scope === 'b');
    if (rec.nameField && rec.nameField !== m.amountField) m.nameField = rec.nameField;
    if (rec.amountField && !skipAmount && rec.amountField !== m.nameField) m.amountField = rec.amountField;
    if (rec.dateField && rec.dateField !== m.nameField && rec.dateField !== m.amountField) m.dateField = rec.dateField;
    if (rec.orderField && rec.orderField !== m.nameField && rec.orderField !== m.amountField && rec.orderField !== m.dateField) m.orderField = rec.orderField;
    /* A 表多单号列：采用推荐时把识别到的品类列都填进 orderFields */
    if (scope === 'a' && rec.orderFields && rec.orderFields.length) {
      m.orderFields = rec.orderFields.filter(function (f) {
        return f !== m.nameField && f !== m.amountField && f !== m.dateField;
      });
      if (m.orderFields.length) m.orderField = m.orderFields[0];
    }
    UI.toast('已填入系统建议，请核对一眼再继续', 'ok', 2600, 'rec');
    App.render();
  }

  function applyToAll() {
    var s = st();
    var sheets = bSelectedSheets();
    var cur = sheets[Math.min(s.activeBIdx || 0, sheets.length - 1)];
    if (!cur) return;
    var src = s.bMaps[cur.name] || {};
    if (!src.nameField && !src.amountField) { UI.toast('当前这张表还没选字段', 'warn'); return; }

    var applied = 0, skipped = [];
    sheets.forEach(function (sh) {
      if (sh.name === cur.name) return;
      var m = ensureMap('b', sh.name);
      if (sh.headers.indexOf(src.nameField) >= 0) m.nameField = src.nameField;
      else skipped.push(sh.name);
      if (sh.headers.indexOf(src.amountField) >= 0) m.amountField = src.amountField;
      if (src.dateField && sh.headers.indexOf(src.dateField) >= 0) m.dateField = src.dateField;
      if (src.orderField && sh.headers.indexOf(src.orderField) >= 0) m.orderField = src.orderField;
      m.extraFields = (src.extraFields || []).filter(function (f) { return sh.headers.indexOf(f) >= 0; });
      applied++;
    });
    UI.toast('已应用到 ' + applied + ' 张表' + (skipped.length ? '（' + skipped.length + ' 张没有同名列，请单独确认）' : ''), skipped.length ? 'warn' : 'ok', 3600);
    App.render();
  }

  function saveScheme() {
    var s = st();
    UI.prompt({
      title: '保存为核对方案',
      desc: '下次上传同类文件时可以直接套用这套字段配置。',
      label: '方案名称',
      value: s.schemeName || (s.bFile ? s.bFile.fileName.replace(/\.[^.]+$/, '') + ' 核对' : '新方案'),
      placeholder: '例如：物流月度核对'
    }).then(function (name) {
      if (!name) return;
      var scheme = {
        id: s.schemeId || null,
        name: name,
        aMap: U.clone(s.aMap),
        bMaps: U.clone(s.bMaps),
        aSheets: s.aSheets.slice(),
        bSelected: s.bSelected.slice(),
        mode: 'threshold',
        threshold: curThreshold(),
        note: ''
      };
      var saved = DB.saveScheme(scheme);
      s.schemeId = saved.id;
      s.schemeName = saved.name;
      DB.setPref('lastSchemeId', saved.id);
      UI.toast('方案已保存：' + name, 'ok');
    });
  }

  /* ---------------- 套用方案 ----------------
     之前只能「保存为方案」却没有入口套用 —— 等于白存。
     这里按列名智能匹配：方案里的字段在当前文件里存在才填入，
     对不上的跳过并列出来，绝不瞎填。 */

  function openSchemePicker() {
    var schemes = DB.listSchemes();
    var s = st();
    var head = '<div class="ck-modal-head">' +
      '<div style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:var(--brand-l);color:var(--brand-d)">' +
        UI.icon('books') + '</div>' +
      '<div><h3>套用核对方案</h3><p>按列名匹配填入，对不上的列会跳过</p></div></div>';

    if (!schemes.length) {
      UI.modal(head +
        '<div class="ck-modal-body"><div class="ck-small ck-muted" style="line-height:1.8">' +
          '还没有保存过方案。先把字段配置好，点「保存为方案」，下次上传同类文件就能一键套用。</div></div>' +
        '<div class="ck-modal-foot"><button class="ck-btn is-primary" data-close>知道了</button></div>');
      return;
    }

    var rows = schemes.map(function (sc) {
      var bCount = sc.bMaps ? Object.keys(sc.bMaps).length : 0;
      return '<div class="ck-recent-item" style="padding:11px 14px">' +
        '<div class="ck-recent-main">' +
          '<div class="ck-recent-title">' + U.esc(sc.name) +
            (s.schemeId === sc.id ? ' <span class="ck-tag is-ok">当前</span>' : '') + '</div>' +
          '<div class="ck-recent-sub">' +
            '内部表门店 = ' + U.esc((sc.aMap && sc.aMap.nameField) || '未设') +
            (sc.aMap && sc.aMap.amountField ? ' · 金额 = ' + U.esc(sc.aMap.amountField) : '') +
            (sc.aMap && sc.aMap.dateField ? ' · 日期 = ' + U.esc(sc.aMap.dateField) : '') +
            (bCount ? ' · ' + bCount + ' 张外部表配置' : '') +
            (sc.lastUsedAt ? ' · 上次使用 ' + U.fmtRelTime(sc.lastUsedAt) : '') + '</div>' +
        '</div>' +
        '<button class="ck-btn is-sm is-soft" data-use-scheme="' + U.esc(sc.id) + '">套用</button>' +
      '</div>';
    }).join('');

    var m = UI.modal(head +
      '<div class="ck-modal-body">' + rows + '</div>' +
      '<div class="ck-modal-foot"><button class="ck-btn" data-close>取消</button></div>');

    m.el.querySelectorAll('[data-use-scheme]').forEach(function (b) {
      b.onclick = function () {
        m.close();
        applyScheme(b.getAttribute('data-use-scheme'));
      };
    });
  }

  function applyScheme(id) {
    var s = st();
    var sc = DB.getScheme(id);
    if (!sc) { UI.toast('这个方案已经不存在了', 'warn'); return; }
    if (!s.aFile) { UI.toast('先上传内部表和外部表，再套用方案', 'warn'); return; }

    var applied = 0;
    var missed = [];

    /* 工作表勾选：方案勾过、当前文件里也有 → 恢复勾选 */
    if (Array.isArray(sc.aSheets) && sc.aSheets.length && s.aFile) {
      var aNames = s.aFile.sheets.map(function (x) { return x.name; });
      var pickA = sc.aSheets.filter(function (n) { return aNames.indexOf(n) >= 0; });
      if (pickA.length) s.aSheets = pickA;
    }
    if (Array.isArray(sc.bSelected) && sc.bSelected.length && s.bFile) {
      var bNames = s.bFile.sheets.map(function (x) { return x.name; });
      var pickB = sc.bSelected.filter(function (n) { return bNames.indexOf(n) >= 0; });
      if (pickB.length) s.bSelected = pickB;
      s.activeBIdx = 0;
    }

    /* 内部表字段 */
    var aSheets = aSelectedSheets();
    if (sc.aMap && aSheets.length) {
      var aCols = colsOf(aSheets).map(function (c) { return c.name; });
      var am = ensureMap('a', '');
      ['nameField', 'amountField', 'dateField', 'orderField'].forEach(function (f) {
        var v = sc.aMap[f];
        if (!v) return;
        if (aCols.indexOf(v) >= 0) { am[f] = v; applied++; }
        else missed.push('内部表没有「' + v + '」列');
      });
      /* 还原多单号列（常温/冻品等） */
      var scOrderFields = (sc.aMap.orderFields || (sc.aMap.orderField ? [sc.aMap.orderField] : []));
      am.orderFields = scOrderFields.filter(function (f) { return aCols.indexOf(f) >= 0; });
      if (am.orderFields.length && !am.orderField) am.orderField = am.orderFields[0];
      am.extraFields = (sc.aMap.extraFields || []).filter(function (f) { return aCols.indexOf(f) >= 0; });
    }

    /* 外部表字段：按 Sheet 名对应，Sheet 名对不上就按列名尽量填 */
    bSelectedSheets().forEach(function (sh) {
      var sm = sc.bMaps && sc.bMaps[sh.name];
      if (!sm) return;
      var m = ensureMap('b', sh.name);
      ['nameField', 'amountField', 'dateField', 'orderField'].forEach(function (f) {
        var v = sm[f];
        if (!v) return;
        if (sh.headers.indexOf(v) >= 0) { m[f] = v; applied++; }
        else missed.push('「' + sh.name + '」没有「' + v + '」列');
      });
      if (sm.logisticsCompany) m.logisticsCompany = sm.logisticsCompany;
      m.extraFields = (sm.extraFields || []).filter(function (f) { return sh.headers.indexOf(f) >= 0; });
    });

    s.schemeId = sc.id;
    s.schemeName = sc.name;
    DB.touchScheme(sc.id);
    DB.setPref('lastSchemeId', sc.id);

    if (applied) {
      UI.toast('已套用「' + sc.name + '」：填入 ' + applied + ' 项配置' +
        (missed.length ? '，' + missed.length + ' 项列名对不上已跳过' : ''), missed.length ? 'warn' : 'ok', 4200);
    } else {
      UI.toast('「' + sc.name + '」里的列名在当前文件里一个都没对上，请手动配置', 'warn', 5000);
    }
    App.render();
  }

  /* ---------------- 绑定 ---------------- */

  function bind(el) {
    /* 文件选择 */
    el.querySelectorAll('input[data-file]').forEach(function (inp) {
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (f) loadFile(inp.getAttribute('data-file'), f);
        inp.value = '';
      };
    });

    /* 拖拽 */
    el.querySelectorAll('[data-drop]').forEach(function (box) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('is-over'); });
      });
      box.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFile(box.getAttribute('data-drop'), f);
      });
    });

    /* 重新选择 */
    el.querySelectorAll('[data-reset]').forEach(function (b) {
      b.onclick = function () {
        var slot = b.getAttribute('data-reset');
        if (slot === 'a') { st().aFile = null; st().aSheets = []; st().aMap = null; }
        else { st().bFile = null; st().bSelected = []; st().bMaps = {}; }
        st().stepOverride = null;
        App.render();
      };
    });

    /* 步骤跳转 */
    var acts = {
      toStep1: function () { st().stepOverride = 1; App.render({ toTop: true }); },
      toStep2: function () { st().stepOverride = 2; App.render({ toTop: true }); },
      toStep3: function () {
        var s = st();
        if (!s.aSheets.length) { UI.toast('内部表还没选工作表', 'warn'); return; }
        if (!s.bSelected.length) { UI.toast('外部表至少选一张工作表', 'warn'); return; }
        s.stepOverride = 3;
        App.render({ toTop: true });
      },
      run: function (btn) { doRun(btn); },
      saveScheme: function () { saveScheme(); },
      pickScheme: function () { openSchemePicker(); },
      applyAll: function () { applyToAll(); }
    };
    el.querySelectorAll('[data-act]').forEach(function (b) {
      var fn = acts[b.getAttribute('data-act')];
      if (fn) b.onclick = function () { fn(b); };
    });

    /* Sheet 勾选卡片 */
    el.querySelectorAll('.ck-sheet').forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.tagName === 'INPUT') return;
        var name = card.getAttribute('data-sheet');
        var side = card.getAttribute('data-side');
        var arr = side === 'a' ? st().aSheets : st().bSelected;
        var i = arr.indexOf(name);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(name);
        App.render();
      };
    });

    /* 快捷选择 */
    /* 一键全选 / 取消全选 / 只选明细 —— 「全选」只包含有数据的表，
       空白表和说明表勾上没有任何意义，还会让「已选 N 张」变得难看 */
    el.querySelectorAll('[data-pick-a]').forEach(function (b) {
      b.onclick = function () {
        var mode = b.getAttribute('data-pick-a');
        var sheets = st().aFile.sheets.filter(function (x) { return x.dataRowCount > 0; });
        if (mode === 'none') st().aSheets = [];
        else if (mode === 'detail') st().aSheets = sheets.filter(function (x) { return x.kind === 'detail'; }).map(function (x) { return x.name; });
        else st().aSheets = sheets.map(function (x) { return x.name; });
        App.render();
      };
    });
    el.querySelectorAll('[data-pick-b]').forEach(function (b) {
      b.onclick = function () {
        var mode = b.getAttribute('data-pick-b');
        var sheets = st().bFile.sheets;
        if (mode === 'none') st().bSelected = [];
        else if (mode === 'detail') st().bSelected = sheets.filter(function (x) { return x.kind === 'detail'; }).map(function (x) { return x.name; });
        else st().bSelected = sheets.filter(function (x) { return x.dataRowCount > 0; }).map(function (x) { return x.name; });
        App.render();
      };
    });

    /* 字段下拉 */
    el.querySelectorAll('select[data-key]').forEach(function (sel) {
      sel.onchange = function () {
        var scope = sel.getAttribute('data-scope');
        var sheet = sel.getAttribute('data-sheet');
        var key = sel.getAttribute('data-key');
        var m = ensureMap(scope, sheet);
        m[key] = sel.value || '';
        /* 选完把黄框去掉，不整页重绘以免丢焦点 */
        sel.classList.toggle('is-warn', !sel.value);
      };
    });

    /* 文本输入字段（物流公司显示名等） */
    el.querySelectorAll('input[data-input-key]').forEach(function (inp) {
      inp.oninput = function () {
        var scope = inp.getAttribute('data-scope');
        var sheet = inp.getAttribute('data-sheet');
        var key = inp.getAttribute('data-key');
        var m = ensureMap(scope, sheet);
        m[key] = inp.value || '';
      };
    });

    /* 采用推荐 */
    el.querySelectorAll('[data-use-rec]').forEach(function (b) {
      b.onclick = function () { applyRecommend(b.getAttribute('data-use-rec'), b.getAttribute('data-sheet')); };
    });

    /* 添加/移除其他字段 */
    el.querySelectorAll('[data-add-extra]').forEach(function (b) {
      b.onclick = function () {
        var scope = b.getAttribute('data-add-extra');
        var sheet = b.getAttribute('data-sheet');
        var pick = null;
        el.querySelectorAll('select[data-extra-pick]').forEach(function (s2) {
          if (s2.getAttribute('data-extra-pick') === scope && s2.getAttribute('data-sheet') === sheet) pick = s2;
        });
        if (!pick || !pick.value) { UI.toast('先选一个字段', 'warn'); return; }
        var m = ensureMap(scope, sheet);
        if (m.extraFields.indexOf(pick.value) < 0) m.extraFields.push(pick.value);
        App.render();
      };
    });
    el.querySelectorAll('[data-rm-extra]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var scope = b.getAttribute('data-scope');
        var sheet = b.getAttribute('data-sheet');
        var f = b.getAttribute('data-rm-extra');
        var m = ensureMap(scope, sheet);
        m.extraFields = m.extraFields.filter(function (x) { return x !== f; });
        App.render();
      };
    });

    /* 添加/移除 A 表多单号列（常温/冻品等） */
    el.querySelectorAll('[data-add-order]').forEach(function (b) {
      b.onclick = function () {
        var scope = b.getAttribute('data-add-order');
        var sheet = b.getAttribute('data-sheet');
        var pick = null;
        el.querySelectorAll('select[data-order-pick]').forEach(function (s2) {
          if (s2.getAttribute('data-order-pick') === scope && s2.getAttribute('data-sheet') === sheet) pick = s2;
        });
        if (!pick || !pick.value) { UI.toast('先选一个单号列', 'warn'); return; }
        var m = ensureMap(scope, sheet);
        if (!m.orderFields) m.orderFields = [];
        if (m.orderFields.indexOf(pick.value) < 0) m.orderFields.push(pick.value);
        if (!m.orderField) m.orderField = pick.value;
        App.render();
      };
    });
    el.querySelectorAll('[data-rm-order]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var scope = b.getAttribute('data-scope');
        var sheet = b.getAttribute('data-sheet');
        var f = b.getAttribute('data-rm-order');
        var m = ensureMap(scope, sheet);
        if (m.orderFields) {
          m.orderFields = m.orderFields.filter(function (x) { return x !== f; });
          if (m.orderField === f) m.orderField = m.orderFields[0] || '';
        }
        App.render();
      };
    });

    /* Sheet tab */
    el.querySelectorAll('[data-btab]').forEach(function (b) {
      b.onclick = function () {
        st().activeBIdx = Number(b.getAttribute('data-btab'));
        App.render();
      };
    });

    /* 门槛在规则配置页改，这里只留个入口 */
    var goRules = el.querySelector('[data-act="goRules"]');
    if (goRules) goRules.onclick = function () { App.go('rules'); };
  }

  window.CKPages['new'] = {
    title: function () { return '新建核对'; },
    subtitle: function () {
      var s = st();
      if (!s.aFile || !s.bFile) return '上传内部表（订货明细）和外部表（这次要核实包邮的门店）';
      return '已读取 ' + (s.aFile.sheets.length + s.bFile.sheets.length) + ' 张工作表，正在配置核对规则';
    },
    topActions: function () {
      var s = st();
      if (!s.aFile && !s.bFile) return '';
      return '<button class="ck-btn is-sm" data-top="reset">' + UI.icon('refresh') + '全部重来</button>';
    },
    render: function () {
      return stepsHtml() + '<div id="ckStepBody">' + bodyHtml() + '</div>';
    },
    mount: function (el) {
      bind(el);
      var reset = document.querySelector('[data-top="reset"]');
      if (reset) {
        reset.onclick = function () {
          UI.confirm({ title: '清空当前配置？', desc: '已上传的文件和字段配置会被清掉，已保存的方案和匹配库不受影响。', okText: '清空', danger: true })
            .then(function (ok) { if (ok) { App.resetNew(); App.render(); } });
        };
      }
    }
  };
})();
