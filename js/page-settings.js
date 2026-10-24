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

    stageCard() +

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
    var missing = !tpls.length;   /* 清单空了提醒一声，引导去卡牌里加，不再提「恢复」 */

    /* 每一张都能点：点一下直接去能调整它的地方（2026-10-24 用户要求） */
    function box(label, val, foot, act, tip) {
      return '<div class="mini-stat cfg-go" data-cfg="' + act + '" title="' + U.esc(tip) + '">' +
        '<div class="ms-label">' + label + '</div>' +
        '<div class="ms-val">' + val + '</div>' +
        '<div class="cfg-foot-num">' + foot + '<span class="cfg-arrow">去调整 →</span></div></div>';
    }

    return '' +
    '<div class="card fade-up cfg-card" style="animation-delay:.062s">' +
      '<div class="card-head"><h3>我的工作流配置</h3>' +
        '<span class="card-sub">点任意一张卡牌，直达它的调整入口；演示门店不会改动它们</span></div>' +

      '<div class="mini-stats cfg-stats">' +
        box('阶段时间线', stages.length + ' 个', subCount + ' 个二级阶段', 'stages',
          '就在本页下面「阶段与子阶段」：加一级 / 二级、改名、删除、按住手柄拖排序') +
        box('筹建任务清单', tpls.length + ' 条', tpls.length ? '新门店按它派活' : '没有任务可派', 'tpl',
          '打开筹建任务清单：增删改每条任务的名称、所属阶段、开业前天数') +
        box('到货物料清单', items.length + ' 项', items.length ? '门店里点一下就能选' : '门店里只能手填', 'items',
          '就在本页下面「到货物料清单」：加词条，长按删除') +
        box('团队成员', (S.getState().members || []).length + ' 人', '任务负责人从这里选', 'members',
          '去「团队工作台」：新增 / 编辑 / 移除成员') +
      '</div>' +

      (missing
        ? '<div class="cfg-warn">' +
            '<b>筹建任务清单现在是空的。</b>' +
            '新建门店不会再自动派任务。点上面「筹建任务清单」卡牌进去，把任务的名称、所属阶段、开业前天数加回来。' +
          '</div>'
        : '') +

      (snap && snap.richer
        ? '<div class="lead-foot">' +
            '<button class="btn btn-sm" data-act="restoreSnap">' +
              UI.icon('refresh') + '恢复 ' + fmtSnapTime(snap.at) + ' 的配置快照' +
              '<span class="dim">（' + snap.stages + ' 阶段 / ' + snap.templates + ' 任务 / ' + snap.items + ' 物料）</span>' +
            '</button>' +
            '<span class="lead-foot-tip">只改配置，不动已建的门店和任务；恢复前会再存一份现在的配置。</span>' +
          '</div>'
        : '') +
    '</div>';
  }

  /* ================= 阶段与子阶段（2026-10-24 从任务页时间线搬到设置） ================= */

  /* 新建状态不落库：加一级 / 给某个一级加二级的输入行开着就开着，刷新自然没 */
  var smState = { addStage: false, addSub: '' };

  /* 一级阶段用量：门店 / 任务 / 筹建清单各几个 */
  function smStageUse(name) {
    var u = S.stageUsage(name);
    var bits = [];
    if (u.stores) bits.push(u.stores + ' 家门店');
    if (u.tasks) bits.push(u.tasks + ' 条任务');
    if (u.templates) bits.push(u.templates + ' 条清单');
    return bits.length ? bits.join(' · ') : '还没用到';
  }

  /* 二级用量：任务 / 筹建清单 */
  function smSubUse(base, name) {
    var u = S.stageSubUsage(base, name);
    var bits = [];
    if (u.tasks) bits.push(u.tasks + ' 条任务');
    if (u.templates) bits.push(u.templates + ' 条清单');
    return bits.length ? bits.join(' · ') : '还没用到';
  }

  /* 二级用三源并集：设置里手填的 + 筹建清单里用到的 + 已有任务里用到的，
     和任务页时间线看到的是同一套（stageSubsWithUsed） */
  function smListHtml() {
    var subs = S.stageSubsWithUsed() || {};

    var rows = (S.stages() || []).map(function (st) {
      var list = subs[st.key] || [];

      var html = '<div class="sm-row" data-sm-stage="' + U.esc(st.key) + '">' +
          '<span class="sm-grip" title="按住上下拖排序">' + UI.icon('grip') + '</span>' +
          '<i class="sm-dot" style="background:' + st.color + '"></i>' +
          '<span class="sm-name">' + U.esc(st.key) + '</span>' +
          '<span class="sm-use">' + smStageUse(st.key) + '</span>' +
          '<span class="sm-tools">' +
            '<i data-sm-ren="' + U.esc(st.key) + '" title="给「' + U.esc(st.key) + '」改名">' + UI.icon('edit') + '</i>' +
            '<i data-sm-del="' + U.esc(st.key) + '" title="删除「' + U.esc(st.key) + '」">' + UI.icon('close') + '</i>' +
            '<button type="button" data-sm-subadd="' + U.esc(st.key) + '"' +
              ' title="给「' + U.esc(st.key) + '」加一个二级">' + UI.icon('plus') + '</button>' +
          '</span>' +
        '</div>';

      if (list.length || smState.addSub === st.key) {
        html += '<div class="sm-subs">' + list.map(function (sub) {
          return '<div class="sm-sub" data-sm-base="' + U.esc(st.key) + '" data-sm-sub="' + U.esc(sub) + '">' +
            '<i class="sm-sub-dot"></i>' +
            '<span class="sm-sub-name">' + U.esc(sub) + '</span>' +
            '<span class="sm-use">' + smSubUse(st.key, sub) + '</span>' +
            '<span class="sm-tools">' +
              '<i data-sm-subren="' + U.esc(sub) + '" title="给「' + U.esc(sub) + '」改名">' + UI.icon('edit') + '</i>' +
              '<i data-sm-subdel="' + U.esc(sub) + '" title="删除「' + U.esc(sub) + '」">' + UI.icon('close') + '</i>' +
            '</span>' +
          '</div>';
        }).join('') +
          (smState.addSub === st.key
            ? '<div class="sm-sub-add">' +
                '<input class="input" data-sm-subinp="' + U.esc(st.key) + '" maxlength="20" autocomplete="off"' +
                  ' placeholder="二级名称，回车确定" />' +
                '<button class="btn btn-primary btn-sm" type="button" data-sm-subok="' + U.esc(st.key) + '">添加</button>' +
              '</div>'
            : '') +
        '</div>';
      }

      return html;
    }).join('');

    return rows +
      (smState.addStage
        ? '<div class="sm-top-add">' +
            '<input class="input" id="smStageInp" maxlength="20" autocomplete="off"' +
              ' placeholder="新阶段名称，回车确定" />' +
            '<button class="btn btn-primary btn-sm" type="button" data-sm-stageok>添加</button>' +
          '</div>'
        : '');
  }

  function stageCard() {
    return '<div class="card fade-up" style="animation-delay:.075s">' +
      '<div class="card-head"><h3>阶段与子阶段</h3>' +
        '<span class="card-sub">任务管理左侧的时间线按这里显示，共 <b id="smStageCount">' +
          (S.stages() || []).length + '</b> 个一级阶段</span></div>' +
      '<div class="sm-list" id="smList">' + smListHtml() + '</div>' +
      '<div class="sm-addbar">' +
        '<button class="btn" type="button" data-sm-add>' + UI.icon('plus') + '添加一级阶段</button>' +
      '</div>' +
      '<p class="item-hint">一级阶段：<b>✎</b> 改名、<b>✕</b> 删除、<b>＋</b> 加二级；按住行首 <b>⠿</b> 手柄上下拖排序。' +
        '改名 / 删除会同步改掉门店、任务和筹建任务清单里的阶段，不会新旧两个名字并存。</p>' +
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
      /* 工作流配置卡：点一下直接去能调整它的地方（2026-10-24 用户要求） */
      var cfg = e.target.closest('[data-cfg]');
      if (cfg) {
        var k = cfg.getAttribute('data-cfg');
        if (k === 'stages') {
          var smb = root.querySelector('#smList');
          if (smb) {
            if (smb.scrollIntoView) smb.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var smCard = smb.closest('.card');
            if (smCard) {
              smCard.classList.remove('cfg-flash');
              void smCard.offsetWidth;   /* 强制重排，让动画能重新触发 */
              smCard.classList.add('cfg-flash');
            }
          }
        } else if (k === 'tpl') {
          App.go('tasks');
          /* 等任务管理页渲染出来，再点它顶部的「筹建任务清单」按钮把弹窗打开 */
          setTimeout(function () {
            var btn = document.querySelector('#view [data-act="tpl"]');
            if (btn) btn.click();
          }, 420);
        } else if (k === 'members') {
          App.go('team');
          UI.toast('在这儿新增 / 编辑 / 移除成员，任务负责人从成员里选', 'info', 3200);
        } else if (k === 'items') {
          var ib = root.querySelector('#arrItemsBox');
          if (ib) {
            ib.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var card = ib.closest('.card');
            if (card) {
              card.classList.remove('cfg-flash');
              void card.offsetWidth;   /* 强制重排，让动画能重新触发 */
              card.classList.add('cfg-flash');
            }
          }
        }
        return;
      }

      /* ---- 阶段与子阶段管理（2026-10-24 从任务页时间线搬来） ---- */
      var smAdd = e.target.closest('[data-sm-add]');
      if (smAdd) {
        smState.addStage = true;
        smState.addSub = '';
        paintSm();
        return;
      }

      var smStageOk = e.target.closest('[data-sm-stageok]');
      if (smStageOk) { commitSmStage(); return; }

      var smRen = e.target.closest('[data-sm-ren]');
      if (smRen) { renameStageDlg(smRen.getAttribute('data-sm-ren')); return; }

      var smDel = e.target.closest('[data-sm-del]');
      if (smDel) { removeStageDlg(smDel.getAttribute('data-sm-del')); return; }

      var smSubAdd = e.target.closest('[data-sm-subadd]');
      if (smSubAdd) {
        var smBase = smSubAdd.getAttribute('data-sm-subadd');
        smState.addSub = (smState.addSub === smBase) ? '' : smBase;
        smState.addStage = false;
        paintSm();
        return;
      }

      var smSubOk = e.target.closest('[data-sm-subok]');
      if (smSubOk) { commitSmSub(smSubOk.getAttribute('data-sm-subok')); return; }

      var smSubRen = e.target.closest('[data-sm-subren]');
      if (smSubRen) {
        var smRenRow = smSubRen.closest('.sm-sub');
        renameSubDlg(smRenRow.getAttribute('data-sm-base'), smRenRow.getAttribute('data-sm-sub'));
        return;
      }

      var smSubDel = e.target.closest('[data-sm-subdel]');
      if (smSubDel) {
        var smDelRow = smSubDel.closest('.sm-sub');
        removeSubDlg(smDelRow.getAttribute('data-sm-base'), smDelRow.getAttribute('data-sm-sub'));
        return;
      }

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

    /* ---------------- 阶段与子阶段管理（2026-10-24 从任务页时间线搬来） ----------------
       Store 的 API 都是现成的（addStage / renameStage / removeStage / saveStageOrder /
       saveStageSubs / renameStageSub / removeStageSub），页面只负责收集输入和确认。
       弹窗逻辑照搬任务页原来那套，只是 updateList(root) 换成 paintSm()。 */
    var smBox = root.querySelector('#smList');

    function paintSm() {
      if (!smBox) return;
      smBox.innerHTML = smListHtml();
      var cnt = root.querySelector('#smStageCount');
      if (cnt) cnt.textContent = (S.stages() || []).length;
      /* 新建行出现后直接聚焦，省一次点击 */
      if (smState.addSub) {
        var i1 = smBox.querySelector('[data-sm-subinp]');
        if (i1) i1.focus();
      } else if (smState.addStage) {
        var i2 = smBox.querySelector('#smStageInp');
        if (i2) i2.focus();
      }
    }

    function commitSmStage() {
      var inp = root.querySelector('#smStageInp');
      if (!inp) return false;

      var v = String(inp.value || '').trim().replace(/\s+/g, ' ');
      if (!v) { smState.addStage = false; paintSm(); return false; }

      var r = S.addStage(v, '');
      if (!r.ok) {
        UI.toast(r.error, 'error');
        inp.focus();
        inp.select();
        return false;
      }

      smState.addStage = false;
      paintSm();
      UI.toast('已添加一级阶段「' + v + '」', 'success', 2400);
      return true;
    }

    function commitSmSub(base) {
      var inp = smBox.querySelector('[data-sm-subinp]');
      if (!inp) return false;

      var v = String(inp.value || '').trim().replace(/\s+/g, ' ');
      if (!v) { smState.addSub = ''; paintSm(); return false; }

      if (v.indexOf('/') >= 0) {
        UI.toast('二级名称里不要带斜杠（斜杠是阶段名专用）', 'error');
        inp.focus();
        return false;
      }

      if ((S.stageSubsWithUsed()[base] || []).indexOf(v) >= 0) {
        UI.toast('「' + base + ' · ' + v + '」已经有了', 'info');
        inp.focus();
        inp.select();
        return false;
      }

      var map = S.stageSubs();
      var list = (map[base] || []).slice();
      list.push(v);
      map[base] = list;
      S.saveStageSubs(map);

      smState.addSub = '';
      paintSm();
      UI.toast('已添加二级「' + base + ' · ' + v + '」', 'success', 2400);
      return true;
    }

    function renameStageDlg(from) {
      var use = S.stageUsage(from);

      UI.modal({
        title: '给阶段改名',
        sub: from,
        body:
          '<div class="form-row">' +
            '<label class="form-label">新名称</label>' +
            '<input class="input" id="smStageNew" maxlength="20" autocomplete="off" value="' + U.esc(from) + '" />' +
          '</div>' +
          '<p class="item-hint">' +
            (use.stores || use.tasks || use.templates
              ? '会同时改掉 <b>' + use.stores + '</b> 家门店、<b>' + use.tasks + '</b> 条任务、' +
                '<b>' + use.templates + '</b> 条筹建清单里的这个阶段。'
              : '目前还没有门店 / 任务用这个阶段。') +
            '阶段下的二级保持不变。</p>',
        footer:
          '<button class="btn" type="button" data-x="cancel">取消</button>' +
          '<button class="btn btn-primary" type="button" data-x="ok">保存</button>',
        onMount: function (m, close) {
          var inp = m.querySelector('#smStageNew');
          if (inp) { inp.focus(); inp.select(); }

          function doSave() {
            var v = String(inp.value || '').trim().replace(/\s+/g, ' ');
            if (!v) { inp.focus(); return; }

            var r = S.renameStage(from, v);
            if (!r.ok) { UI.toast(r.error, 'error'); inp.focus(); return; }

            close();
            if (smState.addSub === from) smState.addSub = v;
            paintSm();
            UI.toast('「' + from + '」已改名为「' + v + '」' +
              (r.hit ? '，同步了 ' + r.hit + ' 条数据' : ''), 'success', 2600);
          }

          m.addEventListener('click', function (e) {
            if (e.target.closest('[data-x="ok"]')) doSave();
            if (e.target.closest('[data-x="cancel"]')) close();
          });
          if (inp) {
            inp.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') { e.preventDefault(); doSave(); }
            });
          }
        }
      });
    }

    function removeStageDlg(name) {
      var use = S.stageUsage(name);

      /* 还有门店在这个阶段 → 不能删，否则门店会变成「找不到阶段」 */
      if (use.stores) {
        UI.confirm({
          title: '先别删「' + name + '」',
          text: '还有 <b>' + use.stores + '</b> 家门店停在这个阶段。',
          warn: '把它们改到别的阶段之后再删。删除阶段不会删门店，但门店必须有阶段。',
          okText: '知道了',
          onOk: function () {}
        });
        return;
      }

      var doRemove = function () {
        var r = S.removeStage(name);
        if (!r.ok) { UI.toast(r.error, 'error'); return; }
        if (smState.addSub === name) smState.addSub = '';
        paintSm();
        UI.toast('已删除阶段「' + name + '」' +
          (r.moved ? '，' + r.moved + ' 条任务挪到「' + r.to + '」' : ''), 'info', 2800);
      };

      if (use.tasks || use.templates) {
        UI.confirm({
          title: '删除阶段「' + name + '」',
          text: '这个阶段下没有门店，但还有 <b>' + use.tasks + '</b> 条任务、' +
            '<b>' + use.templates + '</b> 条筹建清单挂着。',
          warn: '它们会被挪到「' + (S.stages()[0] || {}).key + '」，不会被删掉。阶段下面的二级定义一起消失。',
          danger: true,
          okText: '确认删除',
          onOk: doRemove
        });
        return;
      }

      UI.confirm({
        title: '删除阶段「' + name + '」',
        text: '这个阶段下没有门店，也没有任务。',
        danger: true,
        okText: '确认删除',
        onOk: doRemove
      });
    }

    function renameSubDlg(base, name) {
      UI.modal({
        title: '给二级改名',
        sub: base + ' · ' + name,
        body:
          '<div class="form-row">' +
            '<label class="form-label">新名称</label>' +
            '<input class="input" id="smSubNew" maxlength="20" autocomplete="off" value="' + U.esc(name) + '" />' +
          '</div>' +
          '<p class="item-hint">改名会同时改掉<b>筹建任务清单</b>和<b>已派到门店的任务</b>里的这个二级，' +
            '阶段时间线立刻同步，不会新旧两个名字并存。</p>',
        footer:
          '<button class="btn" type="button" data-x="cancel">取消</button>' +
          '<button class="btn btn-primary" type="button" data-x="ok">保存</button>',
        onMount: function (m, close) {
          var inp = m.querySelector('#smSubNew');
          if (inp) { inp.focus(); inp.select(); }

          function doSave() {
            var v = String(inp.value || '').trim().replace(/\s+/g, ' ');
            if (!v) { inp.focus(); return; }
            if (v === name) { close(); return; }
            if (v.indexOf('/') >= 0) { UI.toast('二级名称里不要带斜杠', 'error'); return; }

            var hit = S.renameStageSub(base, name, v);
            close();
            if (smState.addSub === name) smState.addSub = v;
            paintSm();
            UI.toast('「' + name + '」已改名为「' + v + '」' + (hit ? '，同步了 ' + hit + ' 条任务' : ''), 'success', 2600);
          }

          m.addEventListener('click', function (e) {
            if (e.target.closest('[data-x="ok"]')) doSave();
            if (e.target.closest('[data-x="cancel"]')) close();
          });
          if (inp) {
            inp.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') { e.preventDefault(); doSave(); }
            });
          }
        }
      });
    }

    function removeSubDlg(base, name) {
      var use = S.stageSubUsage(base, name);

      var doRemove = function () {
        S.removeStageSub(base, name);
        if (smState.addSub === name) smState.addSub = '';
        paintSm();
        UI.toast('已删除「' + base + ' · ' + name + '」' +
          (use.templates + use.tasks ? '，' + (use.templates + use.tasks) + ' 条任务退回一级' : ''),
          'info', 2600);
      };

      if (use.templates || use.tasks) {
        UI.confirm({
          title: '删除二级「' + name + '」',
          text: (use.templates ? '筹建任务清单里有 <b>' + use.templates + '</b> 条、' : '') +
            (use.tasks ? '门店任务里有 <b>' + use.tasks + '</b> 条' : '') +
            '挂在「' + base + ' · ' + name + '」上。',
          warn: '它们的阶段会退回一级「' + base + '」，任务本身不删。改动立刻同步到阶段时间线。',
          danger: true,
          okText: '确认删除',
          onOk: doRemove
        });
        return;
      }

      doRemove();
    }

    /* 按住行首手柄上下拖 → 调一级阶段顺序（逻辑照搬任务页原来那套） */
    (function bindSmDrag() {
      var drag = null;

      function pairOf(node) {
        var sib = node.nextElementSibling;
        return (sib && sib.classList && sib.classList.contains('sm-subs')) ? sib : null;
      }

      smBox.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        var grip = e.target.closest('.sm-grip');
        if (!grip || !smBox.contains(grip)) return;
        var node = grip.closest('.sm-row');
        if (!node) return;

        drag = {
          node: node,
          key: node.getAttribute('data-sm-stage'),
          startY: e.clientY,
          moved: false
        };
      });

      document.addEventListener('pointermove', function (e) {
        if (!drag) return;

        if (!drag.moved) {
          if (Math.abs(e.clientY - drag.startY) < 6) return;
          drag.moved = true;
          drag.node.classList.add('sm-dragging');
          document.body.classList.add('sm-sorting');
        }

        var list = [].slice.call(smBox.querySelectorAll('.sm-row'));
        var before = null;
        for (var i = 0; i < list.length; i++) {
          var n = list[i];
          if (n === drag.node) continue;
          var r = n.getBoundingClientRect();
          if (e.clientY < r.top + r.height / 2) { before = n; break; }
        }

        if (before === drag.node) return;

        var pair = pairOf(drag.node);

        if (before) {
          if (drag.node.nextElementSibling === before) return;   /* 已经在这个位置 */
          smBox.insertBefore(drag.node, before);
          if (pair) smBox.insertBefore(pair, drag.node.nextSibling);
          return;
        }

        /* 光标在所有行下面 → 挪到最后 */
        var last = list[list.length - 1];
        if (last === drag.node) return;
        smBox.appendChild(drag.node);
        if (pair) smBox.appendChild(pair);
      });

      document.addEventListener('pointerup', function () {
        if (!drag) return;
        var d = drag;
        drag = null;

        d.node.classList.remove('sm-dragging');
        document.body.classList.remove('sm-sorting');

        if (!d.moved) return;

        var keys = [].slice.call(smBox.querySelectorAll('.sm-row')).map(function (n) {
          return n.getAttribute('data-sm-stage');
        });

        S.saveStageOrder(keys);
        paintSm();
        UI.toast('阶段顺序已保存', 'success', 1600);
      });
    })();

    /* 新建行：回车存、Esc 收起、点别处（有内容）自动存 */
    smBox.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t.getAttribute) return;

      if (t.id === 'smStageInp') {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitSmStage();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          smState.addStage = false;
          paintSm();
        }
        return;
      }

      if (t.hasAttribute('data-sm-subinp')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitSmSub(t.getAttribute('data-sm-subinp'));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          smState.addSub = '';
          paintSm();
        }
      }
    });

    smBox.addEventListener('focusout', function (e) {
      var t = e.target;
      if (!t.getAttribute) return;

      var isStage = t.id === 'smStageInp';
      var isSub = t.hasAttribute('data-sm-subinp');
      if (!isStage && !isSub) return;

      /* 等一下：如果是点了「添加」按钮，click 会先把这件事做完 */
      setTimeout(function () {
        if (isStage) {
          if (!smState.addStage) return;
          var cur = root.querySelector('#smStageInp');
          if (cur && String(cur.value || '').trim()) commitSmStage();
          else { smState.addStage = false; paintSm(); }
        } else {
          var base = t.getAttribute('data-sm-subinp');
          if (smState.addSub !== base) return;
          var cur2 = smBox.querySelector('[data-sm-subinp]');
          if (cur2 && String(cur2.value || '').trim()) commitSmSub(base);
          else { smState.addSub = ''; paintSm(); }
        }
      }, 170);
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
