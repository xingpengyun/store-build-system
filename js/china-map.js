/* ==========================================================
   china-map.js — 首页「全国门店分布」中国分省统计地图

   数据：js/china-map-data.js（标准行政区划边界，含台湾省、香港/澳门
         特别行政区、南海诸岛九段线；均为中国领土，不单独成国家）
   口径：Store.getState().stores[].province 按省聚合，不采集任何个人位置。
   视图：默认「统计地图」纯内联 SVG、零网络依赖；
         可切换到「腾讯地图」合规底图（GL JS 代理模式，见 index.html
         的 _TMapSecurityConfig，SDK URL 不带 key、前端零密钥）。
   ========================================================== */
window.ChinaMap = (function () {
  'use strict';

  var U = window.Utils;
  var D = window.ChinaMapData || null;

  /* 0 家 / 1~5 档：按当次数据最大值相对分级，避免门店总数一变就全挤一个色 */
  var COLORS = ['#e0ebf9', '#c8dcf7', '#a9c8f1', '#7faae9', '#5685da', '#3566cf'];

  /* 面积太小的省级行政区：数字放到旁边空白处，用细引线连回本省，
     否则京津 / 沪 / 港澳的数字会叠成一团（1:1 实图确认过） */
  var CALLOUT = {
    '北京': [58, -38], '天津': [92, -20], '上海': [64, -24],
    '香港': [80, 42], '澳门': [-26, 68], '宁夏': [-46, -34]
  };

  /* 门店省份字段的写法归一：全名 / 简称 / 单字简称都收进来。
     seed.js 用的是简称（「广东」「上海」），手工录入常见「广东省」。 */
  var ALIAS = {
    '京': '北京', '津': '天津', '冀': '河北', '晋': '山西', '蒙': '内蒙古',
    '辽': '辽宁', '吉': '吉林', '黑': '黑龙江', '沪': '上海', '苏': '江苏',
    '浙': '浙江', '皖': '安徽', '闽': '福建', '赣': '江西', '鲁': '山东',
    '豫': '河南', '鄂': '湖北', '湘': '湖南', '粤': '广东', '桂': '广西',
    '琼': '海南', '渝': '重庆', '川': '四川', '蜀': '四川', '黔': '贵州',
    '贵': '贵州', '滇': '云南', '云': '云南', '藏': '西藏', '陕': '陕西',
    '秦': '陕西', '甘': '甘肃', '陇': '甘肃', '青': '青海', '宁': '宁夏',
    '新': '新疆', '台': '台湾', '港': '香港', '澳': '澳门'
  };

  var FULL = {};          /* short -> 官方全称 */
  var BY_NAME = {};       /* 任意写法 -> short */
  var allShorts = [];

  if (D) {
    D.provinces.forEach(function (p) {
      FULL[p.short] = p.name;
      allShorts.push(p.short);
      BY_NAME[p.short] = p.short;
      BY_NAME[p.name] = p.short;
      /* 「广东省」「上海市」「新疆维吾尔自治区」等去掉行政后缀 */
      var bare = p.name
        .replace(/特别行政区$/, '')
        .replace(/维吾尔自治区$|壮族自治区$|回族自治区$|自治区$/, '')
        .replace(/省$|市$/, '');
      if (bare) BY_NAME[bare] = p.short;
    });
    Object.keys(ALIAS).forEach(function (k) {
      if (FULL[ALIAS[k]]) BY_NAME[k] = ALIAS[k];
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalize(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(/\s+/g, '');
    if (!s) return '';
    s = s.replace(/^中国/, '');
    if (BY_NAME[s]) return BY_NAME[s];
    /* 「广东·深圳」「浙江省杭州市」这类：取开头两三个字再试一次 */
    var head = s.slice(0, 3);
    if (BY_NAME[head]) return BY_NAME[head];
    head = s.slice(0, 2);
    if (BY_NAME[head]) return BY_NAME[head];
    return '';
  }

  /* 聚合：返回 counts（short -> 家数）、rows（有门店的省，降序）、
     max、total、covered（覆盖省份数）、unknown（库里认不出的写法） */
  function aggregate(stores) {
    var counts = {}, unknown = {}, total = 0;
    (stores || []).forEach(function (s) {
      total++;
      var k = normalize(s && s.province);
      if (!k) {
        var label = String((s && s.province) || '未填省份').trim() || '未填省份';
        unknown[label] = (unknown[label] || 0) + 1;
        return;
      }
      counts[k] = (counts[k] || 0) + 1;
    });
    var rows = allShorts.filter(function (k) { return counts[k] > 0; })
      .map(function (k) { return { short: k, name: FULL[k], count: counts[k] }; })
      .sort(function (a, b) { return b.count - a.count || a.short.localeCompare(b.short, 'zh'); });
    var max = rows.length ? rows[0].count : 0;
    var unknownRows = Object.keys(unknown).map(function (k) {
      return { name: k, count: unknown[k] };
    }).sort(function (a, b) { return b.count - a.count; });
    return {
      counts: counts, rows: rows, max: max, total: total,
      covered: rows.length, unknown: unknownRows
    };
  }

  function levelOf(count, max) {
    if (!count) return 0;
    if (!max) return 1;
    return Math.min(5, 1 + Math.floor(count / max * 5));
  }

  function colorOf(count, max) { return COLORS[levelOf(count, max)]; }

  /* 每档对应的实际数量区间，图例跟着数据走，不写死 */
  function legendBands(max) {
    var out = [{ lv: 0, text: '0 家', color: COLORS[0] }];
    if (!max) return out;
    for (var lv = 1; lv <= 5; lv++) {
      var lo = Math.max(1, Math.ceil((lv - 1) / 5 * max) + (lv === 1 ? 0 : 1));
      var hi = Math.floor(lv / 5 * max);
      if (hi < lo) hi = lo;
      if (lv === 5) hi = max;
      out.push({ lv: lv, text: lo === hi ? lo + ' 家' : lo + '–' + hi + ' 家', color: COLORS[lv] });
    }
    return out;
  }

  function svgHtml(agg, opts) {
    if (!D) return '<div class="cn-map-missing">地图数据未加载</div>';
    opts = opts || {};
    var t = D.meta.southTransform;
    var vb = D.meta.viewBox;
    var s = '<svg class="cn-map-svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" ' +
      'role="img" aria-label="中国分省门店数量分布图，含台湾省、香港特别行政区、澳门特别行政区与南海诸岛">';

    /* 省界填色：<title> 给原生 tooltip，data-p 给自定义浮层 */
    D.provinces.forEach(function (p) {
      var c = agg.counts[p.short] || 0;
      s += '<path class="cn-map-land" data-p="' + esc(p.short) + '" fill="' + colorOf(c, agg.max) +
        '" d="' + p.d + '"><title>' + esc(p.name) + '：' + c + ' 家门店</title></path>';
    });

    /* 每省一个数字：白描边保证深色块上也清晰；小省用引线外移 */
    D.provinces.forEach(function (p) {
      var c = agg.counts[p.short] || 0;
      var off = CALLOUT[p.short];
      var bx = p.label[0], by = p.label[1];
      if (off) {
        /* 京津沪港澳在 440px 卡片里色块只有几像素，补一颗可点的定位圆点，
           数字再沿引线外移，保证「每个省都看得到数量、也点得进去」 */
        s += '<circle class="cn-map-dot" data-p="' + esc(p.short) + '" cx="' + p.label[0] +
          '" cy="' + p.label[1] + '" r="5"><title>' + esc(p.name) + '</title></circle>';
        s += '<path class="cn-map-lead" d="M' + p.label[0] + ' ' + p.label[1] +
          'L' + (p.label[0] + off[0]) + ' ' + (p.label[1] + off[1]) + '"/>';
        bx += off[0]; by += off[1];
      }
      s += '<text class="cn-map-num' + (c ? '' : ' is-zero') + '" data-p="' + esc(p.short) +
        '" x="' + bx + '" y="' + by + '">' + c + '</text>';
    });

    /* 南海诸岛插图：九段线 + 岛礁，独立 viewBox，不省略不改画 */
    s += '<g class="cn-map-south" transform="translate(' + t[0] + ' ' + t[1] + ') scale(' + t[2] + ')">' +
      '<rect class="cn-map-south-bg" x="0" y="0" width="190" height="240" rx="3"/>' +
      D.south.isles.map(function (d) { return '<path class="cn-map-isle" d="' + d + '"/>'; }).join('') +
      D.south.jd.map(function (d) { return '<path class="cn-map-jd" d="' + d + '"/>'; }).join('') +
      '<text class="cn-map-south-t" x="95" y="230">南海诸岛</text>' +
      '</g>';

    /* 放大视图里再把省名标上，卡片小图只留数字，避免糊成一团 */
    if (opts.big) {
      D.provinces.forEach(function (p) {
        if (CALLOUT[p.short]) return;
        s += '<text class="cn-map-name" x="' + p.label[0] + '" y="' + (p.label[1] + 40) + '">' +
          esc(p.short) + '</text>';
      });
    }
    s += '</svg>';
    return s;
  }

  function listHtml(agg, big) {
    if (!agg.rows.length) {
      return '<div class="cn-map-empty">还没有带省份的门店数据。<br>' +
        '在「门店管理」里给门店填上省份，这里就会按省统计。</div>';
    }
    var s = '<div class="cn-map-list' + (big ? ' is-big' : '') + '">';
    agg.rows.forEach(function (r) {
      var w = agg.max ? Math.max(6, Math.round(r.count / agg.max * 100)) : 6;
      s += '<button type="button" class="cn-map-row" data-p="' + esc(r.short) + '">' +
        '<span class="cn-map-row-name">' + esc(r.name) + '</span>' +
        '<span class="cn-map-row-bar"><i style="width:' + w + '%;background:' +
        colorOf(r.count, agg.max) + '"></i></span>' +
        '<b class="cn-map-row-num">' + r.count + '</b><span class="cn-map-row-unit">家</span>' +
        '</button>';
    });
    s += '</div>';
    if (agg.unknown.length) {
      s += '<div class="cn-map-unknown" title="这些省份写法没认出来，未计入地图">' +
        '另有 ' + agg.unknown.reduce(function (a, b) { return a + b.count; }, 0) +
        ' 家门店的省份写法未识别（' + esc(agg.unknown.map(function (x) {
          return x.name + ' ' + x.count;
        }).join('、')) + '）</div>';
    }
    return s;
  }

  function legendHtml(agg) {
    var s = '<div class="cn-map-legend"><span class="cn-map-legend-t">门店数</span>';
    legendBands(agg.max).forEach(function (b) {
      s += '<span class="cn-map-legend-i"><i style="background:' + b.color + '"></i>' +
        esc(b.text) + '</span>';
    });
    s += '</div>';
    return s;
  }

  /* 整张卡片的内容（不含 .card 外壳，由 page-home.js 拼） */
  function cardHtml(agg) {
    var s = '<div class="cn-map" data-cnmap>' +
      '<div class="cn-map-toolbar">' +
        '<div class="cn-map-tabs" role="tablist">' +
          '<button type="button" class="cn-map-tab is-on" data-view="stat" role="tab">统计地图</button>' +
          '<button type="button" class="cn-map-tab" data-view="base" role="tab">腾讯底图</button>' +
        '</div>' +
        '<button type="button" class="cn-map-zoom" data-zoom title="放大查看">⤢ 放大</button>' +
      '</div>' +
      '<div class="cn-map-stage">' +
        '<div class="cn-map-svgwrap" data-svgwrap>' + svgHtml(agg) + '</div>' +
        '<div class="cn-map-base" data-basewrap hidden></div>' +
        '<div class="cn-map-tip" data-tip hidden></div>' +
      '</div>' +
      legendHtml(agg) +
      '<div class="cn-map-summary">覆盖 <b>' + agg.covered + '</b> 个省级行政区 · 共 <b>' +
        agg.total + '</b> 家门店</div>' +
      listHtml(agg, false) +
      '</div>';
    return s;
  }

  /* ---------------- 交互 ---------------- */

  var tipTimer = null;

  function showTip(host, p, evt, agg) {
    var tip = host.querySelector('[data-tip]');
    if (!tip || !p) return;
    var name = FULL[p] || p;
    var c = agg.counts[p] || 0;
    tip.innerHTML = '<b>' + esc(name) + '</b><span>' + c + ' 家门店</span>';
    tip.hidden = false;
    var stage = host.querySelector('.cn-map-stage');
    var r = stage.getBoundingClientRect();
    var x = evt.clientX - r.left + 12;
    var y = evt.clientY - r.top - 8;
    if (x + 130 > r.width) x = r.width - 136;
    if (y < 4) y = 4;
    if (y + 52 > r.height) y = r.height - 56;
    tip.style.left = Math.max(4, x) + 'px';
    tip.style.top = y + 'px';
  }

  function hideTip(host) {
    var tip = host.querySelector('[data-tip]');
    if (tip) tip.hidden = true;
  }

  function openProvince(host, p, agg) {
    var name = FULL[p] || p;
    var c = agg.counts[p] || 0;
    var stores = (window.Store && window.Store.getState ? window.Store.getState().stores : []) || [];
    var list = stores.filter(function (s) { return normalize(s && s.province) === p; });
    var ov = document.createElement('div');
    ov.className = 'cn-map-modal';
    ov.innerHTML = '<div class="cn-map-modal-card" role="dialog" aria-label="' + esc(name) + '门店清单">' +
      '<div class="cn-map-modal-head"><h3>' + esc(name) + ' · ' + c + ' 家门店</h3>' +
      '<button type="button" class="cn-map-modal-close" data-close aria-label="关闭">×</button></div>' +
      '<div class="cn-map-modal-body">' + (list.length
        ? list.map(function (s) {
          return '<div class="cn-map-store"><span>' + esc(s.name || '未命名门店') + '</span>' +
            '<em>' + esc(s.stage || '') + '</em></div>';
        }).join('')
        : '<div class="cn-map-empty">这个省级行政区暂无门店</div>') + '</div>' +
      '<div class="cn-map-modal-foot"><button type="button" class="btn btn-primary" data-close>知道了</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-close]'))) {
        document.body.removeChild(ov);
      }
    });
  }

  function openFullscreen(host, agg) {
    var ov = document.createElement('div');
    ov.className = 'cn-map-modal is-full';
    ov.innerHTML = '<div class="cn-map-modal-card" role="dialog" aria-label="全国门店分布全屏图">' +
      '<div class="cn-map-modal-head"><h3>全国门店分布 · 按省级行政区统计</h3>' +
      '<span class="cn-map-modal-sub">共 ' + agg.total + ' 家门店 · 覆盖 ' + agg.covered +
      ' 个省级行政区</span>' +
      '<button type="button" class="cn-map-modal-close" data-close aria-label="关闭">×</button></div>' +
      '<div class="cn-map-full-body">' +
        '<div class="cn-map-full-map">' + svgHtml(agg, { big: true }) + legendHtml(agg) + '</div>' +
        '<div class="cn-map-full-list"><h4>各省门店数</h4>' + listHtml(agg, true) + '</div>' +
      '</div>' +
      '<div class="cn-map-modal-foot"><span>底图含台湾省、香港/澳门特别行政区与南海诸岛</span>' +
      '<button type="button" class="btn btn-primary" data-close>关闭</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-close]'))) {
        document.body.removeChild(ov);
      } else {
        var row = e.target.closest && e.target.closest('[data-p]');
        if (row) {
          var p = row.getAttribute('data-p');
          var nm = FULL[p] || p;
          var c = agg.counts[p] || 0;
          var box = ov.querySelector('.cn-map-modal-sub');
          if (box) box.textContent = nm + '：' + c + ' 家门店 · 全国共 ' + agg.total + ' 家';
        }
      }
    });
  }

  /* 腾讯地图 GL JS 合规底图：SDK 由 index.html 的 _TMapSecurityConfig 走代理，
     URL 不带 key、前端零密钥。代理未就绪时给提示并留在统计地图，不白屏。 */
  var baseMap = null;
  var baseMarkers = null;
  var tmapState = 0;       /* 0 未加载 / 1 加载中 / 2 就绪 / 3 失败 */

  /* serviceHost 里的 __WB_ 占位符由 WorkBuddy 运行时替换。
     线下 / 静态托管上占位符还在，代理不通，直接告诉用户并留在统计地图，
     不给一张灰白空底图。 */
  function proxyReady() {
    var c = window._TMapSecurityConfig;
    return !!(c && c.serviceHost && c.serviceHost.indexOf('__WB_') < 0);
  }

  function ensureTMap(cb, fail) {
    if (window.TMap) { tmapState = 2; cb(); return; }
    if (tmapState === 3) { fail(); return; }
    if (tmapState === 1) {
      var wait = setInterval(function () {
        if (tmapState === 2) { clearInterval(wait); cb(); }
        else if (tmapState === 3) { clearInterval(wait); fail(); }
      }, 120);
      return;
    }
    tmapState = 1;
    var sc = document.createElement('script');
    sc.src = 'https://map.qq.com/api/gljs?v=1.exp';   /* 不带 key，代理模式 */
    sc.onload = function () {
      if (window.TMap) { tmapState = 2; cb(); }
      else { tmapState = 3; fail(); }
    };
    sc.onerror = function () { tmapState = 3; fail(); };
    document.head.appendChild(sc);
  }

  function toast(msg) {
    if (window.UI && window.UI.toast) window.UI.toast(msg, 'info');
  }

  function svgIcon(count, max) {
    var c = colorOf(count, max);
    var dark = levelOf(count, max) >= 3;
    var txt = dark ? '#ffffff' : '#1d3a86';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
      '<circle cx="20" cy="20" r="16" fill="' + c + '" stroke="#ffffff" stroke-width="3"/>' +
      '<text x="20" y="21" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="' + txt + '">' +
      count + '</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function switchView(host, view, agg) {
    var stat = host.querySelector('[data-svgwrap]');
    var base = host.querySelector('[data-basewrap]');
    var tabs = host.querySelectorAll('.cn-map-tab');
    [].forEach.call(tabs, function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-view') === view);
    });
    if (view === 'stat') {
      stat.hidden = false; base.hidden = true; hideTip(host);
      return;
    }
    if (!proxyReady()) {
      toast('腾讯地图底图需在 WorkBuddy 预览环境打开，已保留统计地图');
      switchView(host, 'stat', agg);
      return;
    }
    ensureTMap(function () {
      stat.hidden = true; base.hidden = false;
      try {
        if (!baseMap) {
          baseMap = new window.TMap.Map(base, {
            zoom: 3.6,
            center: new window.TMap.LatLng(35.6, 104.2)
          });
        }
        var styles = {}, geoms = [];
        D.provinces.forEach(function (p) {
          var c = agg.counts[p.short] || 0;
          if (!c) return;
          var sid = 'lv' + levelOf(c, agg.max);
          if (!styles[sid]) {
            styles[sid] = new window.TMap.MarkerStyle({
              width: 34, height: 34, anchor: { x: 17, y: 17 }, src: svgIcon(c, agg.max)
            });
          }
          geoms.push({
            id: p.code, styleId: sid,
            position: new window.TMap.LatLng(p.center[1], p.center[0]),
            properties: { name: p.name, count: c }
          });
        });
        if (baseMarkers) baseMarkers.setMap(null);
        baseMarkers = new window.TMap.MultiMarker({ map: baseMap, styles: styles, geometries: geoms });
        baseMarkers.on && baseMarkers.on('click', function (e) {
          var pr = e && e.geometry && e.geometry.properties;
          if (pr) toast(pr.name + '：' + pr.count + ' 家门店');
        });
      } catch (err) {
        toast('底图初始化失败，已切回统计地图');
        switchView(host, 'stat', agg);
      }
    }, function () {
      toast('腾讯地图服务未就绪，已保留统计地图');
      switchView(host, 'stat', agg);
    });
  }

  function mount(root, agg) {
    var host = root && root.querySelector('[data-cnmap]');
    if (!host) return;
    if (host.getAttribute('data-bound') === '1') return;
    host.setAttribute('data-bound', '1');

    host.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('[data-view]');
      if (tab) { switchView(host, tab.getAttribute('data-view'), agg); return; }
      if (e.target.closest && e.target.closest('[data-zoom]')) { openFullscreen(host, agg); return; }
      var row = e.target.closest && e.target.closest('[data-p]');
      if (row) { openProvince(host, row.getAttribute('data-p'), agg); return; }
    });

    host.addEventListener('mousemove', function (e) {
      var el = e.target.closest && e.target.closest('[data-p]');
      if (!el) { hideTip(host); return; }
      clearTimeout(tipTimer);
      showTip(host, el.getAttribute('data-p'), e, agg);
    });
    host.addEventListener('mouseleave', function () { hideTip(host); });
  }

  function destroy() {
    if (baseMarkers) { try { baseMarkers.setMap(null); } catch (e) {} baseMarkers = null; }
    if (baseMap) { try { baseMap.destroy(); } catch (e) {} baseMap = null; }
  }

  return {
    aggregate: aggregate,
    normalize: normalize,
    colorOf: colorOf,
    levelOf: levelOf,
    cardHtml: cardHtml,
    svgHtml: svgHtml,
    listHtml: listHtml,
    legendHtml: legendHtml,
    mount: mount,
    destroy: destroy,
    meta: D && D.meta,
    provinceCount: allShorts.length
  };
})();
