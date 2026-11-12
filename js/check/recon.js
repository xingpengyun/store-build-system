/* ==========================================================
   recon.js — 核对引擎
   ----------------------------------------------------------
   两种模式，共用聚合与门店匹配，只在判定处分叉：

     threshold（默认）门槛核验
       外部表 = 该包邮的门店清单；内部表 = 含包邮与不包邮的订货明细。
       判定：该门店在内部表的订货金额合计 ≥ 门槛（默认 16000）→ 达标。
       内部表里没进外部表清单的门店视为不包邮，不参与核验。

     recon 金额对账
       差额 = 外部表金额 − 内部表金额。

   铁律（两种模式都成立）：
   · 金额由程序算，不让模型算
   · 不同 Sheet 的金额绝不擅自累加（对账模式下跨 Sheet 门店降级为「待确认」）
   · 每一行都必须能指回原始文件 / Sheet / 行号
   · 原始数据只读，人工操作全部记在 overrides / manual 里

   分两层：
     groupByStore()  只做聚合（内部表按门店汇总，外部表按 Sheet+门店汇总）
     run()           匹配 + 比对 + 状态判定，产出可渲染、可导出的行
   人工改动后只需重跑 run()，不用重新解析 Excel。
   ========================================================== */
window.CKRecon = (function () {
  'use strict';

  var U = window.CKUtil;
  var M = window.CKMatch;

  /* 发货表比登记表晚几天（业务固定）：B 表是「比登记晚一天」的发货表，
     即 B 发货日期 ≈ A 登记日期 + 1 天。日期容差围绕这个「晚一天」基准，
     而不是对称地前后都算。 */
  var SHIP_LAG_DAYS = 1;

  /* ---------------- 取列 ---------------- */

  function colIndex(sheet, fieldName) {
    if (!fieldName || !sheet || !sheet.headers) return -1;
    return sheet.headers.indexOf(fieldName);
  }

  /* 单号规范化：去首尾空格、去全部空白、全角转半角。
     只允许去空格，不允许删中间字符、改数字或模糊匹配（业务铁律）。 */
  function normOrderNo(v) {
    if (v === null || v === undefined) return '';
    var s = U.normText(String(v));
    return s;
  }

  /* ---------------- 门店聚合 ---------------- */

  function groupByStore(sheets, map, side) {
    var groups = Object.create(null);
    var order = [];
    var skipped = { noName: 0, noAmount: 0, emptyName: 0 };
    var rowsTotal = 0;

    (sheets || []).forEach(function (sh) {
      var ni = colIndex(sh, map.nameField);
      var ai = colIndex(sh, map.amountField);
      var di = colIndex(sh, map.dateField);
      /* 单号列：A 表 = 订单单号（可能分散在多列，如"常温"+"冻品"），B 表 = 物流单号（单列）。
         A 表用 orderFields（数组）；B 表用 orderField（单值）。两者都兼容。 */
      var ois = [];
      if (map.orderFields && map.orderFields.length) {
        map.orderFields.forEach(function (f) { var i = colIndex(sh, f); if (i >= 0) ois.push(i); });
      } else if (map.orderField) {
        var oi0 = colIndex(sh, map.orderField); if (oi0 >= 0) ois.push(oi0);
      }
      var extras = (map.extraFields || []).map(function (f) {
        return { name: f, idx: colIndex(sh, f) };
      }).filter(function (e) { return e.idx >= 0; });

      if (ni < 0) return;   /* 该 Sheet 没有门店字段，跳过 */

      for (var r = 0; r < sh.rows.length; r++) {
        var row = sh.rows[r];
        var rawName = row[ni];
        var nameText = rawName === null || rawName === undefined ? '' : String(rawName).trim();
        if (!nameText) { skipped.emptyName++; continue; }

        /* 带括号的名字只识别/展示括号内的字：「品牌（城市 商场名）」→「城市 商场名」 */
        var dispName = M.displayName(nameText);

        rowsTotal++;

        var amount = null;
        if (ai >= 0) {
          amount = U.parseMoney(row[ai]);
          if (amount === null) skipped.noAmount++;
        }

        var key = M.canonicalKey(nameText) || nameText;

        if (!groups[key]) {
          groups[key] = {
            key: key,
            rawName: dispName,
            rawNames: [],
            amount: 0,
            /* 这张表压根没配金额字段（外部表往往只有门店名）时，
               金额必须是 null 而不是 0 —— 0 会被当成「订了 0 元」参与判定 */
            hasAmount: ai >= 0,
            hasOrderNo: false,
            amountMissing: 0,
            rows: [],
            dates: Object.create(null),
            dateMin: null,
            dateMax: null,
            extraSigs: Object.create(null),
            sheets: []
          };
          order.push(key);
        }

        var g = groups[key];
        /* 原始写法按「轻身份」去重：全半角/空格/括号符号差异不算两种写法，
           否则「内部表原始名称」列会把同一个店写成两行，用户以为识别成了两家 */
        var idk = M.identityKey(nameText);
        var alreadyListed = false;
        for (var _i = 0; _i < g.rawNames.length; _i++) {
          if (M.identityKey(g.rawNames[_i]) === idk) { alreadyListed = true; break; }
        }
        if (!alreadyListed) g.rawNames.push(dispName);
        if (amount === null) g.amountMissing++;
        else g.amount += amount;

        var dateVal = di >= 0 ? U.parseDate(row[di]) : null;
        if (dateVal) {
          g.dates[dateVal] = (g.dates[dateVal] || 0) + 1;
          if (!g.dateMin || dateVal < g.dateMin) g.dateMin = dateVal;
          if (!g.dateMax || dateVal > g.dateMax) g.dateMax = dateVal;
        }

        var extraVals = extras.map(function (e) {
          var v = row[e.idx];
          return { name: e.name, value: v === null || v === undefined ? '' : String(v).trim() };
        });
        var sig = extraVals.map(function (e) { return e.value; }).join('\u0001');
        if (sig) g.extraSigs[sig] = (g.extraSigs[sig] || 0) + 1;

        if (g.sheets.indexOf(sh.name) < 0) g.sheets.push(sh.name);

        /* 从配置的单号列里取第一个非空值作为该行单号（常温/冻品分列时只会有一个有值） */
        var orderNo = '';
        for (var k = 0; k < ois.length; k++) { var _ov = normOrderNo(row[ois[k]]); if (_ov) { orderNo = _ov; break; } }
        if (orderNo) g.hasOrderNo = true;

        g.rows.push({
          sheet: sh.name,
          rowNum: sh.rowNumbers[r] || (r + 2),
          rawName: nameText,
          amount: amount,
          date: dateVal,
          orderNo: orderNo,
          extras: extraVals,
          /* 保留整行原始值，供「查看原始数据」用；只存前 30 列防内存爆 */
          raw: row.slice(0, 30).map(function (v) {
            if (v instanceof Date) return U.parseDate(v) || '';
            return v === null || v === undefined ? '' : v;
          })
        });
      }
    });

    /* 原始写法里取出现最多的当标准名（更能代表这家店在日常表里的写法）。
       rawNames 已经统一成「括号内内容」，这里只在它们之间挑出现次数最多的那个。 */
    var list = order.map(function (k) {
      var g = groups[k];
      var best = g.rawName, bestCount = 0;
      g.rawNames.forEach(function (rn) {
        var c = 0;
        for (var i = 0; i < g.rawNames.length; i++) if (g.rawNames[i] === rn) c++;
        if (c > bestCount) { bestCount = c; best = rn; }
      });
      g.rawName = best;
      g.rowCount = g.rows.length;
      g.datesList = Object.keys(g.dates).sort();
      if (!g.hasAmount) g.amount = null;
      return g;
    });

    return { list: list, map: groups, skipped: skipped, rowsTotal: rowsTotal, side: side };
  }

  /* ---------------- 重复行识别（同一 Sheet 内） ---------------- */

  function detectDuplicates(group) {
    /* 完全相同的行（金额 + 日期 + 其余字段一致）= 高度疑似重复 */
    var bySig = Object.create(null);
    group.rows.forEach(function (r) {
      var extra = r.extras.map(function (e) { return e.value; }).join('\u0001');
      var sig = (r.amount === null ? '' : r.amount.toFixed(2)) + '|' + (r.date || '') + '|' + extra;
      (bySig[sig] = bySig[sig] || []).push(r);
    });
    var exact = [];
    Object.keys(bySig).forEach(function (s) {
      if (bySig[s].length > 1) exact.push(bySig[s]);
    });

    /* 金额相同但其它不同 = 疑似重复（两笔同额订单也可能正常） */
    var byAmount = Object.create(null);
    group.rows.forEach(function (r) {
      if (r.amount === null) return;
      var k = r.amount.toFixed(2);
      (byAmount[k] = byAmount[k] || []).push(r);
    });
    var sameAmount = [];
    Object.keys(byAmount).forEach(function (k) {
      if (byAmount[k].length > 1) sameAmount.push(byAmount[k]);
    });

    return { exact: exact, sameAmount: sameAmount };
  }

  /* ---------------- 主流程 ----------------

     input = {
       aFile, bFile,
       aSheets: ['Sheet1'],                 内部表参与核对的 sheet 名
       aMap: { nameField, amountField, dateField, extraFields },
       bSheets: [{ name, map }],            只含勾选参与核对的
       tolerance: 0.01,
       aliases: [...],
       overrides: { [bGroupKey]: aGroupKey|null },   人工改动
       mergeSheets: false,                  是否允许跨 Sheet 累加（必须用户显式开启）
       savedMatches: { [bGroupKey]: aGroupKey }      上次确认过的
     }
  */
  function run(input) {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

    /* threshold 门槛核验（默认）：外部表的门店，在内部表的订货金额够不够门槛
       recon     金额对账：差额 = 外部表金额 − 内部表金额
       shipping  包邮发货核查：B表=仓库实际包邮发货记录，单号优先匹配，判包邮正确/错误 */
    var mode = input.mode === 'recon' ? 'recon' : (input.mode === 'shipping' ? 'shipping' : 'threshold');
    var threshold = Number(input.threshold);
    if (!isFinite(threshold) || threshold < 0) threshold = 16000;
    /* 日期容差（天）：B 表发货日期和 A 表登记日期允许差几天（默认 1） */
    var dateTol = Number(input.dateTolerance);
    if (!isFinite(dateTol) || dateTol < 0) dateTol = 1;

    var aSheets = (input.aFile.sheets || []).filter(function (s) {
      return (input.aSheets || []).indexOf(s.name) >= 0;
    });
    var bSheetDefs = input.bSheets || [];

    /* ---- 内部表聚合 ---- */
    var aGrouped = groupByStore(aSheets, input.aMap, 'a');

    /* ---- B 侧：每个 Sheet 单独聚合 ---- */
    var bGroups = [];          /* { sheetName, group } */
    var bAllKeys = Object.create(null);
    bSheetDefs.forEach(function (def) {
      var sh = (input.bFile.sheets || []).filter(function (s) { return s.name === def.sheetName; })[0];
      if (!sh) return;
      var g = groupByStore([sh], def.map, 'b');
      g.list.forEach(function (grp) {
        grp.sheetName = def.sheetName;
        /* 重复检测按 sheet 内做 */
        grp.dups = detectDuplicates(grp);
        grp.hasDup = grp.dups.exact.length > 0 || grp.dups.sameAmount.length > 0;
        grp.exactDup = grp.dups.exact.length > 0;
        bGroups.push({ sheetName: def.sheetName, group: grp, def: def });
        (bAllKeys[grp.key] = bAllKeys[grp.key] || []).push({ sheet: def.sheetName, group: grp });
      });
    });

    /* ---- B 侧门店去重（跨 Sheet 同名只匹配一次） ---- */
    var bUnique = Object.create(null);
    var bOrder = [];
    bGroups.forEach(function (bg) {
      var k = bg.group.key;
      if (!bUnique[k]) {
        bUnique[k] = {
          key: k,
          rawName: bg.group.rawName,
          rawNames: bg.group.rawNames.slice(),
          count: 0,
          sheets: [],
          dates: [],
          totalAmount: 0
        };
        bOrder.push(k);
      }
      var u = bUnique[k];
      u.count += bg.group.rowCount;
      if (u.sheets.indexOf(bg.sheetName) < 0) u.sheets.push(bg.sheetName);
      (bg.group.datesList || []).forEach(function (d) {
        if (u.dates.indexOf(d) < 0) u.dates.push(d);
      });
      if (bg.group.amount) u.totalAmount += bg.group.amount;
      bg.group.rawNames.forEach(function (rn) {
        var rk = M.identityKey(rn);
        var dupName = u.rawNames.some(function (x) { return M.identityKey(x) === rk; });
        if (!dupName) u.rawNames.push(rn);
      });
    });

    var bList = bOrder.map(function (k) { return bUnique[k]; });
    var aList = aGrouped.list.map(function (g) {
      return { key: g.key, rawName: g.rawName, count: g.rowCount, amount: g.amount };
    });

    /* ---- 匹配 ---- */
    var matched = M.matchAll(bList, aList, {
      aliases: input.aliases || [],
      autoThreshold: input.autoThreshold,
      softThreshold: input.softThreshold
    });

    /* ---- 应用人工改动（优先级最高） ---- */
    var overrides = input.overrides || {};
    var aByKey = aGrouped.map;
    var bResultByKey = matched.results;
    var manualCount = 0;

    Object.keys(overrides).forEach(function (bKey) {
      var target = overrides[bKey];
      var r = bResultByKey[bKey];
      if (!r) return;
      if (target === '__none__') {
        r.status = 'manual-none';
        r.aKey = null;
        r.aName = null;
        r.note = '你已确认：内部表中没有对应门店';
        manualCount++;
      } else if (aByKey[target]) {
        r.status = 'manual';
        r.aKey = target;
        r.aName = aByKey[target].rawName;
        r.note = '你已确认对应关系';
        manualCount++;
      }
    });

    /* ================= shipping 包邮发货核查模式 =================
       B 表 = 仓库登记的包邮发货记录；A 表 = 门店订货明细（含单号、日期、金额）。
       单号优先匹配，无单号 Sheet 走门店+日期备用匹配，产出双视图与 Sheet 监控。 */
    if (mode === 'shipping') {
      var builtS = assembleShipping({
        aGrouped: aGrouped,
        bGroups: bGroups,
        aByKey: aByKey,
        bResultByKey: bResultByKey,
        aliases: input.aliases || [],
        softThreshold: input.softThreshold
      }, threshold, dateTol);

      var statsS = calcShippingStats(builtS.rowsB, builtS.rowsA, builtS.sheetStats, builtS.aOrders);
      var t1s = (window.performance && performance.now) ? performance.now() : Date.now();

      return {
        mode: 'shipping',
        threshold: threshold,
        dateTolerance: dateTol,
        rowsB: builtS.rowsB,
        rowsA: builtS.rowsA,
        sheetStats: builtS.sheetStats,
        stats: statsS,
        aGroups: aGrouped.list,
        bGroups: bGroups.map(function (x) { return x.group; }),
        aSkipped: aGrouped.skipped,
        matchStats: matched.stats,
        manualCount: manualCount,
        elapsed: Math.round(t1s - t0)
      };
    }

    /* ================= 门槛核验模式 =================
       外部表是「该包邮的门店清单」，内部表是含包邮与不包邮的订货明细。
       要回答的只有一个问题：这家店在内部表的订货金额，够不够门槛。
       所以整段在组装之前就分派出去，下面的对账逻辑一行不动。 */
    if (mode === 'threshold') {
      /* A/B 表原始数据行数：界面上要展示出来，用户才能对得上「我的表到底多少行」。
         门槛模式以 A 表（内部表）为主，参与核验数 = A 表门店数。 */
      var bRawRows = 0;
      bGroups.forEach(function (bg) { bRawRows += bg.group.rowCount || 0; });
      var aRawRows = aGrouped.rowsTotal || 0;

      var builtT = assembleThreshold({
        aGrouped: aGrouped,
        bList: bList,
        bAllKeys: bAllKeys,
        aByKey: aByKey,
        bResultByKey: bResultByKey
      }, threshold, dateTol);

      var statsT = calcThresholdStats(builtT.rows, threshold, aGrouped, builtT.aUsed, bRawRows, aRawRows, bList.length);
      var t1t = (window.performance && performance.now) ? performance.now() : Date.now();

      return {
        mode: 'threshold',
        threshold: threshold,
        dateTolerance: dateTol,
        rows: builtT.rows,
        stats: statsT,
        aGroups: aGrouped.list,
        bGroups: bGroups.map(function (x) { return x.group; }),
        aSkipped: aGrouped.skipped,
        matchStats: matched.stats,
        manualCount: manualCount,
        elapsed: Math.round(t1t - t0)
      };
    }

    /* ---- 组装明细行（金额对账模式） ---- */
    var rows = [];
    var aUsed = Object.create(null);   /* A 门店被哪些 B 行使用 */

    bGroups.forEach(function (bg) {
      var grp = bg.group;
      var m = bResultByKey[grp.key] || { status: 'none', candidates: [] };
      var aGrp = m.aKey ? aByKey[m.aKey] : null;

      var aAmount = aGrp ? round2(aGrp.amount) : null;
      var bAmount = round2(grp.amount);
      var j = judge(aAmount, bAmount, input.tolerance);

      var status = j.status;
      var note = j.label;
      var multiSheet = bAllKeys[grp.key] && bAllKeys[grp.key].length > 1;

      /* 门店匹配状态优先于金额状态 */
      if (m.status === 'none' || m.status === 'manual-none') {
        status = aGrp ? j.status : 'unmatched-b';
        if (!aGrp) note = '内部表中没有能对上的门店';
      } else if (m.status === 'confirm') {
        /* 有待确认的候选时，金额先不算数 */
        status = 'confirm';
        note = m.note || '门店匹配需要你确认';
      }

      /* 跨 Sheet：金额一律不合并，且差异行降级为待确认 */
      if (multiSheet && !input.mergeSheets && status === 'diff') {
        status = 'confirm';
        note = '该门店还出现在 ' + (bAllKeys[grp.key].length - 1) + ' 个 Sheet 里，各 Sheet 不能直接累加，请确认是否按 Sheet 分别结算';
      }

      /* 日期无交集 —— 不影响金额结论，但要提示 */
      if (aGrp && status === 'ok' && aGrp.datesList.length && grp.datesList.length) {
        var inter = grp.datesList.filter(function (d) { return aGrp.datesList.indexOf(d) >= 0; });
        if (!inter.length) note = '金额一致，但日期没有交集（A: ' + aGrp.dateMin + '~' + aGrp.dateMax + '）';
      }

      if (aGrp) (aUsed[aGrp.key] = aUsed[aGrp.key] || []).push(grp.key);

      rows.push({
        id: 'r_' + bg.sheetName + '_' + grp.key,
        storeName: aGrp ? aGrp.rawName : grp.rawName,
        storeKey: aGrp ? aGrp.key : grp.key,
        aKey: aGrp ? aGrp.key : null,
        bKey: grp.key,
        aRawName: aGrp ? aGrp.rawNames.join(' / ') : '',
        bRawName: grp.rawNames.join(' / '),
        aAmount: aAmount,
        bAmount: bAmount,
        diff: j.diff,
        status: status,
        matchStatus: m.status,
        matchScore: m.score || 0,
        matchMethod: m.method || '',
        candidates: m.candidates || [],
        sheet: bg.sheetName,
        sheets: [bg.sheetName],
        aRows: aGrp ? aGrp.rows : [],
        bRows: grp.rows,
        aRowNums: aGrp ? uniq(aGrp.rows.map(function (x) { return x.rowNum; })) : [],
        bRowNums: uniq(grp.rows.map(function (x) { return x.rowNum; })),
        pairType: pairTypeOf(aGrp, grp),
        isDup: !!grp.hasDup,
        dupInfo: grp.dups,
        multiSheet: !!multiSheet,
        note: note || '',
        manual: null,
        aDates: aGrp ? aGrp.datesList : [],
        bDates: grp.datesList
      });
    });

    /* ---- 内部表独有（有金额但 B 里完全没出现） ---- */
    aGrouped.list.forEach(function (ag) {
      if (aUsed[ag.key]) return;
      rows.push({
        id: 'r_alone_' + ag.key,
        storeName: ag.rawName,
        storeKey: ag.key,
        aKey: ag.key,
        bKey: null,
        aRawName: ag.rawNames.join(' / '),
        bRawName: '',
        aAmount: round2(ag.amount),
        bAmount: null,
        diff: null,
        status: 'unmatched-a',
        matchStatus: 'none',
        matchScore: 0,
        matchMethod: '',
        candidates: [],
        sheet: '（内部表）',
        sheets: ['（内部表）'],
        aRows: ag.rows,
        bRows: [],
        aRowNums: uniq(ag.rows.map(function (x) { return x.rowNum; })),
        bRowNums: [],
        pairType: 'n:0',
        isDup: false,
        dupInfo: null,
        multiSheet: false,
        note: '外部表所选 Sheet 中都没有这家门店',
        manual: null,
        aDates: ag.datesList,
        bDates: []
      });
    });

    /* ---- 跨 Sheet 合并行（用户显式开启） ---- */
    if (input.mergeSheets) {
      rows = mergeMultiSheet(rows, input.tolerance, aByKey);
    }

    var stats = calcStats(rows, aGrouped);
    var t1 = (window.performance && performance.now) ? performance.now() : Date.now();

    return {
      mode: 'recon',
      threshold: null,
      rows: rows,
      stats: stats,
      aGroups: aGrouped.list,
      bGroups: bGroups.map(function (x) { return x.group; }),
      aSkipped: aGrouped.skipped,
      matchStats: matched.stats,
      manualCount: manualCount,
      elapsed: Math.round(t1 - t0)
    };
  }

  /* ---------------- 门槛核验：组装明细 ----------------
     以 A 表（内部表 / 订货明细）为主：一家内部店一行，B 表只用来核对。
     业务口径（2026-11-05 三次确认）：
     · 内部表一家门店一行，不管它订了几次货、B 表出现几次
     · B 表发货日期（比登记晚 1 天）往回推登记日期，按「发货 − 登记 ≈ 1 天 ± 容差」
       圈 A 表订货窗口，窗口内任一笔 ≥ 门槛 → 达标；
       窗口内找不到订货记录 → 「没对应上」单独标出
     · B 没配日期字段时退回整店判断：任一笔订货 ≥ 门槛即通过
     · 内部表有、B 清单没有 → 「清单外」；B 有、内部表没有 → 「仓库未对应」
     · 金额只展示判定用的那一笔，绝不多笔相加 */
  function dayIndex(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  }

  /* 日期分层：B 表发货日期 比 A 表下单日期 晚几天。
     正常 = 晚 1 天；0 天 = 异常提示；2~3 天 = 待核实；>3 或早于下单 = 异常。
     日期异常不推翻单号匹配结果，只单独标记（业务铁律）。 */
  function dateTier(aDate, bDate) {
    var x = dayIndex(aDate), y = dayIndex(bDate);
    if (x === null || y === null) return { tier: 'unknown', lag: null, label: '日期缺失，无法核对' };
    var lag = y - x;                       /* 发货 − 下单，正常应 = 1 */
    if (lag === 1) return { tier: 'normal', lag: lag, label: '正常（发货比下单晚 1 天）' };
    if (lag === 0) return { tier: 'abnormal', lag: lag, label: '日期异常：发货与下单同一天' };
    if (lag < 0) return { tier: 'abnormal', lag: lag, label: '日期异常：发货早于下单 ' + (-lag) + ' 天' };
    if (lag >= 2 && lag <= 3) return { tier: 'delay', lag: lag, label: '可能延迟发货（相差 ' + lag + ' 天），待核实' };
    return { tier: 'abnormal', lag: lag, label: '日期异常：相差 ' + lag + ' 天' };
  }

  /* 内部表门店 → 订货批次：有日期按同一天合并，没配日期字段则一行算一笔 */
  function buildBatches(aGrp) {
    var map = Object.create(null);
    var order = [];
    (aGrp ? aGrp.rows : []).forEach(function (row) {
      var k = row.date || ('row_' + row.sheet + '_' + row.rowNum);
      if (!map[k]) {
        map[k] = { key: k, date: row.date || null, amount: 0, hasAmount: false,
          rows: [], rowNums: [], sheets: [] };
        order.push(k);
      }
      var b = map[k];
      if (typeof row.amount === 'number') { b.amount += row.amount; b.hasAmount = true; }
      b.rows.push(row);
      if (b.rowNums.indexOf(row.rowNum) < 0) b.rowNums.push(row.rowNum);
      if (b.sheets.indexOf(row.sheet) < 0) b.sheets.push(row.sheet);
    });
    var list = order.map(function (k) {
      var b = map[k];
      b.amount = round2(b.amount);
      return b;
    });
    list.sort(function (a, b) {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return b.amount - a.amount;
    });
    return list;
  }

  function assembleThreshold(ctx, threshold, dateTol) {
    var aByKey = ctx.aByKey;
    var bList = ctx.bList;
    var bAllKeys = ctx.bAllKeys;
    var bResultByKey = ctx.bResultByKey;
    var tol = (typeof dateTol === 'number' && dateTol >= 0) ? dateTol : 1;

    /* ---- 反向索引：内部表门店 → 匹配到它的外部表门店（含匹配结果）。
       以 A 表（内部表 / 订货明细）为主：一家内部店一行，B 表只用来核对它
       在不在仓库包邮清单里、金额够不够门槛、日期对不对得上。 ---- */
    var bRefsByA = Object.create(null);
    var bCovered = Object.create(null);
    bList.forEach(function (bu) {
      var m = bResultByKey[bu.key] || { status: 'none', candidates: [] };
      if (m.aKey) {
        bCovered[bu.key] = m;
        (bRefsByA[m.aKey] = bRefsByA[m.aKey] || []).push({ bu: bu, m: m });
      }
    });

    var rows = [];
    var aUsed = Object.create(null);   /* 内部表门店 → 是否被 B 引用（1） */

    /* 一家内部店的订货明细（抽屉用），窗口内的标「判定用」 */
    function ordersOf(batches, windowList) {
      return batches.map(function (b) {
        return {
          date: b.date,
          amount: b.hasAmount ? round2(b.amount) : null,
          rows: b.rows.length,
          rowNums: b.rowNums,
          sheets: b.sheets,
          pass: b.hasAmount && b.amount + 1e-9 >= threshold,
          gap: b.hasAmount ? round2(b.amount - threshold) : null,
          inWindow: windowList ? windowList.indexOf(b) >= 0 : true
        };
      });
    }

    /* ---- 主表：内部表（A）门店，一家一行 ---- */
    ((ctx.aGrouped && ctx.aGrouped.list) || []).forEach(function (ag) {
      var refs = bRefsByA[ag.key] || [];
      var batches = buildBatches(ag);

      /* 汇总这家内部店对应的外部表（B）信息 */
      var bDates = [];
      var bRows = [];
      var bRowNums = [];
      var bSheets = [];
      var bRawNames = [];
      var bHasDup = false;
      var bDupExact = [];
      var confirmRef = null;
      refs.forEach(function (ref) {
        if (bRawNames.indexOf(ref.bu.rawName) < 0) bRawNames.push(ref.bu.rawName);
        (ref.bu.dates || []).forEach(function (d) { if (bDates.indexOf(d) < 0) bDates.push(d); });
        (bAllKeys[ref.bu.key] || []).forEach(function (x) {
          if (bSheets.indexOf(x.sheet) < 0) bSheets.push(x.sheet);
          x.group.rows.forEach(function (row) {
            bRows.push(row);
            if (bRowNums.indexOf(row.rowNum) < 0) bRowNums.push(row.rowNum);
          });
          /* 同店同日重复登记（真正意义上的「重复」），不是同店多次发货 */
          if (x.group.hasDup) bHasDup = true;
          (x.group.dups && x.group.dups.exact || []).forEach(function (g) { bDupExact.push(g); });
        });
        if (ref.m.status === 'confirm' && !confirmRef) confirmRef = ref;
      });
      bDates.sort();

      /* 日期窗口：B 表是「比登记晚一天」的发货表 —— 用发货日期往回推登记日期。
         匹配口径：发货日期 − 登记日期 ∈ [SHIP_LAG_DAYS − 容差, SHIP_LAG_DAYS + 容差]。
         默认 SHIP_LAG_DAYS=1、容差=1 → 发货比登记晚 0~2 天都算对上（晚一天上下浮动 1 天）。
         不再是对称的「前后 ±N」——发货日期早于登记日期（晚负数）是不对的。 */
      var dateUsable = bDates.length > 0 && batches.some(function (b) { return !!b.date; });
      var windowBatches = [];
      if (dateUsable) {
        windowBatches = batches.filter(function (b) {
          var x = dayIndex(b.date);
          if (x === null) return false;
          return bDates.some(function (d) {
            var y = dayIndex(d);
            if (y === null) return false;
            var lag = y - x;                     /* 发货 − 登记，正常应 ≈ SHIP_LAG_DAYS */
            return lag >= 0 && Math.abs(lag - SHIP_LAG_DAYS) <= tol;
          });
        });
      }
      var dateMatched = !dateUsable || windowBatches.length > 0;

      /* 判定用的那一笔：窗口内金额最大的一批（单笔，绝不合计） */
      var useBatches = dateUsable ? windowBatches : batches;
      var best = null;
      useBatches.forEach(function (b) {
        if (!b.hasAmount) return;
        if (!best || b.amount > best.amount) best = b;
      });
      var aAmount = best ? round2(best.amount) : null;
      var passing = useBatches.some(function (b) { return b.hasAmount && b.amount + 1e-9 >= threshold; });

      var status;
      var note = '';
      var notInB = false;

      if (confirmRef) {
        status = 'confirm';
        note = confirmRef.m.note || '门店匹配需要你确认';
      } else if (!refs.length) {
        /* 内部表有、仓库清单没有：只有「订够门槛」的才算「清单外」异常（本身仍是达标），
           没订够门槛的这家店不参与核验、不占结果行。 */
        if (passing) {
          status = 'pass';
          notInB = true;
          note = '内部表订够了门槛，但仓库包邮清单里没有这家店';
        } else {
          return;
        }
      } else if (dateUsable && !windowBatches.length) {
        /* 发货日期往回推「登记日期 ≈ 发货 − 1 天」的窗口内找不到订货记录 = 没对应上 */
        status = 'fail';
        note = 'B 表发货日期 ' + bDates.join('、') + '（应比登记晚 ' + SHIP_LAG_DAYS + ' 天）±' + tol + ' 天容差内，没找到这家店的订货记录';
      } else if (aAmount === null) {
        status = 'confirm';
        note = '内部表这家门店的订货金额没能解析出来，请打开原始行确认';
      } else if (passing) {
        status = 'pass';
      } else {
        status = 'fail';
        note = '距门槛还差 ' + U.fmtMoney(threshold - aAmount);
      }

      var orders = ordersOf(batches, dateUsable ? windowBatches : null);

      if (refs.length) aUsed[ag.key] = 1;

      /* 非达标行用「判定用那一笔」；达标行由 pushRow 按各笔自己的金额覆盖 */
      var displayAmount = aAmount;
      var displayGap = aAmount === null ? null : round2(aAmount - threshold);

      /* 达标时：每一笔满足门槛的订货都单独成行（含重复）——一家店一个月订三次
         达标的货就出三行；这样「达标」数量 = 达标订货笔数，「去掉重复」开关再按门店合并。
         未达标 / 待确认 / 仓库未对应仍是整店一行。 */
      var emitBatches = null;
      if (status === 'pass') {
        emitBatches = useBatches.filter(function (b) { return b.hasAmount && b.amount + 1e-9 >= threshold; });
        if (!emitBatches.length) emitBatches = best ? [best] : [];
      }

      function pushRow(selBatch, seq) {
        var amt = selBatch ? round2(selBatch.amount) : displayAmount;
        var gp = selBatch ? round2(selBatch.amount - threshold) : displayGap;
        rows.push({
          id: 'r_a_' + ag.key + (seq === null ? '' : '_' + seq),
          storeName: ag.rawName,
          storeKey: ag.key,
          aKey: ag.key,
          bKey: confirmRef ? confirmRef.bu.key : (refs.length ? refs[0].bu.key : null),
          aRawName: ag.rawNames.join(' / '),
          bRawName: bRawNames.join(' / '),
          aAmount: amt,
          bAmount: null,
          diff: null,
          gap: gp,
          threshold: threshold,
          status: status,
          notInB: notInB,
          matchStatus: confirmRef ? 'confirm' : (refs.length ? refs[0].m.status : 'none'),
          matchScore: refs.length ? (refs[0].m.score || 0) : 0,
          matchMethod: refs.length ? (refs[0].m.method || '') : '',
          candidates: confirmRef ? (confirmRef.m.candidates || []) : [],
          sheet: ag.sheets.join(' / ') || '（内部表）',
          sheets: ag.sheets.length ? ag.sheets.slice() : ['（内部表）'],
          aRows: ag.rows,
          bRows: bRows,
          aRowNums: uniq(ag.rows.map(function (x) { return x.rowNum; })),
          bRowNums: bRowNums,
          pairType: ag.rows.length + ':' + bRows.length,
          /* 外部表同店同日出现多行 = 清单里重复登记，只提示，不改结论 */
          isDup: bHasDup,
          dupInfo: bHasDup ? { exact: bDupExact.length ? bDupExact : [bRows], sameAmount: [] } : null,
          multiSheet: ag.sheets.length > 1,
          note: note,
          manual: null,
          aDates: ag.datesList,
          bDates: bDates,
          bDate: bDates[0] || null,
          orders: orders,
          orderCount: orders.length,
          multiOrder: orders.length > 1,
          passOrderCount: orders.filter(function (o) { return o.pass; }).length,
          dateMatched: dateMatched,
          dateTolerance: tol,
          selectedDate: selBatch ? selBatch.date : (best ? best.date : null)
        });
      }

      if (emitBatches) {
        emitBatches.forEach(function (pb, i) { pushRow(pb, i); });
      } else {
        pushRow(null, null);
      }
    });

    /* ---- 外部表（B）里、内部表没对应门店的：仓库多列了，也要单独展示 ---- */
    bList.forEach(function (bu) {
      if (bCovered[bu.key]) return;
      var m = bResultByKey[bu.key] || { status: 'none', candidates: [] };
      var bRows = [];
      var bSheets = [];
      var bRowNums = [];
      var bHasDup = false;
      var bDupExact = [];
      (bAllKeys[bu.key] || []).forEach(function (x) {
        if (bSheets.indexOf(x.sheet) < 0) bSheets.push(x.sheet);
        x.group.rows.forEach(function (row) {
          bRows.push(row);
          if (bRowNums.indexOf(row.rowNum) < 0) bRowNums.push(row.rowNum);
        });
        if (x.group.hasDup) bHasDup = true;
        (x.group.dups && x.group.dups.exact || []).forEach(function (g) { bDupExact.push(g); });
      });
      var status = (m.status === 'confirm') ? 'confirm' : 'unmatched-b';
      var note = (m.status === 'confirm')
        ? (m.note || '门店匹配需要你确认')
        : '仓库包邮清单里有这家店，但内部表没有对应的订货记录';
      rows.push({
        id: 'r_b_' + bu.key,
        storeName: bu.rawName,
        storeKey: bu.key,
        aKey: null,
        bKey: bu.key,
        aRawName: '',
        bRawName: bu.rawNames.join(' / '),
        aAmount: null,
        bAmount: null,
        diff: null,
        gap: null,
        threshold: threshold,
        status: status,
        matchStatus: m.status,
        matchScore: m.score || 0,
        matchMethod: m.method || '',
        candidates: m.candidates || [],
        sheet: bSheets.join(' / '),
        sheets: bSheets,
        aRows: [],
        bRows: bRows,
        aRowNums: [],
        bRowNums: bRowNums,
        pairType: '0:' + bRows.length,
        isDup: bHasDup,
        dupInfo: bHasDup ? { exact: bDupExact.length ? bDupExact : [bRows], sameAmount: [] } : null,
        multiSheet: bSheets.length > 1,
        note: note,
        manual: null,
        aDates: [],
        bDates: (bu.dates || []).slice(),
        bDate: (bu.dates && bu.dates[0]) || null,
        orders: [],
        orderCount: 0,
        multiOrder: false,
        passOrderCount: 0,
        dateMatched: false,
        dateTolerance: tol,
        selectedDate: null
      });
    });

    return { rows: rows, aUsed: aUsed };
  }

  /* ---------------- 门槛核验：统计 ---------------- */
  function calcThresholdStats(rows, threshold, aGrouped, aUsed, bRawRows, aRawRows, bStores) {
    var s = {
      mode: 'threshold',
      threshold: threshold,
      /* 参与核验 = A 表（内部表）原始数据行数 */
      total: (typeof aRawRows === 'number' && aRawRows >= 0) ? aRawRows : 0,
      /* A 表解析出的原始数据行数 */
      aRawRows: aRawRows || 0,
      /* B 表解析出的原始数据行数（只用来核对，不驱动结果条数） */
      bRawRows: bRawRows || 0,
      /* B 表去重后的门店总数（外部包邮清单一共列了多少家店） */
      bStores: (typeof bStores === 'number' && bStores >= 0) ? bStores : 0,
      /* B 表已涉及 = 匹配上内部表、参与了核验的 B 表门店数 */
      bMatched: 0,
      /* B 表未涉及 = B 表列了、但内部表没有对应门店的数（= bStores − bMatched） */
      bUncovered: 0,
      stores: rows.length,
      matched: 0,
      pass: 0,
      fail: 0,
      unmatched: 0,
      unmatchedA: 0,
      unmatchedB: 0,
      needConfirm: 0,
      dup: 0,
      manual: 0,
      passAmount: 0,
      failAmount: 0,
      aTotal: 0,
      shortSum: 0,
      aOnly: 0,
      aOnlyAmount: 0,
      passRate: 0
    };

    /* 以 A 表为主：达标行 = A 表里每一笔订够门槛的订货（含重复）；
       notInB 的达标行同时归「清单外」异常（A 订够了、B 清单漏了）。 */
    rows.forEach(function (r) {
      if (r.status === 'unmatched-b') {
        /* 仓库多列了（B 有、A 没有）：单独归「仓库未对应」 */
        s.unmatchedB++;
        s.unmatched++;
        return;
      }
      if (r.status === 'pass') {
        s.pass++;
        if (typeof r.aAmount === 'number') { s.passAmount += r.aAmount; s.aTotal += r.aAmount; }
        if (r.notInB) { s.unmatchedA++; s.unmatched++; s.aOnly++; if (typeof r.aAmount === 'number') s.aOnlyAmount += r.aAmount; }
        else if (r.aKey && r.bKey) s.matched++;
      } else if (r.status === 'fail') {
        s.fail++;
        if (typeof r.aAmount === 'number') {
          s.failAmount += r.aAmount;
          s.aTotal += r.aAmount;
          if (typeof r.gap === 'number') s.shortSum += -r.gap;
        }
        if (r.aKey && r.bKey) s.matched++;
      } else if (r.status === 'confirm') {
        s.needConfirm++;
      }
      if (r.isDup) s.dup++;
      if (r.manual && r.manual.confirmed) s.manual++;
    });

    s.passAmount = round2(s.passAmount);
    s.failAmount = round2(s.failAmount);
    s.aTotal = round2(s.aTotal);
    s.shortSum = round2(s.shortSum);
    s.aOnlyAmount = round2(s.aOnlyAmount);
    /* B 表覆盖：未涉及 = B 表里没匹配上任何内部表门店的（结果行 aKey 空、bKey 有值）；
       已涉及 = bStores − 未涉及。这样用户能一眼看到「B 表是否全部都涉及到了」。 */
    s.bUncovered = rows.filter(function (r) { return !r.aKey && r.bKey; }).length;
    s.bMatched = s.bStores - s.bUncovered;
    /* 达标率 = 达标订货笔数 / A 表原始行数 */
    s.passRate = s.total ? Math.round(s.pass / s.total * 1000) / 10 : 0;
    return s;
  }

  /* ==========================================================
     shipping 模式：包邮发货核查
     ----------------------------------------------------------
     B 表 = 仓库登记的「包邮发货记录」（每一行都代表一次包邮发货）；
     A 表 = 门店订货明细（含订单单号、下单日期、订单金额）。
     要回答的问题：仓库登记的包邮发货对不对？

     匹配优先级：
       ① 单号匹配（A 订单单号 = B 物流单号，精确去空格）—— 有单号的 Sheet 走这条
       ② 门店 + 日期 备用匹配 —— 没单号的 Sheet 走这条（先门店名归一/别名，再按日期分层挑候选）
     判定（B 为主）：
       A 金额 ≥ 16000 且 B 有发货记录 → 包邮正确
       A 金额 < 16000 但 B 有发货记录 → 包邮错误（仓库不该包邮却包邮了）
       单号不存在 / 门店冲突 / 日期异常 / 重复 / 无法匹配 → 匹配异常
     反向（A 为主）：
       A 金额 ≥ 16000 但 B 没找到对应记录 → 应包邮但未找到发货记录（待核实，不直接判错）
     ========================================================== */

  /* 把 A 表原始行聚合成「订单」：同一单号的多行（同单号拆行）合并成一笔，
     没单号的行各自算一笔。返回 { byOrder, byStore, list, totalRows }。 */
  function buildAOrders(aGrouped) {
    var byOrder = Object.create(null);
    var byStore = Object.create(null);
    var list = [];
    var totalRows = 0;

    (aGrouped && aGrouped.list || []).forEach(function (ag) {
      var storeKey = ag.key;
      var rowMap = Object.create(null);   /* 单号 → 订单（无单号用行号当 key，各自一笔） */
      (ag.rows || []).forEach(function (row) {
        totalRows++;
        var k = row.orderNo || ('__row_' + row.sheet + '_' + row.rowNum);
        if (!rowMap[k]) {
          rowMap[k] = {
            orderNo: row.orderNo || '',
            storeKey: storeKey,
            storeName: ag.rawName,
            storeRawNames: ag.rawNames.slice(),
            amount: 0,
            hasAmount: false,
            amountMissing: 0,
            rows: [],
            rowNums: [],
            sheets: [],
            dates: Object.create(null),
            dateList: [],
            dateMin: null,
            dateMax: null
          };
        }
        var o = rowMap[k];
        if (row.amount === null) o.amountMissing++;
        else { o.amount += row.amount; o.hasAmount = true; }
        o.rows.push(row);
        if (o.rowNums.indexOf(row.rowNum) < 0) o.rowNums.push(row.rowNum);
        if (o.sheets.indexOf(row.sheet) < 0) o.sheets.push(row.sheet);
        if (row.date) {
          o.dates[row.date] = (o.dates[row.date] || 0) + 1;
          if (!o.dateMin || row.date < o.dateMin) o.dateMin = row.date;
          if (!o.dateMax || row.date > o.dateMax) o.dateMax = row.date;
        }
      });
      Object.keys(rowMap).forEach(function (k) {
        var o = rowMap[k];
        o.amount = round2(o.amount);
        if (!o.hasAmount) o.amount = null;
        o.dateList = Object.keys(o.dates).sort();
        o.rowCount = o.rows.length;
        if (o.orderNo) byOrder[o.orderNo] = o;
        (byStore[storeKey] = byStore[storeKey] || []).push(o);
        list.push(o);
      });
    });

    return { byOrder: byOrder, byStore: byStore, list: list, totalRows: totalRows };
  }

  /* B 表逐 Sheet 聚合成「发货记录」：每个 Sheet 一组，把该 Sheet 所有门店组的行汇成记录列表。
     返回 { sheets: [{ sheetName, def, group, records: [...] }], orderOccurrences }
     注意 bGroups 是「每 Sheet 每门店」一条，这里必须按 sheetName 归并，否则同一 Sheet 会被拆成多条。 */
  function buildBRecords(bGroups) {
    var bySheet = Object.create(null);
    var order = [];
    var orderOccurrences = Object.create(null);   /* 单号 → [{sheet,record}] 跨 Sheet 重复检测 */
    bGroups.forEach(function (bg) {
      var sn = bg.sheetName;
      if (!bySheet[sn]) {
        bySheet[sn] = { sheetName: sn, def: bg.def, group: bg.group, records: [] };
        order.push(sn);
      }
      (bg.group.rows || []).forEach(function (row) {
        var rec = {
          sheetName: sn,
          group: bg.group,
          storeKey: bg.group.key,
          storeName: bg.group.rawName,
          storeRawNames: bg.group.rawNames.slice(),
          orderNo: row.orderNo || '',
          date: row.date || null,
          rowNum: row.rowNum,
          rawName: row.rawName,
          raw: row.raw
        };
        bySheet[sn].records.push(rec);
        if (rec.orderNo) {
          (orderOccurrences[rec.orderNo] = orderOccurrences[rec.orderNo] || []).push({ sheet: sn, record: rec });
        }
      });
    });
    var sheets = order.map(function (sn) { return bySheet[sn]; });
    return { sheets: sheets, orderOccurrences: orderOccurrences };
  }

  function assembleShipping(ctx, threshold, dateTol) {
    var aByKey = ctx.aByKey;
    var bResultByKey = ctx.bResultByKey;     /* 门店级匹配（备用匹配用） */
    var aliases = ctx.aliases || [];

    var aOrders = buildAOrders(ctx.aGrouped);
    var aByOrder = aOrders.byOrder;
    var aByStore = aOrders.byStore;

    var bRecs = buildBRecords(ctx.bGroups);
    var bSheets = bRecs.sheets;
    var orderOcc = bRecs.orderOccurrences;

    var softThreshold = (ctx.softThreshold === undefined ? M.thresholds.soft : ctx.softThreshold);

    /* 标记被 B 覆盖到的 A 订单（单号匹配覆盖；备用匹配覆盖） */
    var aCovered = Object.create(null);     /* orderKey(orderNo or rowId) → 1 */

    /* ---- 视图一：B 表发货核查（主视图）---- */
    var rowsB = [];
    var seqB = 0;

    bSheets.forEach(function (bs) {
      var def = bs.def;
      var map = def.map || {};
      var hasOrderField = !!(map.orderField && map.orderField.length);
      var logisticsCompany = map.logisticsCompany || bs.sheetName;

      bs.records.forEach(function (rec) {
        seqB++;
        var result = matchOneBRecord(rec, {
          aByOrder: aByOrder, aByStore: aByStore, aByKey: aByKey,
          bResultByKey: bResultByKey, softThreshold: softThreshold,
          orderOcc: orderOcc, threshold: threshold
        });

        /* 标记 A 订单被覆盖 */
        if (result.aOrder && result.aOrder.orderNo) aCovered[result.aOrder.orderNo] = 1;
        else if (result.aOrder) aCovered['__row_' + result.aOrder.sheets.join() + '_' + (result.aOrder.rowNums[0] || '')] = 1;

        rowsB.push(makeBRow(rec, result, {
          seq: seqB, logisticsCompany: logisticsCompany, hasOrderField: hasOrderField,
          sheetName: bs.sheetName, threshold: threshold
        }));
      });
    });

    /* ---- 视图二：A 表应包邮核查（反向视图）----
       只看 A 表金额 ≥ 门槛的订单，是否在 B 表找到对应发货记录。
       找不到不直接判错，标「应包邮但未找到发货记录，待核实」。 */
    var bOrderSet = Object.create(null);
    Object.keys(orderOcc).forEach(function (k) { bOrderSet[k] = 1; });
    /* B 备用匹配覆盖的门店（这些门店的 B 行算「找到过」） */
    var bCoveredStores = Object.create(null);
    Object.keys(bResultByKey).forEach(function (bk) {
      var m = bResultByKey[bk];
      if (m.aKey && (m.status === 'auto' || m.status === 'manual')) bCoveredStores[m.aKey] = 1;
    });

    var rowsA = [];
    var seqA = 0;
    aOrders.list.forEach(function (o) {
      if (!o.hasAmount || o.amount + 1e-9 < threshold) return;   /* 只看应包邮的 */
      seqA++;
      var found = false;
      var foundInfo = null;
      if (o.orderNo) {
        if (bOrderSet[o.orderNo]) {
          found = true;
          var occ = orderOcc[o.orderNo] || [];
          foundInfo = { sheets: occ.map(function (x) { return x.sheet; }), orderNo: o.orderNo };
        }
      } else {
        /* 无单号：按门店级匹配看 B 是否覆盖过这家店 */
        if (bCoveredStores[o.storeKey]) {
          found = true;
          foundInfo = { sheets: [], orderNo: '' };
        }
      }
      var status = found ? 'found' : 'missing';
      var note = found
        ? '已在 B 表找到对应发货记录'
        : '应包邮但未找到发货记录，待核实（可能未发货或跨月发货，不直接认定为漏发）';
      rowsA.push({
        id: 'ra_' + seqA,
        seq: seqA,
        storeName: o.storeName,
        storeKey: o.storeKey,
        orderNo: o.orderNo,
        orderDate: o.dateMin,
        amount: o.amount,
        threshold: threshold,
        gap: round2(o.amount - threshold),
        bFound: found,
        bLogistics: foundInfo ? foundInfo.sheets.join(' / ') : '',
        bSheets: foundInfo ? foundInfo.sheets.slice() : [],
        bOrderNo: foundInfo ? foundInfo.orderNo : '',
        status: status,
        note: note,
        aRowNums: o.rowNums.slice(),
        aSheets: o.sheets.slice()
      });
    });

    /* ---- Sheet 完整性监控 ---- */
    var sheetStats = bSheets.map(function (bs) {
      var def = bs.def, map = def.map || {};
      var sheetRows = rowsB.filter(function (r) { return r.bSheet === bs.sheetName; });
      var matched = sheetRows.filter(function (r) { return r.category === 'correct' || r.category === 'wrong'; }).length;
      var needConfirm = sheetRows.filter(function (r) { return r.category === 'exception' && r.exceptionType === 'needConfirm'; }).length;
      var exception = sheetRows.filter(function (r) { return r.category === 'exception'; }).length;
      var unprocessed = sheetRows.filter(function (r) { return r.category === 'exception' && (r.exceptionType === 'noMatch' || r.exceptionType === 'orderNotFound'); }).length;
      return {
        sheetName: bs.sheetName,
        logisticsCompany: map.logisticsCompany || bs.sheetName,
        hasOrderField: !!(map.orderField && map.orderField.length),
        rawRows: bs.group.rowCount || bs.records.length,
        readRows: bs.records.length,
        checkedRows: sheetRows.length,
        matchedRows: matched,
        needConfirm: needConfirm,
        exceptionRows: exception,
        unprocessed: unprocessed
      };
    });

    return { rowsB: rowsB, rowsA: rowsA, sheetStats: sheetStats, aOrders: aOrders, aCovered: aCovered };
  }

  /* 对一条 B 发货记录做匹配判定 */
  function matchOneBRecord(rec, ctx) {
    var aByOrder = ctx.aByOrder, aByStore = ctx.aByStore, aByKey = ctx.aByKey;
    var bResultByKey = ctx.bResultByKey, softThreshold = ctx.softThreshold;
    var orderOcc = ctx.orderOcc, threshold = ctx.threshold;

    var res = { matchMethod: 'none', aOrder: null, aStoreKey: null, category: 'exception',
                exceptionType: 'noMatch', dateTier: null, storeConflict: false, suspectDup: false,
                candidates: [], note: '无法匹配' };

    /* 单号跨 Sheet 重复：同一单号在多个 Sheet 出现 = 疑似重复发货（不删，只标记） */
    if (rec.orderNo && orderOcc[rec.orderNo] && orderOcc[rec.orderNo].length > 1) {
      var sheets = orderOcc[rec.orderNo].map(function (x) { return x.sheet; });
      res.suspectDup = true;
      res.dupSheets = uniqArr(sheets);
    }

    /* 记录"单号在 A 表没找到"这个事实。降级到门店+日期备用匹配后仍保留，
       人工复核时能看到"单号对不上，但门店日期吻合"的完整线索。 */
    var orderMissed = false;
    var missedOrderNo = '';

    /* ① 单号匹配（优先） */
    if (rec.orderNo) {
      var aOrder = aByOrder[rec.orderNo];
      if (aOrder) {
        res.matchMethod = 'order';
        res.aOrder = aOrder;
        res.aStoreKey = aOrder.storeKey;
        /* 门店冲突检测：单号相同但门店名明显不同 → 标记，等人工确认 */
        var sc = M.score(rec.storeName, aOrder.storeName);
        if (sc.score < softThreshold && rec.storeName && aOrder.storeName) {
          res.storeConflict = true;
          res.category = 'exception';
          res.exceptionType = 'storeConflict';
          res.candidates = [{ aKey: aOrder.storeKey, aName: aOrder.storeName, score: sc.score, method: sc.method }];
          res.note = '单号相同但门店名称明显不同（A：' + aOrder.storeName + '，B：' + rec.storeName + '），需人工确认';
        } else {
          /* 金额判定 */
          if (aOrder.hasAmount && aOrder.amount + 1e-9 >= threshold) {
            res.category = 'correct';
            res.exceptionType = '';
            res.note = '包邮正确';
          } else if (aOrder.hasAmount) {
            res.category = 'wrong';
            res.exceptionType = '';
            res.note = '包邮错误：订单金额 ' + U.fmtMoney(aOrder.amount) + ' 未达 ' + U.fmtThreshold(threshold) + '，不应包邮';
          } else {
            res.category = 'exception';
            res.exceptionType = 'needConfirm';
            res.note = '单号匹配成功，但 A 表该订单金额无法解析，请人工确认';
          }
        }
        /* 日期分层（不推翻匹配，只标记） */
        res.dateTier = dateTier(aOrder.dateMin, rec.date);
        return res;
      } else {
        /* 单号在 A 表不存在 —— 不直接判死，降级走门店+日期备用匹配。
           常见原因：A 表单号按品类分列（常温/冻品），B 表这单属于没选进 orderFields 的品类，
           单号对不上，但门店和日期能对上，仍应给出候选让人工确认。 */
        orderMissed = true;
        missedOrderNo = rec.orderNo;
      }
    }

    /* ② 备用匹配：门店 + 日期（无单号 Sheet，或单号在 A 表找不到时降级） */
    var m = bResultByKey[rec.storeKey] || { status: 'none', candidates: [] };
    if (m.status === 'none' || m.status === 'manual-none' || !m.aKey) {
      res.matchMethod = 'backup';
      res.category = 'exception';
      res.exceptionType = m.candidates && m.candidates.length ? 'needConfirm' : 'noMatch';
      res.candidates = (m.candidates || []).slice(0, 5);
      if (orderMissed) {
        /* 单号在 A 表不存在，门店也对不上 —— 这才是真正的"单号不存在" */
        res.matchMethod = 'order';
        res.category = 'exception';
        res.exceptionType = 'orderNotFound';
        res.note = 'B 表单号 ' + missedOrderNo + ' 在 A 表中不存在，且门店也无法匹配';
      } else {
        res.note = m.candidates && m.candidates.length ? '没有足够相似的门店，需人工确认' : 'A 表中没有任何能对上的门店';
      }
      return res;
    }

    var aStoreOrders = aByStore[m.aKey] || [];
    /* 按日期分层挑候选：晚 1 天 > 同天 > 2~3 天 > 其它 */
    var tiered = pickByDateTier(aStoreOrders, rec.date);
    res.matchMethod = 'backup';
    res.aStoreKey = m.aKey;
    res.aStoreName = m.aName || '';
    res.candidates = tiered.list.map(function (o) {
      return { aKey: o.storeKey, aName: o.storeName, score: m.score || 0, method: m.method || 'backup',
               orderNo: o.orderNo, amount: o.amount, date: o.dateMin };
    });

    if (!tiered.list.length) {
      res.category = 'exception';
      res.exceptionType = 'needConfirm';
      if (orderMissed) {
        res.note = '单号 ' + missedOrderNo + ' 在 A 表未找到，但门店吻合，日期无交集（A 下单 ' + (tiered.aDates.join('、') || '缺失') + '，B 发货 ' + (rec.date || '缺失') + '），需人工确认';
      } else {
        res.note = '门店可对上，但日期无交集（A 下单日期 ' + (tiered.aDates.join('、') || '缺失') + '，B 发货 ' + (rec.date || '缺失') + '），需人工确认';
      }
      return res;
    }

    if (tiered.list.length === 1) {
      var o = tiered.list[0];
      res.aOrder = o;
      res.dateTier = tiered.tier;
      if (orderMissed) {
        /* 单号在 A 表没找到，但门店+日期唯一吻合 —— 自动判定包邮正确/错误，
           和正常备用匹配一致。保留 orderMissedButBackup 标记让用户知道
           这不是单号匹配，可在复核抽屉里改关联。 */
        res.orderMissedButBackup = true;
        if (o.hasAmount && o.amount + 1e-9 >= threshold) {
          res.category = 'correct';
          res.exceptionType = '';
          res.note = '包邮正确（降级匹配：单号 ' + missedOrderNo + ' 在 A 表未找到，按门店+日期吻合唯一候选判定）';
        } else if (o.hasAmount) {
          res.category = 'wrong';
          res.exceptionType = '';
          res.note = '包邮错误：订单金额 ' + U.fmtMoney(o.amount) + ' 未达门槛（降级匹配：单号 ' + missedOrderNo + ' 在 A 表未找到，按门店+日期判定）';
        } else {
          res.category = 'exception';
          res.exceptionType = 'needConfirm';
          res.note = '单号 ' + missedOrderNo + ' 在 A 表未找到，门店+日期吻合但金额无法解析，请人工确认';
        }
      } else if (o.hasAmount && o.amount + 1e-9 >= threshold) {
        res.category = 'correct';
        res.exceptionType = '';
        res.note = '包邮正确（备用匹配：门店+日期）';
      } else if (o.hasAmount) {
        res.category = 'wrong';
        res.exceptionType = '';
        res.note = '包邮错误：订单金额 ' + U.fmtMoney(o.amount) + ' 未达门槛（备用匹配）';
      } else {
        res.category = 'exception';
        res.exceptionType = 'needConfirm';
        res.note = '备用匹配成功，但 A 表该订单金额无法解析，请人工确认';
      }
      return res;
    }

    /* 多个候选 → 人工确认 */
    res.category = 'exception';
    res.exceptionType = 'multiCandidate';
    if (orderMissed) {
      res.orderMissedButBackup = true;
      res.note = 'B 表单号 ' + missedOrderNo + ' 在 A 表未找到，同门店在日期窗口内有 ' + tiered.list.length + ' 笔候选订单，需人工确认';
    } else {
      res.note = '同一门店在日期窗口内存在 ' + tiered.list.length + ' 笔候选订单，需人工确认';
    }
    return res;
  }

  /* 备用匹配的日期分层挑选：返回 { list, tier, aDates } */
  function pickByDateTier(orders, bDate) {
    if (!bDate) return { list: orders.slice(0, 5), tier: { tier: 'unknown', lag: null, label: '' }, aDates: collectADates(orders) };
    var tiers = ['normal', 'abnormal', 'delay'];   /* 晚1天 > 同天(异常但仍是同店) > 2~3天(待核实) */
    /* 实际按需求：0天=异常提示，1天=正常，2~3天=待核实，>3天=异常。
       挑选优先级：1天(正常) → 0天(异常但同店) → 2~3天(待核实)。>3天不进候选。 */
    var buckets = { normal: [], sameday: [], delay: [], abnormal: [] };
    orders.forEach(function (o) {
      if (!o.dateMin) { buckets.normal.push(o); return; }   /* A 无日期 → 无法分层，放进默认桶 */
      var t = dateTier(o.dateMin, bDate);
      if (t.tier === 'normal') buckets.normal.push(o);
      else if (t.lag === 0) buckets.sameday.push(o);
      else if (t.tier === 'delay') buckets.delay.push(o);
      else if (t.tier === 'abnormal') buckets.abnormal.push(o);   /* 发货早于下单或>3天：不优先 */
    });
    var pick = buckets.normal.length ? { list: buckets.normal, tier: { tier: 'normal', lag: 1, label: '正常（晚1天）' } }
      : buckets.sameday.length ? { list: buckets.sameday, tier: { tier: 'abnormal', lag: 0, label: '发货与下单同天' } }
      : buckets.delay.length ? { list: buckets.delay, tier: { tier: 'delay', lag: null, label: '延迟发货（2~3天）待核实' } }
      : { list: [], tier: { tier: 'unknown', lag: null, label: '日期无交集' } };
    return { list: pick.list, tier: pick.tier, aDates: collectADates(orders) };
  }

  function collectADates(orders) {
    var s = Object.create(null);
    orders.forEach(function (o) { (o.dateList || []).forEach(function (d) { s[d] = 1; }); });
    return Object.keys(s).sort();
  }

  function makeBRow(rec, result, opt) {
    var aOrder = result.aOrder;
    var aStoreName = aOrder ? aOrder.storeName : (result.aStoreName || '');
    return {
      id: 'rb_' + opt.seq,
      seq: opt.seq,
      bStoreName: rec.storeName,
      aStoreName: aStoreName,
      aOrderNo: aOrder ? aOrder.orderNo : '',
      bOrderNo: rec.orderNo,
      aOrderDate: aOrder ? aOrder.dateMin : null,
      bShipDate: rec.date,
      aAmount: aOrder ? aOrder.amount : null,
      threshold: opt.threshold,
      shouldFreeShip: aOrder ? (aOrder.hasAmount && aOrder.amount + 1e-9 >= opt.threshold) : null,
      category: result.category,                 /* correct / wrong / exception */
      exceptionType: result.exceptionType,       /* storeConflict / orderNotFound / multiCandidate / noMatch / needConfirm / '' */
      matchMethod: result.matchMethod,           /* order / backup / none */
      logisticsCompany: opt.logisticsCompany,
      bSheet: opt.sheetName,
      bSheetHasOrder: opt.hasOrderField,
      suspectDup: result.suspectDup,
      dupSheets: result.dupSheets || [],
      storeConflict: result.storeConflict,
      orderMissedButBackup: !!result.orderMissedButBackup,
      dateTier: result.dateTier ? result.dateTier.tier : (result.dateTier ? result.dateTier.tier : 'unknown'),
      dateLag: result.dateTier ? result.dateTier.lag : null,
      dateLabel: result.dateTier ? result.dateTier.label : '',
      candidates: result.candidates,
      aRowNums: aOrder ? aOrder.rowNums.slice() : [],
      aSheets: aOrder ? aOrder.sheets.slice() : [],
      bRowNum: rec.rowNum,
      bRawName: rec.rawName,
      note: result.note,
      raw: rec.raw
    };
  }

  function calcShippingStats(rowsB, rowsA, sheetStats, aOrders) {
    var s = {
      mode: 'shipping',
      bTotal: rowsB.length,
      correct: 0, wrong: 0, exception: 0,
      storeConflict: 0, orderNotFound: 0, multiCandidate: 0, noMatch: 0, needConfirm: 0,
      orderMissedButBackup: 0,
      dateAbnormal: 0, dateDelay: 0, suspectDup: 0,
      aShouldFreeShip: rowsA.length,
      aFound: 0, aMissing: 0,
      sheetCount: sheetStats.length,
      sheetsOk: 0
    };
    rowsB.forEach(function (r) {
      if (r.category === 'correct') s.correct++;
      else if (r.category === 'wrong') s.wrong++;
      else if (r.category === 'exception') {
        s.exception++;
        if (r.orderMissedButBackup) s.orderMissedButBackup++;
        if (r.exceptionType === 'storeConflict') s.storeConflict++;
        else if (r.exceptionType === 'orderNotFound') s.orderNotFound++;
        else if (r.exceptionType === 'multiCandidate') s.multiCandidate++;
        else if (r.exceptionType === 'noMatch') s.noMatch++;
        else if (r.exceptionType === 'needConfirm') s.needConfirm++;
      }
      if (r.dateTier === 'abnormal') s.dateAbnormal++;
      else if (r.dateTier === 'delay') s.dateDelay++;
      if (r.suspectDup) s.suspectDup++;
    });
    rowsA.forEach(function (r) {
      if (r.status === 'found') s.aFound++;
      else s.aMissing++;
    });
    s.sheetsOk = sheetStats.filter(function (x) { return x.unprocessed === 0; }).length;
    s.complete = (s.sheetsOk === s.sheetCount && s.exception === 0);
    return s;
  }

  function uniqArr(a) { var o = []; for (var i = 0; i < a.length; i++) if (o.indexOf(a[i]) < 0) o.push(a[i]); return o; }

  function mergeMultiSheet(rows, tolerance, aByKey) {
    var byKey = Object.create(null);
    var order = [];
    rows.forEach(function (r) {
      /* 只合并「匹配到 A 门店」且跨多 Sheet 的 */
      if (!r.aKey || r.sheets.length !== 1 || r.status === 'unmatched-a') {
        if (!byKey[r.id]) { byKey[r.id] = r; order.push(r.id); }
        return;
      }
      if (!byKey[r.aKey]) {
        byKey[r.aKey] = {
          id: 'merged_' + r.aKey,
          storeName: r.storeName,
          storeKey: r.storeKey,
          aKey: r.aKey,
          bKey: r.bKey,
          aRawName: r.aRawName,
          bRawName: r.bRawName,
          aAmount: r.aAmount,
          bAmount: 0,
          diff: null,
          status: r.status,
          matchStatus: r.matchStatus,
          matchScore: r.matchScore,
          matchMethod: r.matchMethod,
          candidates: r.candidates,
          sheet: r.sheet,
          sheets: [],
          aRows: r.aRows,
          bRows: [],
          aRowNums: r.aRowNums,
          bRowNums: [],
          pairType: r.pairType,
          isDup: false,
          dupInfo: null,
          multiSheet: true,
          note: r.note,
          manual: null,
          aDates: r.aDates,
          bDates: []
        };
        order.push(r.aKey);
      }
      var m = byKey[r.aKey];
      m.bAmount = round2((m.bAmount || 0) + (r.bAmount || 0));
      m.sheets = m.sheets.concat(r.sheets);
      m.bRows = m.bRows.concat(r.bRows);
      m.bRowNums = m.bRowNums.concat(r.bRowNums);
      m.bRawName = m.bRawName ? (m.bRawName + ' / ' + r.bRawName) : r.bRawName;
      m.bDates = uniq(m.bDates.concat(r.bDates));
      if (r.isDup) { m.isDup = true; m.dupInfo = r.dupInfo; }
    });

    return order.map(function (k) {
      var m = byKey[k];
      if (m && m.sheets && m.sheets.length) {
        m.sheet = m.sheets.join(' + ');
        var j = judge(m.aAmount, m.bAmount, tolerance);
        m.diff = j.diff;
        if (m.status === 'confirm' && m.matchStatus !== 'confirm') {
          /* 合并后重新判 */
          m.status = j.status;
          m.note = '已按你的确认合并 ' + m.sheets.length + ' 个 Sheet 计算';
        } else if (m.status !== 'confirm') {
          m.status = j.status;
        }
      }
      return m;
    });
  }

  function judge(aAmount, bAmount, tolerance) {
    if (aAmount === null && bAmount === null) return { status: 'diff', diff: null, label: '两边金额都无法解析' };
    if (aAmount === null) return { status: 'diff', diff: null, label: 'B 有金额、A 金额无法解析' };
    if (bAmount === null) return { status: 'diff', diff: null, label: 'A 有金额、B 金额无法解析' };
    var diff = bAmount - aAmount;
    if (Math.abs(diff) <= tolerance + 1e-9) return { status: 'ok', diff: diff, label: '' };
    return { status: 'diff', diff: diff, label: '' };
  }

  function pairTypeOf(aGrp, bGrp) {
    var ac = aGrp ? aGrp.rows.length : 0;
    var bc = bGrp ? bGrp.rows.length : 0;
    if (ac === 0) return '0:' + bc;
    if (bc === 0) return ac + ':0';
    if (ac === 1 && bc === 1) return '1:1';
    if (ac === 1) return '1:' + bc;
    if (bc === 1) return ac + ':1';
    return ac + ':' + bc;
  }

  function round2(n) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }

  function uniq(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i]);
    return out;
  }

  function calcStats(rows, aGrouped) {
    var s = {
      total: rows.length,
      stores: 0,
      matched: 0,
      amountOk: 0,
      amountDiff: 0,
      unmatched: 0,
      unmatchedA: 0,
      unmatchedB: 0,
      needConfirm: 0,
      dup: 0,
      diffSum: 0,
      diffAbsSum: 0,
      aTotal: 0,
      bTotal: 0,
      manual: 0
    };
    var seen = Object.create(null);
    rows.forEach(function (r) {
      if (!seen[r.storeKey]) { seen[r.storeKey] = 1; s.stores++; }
      if (r.aKey && r.bKey) s.matched++;
      if (r.status === 'ok') s.amountOk++;
      else if (r.status === 'diff') s.amountDiff++;
      else if (r.status === 'confirm') s.needConfirm++;
      else if (r.status === 'unmatched-a') { s.unmatched++; s.unmatchedA++; }
      else if (r.status === 'unmatched-b') { s.unmatched++; s.unmatchedB++; }
      if (r.isDup) s.dup++;
      if (r.diff !== null && r.diff !== undefined) {
        s.diffSum += r.diff;
        s.diffAbsSum += Math.abs(r.diff);
      }
      if (typeof r.aAmount === 'number') s.aTotal += r.aAmount;
      if (typeof r.bAmount === 'number') s.bTotal += r.bAmount;
      if (r.manual && r.manual.confirmed) s.manual++;
    });
    s.diffSum = round2(s.diffSum);
    s.diffAbsSum = round2(s.diffAbsSum);
    s.aTotal = round2(s.aTotal);
    s.bTotal = round2(s.bTotal);
    return s;
  }

  return {
    run: run,
    groupByStore: groupByStore,
    calcStats: calcStats,
    calcThresholdStats: calcThresholdStats,
    calcShippingStats: calcShippingStats,
    dateTier: dateTier,
    round2: round2
  };
})();
