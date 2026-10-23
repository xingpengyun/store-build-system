/* ==========================================================
   page-settings.js — 系统设置（云端版）
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.settings = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;

  function render() {
    var s = S.getState();
    var set = s.settings;
    var bytes = S.storageBytes();
    var user = (window.App && window.App.user) || {};
    var name = user.name || user.phone || user.email || '当前账号';

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>系统设置</h1>' +
        '<p>数据存放在云端，团队共享同一份；本机只保留一份缓存</p>' +
      '</div>' +
      '<button class="btn" data-act="logout">退出登录</button>' +
    '</div>' +

    '<section class="home-grid-2 fade-up" style="animation-delay:.05s">' +
      '<div class="card">' +
        '<div class="card-head"><h3>基本信息</h3><span class="card-sub">改完点保存，所有人刷新后可见</span></div>' +
        '<form autocomplete="off" id="settingForm">' +
          '<div class="field-row">' +
            '<div class="field"><label>系统名称</label>' +
              '<input class="input" name="brand" value="' + U.esc(set.brand || '') + '" /></div>' +
            '<div class="field"><label>标语</label>' +
              '<input class="input" name="slogan" value="' + U.esc(set.slogan || '') + '" /></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label>团队称呼</label>' +
              '<input class="input" name="teamName" value="' + U.esc(set.teamName || '团队') + '" /></div>' +
            '<div class="field"><label>预警提前天数</label>' +
              '<input class="input" type="number" min="1" max="30" name="warnDays" value="' + (set.warnDays || 3) + '" /></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label>天气温度（°C）</label>' +
              '<input class="input" type="number" name="weatherTemp" value="' + (set.weatherTemp || 26) + '" /></div>' +
            '<div class="field"><label>天气描述</label>' +
              '<input class="input" name="weatherText" value="' + U.esc(set.weatherText || '多云') + '" /></div>' +
          '</div>' +
          '<button class="btn btn-primary" type="button" data-act="saveSetting">保存设置</button>' +
        '</form>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head"><h3>账号与数据</h3></div>' +

        '<div class="mini-stats" style="margin-bottom:14px">' +
          '<div class="mini-stat"><div class="ms-label">当前账号</div>' +
            '<div class="ms-val" style="font-size:13px">' + U.esc(name) + '</div></div>' +
          '<div class="mini-stat"><div class="ms-label">连接状态</div>' +
            '<div class="ms-val" style="font-size:13px;color:' + (S.isOnline() ? 'var(--green)' : 'var(--red)') + '">' +
              (S.isOnline() ? '云端已连接' : '离线') + '</div></div>' +
          '<div class="mini-stat"><div class="ms-label">门店</div><div class="ms-val">' + s.stores.length + '</div></div>' +
          '<div class="mini-stat"><div class="ms-label">任务</div><div class="ms-val">' + s.tasks.length + '</div></div>' +
        '</div>' +

        '<div style="display:flex;flex-direction:column;gap:8px">' +
          '<button class="btn" data-act="export">' + UI.icon('download') + '导出备份（JSON）</button>' +
          '<button class="btn" data-act="import">' + UI.icon('upload') + '从备份文件导入</button>' +
          '<button class="btn btn-danger" data-act="reset">' + UI.icon('refresh') + '清空云端并恢复演示数据</button>' +
        '</div>' +
        '<input type="file" id="importFile" accept=".json,application/json" style="display:none" />' +
        '<p style="margin-top:12px;font-size:11.5px;color:var(--text-3);line-height:1.7">' +
          '数据实时保存在云端，换电脑、清缓存都不会丢。本机缓存约 ' + U.bytes(bytes) + '，仅用于断网时应急。' +
        '</p>' +
      '</div>' +
    '</section>' +

    '<div class="card fade-up" style="animation-delay:.065s">' +
      '<div class="card-head"><h3>逾期倒推口径</h3>' +
        '<span class="card-sub">任务没单独设「开业前(天)」时，用这里的阶段默认值</span></div>' +
      '<div class="lead-grid">' + leadRows() + '</div>' +
      '<div class="lead-foot">' +
        '<button class="btn btn-primary" type="button" data-act="saveLead">保存阶段默认天数</button>' +
        '<span class="lead-foot-tip">保存后，没单独设过天数的任务立刻按新值重算</span>' +
      '</div>' +
      '<p class="item-hint">' +
        '倒推优先级：<b>筹建任务清单里每条任务的「开业前(天)」</b> → 这里的阶段默认值。' +
        '建议完成日 = 门店计划开业日 − 开业前 N 天；门店没填开业日期时不算日期、也不判逾期。' +
        '<br />例：门店 11 月 15 日开业、清单里「设计是否出图」填 30 天 → 10 月 16 日前必须出图；' +
        '过了 10 月 16 日还没做完，这条任务就自动标成逾期。</p>' +
    '</div>' +

    '<div class="card fade-up" style="animation-delay:.08s">' +
      '<div class="card-head"><h3>到货物料清单</h3>' +
        '<span class="card-sub">门店详情里「物料到货」的快捷按钮，共 <b id="arrItemsCount">' + S.items().length + '</b> 个</span></div>' +
      '<div class="item-chips" id="arrItemsBox">' + itemChips(S.items()) + '</div>' +
      '<div class="item-add">' +
        '<input class="input" id="itemAddInput" autocomplete="off" ' +
          'placeholder="输入物料名，比如：冰箱贴，回车添加" />' +
        '<button class="btn btn-primary" type="button" data-act="addItem">添加</button>' +
      '</div>' +
      '<p class="item-hint">长按物料约 1 秒，会变成红色「删除？」，再点一下才真正删掉；点别处可取消。改动即时保存。</p>' +
    '</div>' +

    '<div class="card fade-up" style="animation-delay:.1s">' +
      '<div class="card-head"><h3>云端说明</h3><span class="card-sub">改代码时的参考</span></div>' +
      '<div class="desc-list">' +
        '<div class="d-item"><div class="d-label">数据存储</div><div class="d-val">云端数据库（5 张表）</div></div>' +
        '<div class="d-item"><div class="d-label">共享范围</div><div class="d-val">所有登录成员共享同一份</div></div>' +
        '<div class="d-item"><div class="d-label">自动刷新</div><div class="d-val">每 45 秒检查一次他人改动</div></div>' +
        '<div class="d-item"><div class="d-label">云端接入代码</div><div class="d-val">js/cloud.js</div></div>' +
        '<div class="d-item"><div class="d-label">登录逻辑</div><div class="d-val">js/login.js</div></div>' +
        '<div class="d-item"><div class="d-label">数据读写</div><div class="d-val">js/store.js</div></div>' +
      '</div>' +
    '</div>';
  }

  /* 逾期倒推口径：每个筹建阶段「开业前 N 天该做完」 */
  function leadRows() {
    var list = S.stages() || [];
    if (!list.length) return '<p class="item-none">还没有阶段</p>';

    return list.map(function (st) {
      var key = st.key;
      var days = S.leadDaysOf({ stage: key });
      return '<label class="lead-row">' +
        '<span class="lead-name">' +
          '<i class="lead-dot" style="background:' + (st.color || '#98a2b8') + '"></i>' +
          U.esc(key) + '</span>' +
        '<span class="lead-box">开业前' +
          '<input class="input lead-input" type="number" min="0" max="365" step="1" ' +
            'data-lead="' + U.esc(key) + '" value="' + days + '" />' +
          '天做完</span>' +
      '</label>';
    }).join('');
  }

  /* 物料按钮：长按变成「删除？」，再点一下才删（防误触） */
  function itemChips(list) {
    if (!list.length) {
      return '<p class="item-none">还没有物料，在下面输入名字添加</p>';
    }
    return list.map(function (x) {
      return '<button type="button" class="arr-chip" data-item="' + U.esc(x) + '" title="长按可删除">' +
        U.esc(x) + '</button>';
    }).join('');
  }

  function mount(root) {
    var box = root.querySelector('#arrItemsBox');
    var input = root.querySelector('#itemAddInput');
    var pressTimer = null;
    var askAt = 0;

    function paint() {
      box.innerHTML = itemChips(S.items());
      var c = root.querySelector('#arrItemsCount');
      if (c) c.textContent = S.items().length;
    }

    function clearAsk() {
      [].slice.call(box.querySelectorAll('.arr-chip.ask')).forEach(function (c) {
        c.classList.remove('ask');
        c.textContent = c.getAttribute('data-item');
      });
      askAt = 0;
    }

    function addItem() {
      var v = String(input.value || '').trim();
      if (!v) { input.focus(); return; }
      var list = S.items().slice();
      if (list.indexOf(v) >= 0) {
        UI.toast('「' + v + '」已经在清单里了', 'info');
        input.select();
        return;
      }
      list.push(v);
      S.saveItems(list);
      paint();
      input.value = '';
      input.focus();
      UI.toast('已添加「' + v + '」', 'success');
    }

    function removeItem(name) {
      S.saveItems(S.items().filter(function (x) { return x !== name; }));
      paint();
      UI.toast('已删除「' + name + '」', 'info');
    }

    /* ---------------- 到货物料：长按删除 ---------------- */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    });

    /* 长按 550ms → 进入待确认状态 */
    box.addEventListener('pointerdown', function (e) {
      var chip = e.target.closest('.arr-chip');
      if (!chip || chip.classList.contains('ask')) return;
      clearAsk();
      pressTimer = setTimeout(function () {
        chip.classList.add('ask');
        chip.textContent = '删除？';
        askAt = Date.now();
      }, 550);
      var cancel = function () {
        clearTimeout(pressTimer);
        chip.removeEventListener('pointerup', cancel);
        chip.removeEventListener('pointerleave', cancel);
      };
      chip.addEventListener('pointerup', cancel);
      chip.addEventListener('pointerleave', cancel);
    });

    box.addEventListener('click', function (e) {
      var chip = e.target.closest('.arr-chip');
      if (!chip) { clearAsk(); return; }
      if (!chip.classList.contains('ask')) { clearAsk(); return; }
      if (Date.now() - askAt < 220) return;   /* 长按松手那一下不算确认 */
      removeItem(chip.getAttribute('data-item'));
    });

    /* 点空白处取消待确认状态 */
    root.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.arr-chip')) clearAsk();
    });

    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.getAttribute('data-act');

      if (act === 'logout') {
        App.logout();
      }

      else if (act === 'addItem') {
        addItem();
      }

      else if (act === 'saveSetting') {
        var form = root.querySelector('#settingForm');
        var st = S.getState().settings;
        st.brand = UI.formValue(form, 'brand') || '门店筹建管理系统';
        st.slogan = UI.formValue(form, 'slogan');
        st.teamName = UI.formValue(form, 'teamName') || '阿蛮团队';
        st.warnDays = U.clamp(Number(UI.formValue(form, 'warnDays')) || 3, 1, 30);
        st.weatherTemp = Number(UI.formValue(form, 'weatherTemp')) || 26;
        st.weatherText = UI.formValue(form, 'weatherText') || '多云';
        S.saveAll();
        UI.toast('设置已保存，团队其他人刷新后可见', 'success');
        App.refresh();
      }

      else if (act === 'saveLead') {
        var patch = {};
        [].slice.call(root.querySelectorAll('[data-lead]')).forEach(function (inp) {
          var key = inp.getAttribute('data-lead');
          var v = String(inp.value || '').trim();
          if (key && v !== '') patch[key] = v;
        });
        var hit = S.saveLeadDays(patch);
        UI.toast(hit
          ? '已保存 ' + hit + ' 个阶段的提前天数，任务日期已重算'
          : '没有可保存的数值', hit ? 'success' : 'info');
        App.refresh();
      }

      else if (act === 'export') {
        S.downloadJSON();
        UI.toast('备份文件已下载', 'success');
      }

      else if (act === 'import') {
        root.querySelector('#importFile').click();
      }

      else if (act === 'reset') {
        UI.confirm({
          title: '清空云端数据',
          text: '这会删除云端所有门店、任务、成员和到货记录，换成一套演示数据。',
          warn: '所有同事看到的数据都会被替换，且无法撤销。建议先导出备份。',
          danger: true,
          okText: '确认清空',
          onOk: function () {
            UI.loading('正在重置云端数据…');
            window.Cloud.wipeAll()
              .then(function () { return window.Cloud.importAll(window.Seed()); })
              .then(function () {
                UI.hideLoading();
                UI.toast('已恢复演示数据', 'success');
                setTimeout(function () { location.reload(); }, 600);
              })
              .catch(function (err) {
                UI.hideLoading();
                UI.toast('重置失败：' + (err.message || err), 'error');
              });
          }
        });
      }
    });

    var file = root.querySelector('#importFile');
    if (file) {
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var text = String(reader.result);
          file.value = '';

          var parsed;
          try {
            parsed = JSON.parse(text);
            if (!parsed || !parsed.stores) throw new Error('文件里没有门店数据');
          } catch (e2) {
            UI.toast('文件格式不对：' + (e2.message || e2), 'error');
            return;
          }

          UI.confirm({
            title: '导入备份',
            text: '这个文件里有 <b>' + parsed.stores.length + '</b> 家门店、' +
                  '<b>' + ((parsed.tasks || []).length) + '</b> 条任务。',
            warn: '导入会先清空云端现有数据，再用这个文件替换。所有同事看到的内容都会变。',
            okText: '确认导入',
            onOk: function () {
              UI.loading('正在导入到云端…');
              window.Cloud.wipeAll()
                .then(function () { return S.importJSON(text); })
                .then(function () {
                  UI.hideLoading();
                  UI.toast('导入成功，云端已更新', 'success');
                  setTimeout(function () { location.reload(); }, 700);
                })
                .catch(function (err) {
                  UI.hideLoading();
                  UI.toast('导入失败：' + (err.message || err), 'error');
                });
            }
          });
        };
        reader.readAsText(f, 'utf-8');
      });
    }
  }

  return { title: '系统设置', render: render, mount: mount };
})();
