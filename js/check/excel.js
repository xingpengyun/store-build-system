/* ==========================================================
   excel.js — Excel / CSV 解析与工作表识别
   ----------------------------------------------------------
   职责边界很硬：只负责「把文件变成结构化的二维数据 + 元信息」，
   不做字段映射、不做核对、不做门店匹配。

   最难的两件事：
   1. 表头在哪一行 —— 真实表格前面常有标题行、空行、制表人、日期范围。
      做法是给前 20 行逐行打分，挑最像表头的那行，而不是默认第一行。
   2. 这张 Sheet 是什么 —— 明细 / 汇总 / 空白 / 说明。
      汇总表和明细表混着算会重复计金额，所以必须分开对待。
   ========================================================== */
window.CKExcel = (function () {
  'use strict';

  var U = window.CKUtil;

  var MAX_ROWS = 100000;      /* 单表行数上限，防卡死 */
  var MAX_COLS = 200;
  var MAX_FILE = 60 * 1024 * 1024;

  /* 表头关键词：命中越多越可能是表头行 */
  var HEADER_WORDS = [
    '门店', '店名', '店铺', '门店名称', '收货', '收货人', '客户', '商家', '收货门店',
    '金额', '应付', '应收', '实付', '实收', '合计', '小计', '总额', '费用', '运费',
    '报价', '结算', '单价', '数量', '重量', '件数', '箱数',
    '日期', '时间', '月份', '账期', '结算周期',
    '单号', '订单', '运单', '单据', '编号', '序号', '备注', '说明', '明细',
    '物流', '承运', '快递', '司机', '车牌', '线路',
    '规格', '品类', '商品', '物料', 'sku', 'SKU'
  ];

  var STRONG_HEADER = ['门店', '店名', '金额', '应付', '应收', '运单', '订单', '备注', '日期', '单号'];

  var SUMMARY_NAME_RE = /(汇总|合计|总计|小计|summary|total)/i;
  var SUMMARY_WORD_RE = /(合计|小计|总计|汇总|共计)/;
  var NOTE_NAME_RE = /(说明|备注|填写|须知|注意|readme|目录|cover)/i;

  /* ---------------- 底层：读成二维数组 ---------------- */

  function readWorkbook(arrayBuffer, fileName) {
    var isCsv = /\.(csv|txt)$/i.test(fileName);
    var opts = { type: 'array', cellDates: true, cellNF: false, cellText: false, dense: false };

    if (isCsv) {
      /* 中文 CSV 大量是 GBK 编码。先按 UTF-8 试，若出现大量替换字符再按 GBK 重读。
         （TextDecoder 的 fatal:false 会把非法字节变成 U+FFFD，比例高就说明编码不对） */
      try {
        var probe = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(arrayBuffer));
        var bad = (probe.match(/\uFFFD/g) || []).length;
        if (probe.length && bad / probe.length > 0.002) opts.codepage = 936;
      } catch (e) { /* 没有 TextDecoder 就直接交给 SheetJS */ }
      opts.raw = true;
    }

    return XLSX.read(arrayBuffer, opts);
  }

  /* 把一张工作表读成 { grid, rowNums }，grid 是二维数组（值为 Date/number/string/null） */
  function readSheetGrid(ws) {
    var grid = [];
    var rowNums = [];
    if (!ws || !ws['!ref']) return { grid: grid, rowNums: rowNums, truncated: false };

    var range;
    try { range = XLSX.utils.decode_range(ws['!ref']); } catch (e) { return { grid: grid, rowNums: rowNums, truncated: false }; }

    var r0 = range.s.r;
    var r1 = Math.min(range.e.r, r0 + MAX_ROWS);
    var c0 = range.s.c;
    var c1 = Math.min(range.e.c, c0 + MAX_COLS - 1);
    var truncated = range.e.r - r0 > MAX_ROWS;

    for (var r = r0; r <= r1; r++) {
      var row = new Array(c1 - c0 + 1);
      var hasValue = false;
      for (var c = c0; c <= c1; c++) {
        var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
        var v = cell ? cell.v : null;
        if (v === '' || v === undefined) v = null;
        if (v !== null) hasValue = true;
        row[c - c0] = v;
      }
      /* 整行全空也保留（占位），后面按需过滤；这样行号不会错位 */
      grid.push(row);
      /* 原始 Excel 行号（1-based） */
      rowNums.push(r + 1);
      if (!hasValue && r === r1) { /* 末尾空行无害 */ }
    }

    /* 去掉尾部连续空行，避免 !ref 撑大导致尾部一堆空行 */
    while (grid.length && isBlankRow(grid[grid.length - 1])) {
      grid.pop(); rowNums.pop();
    }

    return { grid: grid, rowNums: rowNums, truncated: truncated };
  }

  function isBlankRow(row) {
    for (var i = 0; i < row.length; i++) {
      if (row[i] !== null && row[i] !== undefined && String(row[i]).trim() !== '') return false;
    }
    return true;
  }

  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) {
      var d = U.parseDate(v);
      return d || '';
    }
    return String(v).trim();
  }

  /* ---------------- 表头行识别 ---------------- */

  function scoreHeaderRow(grid, idx) {
    var row = grid[idx];
    if (!row) return -1;
    var cells = [];
    for (var i = 0; i < row.length; i++) {
      var t = cellText(row[i]);
      if (t) cells.push(t);
    }
    if (cells.length < 2) return -1;

    var score = 0;
    score += Math.min(cells.length, 8) * 4;          /* 列多更像表头 */

    var textLike = 0, shortEnough = 0, kwHit = 0, strongHit = 0, pureNum = 0, dateLike = 0;
    for (var k = 0; k < cells.length; k++) {
      var s = cells[k];
      if (!/^-?[\d,.\s%]+$/.test(s)) textLike++;
      if (s.length <= 14) shortEnough++;
      if (U.parseDate(s) && /\d/.test(s) && /[-/年月日.]/.test(s)) dateLike++;
      if (/^-?[\d,.]+$/.test(s)) pureNum++;
      for (var w = 0; w < HEADER_WORDS.length; w++) {
        if (s.indexOf(HEADER_WORDS[w]) >= 0) { kwHit++; break; }
      }
      for (var s2 = 0; s2 < STRONG_HEADER.length; s2++) {
        if (s.indexOf(STRONG_HEADER[s2]) >= 0) { strongHit++; break; }
      }
    }

    var n = cells.length;
    score += (textLike / n) * 22;                    /* 表头基本都是文字 */
    score += (shortEnough / n) * 10;                 /* 表头不会是一句话 */
    score += Math.min(kwHit, 6) * 6;                 /* 命中业务关键词 */
    score += Math.min(strongHit, 4) * 8;             /* 命中门店/金额/单号这类强词 */
    score -= (pureNum / n) * 26;                     /* 全是数字肯定不是表头 */
    score -= (dateLike / n) * 14;

    /* 只有一行文字（比如大标题「上海区域订货明细表」）—— 列数太少，扣分 */
    if (cells.length === 1) score -= 20;

    /* 下一行也有内容，说明它是「头 + 数据」的关系 */
    var next = grid[idx + 1];
    if (next) {
      var nn = 0;
      for (var m = 0; m < next.length; m++) if (cellText(next[m])) nn++;
      if (nn >= Math.max(2, Math.ceil(n * 0.5))) score += 12;
      else if (nn === 0) score -= 8;
    } else {
      score -= 6;                                    /* 最后一行不可能是表头 */
    }

    /* 上面是空行（标题区），说明这一行是正式表头的可能性更高 */
    var prev = grid[idx - 1];
    if (idx === 0) score += 4;
    else if (prev && isBlankRow(prev)) score += 3;

    return score;
  }

  function findHeaderRow(grid, maxScan) {
    var limit = Math.min(grid.length - 1, maxScan === undefined ? 20 : maxScan);
    var best = -1, bestScore = -Infinity, second = -Infinity;
    for (var i = 0; i <= limit; i++) {
      var s = scoreHeaderRow(grid, i);
      if (s > bestScore) { second = bestScore; bestScore = s; best = i; }
      else if (s > second) second = s;
    }
    /* 分数太低说明这个「表」根本没有表头（纯贴的文本） */
    if (bestScore < 26) return { row: -1, score: bestScore };
    return { row: best, score: bestScore, margin: bestScore - (isFinite(second) ? second : 0) };
  }

  /* 表头去重 + 补空列名 */
  function buildHeaders(grid, headerRow, width) {
    var raw = grid[headerRow] || [];
    var names = [];
    var seen = {};
    for (var i = 0; i < width; i++) {
      var t = cellText(raw[i]);
      if (!t) t = '第' + (i + 1) + '列';
      t = t.replace(/\s+/g, ' ').trim();
      if (seen[t]) {
        seen[t] += 1;
        t = t + ' (' + seen[t] + ')';
      } else {
        seen[t] = 1;
      }
      names.push(t);
    }
    return names;
  }

  /* ---------------- 列类型推断 ---------------- */

  function inferTypes(grid, headerRow, headers, rowNums) {
    var types = [];
    var sampleLimit = Math.min(grid.length, headerRow + 1 + 400);

    for (var c = 0; c < headers.length; c++) {
      var numCnt = 0, dateCnt = 0, textCnt = 0, emptyCnt = 0, total = 0;
      for (var r = headerRow + 1; r < sampleLimit; r++) {
        var v = grid[r] ? grid[r][c] : null;
        var t = cellText(v);
        if (!t) { emptyCnt++; continue; }
        total++;
        if (v instanceof Date) { dateCnt++; continue; }
        var pd = U.parseDate(v);
        if (pd && typeof v === 'string') { dateCnt++; continue; }
        var pm = U.parseMoney(v);
        if (pm !== null) { numCnt++; continue; }
        textCnt++;
      }
      var type = 'empty';
      if (total > 0) {
        if (dateCnt / total >= 0.6) type = 'date';
        else if (numCnt / total >= 0.7) type = 'number';
        else if (textCnt / total >= 0.6) type = 'text';
        else type = 'mixed';
      }
      types.push({ type: type, fills: total, empties: emptyCnt });
    }
    return types;
  }

  /* ---------------- Sheet 类型判定 ---------------- */

  function classifySheet(sheetName, headerRow, headers, dataRowCount, nonEmptyCells, noteLikeRatio) {
    var reasons = [];

    if (headerRow < 0 || headers.length === 0) {
      /* 没有表头结构时：本身就没几个字 → 空白页；有内容 → 说明页。
         注意不能先看 dataRowCount —— 说明页也是 0 数据行。 */
      if (nonEmptyCells < 3) {
        return { kind: 'blank', reason: '没有任何可识别的表格结构' };
      }
      return {
        kind: 'note',
        reason: '没找到表头行，' + (noteLikeRatio > 0.5 ? '内容以长文本为主，像说明页' : '内容不像数据表')
      };
    }

    if (dataRowCount === 0) {
      return { kind: 'note', reason: '只有表头没有数据行' };
    }

    var hitSummaryWord = false;
    for (var i = 0; i < headers.length; i++) {
      if (SUMMARY_WORD_RE.test(headers[i])) { hitSummaryWord = true; break; }
    }
    var nameLooksSummary = SUMMARY_NAME_RE.test(sheetName);
    var nameLooksNote = NOTE_NAME_RE.test(sheetName);

    if (nameLooksNote && dataRowCount <= 3) {
      return { kind: 'note', reason: '表名像说明页且只有 ' + dataRowCount + ' 行' };
    }

    if (hitSummaryWord && dataRowCount <= 6) {
      reasons.push('表头含「合计/小计/汇总」且只有 ' + dataRowCount + ' 行');
      return { kind: 'summary', reason: reasons.join('；') };
    }

    if (nameLooksSummary && dataRowCount <= 12) {
      reasons.push('表名含「汇总/合计」且只有 ' + dataRowCount + ' 行');
      return { kind: 'summary', reason: reasons.join('；') };
    }

    if (dataRowCount <= 2 && headers.length <= 3) {
      return { kind: 'note', reason: '内容太少（' + dataRowCount + ' 行 / ' + headers.length + ' 列）' };
    }

    if (nameLooksSummary) {
      return { kind: 'detail', reason: '表名像汇总，但数据行较多（' + dataRowCount + ' 行），按明细处理，请确认' , suspect: true };
    }

    return { kind: 'detail', reason: '' };
  }

  /* ---------------- 主入口 ---------------- */

  function analyzeSheet(name, ws, index) {
    var g = readSheetGrid(ws);
    var grid = g.grid;
    var rowNums = g.rowNums;
    var warnings = [];
    if (g.truncated) warnings.push('行数超过 ' + U.fmtInt(MAX_ROWS) + '，只读取了前 ' + U.fmtInt(MAX_ROWS) + ' 行');

    /* 宽度取所有行的最大有效列数（避免 !ref 过宽带来一堆空列） */
    var width = 0;
    for (var r = 0; r < grid.length; r++) {
      var row = grid[r];
      for (var c = row.length - 1; c >= 0; c--) {
        if (cellText(row[c])) { if (c + 1 > width) width = c + 1; break; }
      }
    }
    if (width > MAX_COLS) { width = MAX_COLS; warnings.push('列数超过 ' + MAX_COLS + '，只读取前 ' + MAX_COLS + ' 列'); }

    var nonEmptyCells = 0, longTextCells = 0, textCells = 0;
    for (var r2 = 0; r2 < grid.length; r2++) {
      for (var c2 = 0; c2 < width; c2++) {
        var t = cellText(grid[r2][c2]);
        if (!t) continue;
        nonEmptyCells++;
        textCells++;
        if (t.length > 22) longTextCells++;
      }
    }
    var noteLikeRatio = textCells ? longTextCells / textCells : 0;

    var hdr = findHeaderRow(grid, 20);
    var headerRow = hdr.row;
    var headers = headerRow >= 0 ? buildHeaders(grid, headerRow, width) : [];

    /* 数据行：表头之后、非空行 */
    var dataIdx = [];
    if (headerRow >= 0) {
      for (var r3 = headerRow + 1; r3 < grid.length; r3++) {
        if (!isBlankRow(grid[r3])) dataIdx.push(r3);
      }
    }

    var cls = classifySheet(name, headerRow, headers, dataIdx.length, nonEmptyCells, noteLikeRatio);
    var colTypes = headerRow >= 0 ? inferTypes(grid, headerRow, headers, rowNums) : [];

    /* 数据行抽成「对齐 headers 的数组」，同时保留原始行号 */
    var rows = [];
    var rowSeq = [];
    for (var k = 0; k < dataIdx.length; k++) {
      var gi = dataIdx[k];
      var src = grid[gi] || [];
      var out = new Array(width);
      for (var cc = 0; cc < width; cc++) out[cc] = src[cc] === undefined ? null : src[cc];
      rows.push(out);
      rowSeq.push(rowNums[gi] || (gi + 1));
    }

    /* 若表头下面紧跟的几行看起来又是表头（多层表头），提示用户 */
    if (headerRow >= 0 && dataIdx.length && scoreHeaderRow(grid, dataIdx[0]) > 40) {
      warnings.push('表头下方第一行也像表头，可能存在双层表头，请核对列名是否正确');
    }

    return {
      name: name,
      index: index,
      headerRow: headerRow,                 /* 0-based（相对 sheet），-1 表示没找到 */
      headerRowNum: headerRow >= 0 ? (rowNums[headerRow] || headerRow + 1) : null,
      headers: headers,
      rows: rows,
      rowNumbers: rowSeq,
      colTypes: colTypes,
      kind: cls.kind,
      kindReason: cls.reason || '',
      suspect: !!cls.suspect,
      dataRowCount: rows.length,
      nonEmptyCells: nonEmptyCells,
      width: width,
      warnings: warnings
    };
  }

  /* 读文件。返回 Promise，异常统一 throw 带中文 message */
  function parseFile(file, onProgress) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('没有选择文件'));
      if (file.size > MAX_FILE) {
        return reject(new Error('文件太大（' + U.bytes(file.size) + '），请控制在 ' + U.bytes(MAX_FILE) + ' 以内'));
      }
      if (!/\.(xlsx|xls|xlsm|csv|txt)$/i.test(file.name)) {
        return reject(new Error('只支持 .xlsx / .xls / .csv 格式，当前是 ' + (file.name.split('.').pop() || '未知')));
      }

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('文件读取失败，可能文件已损坏或被占用')); };
      reader.onload = function () {
        try {
          if (onProgress) onProgress('正在解析 ' + file.name + ' …');
          var wb = readWorkbook(reader.result, file.name);

          if (!wb.SheetNames || !wb.SheetNames.length) {
            return reject(new Error('这个文件里没有任何工作表'));
          }

          var sheets = [];
          for (var i = 0; i < wb.SheetNames.length; i++) {
            var nm = wb.SheetNames[i];
            var ws = wb.Sheets[nm];
            var s;
            try {
              s = analyzeSheet(nm, ws, i);
            } catch (e) {
              /* 单张表解析失败不该让整个文件失败 */
              s = {
                name: nm, index: i, headerRow: -1, headers: [], rows: [], rowNumbers: [],
                colTypes: [], kind: 'blank', kindReason: '解析失败：' + (e && e.message || '未知错误'),
                dataRowCount: 0, nonEmptyCells: 0, width: 0, warnings: ['这张表解析失败，已跳过']
              };
            }
            sheets.push(s);
            if (onProgress) onProgress('已读取 ' + (i + 1) + '/' + wb.SheetNames.length + ' 张工作表');
          }

          var warnings = [];
          var isCsv = /\.(csv|txt)$/i.test(file.name);
          if (isCsv) warnings.push('CSV 文件只有一个工作表；如果你的 外部表是多 Sheet 的 Excel，请上传原文件');

          resolve({
            fileName: file.name,
            fileSize: file.size,
            ext: (file.name.split('.').pop() || '').toLowerCase(),
            isCsv: isCsv,
            sheets: sheets,
            warnings: warnings
          });
        } catch (e) {
          var msg = (e && e.message) || '解析失败';
          if (/password|encrypted/i.test(msg)) msg = '这个文件有密码保护，请先取消密码再上传';
          else if (/Unsupported|corrupt|Bad|not a zip/i.test(msg)) msg = '文件格式无法识别，请确认是有效的 Excel 文件（不是改了后缀的其它文件）';
          reject(new Error(msg));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  return {
    parseFile: parseFile,
    analyzeSheet: analyzeSheet,
    MAX_ROWS: MAX_ROWS
  };
})();
