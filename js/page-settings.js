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
          '<button class="btn btn-primary" data-act="addDemo">' + UI.icon('plus') + '添加 50 家演示门店</button>' +
          '<button class="btn" data-act="clearStores">' + UI.icon('refresh') + '清空门店与任务</button>' +
        '</div>' +
        '<p style="margin-top:8px;font-size:11.5px;color:var(--text-3);line-height:1.7">' +
          '「添加演示门店」只往门店 / 任务 / 到货里加数据，' +
          '<b>阶段时间线、筹建任务清单、到货物料清单、成员一个都不动</b>；' +
          '「清空门店与任务」同样只清业务数据，配置留着。' +
        '</p>' +
        '<input type="file" id="importFile" accept=".json,application/json" style="display:none" />' +
        '<p style="margin-top:8px;font-size:11.5px;color:var(--text-3);line-height:1.7">' +
          '数据实时保存在云端，换电脑、清缓存都不会丢。本机缓存约 ' + U.bytes(bytes) + '，仅用于断网时应急。' +
        '</p>' +
      '</div>' +
    '</section>' +

    configCard() +

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

  /* ================= 我的工作流配置（阶段 / 清单 / 物料） =================
     2026-10-24：这里以前被「清空云端并生成演示门店」一起删掉过 ——
     阶段时间线、筹建任务清单、到货物料清单都是用户真实的工作逻辑，
     现在单独一张卡看得见、能一键恢复，演示门店也不会再动它们。 */

  function fmtSnapTime(iso) {
    try {
      var d = new Date(iso);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
        U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
    } catch (e) { return ''; }
  }

  function configCard() {
    var stages = S.stages() || [];
    var subs = S.stageSubs() || {};
    var subCount = 0;
    Object.keys(subs).forEach(function (k) { subCount += (subs[k] || []).length; });
    var tpls = S.templates() || [];
    var items = S.items() || [];
    var snap = S.settingsSnapshot ? S.settingsSnapshot() : null;
    var missing = !tpls.length;

    function box(label, val, foot) {
      return '<div class="mini-stat"><div class="ms-label">' + label + '</div>' +
        '<div class="ms-val">' + val + '</div>' +
        '<div class="cfg-foot-num">' + foot + '</div></div>';
    }

    return '' +
    '<div class="card fade-up cfg-card" style="animation-delay:.062s">' +
      '<div class="card-head"><h3>我的工作流配置</h3>' +
        '<span class="card-sub">阶段时间线 / 筹建任务清单 / 到货物料清单 —— 演示门店不会改动它们</span></div>' +

      '<div class="mini-stats cfg-stats">' +
        box('阶段时间线', stages.length + ' 个', subCount + ' 个二级阶段') +
        box('筹建任务清单', tpls.length + ' 条', tpls.length ? '新门店按它派活' : '没有任务可派') +
        box('到货物料清单', items.length + ' 项', items.length ? '门店里点一下就能选' : '门店里只能手填') +
        box('团队成员', (S.getState().members || []).length + ' 人', '任务负责人从这里选') +
      '</div>' +

      (missing
        ? '<div class="cfg-warn">' +
            '<b>筹建任务清单现在是空的。</b>' +
            '新建门店不会再自动派任务，清单里也看不到你原来那套流程。' +
            '点下面「恢复标准工作流」可以把 7 个阶段 + 7 条任务 + 8 项物料一次找回来。' +
          '</div>'
        : '') +

      '<div class="lead-foot">' +
        '<button class="btn btn-primary btn-sm" data-act="restoreWorkflow">' +
          UI.icon('refresh') + '恢复标准工作流</button>' +
        (snap && snap.richer
          ? '<button class="btn btn-sm" data-act="restoreSnap">' +
              UI.icon('refresh') + '恢复 ' + fmtSnapTime(snap.at) + ' 的配置快照' +
              '<span class="dim">（' + snap.stages + ' 阶段 / ' + snap.templates + ' 任务 / ' + snap.items + ' 物料）</span>' +
            '</button>'
          : '') +
        '<span class="lead-foot-tip">' +
          '「恢复标准工作流」只写回配置，不动已建的门店和任务；恢复前会自动存一份当前配置的快照。' +
        '</span>' +
      '</div>' +
    '</div>';
  }

  /* 2026-10-24：原来的「逾期倒推口径」（按阶段配默认天数）整块删掉了。
     逾期天数只有一处来源 —— 筹建任务清单里每条任务的「开业前(天)」：
     建议完成日 = 门店计划开业日 − 这条任务的开业前天数。
     例：门店 11-15 开业、清单填 30 天 → 10-16 前要完成，10-17 起才算逾期。 */

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

      else if (act === 'export') {
        S.downloadJSON();
        UI.toast('备份文件已下载', 'success');
      }

      else if (act === 'addDemo') {
        var st0 = S.getState();
        UI.confirm({
          title: '添加 50 家演示门店',
          text: '会往现有数据里<b>再加 50 家演示门店</b>（各自的阶段、进度、到货日期都不一样），' +
                '并给它们派任务、编发货计划。<br />' +
                '<b>阶段时间线、筹建任务清单、到货物料清单、团队成员一个都不动</b>，' +
                '演示门店直接按你现在的配置生成。',
          warn: '现在系统里有 <b>' + st0.stores.length + ' 家门店</b>，加完会变成 ' +
                (st0.stores.length + 50) + ' 家。只在演示 / 试用时用。',
          okText: '加 50 家',
          onOk: function () {
            UI.loading('正在生成 50 家门店…');
            var bundle = window.Seed({ count: 50 });
            S.addDemoStores(bundle)
              .then(function (r) {
                UI.hideLoading();
                UI.toast('已添加 ' + r.stores + ' 家门店、' + r.tasks + ' 条任务，配置没动', 'success', 2600);
                setTimeout(function () { location.reload(); }, 800);
              })
              .catch(function (err) {
                UI.hideLoading();
                UI.toast('添加失败：' + (err.message || err), 'error');
              });
          }
        });
      }

      else if (act === 'clearStores') {
        var st1 = S.getState();
        UI.confirm({
          title: '清空门店与任务',
          text: '删除全部 <b>' + st1.stores.length + ' 家门店</b>、' + st1.tasks.length + ' 条任务和到货记录。' +
                '<br /><b>阶段时间线、筹建任务清单、到货物料清单、团队成员都会保留</b>。',
          warn: '门店和任务删了就没了（配置不会）。建议先「导出备份」。',
          danger: true,
          okText: '确认清空门店',
          onOk: function () {
            UI.loading('正在清空门店…');
            S.clearBusiness()
              .then(function () {
                UI.hideLoading();
                UI.toast('门店和任务已清空，配置都还在', 'success');
                setTimeout(function () { location.reload(); }, 700);
              })
              .catch(function (err) {
                UI.hideLoading();
                UI.toast('清空失败：' + (err.message || err), 'error');
              });
          }
        });
      }

      else if (act === 'restoreWorkflow') {
        UI.confirm({
          title: '恢复标准工作流',
          text: '写回这套流程：<b>7 个阶段</b>（未出图 → 已出图 → 资料/建档 → 施工/装修 → 物料/到货 → 开业准备 → 已开业）、' +
                '「已出图」下的 <b>已做首批 / 未做首批</b>、<b>7 条筹建任务</b>、<b>8 项到货物料</b>。',
          warn: '如果你现在自己配过阶段 / 清单，会被这套标准流程覆盖（覆盖前会自动存一份快照，可再恢复回来）。',
          okText: '恢复',
          onOk: function () {
            var r = S.restoreWorkflow();
            UI.toast('已恢复：' + r.stages + ' 个阶段（含 ' + r.subs + ' 个二级）、' +
              r.templates + ' 条任务、' + r.items + ' 项物料', 'success', 3200);
            setTimeout(function () { App.refresh(); }, 300);
          }
        });
      }

      else if (act === 'restoreSnap') {
        var snap = S.settingsSnapshot();
        if (!snap) { UI.toast('没有可恢复的快照', 'error'); return; }
        UI.confirm({
          title: '恢复配置快照',
          text: '把 ' + fmtSnapTime(snap.at) + ' 那一份配置恢复回来：' +
                '<b>' + snap.stages + ' 个阶段</b>、<b>' + snap.templates + ' 条筹建任务</b>、' +
                '<b>' + snap.items + ' 项物料</b>。',
          warn: '只改配置，门店和任务不动。现在这份也会先存成快照，随时能换回来。',
          okText: '恢复这份',
          onOk: function () {
            var r = S.restoreSettingsSnapshot();
            if (!r || !r.ok) { UI.toast((r && r.error) || '恢复失败', 'error'); return; }
            UI.toast('已恢复到 ' + fmtSnapTime(r.at) + ' 的配置', 'success', 2800);
            setTimeout(function () { App.refresh(); }, 300);
          }
        });
      }

      else if (act === 'import') {
        root.querySelector('#importFile').click();
      }

      /* 注意：原来的 data-act="reset"（wipeAll + 塞演示数据）已经删掉。
         wipeAll 会把 app_settings 整张清空 —— 阶段时间线、筹建任务清单、
         物料清单全在里面，用户真实的工作流就是这么被一起删掉的。
         现在拆成「添加演示门店（addDemo）」和「清空门店（clearStores）」两步，
         都不碰配置。需要彻底重置，用「从备份文件导入」或手动清库。 */
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
