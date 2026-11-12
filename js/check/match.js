/* ==========================================================
   match.js — 门店名称规范化、相似度、匹配决策
   ----------------------------------------------------------
   设计原则（这条比算法重要）：
   程序只在「非常确定」时才自动认定同一家门店，其余一律转人工。
   错配一家店的代价是几十万金额记到别人头上，比多问一次贵得多。

   三档结论：
     auto     score ≥ 0.90 且与第二名差距 ≥ 0.06（唯一且明显）
     confirm  0.60 ≤ score < 0.90，或者有并列候选 → 给候选让人点
     none     score < 0.60 → 未匹配
   ========================================================== */
window.CKMatch = (function () {
  'use strict';

  var U = window.CKUtil;

  var AUTO_OK = 0.90;
  var AUTO_MARGIN = 0.06;
  var SOFT = 0.60;

  /* 常见后缀，长串优先（先匹配"购物中心"再匹配"中心"）。
     「加单/首批/补单」：订货批次标记会被顺手写进门店名尾（如「中关村大融城加单」），
     不是店名的一部分，剥掉后「中关村大融城加单」才能和「中关村大融城店」对上。 */
  var SUFFIXES = [
    '购物中心', '购物广场', '购物公园', '生活广场', '商业广场', '购物商城',
    '旗舰店', '专卖店', '直营店', '加盟店', '体验店', '概念店', '工厂店', '品牌店',
    '分公司', '分店', '门店', '店',
    '有限公司', '有限责任公司', '公司',
    '百货商场', '百货', '商场', '商厦', '大厦', '大楼', '中心', '广场', '超市',
    '店(直营)', '-直营',
    '加单', '首批', '补单', '追加'
  ];

  /* 城市前缀：内部表爱写「上海环球港」，外部表爱写「环球港店」
     2026-11-05 按真实月度表（云阿蛮北京蜀海仓10月）大幅扩充：
     原表缺了山西全境、内蒙全境、河北承德/衡水/邯郸、山东威海/东营/德州等，
     缺城市 → 「去城市变体」生成不了、「两边城市不同」的风险检测也失效。 */
  var CITIES = [
    '北京', '上海', '广州', '深圳', '天津', '重庆', '成都', '杭州', '南京', '武汉',
    '西安', '苏州', '长沙', '郑州', '青岛', '沈阳', '大连', '宁波', '厦门', '福州',
    '济南', '合肥', '昆明', '哈尔滨', '长春', '石家庄', '太原', '南昌', '贵阳', '南宁',
    '兰州', '乌鲁木齐', '呼和浩特', '银川', '西宁', '拉萨', '海口', '三亚', '无锡',
    '常州', '温州', '嘉兴', '绍兴', '东莞', '佛山', '珠海', '中山', '惠州', '汕头',
    '泉州', '烟台', '潍坊', '淄博', '徐州', '南通', '扬州', '盐城', '洛阳', '唐山',
    '保定', '廊坊', '台州', '金华', '湖州', '芜湖', '赣州', '宜昌', '襄阳', '株洲',
    /* 山西 */
    '大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁',
    /* 内蒙古（含日常简称，简称在 CITY_ALIAS 里归一到全名） */
    '呼市', '包头', '乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '呼盟',
    '巴彦淖尔', '巴盟', '乌兰察布', '乌盟', '锡林郭勒', '锡盟', '兴安盟', '阿拉善',
    /* 河北 */
    '承德', '张家口', '沧州', '衡水', '邢台', '邯郸', '雄安',
    /* 东北其余 */
    '吉林', '四平', '辽源', '通化', '白山', '松原', '白城', '延边',
    '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '阜新', '辽阳', '盘锦', '铁岭',
    /* 西北 */
    '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '酒泉', '定西', '陇南',
    /* 山东其余 */
    '济宁', '泰安', '威海', '日照', '莱芜', '临沂', '德州', '聊城', '滨州', '菏泽', '东营'
  ];

  /* 城市简称归一：「呼市」和「呼和浩特」是同一个城市，
     城市风险检测时两边要归一到全名再比，否则同城市不同写法会被误压分。 */
  var CITY_ALIAS = {
    '呼市': '呼和浩特', '呼盟': '呼伦贝尔', '巴盟': '巴彦淖尔',
    '乌盟': '乌兰察布', '锡盟': '锡林郭勒'
  };

  function cityOf(name) {
    return CITY_ALIAS[name] || name;
  }

  var BRACKET_RE = /[（(【\[〔][^）)】\]〕]*[）)】\]〕]/g;
  var BRACKET_INNER_RE = /[（(【\[〔]([^）)】\]〕]+)[）)】\]〕]/;
  var PHONE_RE = /1[3-9]\d{9}/g;
  var LABEL_RE = /^(收货门店|收货单位|门店名称|门店|店铺|客户名称|客户|收货人|收货地址|地址|备注|说明|运单备注|配送门店|目的门店)\s*[:：]?\s*/;
  var SPLIT_RE = /[-—–_/|\\,，;；:：\s]+/;

  /* ---------- 规范化 ---------- */

  function stripBrackets(s) {
    return s.replace(BRACKET_RE, '');
  }

  /* 提取第一个括号里的内容（去掉括号符号）。
     业务口径（2026-11-05 用户确认）：门店名常写成「品牌（城市 商场名）」
     （如「云阿蜜生烫牛肉米线（长春 欧亚）」），这家店的真实身份就是括号内那部分，
     品牌名只是冗余前缀。所以遇到带括号的名字，识别和展示都只认括号里的内容；
     没有括号的保持原样。取第一个括号（后面再有括号通常是备注，忽略）。
     返回 '' 表示这名字没有可用的括号内容。 */
  function bracketInner(s) {
    var m = s.match(BRACKET_INNER_RE);
    if (!m) return '';
    var inner = m[1].replace(/[\s]+/g, '');
    return inner.length >= 2 ? inner : '';
  }

  /* ---------- 真实数据的脏东西清理（2026-11-05 云阿蛮 10 月表） ----------
     三类高频污染，全部在规范化入口统一剥掉：
     ① 「门店名(仓库承担运费)」——括号是备注不是身份，含备注词就整段删（含未闭合的）；
     ② 「澳德乐时代广场店:」——尾部手滑标点；
     ③ 「吕梁临县店2」「星河COCO City店2」——同店多行时人肉加的尾序号。 */

  var NOTE_WORDS = /承担|运费|地址|电话|时间|送货|发货|避开|限高|盖章|冷链|月结|到付|自提|联系|师傅|号楼|单元|号楼|配送|预约|注意|事项/;

  function stripNoteBrackets(s) {
    /* 闭合的备注括号：命中备注词 → 整段删除 */
    var out = s.replace(BRACKET_RE, function (m) { return NOTE_WORDS.test(m) ? '' : m; });
    /* 尾部未闭合的备注括号（外部表常见「店(仓库承担运费」写漏右括号） */
    out = out.replace(/[（(【\[〔][^）)】\]〕]*$/, function (m) { return NOTE_WORDS.test(m) ? '' : m; });
    return out;
  }

  /* 门店名统一规范化入口：normText → 去尾标点 → 剥备注括号 → 去尾序号。
     vmeta / canonicalKey / identityKey 全走这里，别各自散着处理。 */
  function normName(raw) {
    var s = U.normText(raw);
    if (!s) return '';
    s = s.replace(/[：:，,。.、;；!！?？·~～\-—_]+$/, '');
    s = stripNoteBrackets(s);
    if (s.length > 3) s = s.replace(/[0-9]{1,3}$/, '');
    return s;
  }

  function stripSuffix(s) {
    var out = s;
    for (var round = 0; round < 3; round++) {
      var changed = false;
      for (var i = 0; i < SUFFIXES.length; i++) {
        var sfx = SUFFIXES[i];
        if (out.length > sfx.length + 1 && out.slice(-sfx.length) === sfx) {
          out = out.slice(0, -sfx.length);
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
    return out;
  }

  function stripCity(s) {
    for (var i = 0; i < CITIES.length; i++) {
      var c = CITIES[i];
      if (s.length > c.length + 1 && s.indexOf(c) === 0) return s.slice(c.length);
    }
    return s;
  }

  /* 命中的城市（长名优先），没命中返回 ''。
     返回前过 CITY_ALIAS 归一：「呼市」→「呼和浩特」，城市风险比较才不会误伤。 */
  function detectCity(s) {
    var best = '';
    for (var i = 0; i < CITIES.length; i++) {
      var c = CITIES[i];
      if (c.length > best.length && s.length > c.length + 1 && s.indexOf(c) === 0) best = c;
    }
    return best ? cityOf(best) : '';
  }

  /* 生成比较变体（带元信息）：
       level 0 原文 / 1 去括号符号（保留括号里的字）/ 2 再去后缀 / 3 去城市 / 4 去城市+后缀
       city  记录被剥掉的城市 —— 两边城市不同时不能算同一家店。
              「深圳万象城」和「杭州万象城」去掉城市后一字不差，这是最容易错配的一类，
              所以城市信息必须跟着变体一起走，不能剥完就扔。
       重要：带括号的名字（「品牌（城市 商场名）」），门店身份 = 括号内的字。
             所以 level 0 就用括号内的字作为「主身份」，括号外的品牌名不再参与识别，
             否则同品牌所有分店都会被合并成一家。
             「云阿蜜生烫牛肉米线（长春 欧亚）」的 level 0 就是「长春欧亚」。 */
  function vmeta(raw) {
    var base = normName(raw);
    if (!base) return [];
    /* 带括号 → 门店身份就是括号内的字，作为 level 0 的主身份。
       括号内的字开头往往是城市（「长春 欧亚」），但它不是可剥的「城市前缀」，
       而是身份本身 —— 剥了会把「长春欧亚」和「沈阳欧亚」都变成「欧亚」。
       所以括号分支不再做 detectCity / 去城市，直接当完整身份处理。 */
    var inner = bracketInner(base);
    var isBracketed = !!inner;
    if (inner) base = inner;
    var list = [];
    function push(t, level) {
      if (!t || t.length < 2) return;
      for (var i = 0; i < list.length; i++) if (list[i].t === t) return;
      list.push({ t: t, level: level });
    }
    var noBr = flattenBrackets(base);
    var noSfx = stripSuffix(noBr);
    var city = isBracketed ? '' : detectCity(noBr);
    var noCity = city ? noBr.slice(city.length) : noBr;
    var core = city ? stripSuffix(noCity) : noSfx;
    push(base, 0);
    push(noBr, 1);
    push(noSfx, 2);
    if (city) { push(noCity, 3); push(core, 4); }
    /* 城市挂在整组变体上：只要这个名字本身带城市前缀，
       它的每一版写法都算「来自这个城市」，免得拿没剥城市的原文去和别人的城市变体比 */
    list.forEach(function (x) { x.city = city; });
    return list;
  }

  /* 对外只暴露纯字符串变体 */
  function variants(raw) {
    return vmeta(raw).map(function (x) { return x.t; });
  }

  /* 主规范化键：有括号 → 用括号内的字；否则去括号符号（保留字）→ 去后缀。
     带括号的门店，身份 = 括号内的字（品牌名是冗余前缀，不参与识别）。
     注意：括号内的字通常是「城市 + 商场名」，开头就是城市本身，
     所以括号分支**不做去城市**——剥了城市反而把身份剥丢了
     （「长春 欧亚」和「沈阳 欧亚」会都塌成「欧亚」）。

     2026-11-05 用户确认：无括号的名字也**不再剥城市前缀**。
     「哈尔滨王府井店」和「北京王府井店」是两家不同的店，剥掉城市后
     都塌成「王府井」，就会被并成一家店——这是用户最不能接受的错配
     （几十万金额记到别人头上）。跨表的「上海环球港 vs 环球港店」这类
     写法差异，不靠分组键去剥城市，而是由 vmeta 的「去城市变体」在
     compareVariants 里对齐（level 3/4 的 noCity/core 变体）。 */
  function canonicalKey(raw) {
    var base = normName(raw);
    if (!base) return '';
    var inner = bracketInner(base);
    if (inner) return stripSuffix(flattenBrackets(inner));
    return stripSuffix(flattenBrackets(base));
  }

  /* 从「运单备注」这类自由文本里抽门店名候选。
     外部表常见： "上海环球港店-王五-13800138000" / "收货门店：上海环球港店" */
  function extractCandidates(raw) {
    var s = U.normText(raw);
    if (!s) return [];
    var out = [];

    var noPhone = s.replace(PHONE_RE, '');
    var noLabel = noPhone.replace(LABEL_RE, '');

    [noLabel, noPhone, s].forEach(function (v) {
      if (!v) return;
      var parts = v.split(SPLIT_RE).filter(function (p) {
        return p && p.length >= 2 && !/^\d+$/.test(p) && !/^[\d.]+$/.test(p);
      });
      if (parts.length) {
        var head = parts[0];
        /* 第一段常常是门店名；但也可能是「顺丰」这类承运商，一并给出让打分决定 */
        if (out.indexOf(head) < 0) out.push(head);
      }
      /* 整串也留一个：有些备注就是光秃秃一个店名 */
      var whole = v.replace(SPLIT_RE, '');
      if (whole && whole.length >= 2 && out.indexOf(whole) < 0) out.push(whole);
    });

    return out;
  }

  /* ---------- 相似度 ---------- */

  function bigramCount(s) {
    var m = Object.create(null);
    for (var i = 0; i < s.length - 1; i++) {
      var g = s.substr(i, 2);
      m[g] = (m[g] || 0) + 1;
    }
    return m;
  }

  /* Dice 系数（多重集） */
  function dice(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    var A = bigramCount(a), B = bigramCount(b);
    var inter = 0, totalA = 0, totalB = 0;
    var k;
    for (k in A) totalA += A[k];
    for (k in B) totalB += B[k];
    for (k in A) if (B[k]) inter += Math.min(A[k], B[k]);
    if (!totalA || !totalB) return 0;
    return (2 * inter) / (totalA + totalB);
  }

  /* 最长公共子序列占比 */
  function lcsRatio(a, b) {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    var n = a.length, m = b.length;
    if (n * m > 40000) return dice(a, b);      /* 超长串别做 O(nm) */
    var prev = new Array(m + 1).fill(0);
    var cur = new Array(m + 1).fill(0);
    for (var i = 1; i <= n; i++) {
      for (var j = 1; j <= m; j++) {
        cur[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
          ? prev[j - 1] + 1
          : (prev[j] > cur[j - 1] ? prev[j] : cur[j - 1]);
      }
      var t = prev; prev = cur; cur = t;
      cur[0] = 0;
      for (var z = 1; z <= m; z++) cur[z] = cur[z] || 0;
    }
    return prev[m] / Math.max(n, m);
  }

  /* 单字差异：等长、恰好 1 个字不同、长度 ≥ 5。
     外部表手写录入的错别字全是这类（「奥菜/奥莱」「维安/雄安」「或海/威海」「孟县/盂县」），
     按 dice/LCS 只能得 0.63~0.87，全卡在「待确认」让人逐条点——业务每月都遇到，太磨人。 */
  function singleCharDiff(a, b) {
    if (a.length !== b.length || a.length < 5) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      if (a.charCodeAt(i) !== b.charCodeAt(i)) {
        diff++;
        if (diff > 1) return false;
      }
    }
    return diff === 1;
  }

  function containScore(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    var short, long;
    if (a.length < b.length) { short = a; long = b; } else { short = b; long = a; }
    if (long.indexOf(short) < 0) return 0;
    var r = short.length / long.length;
    if (r < 0.45) return 0.55;                 /* 只沾了一小段，别给高分 */
    return 0.84 + (r - 0.45) * 0.28;           /* 0.84 ~ 0.99 */
  }

  /* 「二期 / 东区 / B座」这类区别词：加上它往往是另一家店
     （同一商场一期二期分开结算很常见），所以压到自动线以下让人点一下。 */
  var QUAL_RESIDUAL = /(一期|二期|三期|四期|五期|六期|新馆|老馆|新店|老店|新区|老区|东区|西区|南区|北区|中区|东馆|西馆|北楼|南楼|东楼|西楼|中楼|[\d一二三四五六七八九十]{1,2}\s*(期|区|馆|楼|座|层|栋|号))/;

  /* 一个字串比另一个多出来的部分（谁包含谁） */
  function residualOf(a, b) {
    if (!a || !b || a === b) return '';
    var short = a.length < b.length ? a : b;
    var long = a.length < b.length ? b : a;
    if (long.indexOf(short) < 0) return '';
    return long.replace(short, '');
  }

  /* 两组变体之间的最高分。
     除了分数还回报风险：risk='city' 城市对不上（压到 0.5，不给软线机会），
     risk='qualifier' 多了「二期」这类区别词（压到 0.87，只能进人工）。 */
  function compareVariants(ma, mb) {
    var best = 0, method = '', risk = '', residual = '';
    for (var i = 0; i < ma.length; i++) {
      for (var j = 0; j < mb.length; j++) {
        var x = ma[i], y = mb[j];
        if (!x || !y || !x.t || !y.t) continue;

        var s, m;
        if (x.t === y.t) {
          s = 1; m = 'exact';
        } else {
          s = containScore(x.t, y.t);
          m = 'contains';
          var fuzzy = 0.55 * dice(x.t, y.t) + 0.45 * lcsRatio(x.t, y.t);
          /* 原文（i===0/j===0）之外的变体相等也算强证据，但比原文弱一点 */
          if (i > 0 || j > 0) fuzzy = Math.min(0.97, fuzzy + 0.02);
          if (fuzzy > s) { s = fuzzy; m = 'fuzzy'; }
          /* 错别字规则：等长、恰好 1 字不同、≥5 字 → 0.92 直接给到自动线。
             城市不同的风险压制（→0.5）在后面统一生效，跨城市不会误配；
             matchAll 的 margin≥0.06 与冲突检测也都在，两家真店一字之差时仍会拦下。 */
          if (singleCharDiff(x.t, y.t)) {
            if (0.92 > s) { s = 0.92; m = 'fuzzy'; }
          }
        }

        var riskHere = '', res = '';
        if (x.city && y.city && x.city !== y.city) {
          s = Math.min(s, 0.5);
          riskHere = 'city';
        } else {
          res = residualOf(x.t, y.t);
          if (res && QUAL_RESIDUAL.test(res)) {
            s = Math.min(s, 0.87);
            riskHere = 'qualifier';
          }
        }

        if (s > best) { best = s; method = m; risk = riskHere; residual = res; }
      }
    }
    return { score: best, method: method, risk: risk, residual: residual };
  }

  /* 单对名称打分（供 UI 预览 / 人工比对参考） */
  function score(rawA, rawB) {
    var va = vmeta(rawA);
    var vb = vmeta(rawB);
    if (!va.length || !vb.length) return { score: 0, method: 'empty' };
    return compareVariants(va, vb);
  }

  /* ---------- 别名库 ---------- */

  /* 去掉括号符号但保留括号里的字：「门店（东区）」与「门店东区」要能对上 */
  function flattenBrackets(s) {
    return s.replace(/[()\[\]【】〔〕]/g, '');
  }

  /* 门店「轻身份」：去空白/全半角 + 去括号符号。
     带括号的名字 → 身份 = 括号内的字（品牌名是冗余前缀）。
     用于把同店的不同写法（括号有无、空格、全半角）归成同一个展示名，
     但不去后缀/城市 —— 「鹤岗中心店」和「鹤岗店」仍是两个身份。
     比 canonicalKey（还去城市去后缀）更轻，适合「原始名称」去重展示。 */
  function identityKey(raw) {
    var base = normName(raw);
    if (!base) return '';
    var inner = bracketInner(base);
    return flattenBrackets(inner || base);
  }

  /* 门店展示名：带括号 → 只显示括号内的字；否则原样。
     这是「识别 + 展示」的统一口径 —— 界面上看到的门店名，就是括号里的身份，
     不再带品牌前缀。括号内文字保留原文的空格（城市和商场名之间那格有用）。
     「门店名(仓库承担运费)」这类备注括号先剥掉，展示名不带备注。 */
  function displayName(raw) {
    var s = (raw === null || raw === undefined) ? '' : String(raw).trim();
    if (!s) return '';
    s = stripNoteBrackets(s).trim();
    if (!s) return '';
    var m = s.match(BRACKET_INNER_RE);
    if (m) {
      var inner = m[1].trim();
      if (inner.length >= 2) return inner;
    }
    return s;
  }

  /* 一个名字的多把钥匙：原文 / 规范键（去城市去后缀）/ 去括号符号
     多留几把是为了「人工登记过的写法」不要因为括号、城市、后缀的写法差异而丢命中 */
  function aliasKeys(raw) {
    var base = normName(raw);
    if (!base) return [];
    var out = [base];
    var ck = canonicalKey(raw);
    if (ck && out.indexOf(ck) < 0) out.push(ck);
    var flat = flattenBrackets(base);
    if (flat && out.indexOf(flat) < 0) out.push(flat);
    return out;
  }

  function buildAliasIndex(aliases) {
    var idx = Object.create(null);
    (aliases || []).forEach(function (al) {
      if (!al || !al.variant || !al.canonical) return;
      aliasKeys(al.variant).forEach(function (k) {
        if (k && !idx[k]) idx[k] = { canonical: al.canonical, alias: al };
      });
    });
    return idx;
  }

  function lookupAlias(idx, names) {
    for (var i = 0; i < names.length; i++) {
      var keys = aliasKeys(names[i]);
      for (var j = 0; j < keys.length; j++) {
        if (idx[keys[j]]) return idx[keys[j]];
      }
    }
    return null;
  }

  /* ---------- 批量匹配 ----------

     bList / aList: [{ key, rawName, count, amount }]
     返回 { results: { [bKey]: {...} }, stats }
  */
  function matchAll(bList, aList, opts) {
    opts = opts || {};
    var aliases = opts.aliases || [];
    var aliasIdx = buildAliasIndex(aliases);
    var autoOk = opts.autoThreshold === undefined ? AUTO_OK : opts.autoThreshold;
    var soft = opts.softThreshold === undefined ? SOFT : opts.softThreshold;

    function addExtra(meta, raw) {
      var city = meta.length ? (meta[0].city || '') : '';
      extractCandidates(raw).forEach(function (x) {
        var t = U.normText(x);
        if (!t || t.length < 2) return;
        for (var i = 0; i < meta.length; i++) if (meta[i].t === t) return;
        meta.push({ t: t, city: city, level: 5 });
      });
      return meta;
    }

    /* 预计算 A 侧变体，避免重复计算 */
    var aPrepared = aList.map(function (a) {
      return {
        item: a,
        base: normName(a.rawName),
        key: canonicalKey(a.rawName),
        variants: addExtra(vmeta(a.rawName).slice(), a.rawName)
      };
    });

    var results = Object.create(null);
    var stats = { auto: 0, confirm: 0, none: 0, alias: 0 };

    bList.forEach(function (b) {
      var bMeta = addExtra(vmeta(b.rawName).slice(), b.rawName);
      var bNames = [b.rawName].concat(bMeta.map(function (x) { return x.t; }));

      /* ① 别名库优先：人工确认过的关系直接用 */
      var hit = lookupAlias(aliasIdx, bNames);

      if (hit) {
        /* 别名里的 canonical 要在 A 侧真的存在，否则回落去算。
           注意两边都要过一遍 normText —— 库里存的是用户输入的原文，
           可能带全角括号，直接比字符串会漏。 */
        var hc = U.normText(hit.canonical);
        var hk = canonicalKey(hit.canonical);
        var found = null;
        for (var j = 0; j < aPrepared.length; j++) {
          var ap = aPrepared[j];
          if (ap.base === hc || ap.key === hk || (hk && canonicalKey(ap.base) === hk)) { found = ap; break; }
        }
        if (found) {
          results[b.key] = {
            status: 'auto', method: 'alias', score: 1,
            aKey: found.item.key, aName: found.item.rawName,
            candidates: [{ aKey: found.item.key, aName: found.item.rawName, score: 1, method: 'alias' }],
            note: '来自门店匹配库'
          };
          stats.auto++; stats.alias++;
          return;
        }
      }

      /* ② 逐个算分 */
      var scored = [];
      for (var p = 0; p < aPrepared.length; p++) {
        var apx = aPrepared[p];
        var r = compareVariants(bMeta, apx.variants);
        if (r.score > 0.02) {
          scored.push({
            aKey: apx.item.key, aName: apx.item.rawName, score: r.score,
            method: r.method, aKeyCanon: apx.key, risk: r.risk, residual: r.residual
          });
        }
      }
      scored.sort(function (x, y) { return y.score - x.score; });

      /* 同分时：A 侧这个门店名如果已经「被更明确的匹配占用」，降权在后处理里做 */
      var top = scored[0] || null;
      var second = scored[1] || null;

      if (!top || top.score < soft) {
        results[b.key] = {
          status: 'none', method: 'none', score: top ? top.score : 0,
          aKey: null, aName: null,
          candidates: scored.slice(0, 5),
          note: top ? '没有足够相似的门店' : '内部表中没有任何门店'
        };
        stats.none++;
        return;
      }

      var margin = second ? top.score - second.score : 1;
      var isExact = top.method === 'exact';

      if ((top.score >= autoOk && margin >= AUTO_MARGIN) || (isExact && margin >= 0.001)) {
        results[b.key] = {
          status: 'auto', method: top.method, score: top.score,
          aKey: top.aKey, aName: top.aName,
          candidates: scored.slice(0, 5),
          note: ''
        };
        stats.auto++;
      } else {
        var note = margin < AUTO_MARGIN && top.score >= autoOk
          ? '有多个相似门店，需要你确认'
          : '相似度不够高，需要你确认';
        if (top.risk === 'qualifier') {
          note = '两边写法只差「' + (top.residual || '一小段') + '」——同一商场分期、分区常被当成两家店，需要你确认';
        }
        results[b.key] = {
          status: 'confirm', method: top.method, score: top.score,
          aKey: top.aKey, aName: top.aName,
          candidates: scored.slice(0, 5),
          note: note
        };
        stats.confirm++;
      }
    });

    /* ④ 冲突检测：多个 B 门店指向同一个 A 门店 → 全部降级为待确认 */
    var usedBy = Object.create(null);
    Object.keys(results).forEach(function (bk) {
      var r = results[bk];
      if (r.status === 'auto' && r.aKey) {
        (usedBy[r.aKey] = usedBy[r.aKey] || []).push(bk);
      }
    });
    Object.keys(usedBy).forEach(function (ak) {
      var arr = usedBy[ak];
      if (arr.length > 1) {
        arr.forEach(function (bk) {
          var r = results[bk];
          r.status = 'confirm';
          r.note = '有 ' + arr.length + ' 个 外部表门店都指向同一家 内部表门店，需要你确认';
          stats.auto--; stats.confirm++;
        });
      }
    });

    return { results: results, stats: stats };
  }

  return {
    canonicalKey: canonicalKey,
    identityKey: identityKey,
    displayName: displayName,
    variants: variants,
    aliasKeys: aliasKeys,
    extractCandidates: extractCandidates,
    score: score,
    matchAll: matchAll,
    buildAliasIndex: buildAliasIndex,
    thresholds: { auto: AUTO_OK, margin: AUTO_MARGIN, soft: SOFT }
  };
})();
