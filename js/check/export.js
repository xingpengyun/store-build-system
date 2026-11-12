/* ==========================================================
   export.js — Excel 报告导出
   ----------------------------------------------------------
   报告结构按需求「十、Excel 报告导出」的七项来：
     01 核对汇总 / 02 全部明细 / 03 金额差异 / 04 未匹配
     05 重复数据 / 06 人工确认 / 07 各 Sheet 独立结果
   金额一律写成数字（不写字符串），这样接收方还能继续算 sum。
   ========================================================== */
window.CKExport = (function () {
  'use strict';

  var U = window.CKUtil;

  var STATUS_TEXT = {
    /* 门槛核验 */
    pass: '达标',
    fail: '未达标',
    /* 金额对账 */
    ok: '金额一致',
    diff: '金额差异',
    confirm: '待人工确认',
    'unmatched-a': '清单外（内部表有、外部表无）',
    'unmatched-b': '仓库未对应（外部表有、内部表无）',
    dup: '重复数据'
  };

  function methodText(m) {
    return m === 'alias' ? '门店库'
      : m === 'exact' ? '精确'
      : m === 'contains' ? '包含'
      : m === 'fuzzy' ? '相似' : '';
  }

  var DETAIL_HEAD = [
    '门店标准名称', '内部表原始名称', '外部表原始名称',
    '内部表金额', '外部表金额', '差额(外部−内部)', '核对状态',
    '所属Sheet', '内部表行号', '外部表行号', '对应关系',
    '重复标记', '匹配方式', '匹配得分', '异常备注'
  ];

  function statusText(r) {
    if (r.manual && r.manual.confirmed) {
      return r.manual.label ? ('已确认：' + r.manual.label) : '已确认';
    }
    if (r.status === 'pass' && r.notInB) return '清单外（内部表有、外部表无）';
    return STATUS_TEXT[r.status] || r.status;
  }

  function detailRow(r) {
    return [
      r.storeName,
      r.aRawName,
      r.bRawName,
      typeof r.aAmount === 'number' ? r.aAmount : null,
      typeof r.bAmount === 'number' ? r.bAmount : null,
      typeof r.diff === 'number' ? r.diff : null,
      statusText(r),
      r.sheet,
      (r.aRowNums || []).join(','),
      (r.bRowNums || []).join(','),
      r.pairType || '',
      r.isDup ? '疑似重复' : '',
      methodText(r.matchMethod),
      r.matchScore ? Math.round(r.matchScore * 100) + '%' : '',
      r.note || ''
    ];
  }

  function sheetFromAoa(aoa, widths) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    if (widths) ws['!cols'] = widths.map(function (w) { return { wch: w }; });
    /* 金额列格式：保留两位小数（只是显示，值仍是数字） */
    return ws;
  }

  function build(result, meta) {
    meta = meta || {};
    var mode = meta.mode || (result && result.mode) || '';
    if (mode === 'shipping') return buildShipping(result, meta);
    var isThr = mode === 'threshold' || (result && result.mode === 'threshold');
    return isThr ? buildThreshold(result, meta) : buildRecon(result, meta);
  }

  /* ---------------- 金额对账模式报告 ---------------- */
  function buildRecon(result, meta) {
    var wb = XLSX.utils.book_new();
    var rows = result.rows || [];
    var stats = result.stats || {};

    /* ---- 01 汇总 ---- */
    var sum = [];
    sum.push(['Excel 内部表 × 外部表 核对报告']);
    sum.push([]);
    sum.push(['生成时间', U.fmtDateTime(Date.now())]);
    sum.push(['核对任务', meta.title || '未命名核对']);
    sum.push(['内部表文件', meta.aFileName || '']);
    sum.push(['外部表文件', meta.bFileName || '']);
    sum.push(['内部表参与 Sheet', (meta.aSheets || []).join('、')]);
    sum.push(['外部表参与 Sheet', (meta.bSheets || []).join('、')]);
    sum.push(['内部表字段', '门店：' + (meta.aMap && meta.aMap.nameField || '') + ' / 金额：' + (meta.aMap && meta.aMap.amountField || '')]);
    sum.push(['金额允许误差', '±' + U.fmtMoney(meta.tolerance || 0)]);
    sum.push(['跨 Sheet 处理', meta.mergeSheets ? '已按用户确认合并计算' : '各 Sheet 独立比对（不累加）']);
    sum.push([]);
    sum.push(['统计项', '数值']);
    sum.push(['总门店数（去重）', stats.stores || 0]);
    sum.push(['核对行数', stats.total || 0]);
    sum.push(['已匹配门店', stats.matched || 0]);
    sum.push(['金额一致', stats.amountOk || 0]);
    sum.push(['金额差异', stats.amountDiff || 0]);
    sum.push(['未匹配', stats.unmatched || 0]);
    sum.push(['—— 其中 内部表有 外部表无', stats.unmatchedA || 0]);
    sum.push(['—— 其中 外部表有 内部表无', stats.unmatchedB || 0]);
    sum.push(['待人工确认', stats.needConfirm || 0]);
    sum.push(['疑似重复', stats.dup || 0]);
    sum.push([]);
    sum.push(['内部表金额合计', stats.aTotal || 0]);
    sum.push(['外部表金额合计', stats.bTotal || 0]);
    sum.push(['差额合计（B-A）', stats.diffSum || 0]);
    sum.push(['差异绝对值合计', stats.diffAbsSum || 0]);
    sum.push([]);
    sum.push(['说明', '本报告由程序按确定逻辑计算，未修改任何原始数据。']);
    sum.push(['说明', '差额 = 外部表金额 − 内部表金额；金额差异未累加跨 Sheet 数据，除非用户显式确认合并。']);
    wb.SheetNames.push('01 核对汇总');
    wb.Sheets['01 核对汇总'] = sheetFromAoa(sum, [24, 62]);

    /* ---- 07 各 Sheet 独立结果（先算，汇总区放前面） ---- */
    var bySheet = {};
    rows.forEach(function (r) {
      var list = r.sheets && r.sheets.length ? r.sheets : [r.sheet];
      /* 合并行只计入第一个 sheet 的统计，避免重复计数 */
      var key = r.multiSheet && list.length > 1 ? list.join(' + ') : list[0];
      if (!bySheet[key]) bySheet[key] = { rows: [], ok: 0, diff: 0, confirm: 0, miss: 0, dup: 0, aSum: 0, bSum: 0, diffSum: 0 };
      var s = bySheet[key];
      s.rows.push(r);
      if (r.status === 'ok') s.ok++;
      else if (r.status === 'diff') s.diff++;
      else if (r.status === 'confirm') s.confirm++;
      else if (r.status === 'unmatched-a' || r.status === 'unmatched-b') s.miss++;
      if (r.isDup) s.dup++;
      if (typeof r.aAmount === 'number') s.aSum += r.aAmount;
      if (typeof r.bAmount === 'number') s.bSum += r.bAmount;
      if (typeof r.diff === 'number') s.diffSum += r.diff;
    });

    /* ---- 02 全部明细 ---- */
    var all = [DETAIL_HEAD];
    rows.forEach(function (r) { all.push(detailRow(r)); });
    wb.SheetNames.push('02 全部明细');
    wb.Sheets['02 全部明细'] = sheetFromAoa(all, [22, 22, 26, 14, 14, 14, 15, 14, 12, 12, 10, 10, 10, 9, 40]);

    /* ---- 03 金额差异 ---- */
    var diffs = [DETAIL_HEAD];
    rows.filter(function (r) { return r.status === 'diff'; })
      .sort(function (a, b) { return Math.abs(b.diff || 0) - Math.abs(a.diff || 0); })
      .forEach(function (r) { diffs.push(detailRow(r)); });
    if (diffs.length === 1) diffs.push(['没有金额差异记录']);
    wb.SheetNames.push('03 金额差异');
    wb.Sheets['03 金额差异'] = sheetFromAoa(diffs, [22, 22, 26, 14, 14, 14, 15, 14, 12, 12, 10, 10, 10, 9, 40]);

    /* ---- 04 未匹配 ---- */
    var miss = [DETAIL_HEAD];
    rows.filter(function (r) { return r.status === 'unmatched-a' || r.status === 'unmatched-b'; })
      .forEach(function (r) { miss.push(detailRow(r)); });
    if (miss.length === 1) miss.push(['没有未匹配门店']);
    wb.SheetNames.push('04 未匹配门店');
    wb.Sheets['04 未匹配门店'] = sheetFromAoa(miss, [22, 22, 26, 14, 14, 14, 15, 14, 12, 12, 10, 10, 10, 9, 40]);

    /* ---- 05 重复数据 ---- */
    var dups = [['门店标准名称', '所属Sheet', '重复类型', '涉及行号', '金额', '行数', '说明']];
    rows.filter(function (r) { return r.isDup; }).forEach(function (r) {
      var info = r.dupInfo || {};
      (info.exact || []).forEach(function (grp) {
        dups.push([
          r.storeName, r.sheet, '完全相同', grp.map(function (x) { return x.rowNum; }).join(','),
          info.exact && info.exact[0] ? (grp[0].amount === null ? null : grp[0].amount) : null,
          grp.length, '门店、金额、日期及其它字段完全一致'
        ]);
      });
      (info.sameAmount || []).forEach(function (grp) {
        var sameAsExact = (info.exact || []).some(function (g) {
          return g.length === grp.length && g[0] && grp[0] && g[0].rowNum === grp[0].rowNum;
        });
        if (sameAsExact) return;
        dups.push([
          r.storeName, r.sheet, '金额相同', grp.map(function (x) { return x.rowNum; }).join(','),
          grp[0].amount === null ? null : grp[0].amount,
          grp.length, '金额相同但其它字段有差异，可能是两笔正常业务，也可能是重复录入'
        ]);
      });
    });
    if (dups.length === 1) dups.push(['没有发现重复数据']);
    wb.SheetNames.push('05 重复数据');
    wb.Sheets['05 重复数据'] = sheetFromAoa(dups, [22, 14, 12, 20, 14, 8, 46]);

    /* ---- 06 人工确认记录 ---- */
    var manual = [['门店标准名称', '内部表原始名称', '外部表原始名称', '处理动作', '原因备注', '内部表金额', '外部表金额', '差额', '所属Sheet', '处理时间']];
    rows.filter(function (r) { return r.manual && (r.manual.confirmed || r.manual.label); }).forEach(function (r) {
      manual.push([
        r.storeName, r.aRawName, r.bRawName,
        r.manual.confirmed ? '已确认' : '已标记',
        r.manual.note || r.manual.label || '',
        typeof r.aAmount === 'number' ? r.aAmount : null,
        typeof r.bAmount === 'number' ? r.bAmount : null,
        typeof r.diff === 'number' ? r.diff : null,
        r.sheet,
        r.manual.at ? U.fmtDateTime(r.manual.at) : ''
      ]);
    });
    if (manual.length === 1) manual.push(['本次没有人工处理记录']);
    wb.SheetNames.push('06 人工确认');
    wb.Sheets['06 人工确认'] = sheetFromAoa(manual, [22, 22, 26, 12, 32, 14, 14, 14, 14, 18]);

    /* ---- 07 各 Sheet 独立结果 ---- */
    var perSheet = [['Sheet', '核对行数', '金额一致', '金额差异', '待确认', '未匹配', '疑似重复', '内部表金额合计', '外部表金额合计', '差额合计']];
    Object.keys(bySheet).forEach(function (k) {
      var s = bySheet[k];
      perSheet.push([k, s.rows.length, s.ok, s.diff, s.confirm, s.miss, s.dup,
        Math.round(s.aSum * 100) / 100, Math.round(s.bSum * 100) / 100, Math.round(s.diffSum * 100) / 100]);
    });
    perSheet.push([]);
    perSheet.push(['下面按 Sheet 逐个列出明细']);
    Object.keys(bySheet).forEach(function (k) {
      perSheet.push([]);
      perSheet.push(['Sheet：' + k]);
      perSheet.push(DETAIL_HEAD);
      bySheet[k].rows.forEach(function (r) { perSheet.push(detailRow(r)); });
    });
    wb.SheetNames.push('07 各Sheet结果');
    wb.Sheets['07 各Sheet结果'] = sheetFromAoa(perSheet, [22, 12, 12, 12, 10, 10, 10, 16, 16, 14]);

    return wb;
  }

  /* ---------------- 门槛核验模式报告 ----------------
     报告只回答一个问题：外部表里的门店，订货金额够不够门槛。
     所以没有「差额」「未匹配（内部表独有）」这些对账概念的列。 */
  function buildThreshold(result, meta) {
    var wb = XLSX.utils.book_new();
    var rows = result.rows || [];
    var stats = result.stats || {};
    var threshold = typeof meta.threshold === 'number' ? meta.threshold
      : (typeof result.threshold === 'number' ? result.threshold : 16000);

    var HEAD = ['门店标准名称', '内部表原始名称', '外部表原始名称',
      '内部表订货金额', '门槛', '与门槛差', '核验状态',
      '所属Sheet', '内部表行号', '外部表行号', '重复标记', '匹配方式', '匹配得分', '异常备注'];
    var WIDTH = [22, 22, 26, 16, 12, 14, 14, 16, 12, 12, 10, 10, 9, 40];

    function rowOf(r) {
      return [
        r.storeName,
        r.aRawName,
        r.bRawName,
        typeof r.aAmount === 'number' ? r.aAmount : null,
        typeof r.threshold === 'number' ? r.threshold : threshold,
        typeof r.gap === 'number' ? r.gap : null,
        statusText(r),
        r.sheet,
        (r.aRowNums || []).join(','),
        (r.bRowNums || []).join(','),
        r.isDup ? '重复登记' : '',
        methodText(r.matchMethod),
        r.matchScore ? Math.round(r.matchScore * 100) + '%' : '',
        r.note || ''
      ];
    }

    /* ---- 01 汇总 ---- */
    var sum = [];
    sum.push(['Excel 门店包邮门槛核验报告']);
    sum.push([]);
    sum.push(['生成时间', U.fmtDateTime(Date.now())]);
    sum.push(['核对任务', meta.title || '未命名核对']);
    sum.push(['核对模式', '门槛核验']);
    sum.push(['订货金额门槛', '≥ ' + U.fmtThreshold(threshold) + ' 元（含等于）算达标']);
    sum.push(['内部表文件', meta.aFileName || '']);
    sum.push(['外部表文件', meta.bFileName || '']);
    sum.push(['内部表参与 Sheet', (meta.aSheets || []).join('、')]);
    sum.push(['外部表参与 Sheet', (meta.bSheets || []).join('、')]);
    sum.push(['内部表字段', '门店：' + (meta.aMap && meta.aMap.nameField || '') +
      ' / 金额：' + (meta.aMap && meta.aMap.amountField || '')]);
    sum.push([]);
    sum.push(['统计项', '数值']);
    sum.push(['参与核验记录数（A 表原始行数）', stats.total || 0]);
    sum.push(['达标（订货笔数，含重复）', stats.pass || 0]);
    sum.push(['未达标', stats.fail || 0]);
    sum.push(['仓库未对应（外部表有、内部表无）', stats.unmatchedB || 0]);
    sum.push(['待人工确认', stats.needConfirm || 0]);
    sum.push(['外部表重复登记', stats.dup || 0]);
    sum.push(['已人工处理', stats.manual || 0]);
    sum.push(['达标率（达标笔数 / A 表行数）', (stats.passRate || 0) + '%']);
    sum.push([]);
    sum.push(['达标订货金额合计', stats.passAmount || 0]);
    sum.push(['未达标订货金额合计', stats.failAmount || 0]);
    sum.push(['距门槛合计还差', stats.shortSum || 0]);
    sum.push([]);
    sum.push(['清单外（内部表订够、外部表没有）', (stats.aOnly || 0) + ' 笔']);
    sum.push(['—— 这些订货的金额合计', stats.aOnlyAmount || 0]);
    sum.push([]);
    sum.push(['说明', '本报告由程序按确定逻辑计算，未修改任何原始数据。']);
    sum.push(['说明', '判定规则：以内部表（订货明细）为主，每一笔满足门槛的订货单独一行（含重复）。']);
    sum.push(['说明', '内部表订够门槛、外部表清单没有的门店 → 「清单外」；外部表有、内部表没有 → 「仓库未对应」，均在明细里单独列出。']);
    wb.SheetNames.push('01 核验汇总');
    wb.Sheets['01 核验汇总'] = sheetFromAoa(sum, [30, 62]);

    /* 各 Sheet 统计 */
    var bySheet = {};
    rows.forEach(function (r) {
      var key = (r.sheets && r.sheets.length) ? r.sheets.join(' + ') : (r.sheet || '');
      if (!bySheet[key]) bySheet[key] = { rows: [], pass: 0, fail: 0, confirm: 0, miss: 0, dup: 0, passAmt: 0, failAmt: 0 };
      var s = bySheet[key];
      s.rows.push(r);
      if (r.status === 'pass') { s.pass++; if (typeof r.aAmount === 'number') s.passAmt += r.aAmount; }
      else if (r.status === 'fail') { s.fail++; if (typeof r.aAmount === 'number') s.failAmt += r.aAmount; }
      else if (r.status === 'confirm') s.confirm++;
      else if (r.status === 'unmatched-b') s.miss++;
      if (r.isDup) s.dup++;
    });

    /* ---- 02 全部明细 ---- */
    var all = [HEAD];
    rows.forEach(function (r) { all.push(rowOf(r)); });
    wb.SheetNames.push('02 全部明细');
    wb.Sheets['02 全部明细'] = sheetFromAoa(all, WIDTH);

    /* ---- 03 未达标 ---- */
    var fails = [HEAD];
    rows.filter(function (r) { return r.status === 'fail'; })
      .sort(function (a, b) { return (a.gap || 0) - (b.gap || 0); })
      .forEach(function (r) { fails.push(rowOf(r)); });
    if (fails.length === 1) fails.push(['没有未达标门店']);
    wb.SheetNames.push('03 未达标门店');
    wb.Sheets['03 未达标门店'] = sheetFromAoa(fails, WIDTH);

    /* ---- 04 仓库未对应 ---- */
    var miss = [HEAD];
    rows.filter(function (r) { return r.status === 'unmatched-b'; })
      .forEach(function (r) { miss.push(rowOf(r)); });
    if (miss.length === 1) miss.push(['外部表里的门店在内部表都能找到']);
    wb.SheetNames.push('04 仓库未对应');
    wb.Sheets['04 仓库未对应'] = sheetFromAoa(miss, WIDTH);

    /* ---- 05 重复登记 ---- */
    var dups = [['门店标准名称', '所属Sheet', '外部表行号', '重复行数', '说明']];
    rows.filter(function (r) { return r.isDup; }).forEach(function (r) {
      dups.push([r.storeName, r.sheet, (r.bRowNums || []).join(','),
        (r.bRows || []).length, '这家门店在外部表里出现了多次，核验结论按一次计算；请确认清单是否重复登记']);
    });
    if (dups.length === 1) dups.push(['没有重复登记的门店']);
    wb.SheetNames.push('05 重复登记');
    wb.Sheets['05 重复登记'] = sheetFromAoa(dups, [22, 18, 22, 12, 52]);

    /* ---- 06 人工确认 ---- */
    var manual = [['门店标准名称', '内部表原始名称', '外部表原始名称', '处理动作', '原因备注', '内部表订货金额', '门槛', '与门槛差', '核验状态', '所属Sheet', '处理时间']];
    rows.filter(function (r) { return r.manual && (r.manual.confirmed || r.manual.label); }).forEach(function (r) {
      manual.push([
        r.storeName, r.aRawName, r.bRawName,
        r.manual.confirmed ? '已确认' : '已标记',
        r.manual.note || r.manual.label || '',
        typeof r.aAmount === 'number' ? r.aAmount : null,
        typeof r.threshold === 'number' ? r.threshold : threshold,
        typeof r.gap === 'number' ? r.gap : null,
        statusText(r),
        r.sheet,
        r.manual.at ? U.fmtDateTime(r.manual.at) : ''
      ]);
    });
    if (manual.length === 1) manual.push(['本次没有人工处理记录']);
    wb.SheetNames.push('06 人工确认');
    wb.Sheets['06 人工确认'] = sheetFromAoa(manual, [22, 22, 26, 12, 32, 16, 12, 14, 14, 16, 18]);

    /* ---- 07 各Sheet结果 ---- */
    var perSheet = [['Sheet', '核验门店数', '达标', '未达标', '待确认', '未找到', '重复登记', '达标金额合计', '未达标金额合计']];
    Object.keys(bySheet).forEach(function (k) {
      var s = bySheet[k];
      perSheet.push([k, s.rows.length, s.pass, s.fail, s.confirm, s.miss, s.dup,
        Math.round(s.passAmt * 100) / 100, Math.round(s.failAmt * 100) / 100]);
    });
    perSheet.push([]);
    perSheet.push(['下面按 Sheet 逐个列出明细']);
    Object.keys(bySheet).forEach(function (k) {
      perSheet.push([]);
      perSheet.push(['Sheet：' + k]);
      perSheet.push(HEAD);
      bySheet[k].rows.forEach(function (r) { perSheet.push(rowOf(r)); });
    });
    wb.SheetNames.push('07 各Sheet结果');
    wb.Sheets['07 各Sheet结果'] = sheetFromAoa(perSheet, [22, 12, 10, 10, 10, 10, 10, 16, 18]);

    return wb;
  }

  /* ---------------- shipping 包邮发货核查报告 ----------------
     报告回答：仓库登记的包邮发货是否正确。
     B 表 = 仓库实际发货记录；A 表 = 门店订货明细（包邮判断依据）。
     4 大类：包邮正确 / 包邮错误 / 匹配异常 / 应包邮未找到。 */
  function buildShipping(result, meta) {
    var wb = XLSX.utils.book_new();
    var rowsB = result.rowsB || [];
    var rowsA = result.rowsA || [];
    var sheetStats = result.sheetStats || [];
    var stats = result.stats || {};
    var threshold = typeof meta.threshold === 'number' ? meta.threshold
      : (typeof result.threshold === 'number' ? result.threshold : 16000);

    function shipStatusText(r) {
      if (r.manual && r.manual.confirmed) return r.manual.label ? ('已处理：' + r.manual.label) : '已处理';
      var cat = { correct: '包邮正确', wrong: '包邮错误', exception: '匹配异常' }[r.category] || r.category;
      if (r.category === 'exception') {
        var ex = { storeConflict: '门店冲突', orderNotFound: '单号不存在',
          multiCandidate: '多候选·待确认', noMatch: '无法匹配', needConfirm: '待人工确认' }[r.exceptionType] || r.exceptionType;
        cat += '（' + ex + '）';
      }
      return cat;
    }

    function shipMethodText(m) {
      return { order: '单号匹配', backup: '门店+日期备用', manual: '人工确认',
        none: '未匹配', alias: '门店别名库', exact: '精确', contains: '包含', fuzzy: '相似' }[m] || m || '';
    }

    function dateTierText(r) {
      var t = { normal: '正常（晚1天）', abnormal: '日期异常', delay: '延迟发货(2~3天)待核实', unknown: '日期缺失' }[r.dateTier] || r.dateTier || '';
      if (r.dateLag !== null && r.dateLag !== undefined) t += '（相差' + (r.dateLag >= 0 ? '+' + r.dateLag : r.dateLag) + '天）';
      return t;
    }

    var HEAD_B = ['序号', '物流公司', 'B门店名称', 'A匹配门店', 'B物流单号', 'A订单单号',
      'A下单日期', 'B发货日期', 'A订单金额', '门槛', '应有包邮', '核查结果', '异常类型',
      '匹配方式', '日期分层', '来源Sheet', 'B行号', '疑似重复', '重复Sheet', '异常备注'];
    var WIDTH_B = [6, 14, 22, 22, 20, 20, 12, 12, 14, 10, 10, 14, 16, 14, 22, 14, 8, 10, 18, 40];

    function bRowOf(r) {
      return [
        r.seq || '',
        r.logisticsCompany || r.bSheet || '',
        r.bStoreName || '',
        r.aStoreName || '',
        r.bOrderNo || '',
        r.aOrderNo || '',
        r.aOrderDate || '',
        r.bShipDate || '',
        typeof r.aAmount === 'number' ? r.aAmount : null,
        threshold,
        r.shouldFreeShip === true ? '是' : r.shouldFreeShip === false ? '否' : '—',
        shipStatusText(r),
        r.category === 'exception' ? ({ storeConflict: '门店冲突', orderNotFound: '单号不存在',
          multiCandidate: '多候选·待确认', noMatch: '无法匹配', needConfirm: '待人工确认' }[r.exceptionType] || r.exceptionType) : '',
        shipMethodText(r.matchMethod),
        dateTierText(r),
        r.bSheet || '',
        r.bRowNum || '',
        r.suspectDup ? '疑似重复' : '',
        r.suspectDup ? (r.dupSheets || []).join('、') : '',
        r.note || ''
      ];
    }

    var HEAD_A = ['序号', 'A门店名称', '订单单号', '下单日期', '订单金额', '门槛', '距门槛',
      'B是否找到', '对应物流', '对应Sheet', 'B单号', '核查状态', '异常备注'];
    var WIDTH_A = [6, 22, 20, 12, 14, 10, 12, 12, 16, 16, 20, 14, 40];

    function aRowOf(r) {
      var found = r.bFound || r.status === 'found';
      return [
        r.seq || '',
        r.storeName || '',
        r.orderNo || '',
        r.orderDate || '',
        typeof r.amount === 'number' ? r.amount : null,
        threshold,
        typeof r.gap === 'number' ? r.gap : null,
        found ? '已找到' : '未找到',
        r.bLogistics || '',
        (r.bSheets || []).join('、'),
        r.bOrderNo || '',
        found ? '已发货' : '应包邮·未找到（待核实）',
        r.note || ''
      ];
    }

    /* ---- 01 核查汇总 ---- */
    var sum = [];
    sum.push(['包邮发货核查报告']);
    sum.push([]);
    sum.push(['生成时间', U.fmtDateTime(Date.now())]);
    sum.push(['核查任务', meta.title || '未命名核查']);
    sum.push(['核查模式', '包邮发货核查（B表=仓库实际发货记录）']);
    sum.push(['包邮门槛', '≥ ' + U.fmtThreshold(threshold) + ' 元（含等于）应该包邮']);
    sum.push(['A表（订货明细）', meta.aFileName || '']);
    sum.push(['B表（仓库发货）', meta.bFileName || '']);
    sum.push(['A表参与Sheet', (meta.aSheets || []).join('、')]);
    sum.push(['B表参与Sheet', (meta.bSheets || []).join('、')]);
    sum.push([]);
    sum.push(['统计项', '数值']);
    sum.push(['B表发货记录总数', stats.bTotal || 0]);
    sum.push(['—— 包邮正确', stats.correct || 0]);
    sum.push(['—— 包邮错误（不该包邮却发了）', stats.wrong || 0]);
    sum.push(['—— 匹配异常合计', stats.exception || 0]);
    sum.push(['—— —— 门店冲突', stats.storeConflict || 0]);
    sum.push(['—— —— 单号不存在', stats.orderNotFound || 0]);
    sum.push(['—— —— 多候选·待确认', stats.multiCandidate || 0]);
    sum.push(['—— —— 无法匹配', stats.noMatch || 0]);
    sum.push(['—— —— 待人工确认', stats.needConfirm || 0]);
    sum.push(['—— 疑似重复发货', stats.suspectDup || 0]);
    sum.push(['—— 日期异常', (stats.dateAbnormal || 0) + (stats.dateDelay || 0)]);
    sum.push([]);
    sum.push(['A表应包邮订单数（≥门槛）', stats.aShouldFreeShip || 0]);
    sum.push(['—— 已在B表找到发货记录', stats.aFound || 0]);
    sum.push(['—— 应包邮但未找到（待核实）', stats.aMissing || 0]);
    sum.push([]);
    sum.push(['物流Sheet数', stats.sheetCount || 0]);
    sum.push(['—— 无未处理的Sheet', stats.sheetsOk || 0]);
    sum.push(['本次核查完成', stats.complete ? '是（所有Sheet读取成功且无未处理记录）' : '否（仍有异常或未处理）']);
    sum.push([]);
    sum.push(['说明', '本报告由程序按确定逻辑计算，未修改任何原始数据。']);
    sum.push(['说明', '判定规则：以A表单笔订单金额为依据，≥' + U.fmtThreshold(threshold) + '元应包邮，每笔订单独立判断，不累计。']);
    sum.push(['说明', '单号匹配优先：A订单单号=B物流单号（精确，仅去空格）；无单号Sheet走门店+日期备用匹配。']);
    sum.push(['说明', '日期分层：相差1天=正常 / 0天=异常 / 2~3天=待核实 / >3天=异常；日期异常不推翻单号匹配，仅标记。']);
    wb.SheetNames.push('01 核查汇总');
    wb.Sheets['01 核查汇总'] = sheetFromAoa(sum, [30, 62]);

    /* ---- 02 B表发货核查明细（全部） ---- */
    var allB = [HEAD_B];
    rowsB.forEach(function (r) { allB.push(bRowOf(r)); });
    wb.SheetNames.push('02 B发货核查明细');
    wb.Sheets['02 B发货核查明细'] = sheetFromAoa(allB, WIDTH_B);

    /* ---- 03 包邮错误 ---- */
    var wrong = [HEAD_B];
    rowsB.filter(function (r) { return r.category === 'wrong'; })
      .forEach(function (r) { wrong.push(bRowOf(r)); });
    if (wrong.length === 1) wrong.push(['没有包邮错误记录（所有发货记录的对应订单金额都达到门槛）']);
    wb.SheetNames.push('03 包邮错误');
    wb.Sheets['03 包邮错误'] = sheetFromAoa(wrong, WIDTH_B);

    /* ---- 04 匹配异常 ---- */
    var exc = [HEAD_B];
    rowsB.filter(function (r) { return r.category === 'exception'; })
      .forEach(function (r) { exc.push(bRowOf(r)); });
    if (exc.length === 1) exc.push(['没有匹配异常记录']);
    wb.SheetNames.push('04 匹配异常');
    wb.Sheets['04 匹配异常'] = sheetFromAoa(exc, WIDTH_B);

    /* ---- 05 应包邮未找到 ---- */
    var missA = [HEAD_A];
    rowsA.filter(function (r) { return !(r.bFound || r.status === 'found'); })
      .forEach(function (r) { missA.push(aRowOf(r)); });
    if (missA.length === 1) missA.push(['没有「应包邮未找到」记录（所有应包邮订单都在B表找到发货记录）']);
    wb.SheetNames.push('05 应包邮未找到');
    wb.Sheets['05 应包邮未找到'] = sheetFromAoa(missA, WIDTH_A);

    /* ---- 06 各Sheet完整性 ---- */
    var perSheet = [['Sheet', '物流公司', '单号字段', '原始行数', '已读行数', '已核查', '已匹配', '待确认', '异常', '未处理']];
    sheetStats.forEach(function (x) {
      perSheet.push([x.sheetName, x.logisticsCompany, x.hasOrderField ? '有' : '无',
        x.rawRows, x.readRows, x.checkedRows, x.matchedRows, x.needConfirm, x.exceptionRows, x.unprocessed]);
    });
    wb.SheetNames.push('06 各Sheet完整性');
    wb.Sheets['06 各Sheet完整性'] = sheetFromAoa(perSheet, [18, 14, 10, 10, 10, 10, 10, 10, 10, 10]);

    /* ---- 07 A表应包邮全部订单（反向视图） ---- */
    var allA = [HEAD_A];
    rowsA.forEach(function (r) { allA.push(aRowOf(r)); });
    wb.SheetNames.push('07 A应包邮订单');
    wb.Sheets['07 A应包邮订单'] = sheetFromAoa(allA, WIDTH_A);

    /* ---- 08 人工确认记录 ---- */
    var manual = [['来源', '序号', '门店/订单', '单号', '金额', '处理动作', '原因备注', '处理时间']];
    rowsB.filter(function (r) { return r.manual && (r.manual.confirmed || r.manual.label); }).forEach(function (r) {
      manual.push(['B发货', r.seq || '', r.bStoreName || '', r.bOrderNo || '',
        typeof r.aAmount === 'number' ? r.aAmount : null,
        r.manual.confirmed ? '已处理' : '已记录', r.manual.label || r.manual.note || '',
        r.manual.at ? U.fmtDateTime(r.manual.at) : '']);
    });
    rowsA.filter(function (r) { return r.manual && (r.manual.confirmed || r.manual.label); }).forEach(function (r) {
      manual.push(['A订单', r.seq || '', r.storeName || '', r.orderNo || '',
        typeof r.amount === 'number' ? r.amount : null,
        r.manual.confirmed ? '已处理' : '已记录', r.manual.label || r.manual.note || '',
        r.manual.at ? U.fmtDateTime(r.manual.at) : '']);
    });
    if (manual.length === 1) manual.push(['本次没有人工处理记录']);
    wb.SheetNames.push('08 人工确认');
    wb.Sheets['08 人工确认'] = sheetFromAoa(manual, [10, 8, 22, 20, 14, 12, 32, 18]);

    return wb;
  }

  function fileName(meta) {
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) +
      '_' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2);
    var base = (meta && meta.title ? meta.title : '核对报告').replace(/[\\/:*?"<>|]/g, '');
    return base + '_' + stamp + '.xlsx';
  }

  function download(result, meta) {
    var wb = build(result, meta);
    var name = fileName(meta);
    XLSX.writeFile(wb, name, { compression: true });
    return name;
  }

  /* 门店匹配库 / 方案 导出成 CSV，方便给同事看或存档 */
  function downloadAliasesCsv(aliases) {
    var aoa = [['外部表/原始写法', '对应标准门店', '来源', '使用次数', '备注', '创建时间']];
    (aliases || []).forEach(function (a) {
      aoa.push([a.variant, a.canonical, a.source === 'history' ? '核对时确认' : '手动添加',
        a.hits || 1, a.note || '', U.fmtDateTime(a.createdAt)]);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var csv = XLSX.utils.sheet_to_csv(ws);
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var name = '门店匹配库_' + U.todayStr() + '.csv';
    U.downloadBlob(blob, name);
    return name;
  }

  return {
    build: build,
    download: download,
    downloadAliasesCsv: downloadAliasesCsv,
    STATUS_TEXT: STATUS_TEXT,
    statusText: statusText
  };
})();
