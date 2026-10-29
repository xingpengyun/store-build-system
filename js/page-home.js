/* ==========================================================
   page-home.js — 首页
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.home = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  /* 当前阶段筛选（空 = 全部）。存在模块里，刷新数据后不会被重置 */
  var filterStage = '';
  /* 进度总览表格：z131 起不再截断，改卡内滚动显示全部门店 */

  function stageObjOf(key) {
    for (var i = 0; i < C.STAGES.length; i++) {
      if (C.STAGES[i].key === key) return C.STAGES[i];
    }
    return null;
  }

  function riskOf(store) {
    return store.risk === 'high' || store.risk === 'overdue';
  }

  /* 6 张 KPI 卡片 → 点开的小窗文案。
     口径必须跟卡片上的数字一模一样（同一份 stats 字段），否则「写 3 家，点开 4 家」 */
  var KPI_META = {
    all: {
      title: '筹建门店', sub: '全部在册门店（含已开业）',
      empty: '还没有门店', emptySub: '去门店管理添加第一家门店'
    },
    opened: {
      title: '已开业', sub: '阶段停在「已开业」的门店',
      empty: '还没有门店开业', emptySub: '门店推进到「已开业」后会自动出现在这里'
    },
    doing: {
      title: '进行中', sub: '还没开业、也没标高危/逾期的门店',
      empty: '没有正在筹建的门店', emptySub: ''
    },
    risk: {
      title: '风险门店', sub: '风险等级标为「高危」或「逾期」的门店',
      empty: '暂无风险门店', emptySub: '风险等级在门店档案里手动维护，「关注」不算风险'
    },
    overdue: {
      title: '逾期任务', sub: '已过建议完成日、还没完成的任务，按门店汇总',
      empty: '没有逾期任务', emptySub: '所有待办任务都还在建议完成日之内'
    },
    notify: {
      title: '7天内该通知', sub: '7 天内要到货、还没通知供应商的物料，按门店汇总',
      empty: '近期没有要到货的物料', emptySub: '物料登记了到货日之后才会出现在这里'
    }
  };

  /* 把一类 KPI 展开成「门店 + 摘要」的列表。
     返回 { title, sub, rows }，rows = [{ store, items: [{ text, late }] }] */
  function kpiDetail(key) {
    var s = S.getState();
    var t0 = U.today();
    var meta = KPI_META[key] || KPI_META.all;
    var rows = [];
    var unit = '';

    if (key === 'overdue' || key === 'notify') {
      /* 这两类是任务 / 物料，按门店归堆：一条一条平铺看不出是哪家店的 */
      var bag = {};
      if (key === 'overdue') {
        unit = '条任务';
        s.tasks.forEach(function (t) {
          if (S.classify(t) !== 'overdue') return;
          var due = S.suggestDateOf(t);
          var text;
          if (due) {
            text = t.title + ' · 建议 ' + U.monthDay(due) + ' 完成，已过 ' + (-U.diffDays(t0, due)) + ' 天';
          } else {
            text = t.title + ' · 开业前 ' + S.taskBeforeOf(t) + ' 天该做';
          }
          (bag[t.storeId] = bag[t.storeId] || []).push({ text: text, late: true });
        });
      } else {
        unit = '项物料';
        var watch = Number(C.ARR_WATCH_DAYS || 7);
        s.arrivals.forEach(function (a) {
          if (S.arrNotified(a) || !a.etaDate) return;
          var d = U.diffDays(t0, a.etaDate);
          if (d < 0 || d > watch) return;
          var when = d === 0 ? '今天到' : (d + ' 天后到');
          (bag[a.storeId] = bag[a.storeId] || []).push({
            text: (a.item || '未填物料名') + ' · ' + U.monthDay(a.etaDate) + '（' + when + '）'
          });
        });
      }
      Object.keys(bag).forEach(function (id) {
        var store = S.storeById(id);
        if (store) rows.push({ store: store, items: bag[id] });
      });
    } else {
      s.stores.forEach(function (store) {
        if (key === 'opened' && store.stage !== '已开业') return;
        if (key === 'doing' && (store.stage === '已开业' || riskOf(store))) return;
        if (key === 'risk' && !riskOf(store)) return;
        rows.push({ store: store, items: [] });
      });
    }

    /* 排序：在筹的按开业日早的在前，已开业的沉到后面（跟下面表格一个顺序）。
       任务 / 物料类在这基础上再按件数多的排前面（sort 是稳定的，件数相同仍按开业日） */
    rows = U.sortBy(rows, function (r) {
      return (r.store.stage === '已开业' ? '2' : '1') + (r.store.openDate || '9999-99-99');
    });
    if (unit) rows = U.sortBy(rows, function (r) { return 999 - r.items.length; });

    var total = 0;
    rows.forEach(function (r) { total += r.items.length; });

    var sub = '共 ' + rows.length + ' 家';
    if (key === 'overdue') sub += ' · ' + total + ' 条任务';
    else if (key === 'notify') sub += ' · ' + total + ' 项物料';
    else if (key !== 'all') sub += ' · ' + meta.sub;   /* all 的「全部在册门店」跟标题重复，不写 */

    return { title: meta.title, sub: sub, meta: meta, rows: rows, unit: unit };
  }

  function kpiDetailHtml(d) {
    if (!d.rows.length) {
      return UI.empty(d.meta.empty, d.meta.emptySub);
    }

    return '<div class="kdl">' + d.rows.map(function (r) {
      var store = r.store;
      var stageObj = stageObjOf(store.stage);
      var shown = r.items.slice(0, 3);
      var notes = shown.map(function (i) {
        return '<div class="kdl-note' + (i.late ? ' is-late' : '') + '">' + U.esc(i.text) + '</div>';
      }).join('');
      var rest = r.items.length - shown.length;
      if (rest > 0) notes += '<div class="kdl-more">还有 ' + rest + ' 条，点门店看全部</div>';

      return '<div class="kdl-row" data-kdl-store="' + store.id + '" role="button" tabindex="0"' +
          ' title="打开「' + U.esc(store.name) + '」的门店详情">' +
        '<i class="store-dot" style="background:' + (stageObj ? stageObj.color : '#98a2b8') + '"></i>' +
        '<div class="kdl-main">' +
          '<div class="kdl-top">' +
            '<span class="kdl-name">' + U.esc(store.name) + '</span>' +
            '<span class="kdl-meta">' + U.esc(store.province || '未填省份') + ' · ' +
              (store.openDate ? U.monthDay(store.openDate) + ' 开业' : '开业日未定') + '</span>' +
          '</div>' + notes +
        '</div>' +
        '<div class="kdl-right">' +
          (r.items.length ? '<span class="kdl-cnt">' + r.items.length + ' ' + d.unit + '</span>' : '') +
          (d.meta.title === '风险门店' ? UI.riskBadge(store.risk) : UI.stageBadge(store.stage, S.storeSub(store))) +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function showKpiStores(key) {
    var d = kpiDetail(key);
    UI.modal({
      size: 'lg',
      title: d.title,
      sub: d.sub,
      body: kpiDetailHtml(d),
      footer: '<button class="btn" data-kdl-close type="button">关闭</button>',
      onMount: function (box, close) {
        box.querySelectorAll('[data-kdl-store]').forEach(function (el) {
          el.addEventListener('click', function () {
            close();
            openStore(el.getAttribute('data-kdl-store'));
          });
        });
        var btn = box.querySelector('[data-kdl-close]');
        if (btn) btn.addEventListener('click', close);
      }
    });
  }

  /* 按当前筛选取门店，在筹的在前、已开业的排后面 */
  function pickedStores(s) {
    var list = s.stores.filter(function (x) {
      return !filterStage || x.stage === filterStage;
    });
    var active = U.sortBy(list.filter(function (x) { return x.stage !== '已开业'; }),
      function (a) { return a.openDate; });
    var opened = list.filter(function (x) { return x.stage === '已开业'; });
    return active.concat(opened);
  }

  function subHtml(s) {
    if (!filterStage) return '点击上方色块或图例，可直接筛出该阶段的门店';
    var n = pickedStores(s).length;
    return '已筛选 <b style="color:var(--primary)">' + U.esc(filterStage) + '</b>' +
      ' · 共 <b>' + n + '</b> 家' + (n === 0 ? '（该阶段暂无门店）' : '');
  }

  function footHtml(s) {
    var n = pickedStores(s).length;
    if (!n) return '';
    return '共 <b>' + n + '</b> 家 · 表格内上下滚动查看全部' +
      '<span class="stage-foot-link" data-go="stores">去门店管理查看全部 →</span>';
  }

  function rowsHtml(s) {
    var list = pickedStores(s);

    if (!list.length) {
      return '<tr><td colspan="8">' + UI.empty(
        filterStage ? '「' + filterStage + '」暂无门店' : '还没有门店',
        filterStage ? '换个阶段看看，或点右上角「清除」' : '去门店管理添加第一家门店'
      ) + '</td></tr>';
    }

    return list.map(function (store) {
      var owner = S.memberById(store.ownerId);
      var stageObj = stageObjOf(store.stage);
      return '<tr data-store="' + store.id + '">' +
        '<td><div class="store-cell">' +
          '<i class="store-dot" style="background:' + (stageObj ? stageObj.color : '#98a2b8') + '"></i>' +
          '<span class="store-name">' + U.esc(store.name) + '</span>' +
        '</div></td>' +
        '<td class="muted">' + U.esc(store.province) + '</td>' +
        '<td class="muted mono">' + store.openDate + '</td>' +
        '<td>' + UI.progress(S.progressValue(store), null, S.progressTip(store)) + '</td>' +
        '<td>' + UI.stageBadge(store.stage, S.storeSub(store)) + '</td>' +
        '<td>' + UI.riskBadge(store.risk) + '</td>' +
        '<td>' + (owner ? '<div class="store-cell">' + UI.avatar(owner.name, owner.color, 'sm', owner.animal) +
          '<span>' + U.esc(owner.name) + '</span></div>' : '<span class="dim">未指派</span>') + '</td>' +
        '<td><span class="tlink" data-store-view="' + store.id + '">查看</span></td>' +
      '</tr>';
    }).join('');
  }

  function heroArt() {
    /* 夜景版：深紫墙 + 南瓜橙屋顶 + 暖黄窗户。
       原来是白墙蓝顶的白天房子，压在万圣夜色底上像贴上去的。 */
    return '<div class="hero-art"><svg viewBox="0 0 148 78" fill="none">' +
      '<ellipse cx="74" cy="71" rx="54" ry="5" fill="#1b1229" opacity=".85"/>' +
      '<rect x="47" y="34" width="54" height="34" rx="3" fill="#3b2b53" stroke="#63497f"/>' +
      '<path d="M41 36l33-21 33 21z" fill="#e8892a"/>' +
      '<path d="M41 36h66l-4 6H45z" fill="#c46912"/>' +
      '<rect x="56" y="48" width="14" height="20" rx="2" fill="#2a1e3d" stroke="#5b4278"/>' +
      '<rect x="78" y="48" width="16" height="10" rx="2" fill="#ffce6b" stroke="#e8a33c"/>' +
      '<circle cx="82" cy="53" r="1.2" fill="#ff8a5c" opacity=".9"/>' +
      '<circle cx="90" cy="53" r="1.2" fill="#ff8a5c" opacity=".9"/>' +
      '<rect x="66" y="26" width="16" height="6" rx="1.5" fill="#ffe0a8" opacity=".92"/>' +
      '<circle cx="118" cy="46" r="11" fill="#4a3a63"/>' +
      '<rect x="116.5" y="56" width="3" height="9" rx="1.5" fill="#3a2c50"/>' +
      '<circle cx="28" cy="52" r="8" fill="#443456"/>' +
      '<rect x="26.8" y="59" width="2.4" height="7" rx="1.2" fill="#37294c"/>' +
      '<path d="M96 22h6l2 4h-10z" fill="#63497f"/>' +
      '</svg></div>';
  }




  /* ================= 天气：真实数据 + 按天气动起来 =================
     数据源 Open-Meteo（不用 key，响应头带 access-control-allow-origin:*，
     所以 file:// 双击打开也取得到）。城市取「系统设置 → 天气城市」，默认上海。
     取不到就退回设置里手填的温度/描述，绝不让横幅上空一块。
     缓存 20 分钟：open-meteo 的 current 每 15 分钟更新一次，没必要每次进首页都打。 */

  var WX_KEY = 'sbs.weather.v1';
  var WX_TTL = 20 * 60 * 1000;

  /* WMO weather code → [中文文案, 动效类型] */
  var WX_CODES = {
    0: ['晴', 'clear'],
    1: ['晴间多云', 'partly'],
    2: ['多云', 'cloudy'],
    3: ['阴', 'overcast'],
    45: ['有雾', 'fog'],
    48: ['雾凇', 'fog'],
    51: ['小毛毛雨', 'drizzle'],
    53: ['毛毛雨', 'drizzle'],
    55: ['浓毛毛雨', 'drizzle'],
    56: ['冻毛毛雨', 'drizzle'],
    57: ['冻毛毛雨', 'drizzle'],
    61: ['小雨', 'rain'],
    63: ['中雨', 'rain'],
    65: ['大雨', 'heavy'],
    66: ['冻雨', 'rain'],
    67: ['强冻雨', 'heavy'],
    71: ['小雪', 'snow'],
    73: ['中雪', 'snow'],
    75: ['大雪', 'snow'],
    77: ['米雪', 'snow'],
    80: ['阵雨', 'rain'],
    81: ['强阵雨', 'rain'],
    82: ['暴雨', 'heavy'],
    85: ['阵雪', 'snow'],
    86: ['强阵雪', 'snow'],
    95: ['雷阵雨', 'thunder'],
    96: ['雷阵雨伴冰雹', 'thunder'],
    99: ['雷暴伴冰雹', 'thunder']
  };

  /* 常用城市的坐标（省一次地理编码请求）；表里没有的城市走 geocoding 接口 */
  var CITY_COORDS = {
    上海: [31.23, 121.47], 北京: [39.90, 116.41], 广州: [23.13, 113.26], 深圳: [22.54, 114.06],
    杭州: [30.27, 120.15], 南京: [32.06, 118.80], 苏州: [31.30, 120.58], 无锡: [31.49, 120.31],
    宁波: [29.87, 121.55], 合肥: [31.82, 117.23], 成都: [30.57, 104.07], 重庆: [29.56, 106.55],
    武汉: [30.59, 114.31], 长沙: [28.23, 112.94], 西安: [34.34, 108.94], 郑州: [34.75, 113.63],
    济南: [36.65, 117.12], 青岛: [36.07, 120.38], 天津: [39.08, 117.20], 沈阳: [41.81, 123.43],
    大连: [38.91, 121.61], 福州: [26.07, 119.30], 厦门: [24.48, 118.09], 昆明: [25.04, 102.72],
    东莞: [23.02, 113.75], 佛山: [23.02, 113.12], 南昌: [28.68, 115.86], 贵阳: [26.65, 106.63],
    南宁: [22.82, 108.32], 海口: [20.04, 110.32], 石家庄: [38.04, 114.51], 太原: [37.87, 112.55],
    兰州: [36.06, 103.83], 哈尔滨: [45.80, 126.53], 长春: [43.82, 125.32], 乌鲁木齐: [43.83, 87.62],
    呼和浩特: [40.84, 111.75], 温州: [28.00, 120.67], 常州: [31.81, 119.97], 徐州: [34.26, 117.19]
  };

  function wxCacheGet() {
    try {
      var o = JSON.parse(localStorage.getItem(WX_KEY) || 'null');
      if (o && o.city && (Date.now() - o.at) < WX_TTL) return o;
    } catch (e) {}
    return null;
  }

  function wxCacheSet(o) {
    try { localStorage.setItem(WX_KEY, JSON.stringify(o)); } catch (e) {}
  }

  function wxCityName() {
    var set = (S.getState() && S.getState().settings) || {};
    return String(set.weatherCity || '上海').trim() || '上海';
  }

  function wxCoordsOf(city) {
    var hit = CITY_COORDS[city];
    if (hit) return Promise.resolve({ lat: hit[0], lon: hit[1], name: city });
    var url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&format=json&name=' +
      encodeURIComponent(city);
    return fetch(url, { mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var it = j && j.results && j.results[0];
        if (!it) throw new Error('找不到这个城市');
        return { lat: it.latitude, lon: it.longitude, name: it.name || city };
      });
  }

  function wxFetch() {
    var city = wxCityName();
    return wxCoordsOf(city).then(function (pos) {
      var url = 'https://api.open-meteo.com/v1/forecast' +
        '?latitude=' + pos.lat + '&longitude=' + pos.lon +
        '&current=temperature_2m,weather_code,is_day' +
        '&timezone=Asia%2FShanghai&_=' + Date.now();
      return fetch(url, { mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var cur = j && j.current;
          if (!cur || cur.temperature_2m == null) throw new Error('天气接口没返回数据');
          var o = {
            at: Date.now(),
            city: pos.name,
            temp: Math.round(cur.temperature_2m),
            code: Number(cur.weather_code) || 0,
            isDay: cur.is_day == null ? 1 : Number(cur.is_day)
          };
          wxCacheSet(o);
          return o;
        });
    });
  }

  /* 一个 26×26 的小图标，元素带 .wx-* 类，动画全交给 CSS */
  function wxIcon(kind, isDay) {
    var sun = '<g class="wx-sun">' +
      '<circle cx="13" cy="13" r="4.3" fill="#ffb02e"/>' +
      '<g stroke="#ffb02e" stroke-width="1.5" stroke-linecap="round">' +
        '<path d="M13 3.6v2.1M13 20.3v2.1M3.6 13h2.1M20.3 13h2.1' +
              'M6.4 6.4l1.5 1.5M18.1 18.1l1.5 1.5M19.6 6.4l-1.5 1.5M7.9 18.1l-1.5 1.5"/>' +
      '</g></g>';

    var moon = '<g class="wx-moon">' +
      '<path d="M17 16.2a5.7 5.7 0 0 1-7.2-7.4 6.7 6.7 0 1 0 7.2 7.4z" fill="#8492d6"/>' +
      '<circle cx="18.4" cy="7.6" r=".8" fill="#c3cbf2"/>' +
      '<circle cx="20.6" cy="11.2" r=".6" fill="#c3cbf2"/></g>';

    var cloud = '<g class="wx-cloud">' +
      '<path d="M7 18.6h10.6a3.3 3.3 0 0 0 .2-6.6 4.9 4.9 0 0 0-9.3-1.1A3.7 3.7 0 0 0 7 18.6z" ' +
        'fill="#eaf0fb" stroke="#b3c2dd" stroke-width="1.1"/></g>';

    var cloud2 = '<g class="wx-cloud wx-cloud-2">' +
      '<path d="M4.4 15.2h7.4a2.6 2.6 0 0 0 .1-5.2 3.9 3.9 0 0 0-7.4-.9 2.9 2.9 0 0 0-.1 6.1z" ' +
        'fill="#f4f7fe" stroke="#c3cfe6" stroke-width="1"/></g>';

    function drops(n, cls, big) {
      var out = '';
      for (var i = 0; i < n; i++) {
        var x = 8.6 + i * 2.9;
        out += '<line class="wx-drop' + (big ? ' wx-drop-big' : '') + '" x1="' + x + '" y1="19.4" ' +
          'x2="' + (x - 0.6) + '" y2="22.6" stroke="#3f8ae8" stroke-width="1.7" stroke-linecap="round" ' +
          'style="animation-delay:' + (i * 0.28).toFixed(2) + 's"/>';
      }
      return out;
    }

    function flakes(n) {
      var out = '';
      for (var i = 0; i < n; i++) {
        var x = 8.8 + i * 3.1;
        out += '<circle class="wx-flake" cx="' + x + '" cy="21" r="1.25" fill="#8fbce9" ' +
          'style="animation-delay:' + (i * 0.55).toFixed(2) + 's"/>';
      }
      return out;
    }

    var bolt = '<path class="wx-bolt" d="M14 16.8l-3 4.4h2.1l-1.2 3.6 4-5.2h-2.3l1.4-2.8z" ' +
      'fill="#ffc53d" stroke="#f0a300" stroke-width=".6"/>';

    var fogLines = '<g class="wx-fog" stroke="#b7c4dd" stroke-width="1.4" stroke-linecap="round">' +
      '<path d="M5.2 19.6h13.6"/><path d="M7.4 22.4h9.4" style="animation-delay:-1.6s"/></g>';

    var body;
    if (kind === 'clear') body = isDay ? sun : moon;
    else if (kind === 'partly') body = (isDay ? sun.replace('cx="13" cy="13" r="4.3"',
      'cx="9.6" cy="9.6" r="3.6"') : moon) + cloud;
    else if (kind === 'cloudy') body = cloud2 + cloud;
    else if (kind === 'overcast') body = cloud.replace('fill="#eaf0fb"', 'fill="#dde5f4"') + cloud2;
    else if (kind === 'fog') body = cloud + fogLines;
    else if (kind === 'drizzle') body = cloud + drops(2, 'drizzle', false);
    else if (kind === 'rain') body = cloud + drops(3, 'rain', false);
    else if (kind === 'heavy') body = cloud + drops(4, 'heavy', true);
    else if (kind === 'snow') body = cloud + flakes(3);
    else if (kind === 'thunder') body = cloud + drops(2, 'thunder', false) + bolt;
    else body = cloud;

    return '<svg class="wx-svg" viewBox="0 0 26 26" fill="none" aria-hidden="true">' + body + '</svg>';
  }

  function wxHtml(w) {
    var set = (S.getState() && S.getState().settings) || {};
    if (!w) {
      /* 还没取到：先显示手填的兜底值，取到会被原地替换 */
      return '<span class="wx wx-loading"><svg class="wx-svg" viewBox="0 0 26 26" fill="none">' +
          '<path d="M7 18.6h10.6a3.3 3.3 0 0 0 .2-6.6 4.9 4.9 0 0 0-9.3-1.1A3.7 3.7 0 0 0 7 18.6z" ' +
          'fill="#eaf0fb" stroke="#b3c2dd" stroke-width="1.1"/></svg></span>' +
        '<span class="wx-main"><b>' + (set.weatherTemp || 26) + '°C</b>' +
          '<span>' + U.esc(set.weatherText || '多云') + '</span></span>' +
        '<span class="wx-sub">' + U.esc(wxCityName()) + ' · 手动设置</span>';
    }
    var d = WX_CODES[w.code] || ['天气', 'cloudy'];
    var hm = new Date(w.at);
    var clock = U.pad2(hm.getHours()) + ':' + U.pad2(hm.getMinutes());
    var tip = '数据来源 Open-Meteo · ' + clock + ' 更新';
    return '<span class="wx wx-' + d[1] + '" title="' + tip + '">' + wxIcon(d[1], w.isDay) + '</span>' +
      '<span class="wx-main"><b>' + w.temp + '°C</b>' +
        '<span>' + U.esc(d[0]) + '</span></span>' +
      '<span class="wx-sub">' + U.esc(w.city) + ' · ' + clock + '</span>';
  }

  /* 只换天气那一块，不整页重画（否则筛选、展开状态全没了） */
  function paintWeather(root, w) {
    var box = root && root.querySelector('.hd-weather');
    if (!box) return;
    box.innerHTML = wxHtml(w);
  }

  function loadWeather(root) {
    var cached = wxCacheGet();
    paintWeather(root, cached);

    /* 没有 fetch（老浏览器 / 测试环境）：缓存或手填兜底已经画上去了，到此为止 */
    if (typeof fetch !== 'function') return;

    var p;
    try { p = wxFetch(); } catch (e) { return; }

    p.then(function (w) {
      paintWeather(root, w);
    }).catch(function (e) {
      /* 取不到：有缓存就继续用缓存（比手填值新），没有才退回手填值 */
      if (cached) return;
      var box = root && root.querySelector('.hd-weather');
      if (box) {
        box.innerHTML = wxHtml(null);
        box.setAttribute('title', '实时天气获取失败（' + ((e && e.message) || '网络不可用') +
          '），现在显示的是系统设置里手填的温度和天气');
      }
    });
  }

  function render() {
    var s = S.getState();
    var st = S.stats();
    var set = s.settings;
    var t0 = U.today();

    var doingStores = s.stores.filter(function (x) {
      return x.stage !== '已开业' && !riskOf(x);
    }).length;   /* 跟「进行中」小窗同一口径：没开业、也没标风险 */

    /* ---- KPI ---- */
    var kpis = [
      {
        key: 'all', label: '筹建门店', value: st.totalStores, foot: '总门店数',
        color: '#2f56f0', soft: '#e3eaff', icon: 'box',
        tip: '点击查看这 ' + st.totalStores + ' 家门店'
      },
      {
        key: 'opened', label: '已开业', value: st.opened, foot: U.pct(st.opened, st.totalStores),
        color: '#0aa564', soft: '#dcf7ea', icon: 'check',
        tip: '点击查看已开业的 ' + st.opened + ' 家门店'
      },
      {
        key: 'doing', label: '进行中', value: doingStores, foot: U.pct(doingStores, st.totalStores),
        color: '#0190bf', soft: '#d9f3fd', icon: 'chart',
        tip: '点击查看正在筹建的 ' + doingStores + ' 家门店',
        help: '还没开业、也没把风险等级标成<b>高危 / 逾期</b>的门店 —— ' +
              '风险门店单独统计，不会在这张卡里重复算一次。'
      },
      {
        key: 'risk', label: '风险门店', value: st.riskStores, foot: U.pct(st.riskStores, st.totalStores),
        color: '#e97a06', soft: '#fdecdb', icon: 'alert',
        tip: '点击查看 ' + st.riskStores + ' 家风险门店',
        help: '门店档案里「风险等级」标为<b>高危</b>或<b>逾期</b>的门店（占比 = 风险门店数 ÷ 门店总数）。' +
              '「关注」不算风险；等级在门店详情里手动维护。'
      },
      {
        key: 'overdue', label: '逾期任务', value: st.taskCounts.overdue, foot: U.pct(st.taskCounts.overdue, st.taskCounts.total),
        color: '#e83a2f', soft: '#ffe6e3', icon: 'clock',
        tip: '点击查看 ' + st.taskCounts.overdue + ' 条逾期任务在哪些门店',
        help: '还没做的任务里，今天已经过了<b>建议完成日</b>的：' +
              '建议完成日 = 门店计划开业日 − 该任务的开业前天数（可为单条任务延后）。' +
              '门店没填开业日的不判逾期；占比 = 逾期数 ÷ 全部任务数。'
      },
      {
        key: 'notify', label: '7天内该通知', value: st.arrivals7, foot: U.pct(st.arrivals7, st.totalStores),
        color: '#6d3fe8', soft: '#ece5ff', icon: 'truck',
        tip: '点击查看 ' + st.arrivals7 + ' 项该通知供应商的物料',
        help: '登记了到货日、<b>7 天内</b>要到的物料，且还没标「已通知供应商」的。' +
              '没填到货日的不会算进来（没法判断哪天到）。'
      }
    ];

    var kpiHtml = kpis.map(function (k) {
      /* 有 help 的卡片：标签旁加 ⓘ，hover / 键盘聚焦 / 点击都能看判断逻辑 */
      var helpHtml = k.help
        ? '<span class="kpi-help" tabindex="0" role="button" aria-label="查看「' + k.label + '」的判断逻辑"' +
            ' style="color:' + k.color + '">' +
            UI.icon('info') +
            '<span class="kpi-help-pop">' + k.help + '</span>' +
          '</span>'
        : '';
      return '<div class="kpi is-clickable" data-kpi="' + k.key + '" role="button" tabindex="0"' +
          ' title="' + U.esc(k.tip) + '">' +
        '<span class="kpi-icon" style="background:' + k.soft + ';color:' + k.color + '">' + UI.icon(k.icon) + '</span>' +
        '<div class="kpi-body">' +
          '<div class="kpi-label">' + k.label + helpHtml + '</div>' +
          '<div class="kpi-value">' + k.value + '</div>' +
          '<div class="kpi-foot">' + k.foot + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    /* ---- 门店表格（受阶段筛选控制） ---- */
    var tableRows = rowsHtml(s);

    /* ---- 阶段图例 ---- */
    var legend = st.stageCounts.map(function (sc) {
      return '<div class="sl-item' + (filterStage === sc.key ? ' on' : '') + '" data-stage="' + sc.key + '"' +
        ' title="只看「' + sc.key + '」的门店">' +
        '<i class="sl-dot" style="background:' + sc.color + '"></i>' +
        '<span class="sl-name">' + sc.key + '</span>' +
        '<span class="sl-num" style="color:' + sc.color + '">' + sc.count + '</span>' +
        '<span class="sl-unit">家</span>' +
      '</div>';
    }).join('');

    /* ---- 团队 ---- */
    var teamHtml = st.team.map(function (m, i) {
      return '<div class="team-row" data-member="' + m.id + '">' +
        UI.avatar(m.name, m.color, 'md', m.animal) +
        '<div class="team-info">' +
          '<div class="team-name-line">' + U.esc(m.name) +
            '<span class="team-role">' + U.esc(m.role) + '</span>' +
          '</div>' +
          '<div class="team-meta">' +
            '<span>待办 <b>' + m.todo + '</b></span>' +
            '<span class="' + (m.late > 0 ? 'late' : '') + '">逾期 <b style="' + (m.late > 0 ? 'color:var(--red)' : '') + '">' + m.late + '</b></span>' +
          '</div>' +
        '</div>' +
        '<div class="team-right">' +
          '<div class="mini-progress"><span class="mini-track"><i style="width:' + m.percent + '%;background:' +
            (m.percent >= 80 ? '#17b26a' : m.percent >= 60 ? '#3f6bf5' : '#f79009') + '"></i></span>' +
            '<span class="mini-num">' + m.percent + '%</span></div>' +
          '<span class="team-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    /* 团队卡底部概览：全队待办 / 逾期汇总，把卡片垫到和左侧进度总览持平 */
    var teamTodo = 0, teamLate = 0;
    st.team.forEach(function (m) { teamTodo += (m.todo || 0); teamLate += (m.late || 0); });
    var teamFootHtml = '<div class="team-foot">' +
      '<div class="team-foot-stats">' +
        '<div class="tf-stat"><b>' + teamTodo + '</b><span>全队待办</span></div>' +
        '<div class="tf-stat"><b style="color:' + (teamLate > 0 ? 'var(--red)' : 'var(--text)') + '">' + teamLate + '</b><span>逾期</span></div>' +
        '<div class="tf-stat"><b>' + st.team.length + '</b><span>成员</span></div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-block" data-go="team">查看全部成员</button>' +
    '</div>';

    /* ---- 今日关注 ---- */
    var focusHtml = st.focus.length ? st.focus.map(function (f) {
      var late = f.late;
      return '<div class="focus-item" data-task="' + f.task.id + '">' +
        '<span class="focus-ico" style="background:' + (late ? '#feeceb' : '#fef4e6') + ';color:' +
          (late ? '#f04438' : '#f79009') + '">' + UI.icon(late ? 'alert' : 'clock') + '</span>' +
        '<div class="focus-body">' +
          '<div class="focus-title">' + U.esc(f.store ? f.store.name : '') + ' · ' + U.esc(f.task.title) + '</div>' +
          '<div class="focus-desc">' + (f.due
            ? '建议 ' + U.monthDay(f.due) + ' 前完成' +
              (late ? '（已逾期 ' + Math.abs(f.days) + ' 天）' : '（还剩 ' + f.days + ' 天）')
            : '未设开业日期 · 开业前 ' + f.lead + ' 天') +
            (f.left != null ? '　·　距开业 ' + f.left + ' 天，开业前 ' + f.lead + ' 天' : '') +
            (f.snooze ? '　·　已延后 ' + f.snooze + ' 天' : '') + '</div>' +
        '</div>' +
        '<span class="focus-owner">' + U.esc(f.owner ? f.owner.name : '未指派') + '</span>' +
      '</div>';
    }).join('') : UI.empty('今天没有需要特别盯的任务', '所有任务都在计划内');

    /* ---- 任务状态环形图 ---- */
    var tc = st.taskCounts;
    var donutItems = [
      { name: '已完成', value: tc.done, color: '#17b26a' },
      { name: '未完成', value: tc.pending, color: '#98a2b8' },
      { name: '逾期', value: tc.overdue, color: '#f04438' },
      { name: '风险', value: tc.risk, color: '#f79009' }
    ];
    var donutLegend = donutItems.map(function (d) {
      return '<div class="dl-row">' +
        '<i class="dl-dot" style="background:' + d.color + '"></i>' +
        '<span class="dl-name">' + d.name + '</span>' +
        '<span class="dl-val">' + d.value + '</span>' +
      '</div>';
    }).join('');

    var upcomingStores = 0;
    (function () {
      var seen = {};
      s.arrivals.forEach(function (a) {
        var d = U.diffDays(t0, a.etaDate);
        if (a.status === 'pending' && d >= 0 && d <= 7 && !seen[a.storeId]) {
          seen[a.storeId] = 1;
          upcomingStores += 1;
        }
      });
    })();

    /* 近 7 天到货量卡底部统计：7 天总到货、今日到货 */
    var trendSum = 0, trendToday = 0;
    st.trend.forEach(function (t, i) {
      trendSum += t.count;
      if (i === st.trend.length - 1) trendToday = t.count;
    });

    return '' +
    /* Hero */
    '<section class="hero fade-up">' +
      /* 装饰层：横幅中间那块空白太空了，飘几团柔光、流动点阵、几点星光。
         纯 CSS 动画，pointer-events:none，不挡任何内容。 */
      '<div class="hero-fx" aria-hidden="true">' +
        '<i class="hf-blob hf-b1"></i><i class="hf-blob hf-b2"></i><i class="hf-blob hf-b3"></i>' +
        '<i class="hf-spark hf-s1"></i><i class="hf-spark hf-s2"></i><i class="hf-spark hf-s3"></i>' +
        '<i class="hf-spark hf-s4"></i>' +
        /* 万圣节大满月：深橙色半圆月，落在横幅中段空白处（纯 SVG + CSS 动画） */
        '<svg class="hw-hero-moon" viewBox="0 0 190 95" aria-hidden="true">' +
          '<path d="M5 95 A90 90 0 0 1 185 95 Z" fill="#e8892a"/>' +
          '<circle cx="62" cy="66" r="11" fill="#c46912" opacity=".5"/>' +
          '<circle cx="95" cy="46" r="8" fill="#c46912" opacity=".45"/>' +
          '<circle cx="128" cy="70" r="10" fill="#c46912" opacity=".5"/>' +
          '<circle cx="155" cy="52" r="6" fill="#c46912" opacity=".4"/>' +
        '</svg>' +
        /* 万圣节漂浮装饰：蜘蛛网 + 2 只蝙蝠 + 1 只幽灵 + 1 盏南瓜灯（纯 SVG + CSS 动画） */
        '<svg class="hw-hero-web" viewBox="0 0 100 100" fill="none" stroke="#8a7bc0" stroke-width="1.3" aria-hidden="true">' +
          '<path d="M0 0 L100 0"/><path d="M0 0 L85 45"/><path d="M0 0 L55 85"/><path d="M0 0 L0 100"/>' +
          '<path d="M18 0 Q20 18 0 18"/><path d="M38 0 Q46 38 0 38"/><path d="M58 0 Q72 58 0 58"/><path d="M78 0 Q98 78 0 78"/>' +
        '</svg>' +
        /* z160：这两格原来飞的是纯黑蝙蝠 —— 深紫夜空上就剩两个小黑点，只有橙眼睛亮着
           （用户原话「背景黑色不太明显」）。黑剪影压黑底天生没救，换成深色底上照样跳出来的：
           一颗白骷髅头 + 一只南瓜橙的蝙蝠（蝙蝠还留着，只是不再是黑的）。 */
        '<svg class="hw-skull" viewBox="0 0 40 44" aria-hidden="true">' +
          '<ellipse cx="20" cy="17" rx="15.5" ry="15" fill="#f4efff"/>' +
          '<path d="M11.5 25 L28.5 25 L28.5 33.6 Q28.5 37 25 37 L15 37 Q11.5 37 11.5 33.6 Z" fill="#f4efff"/>' +
          '<ellipse cx="13.8" cy="17.4" rx="4.3" ry="4.9" fill="#2a1e42"/>' +
          '<ellipse cx="26.2" cy="17.4" rx="4.3" ry="4.9" fill="#2a1e42"/>' +
          '<circle cx="13.8" cy="18" r="1.7" fill="#f6a11c"/><circle cx="26.2" cy="18" r="1.7" fill="#f6a11c"/>' +
          '<path d="M20 22.2 L21.9 26.4 L18.1 26.4 Z" fill="#2a1e42"/>' +
          '<path d="M15.4 30 L15.4 36.4 M20 30 L20 36.4 M24.6 30 L24.6 36.4" stroke="#2a1e42" stroke-width="1.3" stroke-linecap="round"/>' +
        '</svg>' +
        '<svg class="hw-bat-light" viewBox="0 0 48 30" aria-hidden="true">' +
          '<path d="M24 14 Q14.6 4.4 5.6 5.4 Q1.4 6.2 3.9 11 Q6.6 15.6 12.8 13.6 Q18.4 12 24 14 Z" fill="#ffb45c"/>' +
          '<path d="M24 14 Q33.4 4.4 42.4 5.4 Q46.6 6.2 44.1 11 Q41.4 15.6 35.2 13.6 Q29.6 12 24 14 Z" fill="#ffb45c"/>' +
          /* 耳朵：短而宽的三角，细尖的那种放大看像两根天线，不像蝙蝠 */
          '<path d="M20.2 11.2 L18.6 5.6 L23 9.4 Z" fill="#ffb45c"/>' +
          '<path d="M27.8 11.2 L29.4 5.6 L25 9.4 Z" fill="#ffb45c"/>' +
          '<circle cx="24" cy="14.6" r="5.4" fill="#ffb45c"/>' +
          '<circle class="hw-bat-eye" cx="22.2" cy="14.2" r="1.3" fill="#2a1e42"/><circle class="hw-bat-eye" cx="25.8" cy="14.2" r="1.3" fill="#2a1e42"/>' +
        '</svg>' +
        '<svg class="hw-ghost" viewBox="0 0 40 48" aria-hidden="true">' +
          '<path d="M20 4 Q32 4 32 18 L32 38 Q28 34 24 38 Q20 42 16 38 Q12 34 8 38 L8 18 Q8 4 20 4 Z" fill="#f7f4ff" stroke="#c9bde8" stroke-width="1" opacity=".95"/>' +
          '<circle cx="16" cy="18" r="2.6" fill="#3a2f4d"/><circle cx="24" cy="18" r="2.6" fill="#3a2f4d"/>' +
          '<ellipse cx="20" cy="26" rx="3" ry="3.4" fill="#3a2f4d"/>' +
        '</svg>' +
        '<svg class="hw-pumpkin" viewBox="0 0 40 40" aria-hidden="true">' +
          '<path d="M19 2 Q20 0 21 2 L21 5 L19 5 Z" fill="#7a4a12"/>' +
          '<ellipse cx="20" cy="21" rx="16" ry="15" fill="#f6a11c"/>' +
          '<ellipse cx="12" cy="21" rx="6" ry="14" fill="#e8892a"/>' +
          '<ellipse cx="28" cy="21" rx="6" ry="14" fill="#e8892a"/>' +
          '<path d="M12 15 L17 19 L13 22 Z" fill="#3a2f4d"/>' +
          '<path d="M28 15 L23 19 L27 22 Z" fill="#3a2f4d"/>' +
          '<path d="M12 27 Q16 24 20 27 Q24 24 28 27 L28 32 L12 32 Z" fill="#3a2f4d"/>' +
        '</svg>' +
      '</div>' +
      '<div class="hero-icon">🏪</div>' +
      '<div class="hero-main">' +
        '<h2>' + U.greeting() + '，' + U.esc(set.teamName || '阿蛮团队') + '！</h2>' +
        '<p>今天有 <b>' + st.todayTasks + '</b> 项任务需要处理，' +
           '<b class="warn">' + st.riskStores + '</b> 家门店存在风险，本周共 ' +
           '<b>' + st.weekTasks + '</b> 项待推进。</p>' +
      '</div>' +
      heroArt() +
      '<div class="hero-date">' +
        '<div class="hd-day">' + U.cnDate(t0) + '</div>' +
        '<div class="hd-week">' + U.weekdayCn(t0) + '</div>' +
        '<div class="hd-weather">' + wxHtml(wxCacheGet()) + '</div>' +
      '</div>' +
    '</section>' +


    /* KPI */
    '<section class="kpi-grid fade-up" style="animation-delay:.04s">' + kpiHtml + '</section>' +

    /* 进度总览 + 团队 */
    '<section class="home-grid-2 fade-up" style="animation-delay:.08s">' +
      '<div class="card accent-blue">' +
        '<div class="card-head">' +
          '<h3>门店筹建进度总览</h3>' +
          '<span class="card-sub" data-role="stageSub">' + subHtml(s) + '</span>' +
          '<div class="card-tools">' +
            '<select class="select" id="homeStageFilter" style="width:auto;height:30px;font-size:12px">' +
              '<option value="">全部阶段</option>' +
              UI.options(C.STAGES.map(function (x) { return x.key; }), filterStage) +
            '</select>' +
            '<span class="link-more hidden" data-clear>清除</span>' +
            '<span class="link-more" data-go="stores">全部门店 →</span>' +
          '</div>' +
        '</div>' +
        Charts.stackBar(st.stageCounts, { clickable: true, active: filterStage }) +
        '<div class="stage-legend">' + legend + '</div>' +
        '<div class="table-wrap stage-scroll"><table class="tbl">' +
          '<thead><tr>' +
            '<th>门店名称</th><th>省份</th><th>开业日期</th><th title="已完成任务 / 任务总计">整体进度</th>' +
            '<th>当前阶段</th><th>风险等级</th><th>负责人</th><th>操作</th>' +
          '</tr></thead>' +
          '<tbody data-role="stageBody">' + tableRows + '</tbody>' +
        '</table></div>' +
        '<div class="stage-foot" data-role="stageFoot">' + footHtml(s) + '</div>' +
      '</div>' +

      '<div class="card accent-green">' +
        '<div class="card-head">' +
          '<h3>团队工作台</h3><span class="card-sub">（' + st.team.length + '人）</span>' +
          '<div class="card-tools"><span class="link-more" data-go="team">全部成员 →</span></div>' +
        '</div>' +
        '<div class="team-list team-list-scroll">' + (teamHtml || UI.empty('还没有成员')) + '</div>' +
        (st.team.length ? teamFootHtml : '') +
      '</div>' +
    '</section>' +

    /* 三小卡 */
    '<section class="home-grid-3 fade-up" style="animation-delay:.12s">' +
      '<div class="card accent-red">' +
        '<div class="card-head">' +
          '<h3>今日重点关注</h3>' +
          '<span class="badge" style="color:var(--red);background:var(--red-soft)">' + st.focus.length + '</span>' +
          '<div class="card-tools"><span class="link-more" data-go="alerts">查看全部 →</span></div>' +
        '</div>' +
        '<div class="focus-list">' + focusHtml + '</div>' +
      '</div>' +

      '<div class="card accent-violet">' +
        '<div class="card-head"><h3>任务状态分布</h3></div>' +
        '<div class="donut-wrap">' +
          Charts.donut(donutItems, { size: 150, centerLabel: '总任务', centerValue: tc.total }) +
          '<div class="donut-legend">' + donutLegend + '</div>' +
        '</div>' +
        '<div class="donut-foot">' +
          '<div class="tf-stat"><b>' + U.pct(tc.done, tc.total) + '</b><span>完成率</span></div>' +
          '<div class="tf-stat"><b>' + st.todayTasks + '</b><span>今日待办</span></div>' +
          '<div class="tf-stat"><b>' + st.weekTasks + '</b><span>本周待推进</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="card accent-teal">' +
        '<div class="card-head">' +
          '<h3>近 7 天到货量</h3>' +
          '<div class="card-tools"><span class="link-more" data-go="reports">明细 →</span></div>' +
        '</div>' +
        Charts.bars(st.trend) +
        '<div class="arrival-foot">' +
          '<span>即将到货（7 天内）</span>' +
          '<span><b>' + upcomingStores + '</b> <span class="dim" style="font-size:12px">家</span></span>' +
        '</div>' +
        '<div class="arrival-stats">' +
          '<div class="tf-stat"><b>' + trendSum + '</b><span>7 天到货</span></div>' +
          '<div class="tf-stat"><b>' + trendToday + '</b><span>今日到货</span></div>' +
          '<div class="tf-stat"><b>' + st.arrivals7 + '</b><span>待通知</span></div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* 只换表格和文案，不整页重绘（保留滚动位置、不触发入场动画） */
  function paint(root) {
    var s = S.getState();

    var sub = root.querySelector('[data-role="stageSub"]');
    if (sub) sub.innerHTML = subHtml(s);

    var body = root.querySelector('[data-role="stageBody"]');
    if (body) body.innerHTML = rowsHtml(s);

    var foot = root.querySelector('[data-role="stageFoot"]');
    if (foot) foot.innerHTML = footHtml(s);

    var sel = root.querySelector('#homeStageFilter');
    if (sel) sel.value = filterStage;

    var clear = root.querySelector('[data-clear]');
    if (clear) clear.classList.toggle('hidden', !filterStage);

    /* 图例 + 色条：同一个 data-stage，一起点亮 */
    root.querySelectorAll('[data-stage]').forEach(function (el) {
      el.classList.toggle('on', !!filterStage && el.getAttribute('data-stage') === filterStage);
    });
    root.querySelectorAll('.stage-bar i').forEach(function (el) {
      el.classList.toggle('dim', !!filterStage && el.getAttribute('data-stage') !== filterStage);
    });
  }

  function setFilter(key, root) {
    filterStage = (key && key !== filterStage) ? key : '';
    paint(root);
  }

  /* 判断逻辑气泡：默认从 ⓘ 往右下展开。
     卡片靠右（或窄屏）时 254px 会顶出屏幕 → 加 is-right 翻到左边对齐。
     hover 和点击都走一遍，触屏只有点击。 */
  function placeTip(help) {
    var pop = help.querySelector('.kpi-help-pop');
    if (!pop) return;
    pop.classList.remove('is-right');
    var r = pop.getBoundingClientRect();
    var vw = document.documentElement.clientWidth || window.innerWidth || 0;
    if (r.right > vw - 12) pop.classList.add('is-right');
  }

  /* 收起所有展开的判断逻辑气泡，顺手清掉卡片的抬层级 class */
  function closeTips(root) {
    var list = root.querySelectorAll('.kpi-help.is-open');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.remove('is-open');
      var card = list[i].closest('.kpi');
      if (card) card.classList.remove('is-tip-open');
    }
  }

  function mount(root) {
    /* 天气：先用手上的缓存/兜底值画出来，再异步换真实数据 */
    loadWeather(root);


    /* 先按当前宽度把每个判断逻辑气泡定好位（2026-10-25 z105）。
       气泡宽 254px，默认从 ⓘ 往右展开；最右边那张卡的气泡即使没展开
       （visibility:hidden 仍参与布局），也会把整页撑出一条横向滚动条。
       提前跑一遍 placeTip，该翻到左边的先翻过去。 */
    try {
      root.querySelectorAll('.kpi-help').forEach(placeTip);
    } catch (e) { /* 老浏览器没有 forEach 就算了，不影响功能 */ }

    /* 首次进首页引导一次：ⓘ 在哪、怎么用（之后不再打扰） */
    try {
      if (!localStorage.getItem('sbs.kpiHelpTip')) {
        localStorage.setItem('sbs.kpiHelpTip', '1');
        setTimeout(function () {
          UI.toast('提示：KPI 标签旁的 ⓘ 点一下（或鼠标放上去）能查看判断逻辑', 'info');
        }, 900);
      }
    } catch (e) {}

    /* 统一用事件委托：表格行会被重新渲染，直接绑在行上会失效 */
    root.addEventListener('click', function (e) {
      var t = e.target;

      /* ⓘ 判断逻辑：点一下固定展开 / 收起（触屏和懒得 hover 时用） */
      var help = t.closest('.kpi-help');
      if (help) {
        if (t.closest('.kpi-help-pop')) return;   /* 点在浮层内容上：不关，方便选中文字 */
        var wasOpen = help.classList.contains('is-open');
        closeTips(root);
        if (!wasOpen) {
          help.classList.add('is-open');
          var card = help.closest('.kpi');
          if (card) card.classList.add('is-tip-open');   /* 卡片抬层级，气泡才不会被右边的卡压住 */
          placeTip(help);
        }
        return;
      }

      /* 点到别处 → 收起展开的浮层 */
      closeTips(root);

      /* KPI 卡片 → 弹出「这几家是谁」（ⓘ 在上面已 return，不会误触） */
      var kpiEl = t.closest('.kpi[data-kpi]');
      if (kpiEl) { showKpiStores(kpiEl.getAttribute('data-kpi')); return; }

      var view = t.closest('[data-store-view]');
      if (view) { openStore(view.getAttribute('data-store-view')); return; }

      var row = t.closest('tr[data-store]');
      if (row) { openStore(row.getAttribute('data-store')); return; }

      /* 阶段色块 / 图例 → 就地筛选下方门店，不跳页 */
      var stageEl = t.closest('[data-stage]');
      if (stageEl) { setFilter(stageEl.getAttribute('data-stage'), root); return; }

      if (t.closest('[data-clear]')) { setFilter('', root); return; }

      var goEl = t.closest('[data-go]');
      if (goEl) {
        var route = goEl.getAttribute('data-go');
        if (route === 'stores' && filterStage) App.go('stores', { stage: filterStage });
        else App.go(route);
        return;
      }

      var memberEl = t.closest('[data-member]');
      if (memberEl) { App.go('team', { member: memberEl.getAttribute('data-member') }); return; }

      var taskEl = t.closest('[data-task]');
      if (taskEl) { App.go('tasks', { task: taskEl.getAttribute('data-task') }); }
    });

    /* 键盘：卡片上 Enter / 空格 = 点一下；ⓘ 上则是展开判断逻辑 */
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var t = e.target;
      if (!t || !t.closest) return;

      var helpEl = t.closest('.kpi-help');
      if (helpEl) {
        e.preventDefault();
        var willOpen = !helpEl.classList.contains('is-open');
        closeTips(root);
        if (willOpen) {
          helpEl.classList.add('is-open');
          var card = helpEl.closest('.kpi');
          if (card) card.classList.add('is-tip-open');
          placeTip(helpEl);
        }
        return;
      }

      var kpiEl = t.closest('.kpi[data-kpi]');
      if (kpiEl) {
        e.preventDefault();
        closeTips(root);
        showKpiStores(kpiEl.getAttribute('data-kpi'));
      }
    });

    /* hover 展开的也做一次边界判断（不用等点击） */
    root.addEventListener('mouseover', function (e) {
      var help = e.target && e.target.closest ? e.target.closest('.kpi-help') : null;
      if (help) placeTip(help);
    });

    var sf = root.querySelector('#homeStageFilter');
    if (sf) {
      sf.addEventListener('change', function () { setFilter(sf.value, root); });
    }
  }

  function openStore(id) {
    if (window.Pages.stores && window.Pages.stores.openDetail) {
      window.Pages.stores.openDetail(id);
    }
  }

  return { title: '首页', render: render, mount: mount };
})();
