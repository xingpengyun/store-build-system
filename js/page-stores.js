/* ==========================================================
   page-stores.js — 门店管理
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.stores = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  var state = { q: '', province: '', stage: '', risk: '', owner: '', page: 1, per: 10 };

  /* ---------------- 数据筛选 ---------------- */
  function filtered() {
    var q = state.q.toLowerCase();
    return S.getState().stores.filter(function (s) {
      if (state.province && s.province !== state.province) return false;
      if (state.stage && s.stage !== state.stage) return false;
      if (state.risk && s.risk !== state.risk) return false;
      if (state.owner && s.ownerId !== state.owner) return false;
      if (q) {
        var owner = S.memberById(s.ownerId);
        var hay = (s.name + ' ' + s.province + ' ' + s.stage + ' ' + (owner ? owner.name : '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* ---------------- 列表 HTML ---------------- */
  function listHtml() {
    var all = filtered();
    var totalPages = Math.max(1, Math.ceil(all.length / state.per));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.per;
    var rows = all.slice(start, start + state.per);

    if (!rows.length) {
      return UI.empty('没有符合条件的门店', '试试调整筛选条件，或新增一家门店');
    }

    var body = rows.map(function (store) {
      var owner = S.memberById(store.ownerId);
      var stageObj = null;
      C.STAGES.forEach(function (x) { if (x.key === store.stage) stageObj = x; });

      var mine = S.getState().tasks.filter(function (t) { return t.storeId === store.id; });
      var done = mine.filter(function (t) { return t.status === 'done'; }).length;

      return '<tr>' +
        '<td><div class="store-cell">' +
          '<i class="store-dot" style="background:' + (stageObj ? stageObj.color : '#98a2b8') + '"></i>' +
          '<span class="store-name" data-act="view" data-id="' + store.id + '">' + U.esc(store.name) + '</span>' +
        '</div></td>' +
        '<td class="muted">' + U.esc(store.province || '—') + '</td>' +
        '<td class="muted mono">' + (store.openDate || '<span class="dim">未定</span>') + '</td>' +
        '<td>' + UI.progress(S.progressValue(store), null, S.progressTip(store)) + '</td>' +
        '<td>' + UI.stageBadge(store.stage, S.storeSub(store)) + '</td>' +
        '<td>' + UI.riskBadge(store.risk) + '</td>' +
        '<td>' + (owner
          ? '<div class="store-cell">' + UI.avatar(owner.name, owner.color, 'sm', owner.animal) + '<span>' + U.esc(owner.name) + '</span></div>'
          : '<span class="dim">未指派</span>') + '</td>' +
        '<td class="muted mono">' + done + ' / ' + mine.length + '</td>' +
        '<td class="nowrap">' +
          '<span class="tlink" data-act="view" data-id="' + store.id + '">详情</span>' +
          '<span class="tlink" data-act="edit" data-id="' + store.id + '">编辑</span>' +
          '<span class="tlink danger" data-act="del" data-id="' + store.id + '">删除</span>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<div class="table-wrap"><table class="tbl">' +
      '<thead><tr>' +
        '<th>门店名称</th><th>省份</th><th>开业日期</th><th title="已完成任务 / 任务总计">整体进度</th>' +
        '<th>当前阶段</th><th>风险等级</th><th>负责人</th><th>任务</th><th>操作</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>' +
    UI.pager(state.page, totalPages, all.length);
  }

  /* ---------------- 表单 ---------------- */
  function formHtml(store) {
    var isNew = !store;
    var s = store || {};
    var provinceOptions = C.PROVINCES.map(function (p) { return p; });
    if (s.province && provinceOptions.indexOf(s.province) < 0) provinceOptions.unshift(s.province);

    return '<form autocomplete="off">' +
      /* ① 名称：整行，唯一必填 */
      '<div class="field">' +
        '<label>门店名称 <span class="req">*</span></label>' +
        '<input class="input" name="name" value="' + U.esc(s.name || '') + '" placeholder="例如：广州天河店" />' +
      '</div>' +

      /* ② 地点：省份 + 门店地址。
         原来地址单独占一整行、省份和开业日期并排（右边还带两行说明），
         结果左边省份底下空一大块、下一行只剩左半边 —— 看着就是不齐。
         现在按「同类信息同一行」配对，每行两格都有内容，没有半行。 */
      '<div class="field-row">' +
        '<div class="field"><label>省份</label>' +
          UI.comboHtml({
            name: 'province',
            value: s.province || '',
            items: provinceOptions,
            py: C.PROVINCE_PINYIN,
            placeholder: '打一个字，如「广」'
          }) +
        '</div>' +
        '<div class="field"><label>门店地址 <span class="field-sub">选填</span></label>' +
          '<input class="input" name="address" value="' + U.esc(s.address || '') + '" placeholder="例如：天河路 1 号" />' +
        '</div>' +
      '</div>' +

      /* ③ 时间：计划开业日期 + 建档提交时间。两格都带同样长度的一行说明，高度一致 */
      '<div class="field-row">' +
        '<div class="field"><label>计划开业日期 <span class="field-sub">没定可以先空着</span></label>' +
          '<input class="input" type="date" name="openDate" value="' + (s.openDate || '') + '" />' +
          '<div class="field-hint">填了才能倒推任务日期；空着时只显示「开业前 N 天」，不判逾期。</div>' +
        '</div>' +
        '<div class="field"><label>建档提交时间 <span class="field-sub">选填</span></label>' +
          '<input class="input" type="date" name="buildDate" value="' +
            (s.buildDate || '') + '" />' +
          '<div class="field-hint">这家店什么时候提交建档的，选填，和开业日期分开记录。</div>' +
        '</div>' +
      '</div>' +

      /* ④ 状态：当前阶段 + 风险等级 */
      '<div class="field-row">' +
        '<div class="field"><label>当前阶段</label>' +
          '<select class="select" name="stage">' +
            UI.options(C.STAGES.map(function (x) { return x.key; }), s.stage || (C.STAGES[0] || {}).key) +
          '</select>' +
        '</div>' +
        '<div class="field"><label>风险等级</label>' +
          '<select class="select" name="risk">' + riskOptions(s.risk || 'normal') + '</select>' +
        '</div>' +
      '</div>' +

      /* ⑤ 人 + 进度：负责人 + 只读进度（进度条压成一行，和下拉同高，
         说明文字放到框外，避免原来「左边三行字、右边一个框」的高度错位） */
      '<div class="field-row">' +
        '<div class="field"><label>门店负责人</label>' +
          '<select class="select" name="ownerId">' +
            UI.options(S.getState().members, s.ownerId || '', 'id', 'name') +
          '</select>' +
          (isNew ? '' : '<div class="field-hint" data-owner-hint style="display:none"></div>') +
        '</div>' +
        '<div class="field"><label>阶段进度 <span class="field-sub">按阶段自动算，不用填</span></label>' +
          '<div data-prog-preview>' + progPreviewHtml(s.stage || (C.STAGES[0] || {}).key) + '</div>' +
        '</div>' +
      '</div>' +

      /* ⑥ 备注：整行 */
      '<div class="field"><label>备注 <span class="field-sub">选填</span></label>' +
        '<textarea class="textarea" name="remark" placeholder="选址情况、特殊要求等">' + U.esc(s.remark || '') + '</textarea>' +
      '</div>' +
      (isNew && S.templates().length
        ? '<label class="form-check">' +
            '<input type="checkbox" name="autoTasks" checked /> 建店后自动派发清单里的 ' + S.templates().length + ' 条任务（不需要就取消勾选）' +
          '</label>'
        : '') +
    '</form>';
  }

  /* 表单里那格「阶段进度」：只读预览，跟着「当前阶段」即时变。
     这里刻意用阶段口径（stageProgress）——表单里还没保存、任务也还没派，
     按任务算只会一直显示「—」。页面上其他地方的门店进度条走任务口径。 */
  function progPreviewHtml(stage) {
    var p = S.stageProgress({ stage: stage });
    var per = Math.round(100 / p.total * 10) / 10;
    var tip = p.isEnd
      ? '收尾阶段不占进度，筹建部分已走完 → 100%'
      : p.ended
        ? '已经是最后一个筹建阶段，进度 100%'
        : p.label + '，每格约 ' + per + '%，推到最后一格就是 100%';
    /* 进度条单独占一行（和旁边的下拉框同高），说明文字放到框外统一走 .field-hint，
       否则「左边三行小字 + 右边一个下拉」必然一高一矮。 */
    return '<div class="prog-prev">' + UI.progress(p.pct) + '</div>' +
      '<div class="field-hint">' + U.esc(tip) + '</div>';
  }

  /* 风险下拉需要正确的 value/label，单独生成 */
  function riskOptions(selected) {
    return Object.keys(C.RISKS).map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + C.RISKS[k].label + '</option>';
    }).join('');
  }

  function openForm(store) {
    var isNew = !store;
    var tplCount = S.templates().length;

    UI.modal({
      title: isNew ? '新增门店' : '编辑门店',
      sub: isNew
        ? (tplCount ? '保存后自动派发 ' + tplCount + ' 条筹建任务' : '筹建任务清单为空，暂不派发任务')
        : (store.name || ''),
      body: formHtml(store),
      footer:
        '<button class="btn" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" data-act="save">保存</button>',
      onMount: function (rootEl, close) {
        UI.initCombos(rootEl);
        /* 回车不要触发表单提交（会刷新页面） */
        var frm = rootEl.querySelector('form');
        if (frm) frm.addEventListener('submit', function (e) { e.preventDefault(); });

        rootEl.querySelector('[data-act="cancel"]').onclick = close;

        /* 换「当前阶段」时，旁边的阶段进度实时跟着变 */
        var stageSel = rootEl.querySelector('[name="stage"]');
        var prev = rootEl.querySelector('[data-prog-preview]');
        if (stageSel && prev) {
          stageSel.addEventListener('change', function () {
            prev.innerHTML = progPreviewHtml(stageSel.value);
          });
        }

        /* 换负责人：在保存前就把话说明白 —— 这家店的任务会一条不剩地转过去。
           不弹二次确认（弹窗是单例，会把正在编辑的表单顶掉），改成随下拉变化的内联提示。 */
        var ownerSel = rootEl.querySelector('[name="ownerId"]');
        var ownerHint = rootEl.querySelector('[data-owner-hint]');
        function paintOwnerHint() {
          if (!ownerSel || !ownerHint || !store) return;
          if (ownerSel.value === store.ownerId) {
            ownerHint.style.display = 'none';
            ownerHint.textContent = '';
            return;
          }
          var n = S.taskCountOfStore(store.id, ownerSel.value);
          ownerHint.style.display = '';
          ownerHint.textContent = n
            ? '这家店 ' + n + ' 条任务（含已完成的）保存后全部转到新负责人名下。'
            : '这家店还没有任务，换人只影响以后再派的活。';
        }
        if (ownerSel && ownerHint) {
          ownerSel.addEventListener('change', paintOwnerHint);
          paintOwnerHint();
        }

        rootEl.querySelector('[data-act="save"]').onclick = function () {
          var name = UI.formValue(rootEl, 'name');
          if (!name) {
            UI.toast('门店名称不能为空', 'error');
            rootEl.querySelector('[name="name"]').focus();
            return;
          }

          var payload = {
            name: name,
            province: UI.formValue(rootEl, 'province'),
            stage: UI.formValue(rootEl, 'stage'),
            risk: UI.formValue(rootEl, 'risk'),
            ownerId: UI.formValue(rootEl, 'ownerId'),
            openDate: UI.formValue(rootEl, 'openDate'),
            buildDate: UI.formValue(rootEl, 'buildDate'),
            address: UI.formValue(rootEl, 'address'),
            remark: UI.formValue(rootEl, 'remark')
          };
          /* progress 不再手填：显示用的百分比由 Store.storeProgress() 按「已完成任务 / 任务总计」现算 */

          if (isNew) {
            var auto = rootEl.querySelector('[name="autoTasks"]');
            payload.autoTasks = auto ? auto.checked : true;
            S.addStore(payload);
            UI.toast(payload.autoTasks && tplCount
              ? '门店已创建，已按清单派发 ' + tplCount + ' 条任务'
              : '门店已创建', 'success');
          } else {
            var before = store.stage;
            var forward = S.stageOrder(payload.stage) > S.stageOrder(before);
            /* 换负责人前先数清楚：这家店有几条任务要跟着转（含已完成的） */
            var ownerChanged = !!payload.ownerId && payload.ownerId !== store.ownerId;
            var movedCount = ownerChanged ? S.taskCountOfStore(store.id, payload.ownerId) : 0;
            var newOwnerName = (S.memberById(payload.ownerId) || {}).name || '新负责人';
            S.updateStore(store.id, payload);

            /* 阶段往前挪了：沿「已完成任务」落点连续推进，把已经做完的格子越过去
               （推进到某一格、发现它已做完 → 继续跳到下一格）。越过了就右下角弹小卡片。 */
            var jumped = forward ? S.advanceStore(store.id) : null;

            UI.toast(movedCount
              ? '门店信息已更新，' + movedCount + ' 条任务已转到 ' + newOwnerName + ' 名下'
              : '门店信息已更新', 'success');
            if (jumped) {
              UI.stagePop({
                store: jumped.store ? jumped.store.name : payload.name,
                from: C.stageLabel(jumped.from),
                to: C.stageLabel(jumped.to),
                note: '「' + jumped.gate.title + '」已完成' +
                  (jumped.skipped.length ? ' · 越过 ' + jumped.skipped.length + ' 格' : '')
              });
            }
          }
          close();
          App.refresh({ keep: true });
        };
      }
    });
  }

  /* ---------------- 物料到货（可编辑） ----------------
     门店给出到货时间 → 在这里逐条填；通知完供应商就点一下「通知供应商」变成「已通知」。
     口径：登记的到货日往前 ARR_WATCH_DAYS 天（默认 7）就该通知供应商发货 ——
     门店说 11-10 到，11-03 就要打电话让对方安排发货。
     所以这里不记在途 / 到店、也不确认到货，只认登记的到货时间和「通知了没」：
     「快到了 / 已经过了到货日还没通知」的排最前面并标色。 */
  function arrList(storeId) {
    return S.getState().arrivals.filter(function (a) { return a.storeId === storeId; })
      .sort(function (a, b) {
        /* 1) 还没通知的排前面，已通知的沉底（已通知的按最近日期在上） */
        var da = S.arrNotified(a) ? 1 : 0;
        var db = S.arrNotified(b) ? 1 : 0;
        if (da !== db) return da - db;

        /* 2) 没填日期的放最后，别占着第一屏 */
        if (!a.etaDate !== !b.etaDate) return a.etaDate ? -1 : 1;

        /* 3) 待通知按日期升序（过期 & 7 天内的自然浮上来）；已通知按日期降序 */
        var cmp = String(a.etaDate || '').localeCompare(String(b.etaDate || ''));
        return da ? -cmp : cmp;
      });
  }

  /* 到货倒计时：正数=还有几天，0=今天，负数=已经过；没填日期 = null */
  function arrDays(a) {
    if (!a || !a.etaDate) return null;
    var d = U.diffDays(U.today(), a.etaDate);
    return isNaN(d) ? null : d;
  }

  /* 这条要不要盯着：'late' 已过到货日还没通知 / 'soon' 提前天数内该通知 / null 不用管 */
  function arrWatch(a) {
    if (!a || S.arrNotified(a)) return null;
    var d = arrDays(a);
    if (d == null) return null;
    if (d < 0) return 'late';
    return d <= Number(C.ARR_WATCH_DAYS || 7) ? 'soon' : null;
  }

  /* 到货输入框里的显示：今年的只显示「10-25」，跨年的才带年份「2027-01-05」
     （底层存的还是完整 YYYY-MM-DD，只是输入框里不啰嗦） */
  function etaDisplay(iso) {
    var s = String(iso || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s.slice(0, 4) === String(new Date().getFullYear()) ? s.slice(5) : s;
  }

  /* 清单里还没加进这家门店的物料 */
  function arrMissing(storeId) {
    var have = {};
    arrList(storeId).forEach(function (a) { have[String(a.item || '').trim()] = 1; });
    return S.items().filter(function (x) { return !have[x]; });
  }

  function arrBody(storeId) {
    var list = arrList(storeId);
    var preset = S.items();
    var missing = arrMissing(storeId);
    var watchDays = Number(C.ARR_WATCH_DAYS || 7);


    /* 顶部小结：一眼看出有几项要盯 */
    var late = 0, soon = 0, wait = 0, ok = 0;
    list.forEach(function (a) {
      if (S.arrNotified(a)) { ok += 1; return; }
      var w = arrWatch(a);
      if (w === 'late') late += 1;
      else if (w === 'soon') soon += 1;
      else wait += 1;
    });

    var empty = !list.length
      ? '<div class="arr-empty">' +
          '<p>门店还没给到货时间</p>' +
          '<span>' + (preset.length
            ? '点「一键添加」把清单里的物料一次加进来，再换上门店给的时间；也可以点下面的单个物料'
            : '拿到时间后点「+ 添加物料」，自己填物料名和到货时间') + '</span>' +
          (preset.length
            ? '<div class="arr-quick">' +
                preset.map(function (x) {
                  return '<button type="button" class="arr-chip" data-arr-quick="' + U.esc(x) + '">' + U.esc(x) + '</button>';
                }).join('') +
              '</div>'
            : '') +
        '</div>'
      : '<div class="arr-sum">' +
          '<span class="arr-sum-i">共 <b>' + list.length + '</b> 项</span>' +
          (late ? '<span class="arr-sum-i late"><i></i>漏通知 <b>' + late + '</b></span>' : '') +
          (soon ? '<span class="arr-sum-i soon"><i></i>该通知 <b>' + soon + '</b>（' + watchDays + ' 天内到）</span>' : '') +
          (wait ? '<span class="arr-sum-i">还早 <b>' + wait + '</b></span>' : '') +
          (ok ? '<span class="arr-sum-i ok">已通知 <b>' + ok + '</b></span>' : '') +
        '</div>' +
        '<div class="table-wrap"><table class="tbl arr-tbl" style="min-width:640px">' +
          '<thead><tr><th style="width:140px">物料 / 供应商</th><th>备注</th>' +
            '<th style="width:52px">数量</th><th style="width:168px">登记的到货时间</th>' +
            '<th style="width:92px">通知</th><th style="width:28px"></th></tr></thead>' +
          '<tbody>' + list.map(function (a) {
            var done = S.arrNotified(a);
            var d = arrDays(a);
            var w = arrWatch(a);

            /* 日期后面的倒计时：11-10 到货 → 「还有 4 天」；过了就是红的 */
            var tag = '';
            if (!done && d != null) {
              if (d < 0) tag = '<span class="arr-tag late">过 ' + (-d) + ' 天</span>';
              else if (d === 0) tag = '<span class="arr-tag soon">今天到</span>';
              else if (w === 'soon') tag = '<span class="arr-tag soon">还有 ' + d + ' 天</span>';
              else tag = '<span class="arr-tag">' + d + ' 天后</span>';
            }

            /* 第一列：定好就不能改、也没有下拉（2026-10-24 用户要求）。
               只有还没填物料名的新行才让打字，填好失焦后就锁上。 */
            var itemLocked = !!a.item;

            return '<tr data-arr="' + U.esc(a.id) + '" class="' +
                (done ? 'is-done' : w === 'late' ? 'is-late' : w === 'soon' ? 'is-soon' : '') + '">' +
              '<td><input class="arr-in arr-item' + (itemLocked ? '' : ' is-new') + '" type="text" autocomplete="off" ' +
                'data-arr-field="item" value="' + U.esc(a.item) + '" placeholder="填物料名"' +
                (itemLocked ? ' readonly' : '') + ' title="' +
                (itemLocked ? '物料名定好就不改了；要新的点下面的「+ 添加物料」' : '填上物料或供应商名字，失焦后锁定') + '" /></td>' +
              '<td><input class="arr-in" type="text" autocomplete="off" maxlength="200" ' +
                'data-arr-field="remark" value="' + U.esc(S.arrRemarkOf(a.id)) + '" ' +
                'placeholder="比如：等门店确认收货人" title="这一行的备注，比如「先发招牌，货架后发」" /></td>' +
              '<td><input class="arr-in mono" type="number" min="0" step="1" data-arr-field="qty" value="' + (a.qty ? a.qty : '') + '" placeholder="—" title="数量可以不填" /></td>' +
              '<td><div class="arr-eta">' +
                '<input class="arr-in mono" type="text" inputmode="numeric" autocomplete="off" ' +
                  'data-arr-field="etaDate" value="' + U.esc(etaDisplay(a.etaDate)) + '" placeholder="如 10/25" ' +
                  'title="到货日直接打字就行：10/25、10-25、10月25、1025、2026/10/25 都认；不带年份按今年算。改日期 = 对方给了新承诺" />' +
                tag +
              '</div></td>' +
              '<td><button type="button" class="arr-btn' + (done ? ' done' : '') + '" data-arr-done title="' +
                (done ? '点一下改回「待通知」' : '打电话 / 发微信让对方发货后点一下，这条就不用再催了') + '">' +
                (done ? '✓ 已通知' : '通知供应商') + '</button></td>' +
              '<td><button type="button" class="arr-del" data-arr-del title="删除这条">' + UI.icon('close') + '</button></td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>';

    var bulkLabel = list.length ? '补齐剩余 ' + missing.length + ' 项' : '一键添加全部 ' + preset.length + ' 项';

    return empty +
      '<div class="arr-actions">' +
        (preset.length && missing.length
          ? '<button type="button" class="arr-bulk" data-arr-bulk>' + UI.icon('plus') + bulkLabel + '</button>'
          : '') +
        '<button type="button" class="arr-add" data-arr-add>' + UI.icon('plus') + '添加物料</button>' +
      '</div>';
  }

  /* ---------------- 详情 ---------------- */
  function openDetail(id) {
    var store = S.storeById(id);
    if (!store) return;

    var owner = S.memberById(store.ownerId);
    var tasks = S.getState().tasks.filter(function (t) { return t.storeId === id; });
    var arrivals = S.getState().arrivals.filter(function (a) { return a.storeId === id; });

    /* 筹建任务：不用表格了，改成「一叠卡片」——
       每条任务一张卡，卡片互相错位叠着，鼠标移上去那张会抬起来露出下面的，
       进场时从右侧一张张滑进来。任务少的时候比表格好看，一眼能扫到状态。 */
    function stageColorOf(key) {
      var c = '#98a2b8';
      (C.STAGES || []).forEach(function (x) { if (x.key === key) c = x.color; });
      return c;
    }

    var taskCards = tasks.map(function (t, i) {
      var cls = S.classify(t);
      var m = S.memberById(t.assigneeId);
      var due = S.suggestDateOf(t);
      var ini = (m && m.name) ? m.name.charAt(0) : '?';
      /* 负责人头像：成员配了小动物就画小动物（和首页 / 任务页一致），否则还是姓氏首字 */
      var art = (m && m.animal && UI.ANIMALS[m.animal]) ? m.animal : '';
      var whoAva = art
        ? '<i class="tcard-ava is-art" style="background:' + UI.ANIMALS[art].bg + '">' + UI.animalSvg(art) + '</i>'
        : '<i class="tcard-ava">' + U.esc(ini) + '</i>';
      return '<div class="tcard" style="animation-delay:' + (i * 55) + 'ms">' +
        '<i class="tcard-rail" style="background:' + stageColorOf(t.stage) + '"></i>' +
        '<div class="tcard-main">' +
          '<div class="tcard-title">' + U.esc(t.title) + '</div>' +
          '<div class="tcard-sub">' +
            UI.stageBadge(t.stage) +
            '<span class="tcard-who">' + whoAva +
              U.esc(m ? m.name : '未指派') + '</span>' +
            '<span class="tcard-due">' + (due
              ? U.monthDay(due) + ' 前完成'
              : '开业前 ' + S.taskBeforeOf(t) + ' 天') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="tcard-right">' + UI.statusBadge(cls) + '</div>' +
      '</div>';
    }).join('');

    var stageObj = null;
    C.STAGES.forEach(function (x) { if (x.key === store.stage) stageObj = x; });
    var days = U.diffDays(U.today(), store.openDate);
    var pr = S.storeProgress(store);

    var body =
      '<div class="desc-list">' +
        '<div class="d-item"><div class="d-label">当前阶段</div><div class="d-val">' + UI.stageBadge(store.stage, S.storeSub(store)) + '</div></div>' +
        '<div class="d-item"><div class="d-label">风险等级</div><div class="d-val">' + UI.riskBadge(store.risk) + '</div></div>' +
        '<div class="d-item"><div class="d-label">省份</div><div class="d-val">' + U.esc(store.province || '—') + '</div></div>' +
        '<div class="d-item"><div class="d-label">负责人</div><div class="d-val">' + U.esc(owner ? owner.name : '未指派') + '</div></div>' +
        '<div class="d-item"><div class="d-label">计划开业</div><div class="d-val mono">' + (store.openDate
          ? store.openDate + ' <span class="dim" style="font-weight:400">（' +
            (days >= 0 ? '还剩 ' + days + ' 天' : '已过 ' + (-days) + ' 天') + '）</span>'
          : '<span class="dim">未设置（任务只按「开业前 N 天」计，不算逾期）</span>') + '</div></div>' +
        '<div class="d-item"><div class="d-label">建档提交时间</div><div class="d-val mono">' + (store.buildDate
          ? store.buildDate
          : '<span class="dim">未记录</span>') + '</div></div>' +
        '<div class="d-item"><div class="d-label">任务进度</div><div class="d-val">' +
          UI.progress(S.progressValue(store), null, S.progressTip(store)) +
          '<span class="dim" style="font-weight:400;margin-left:8px">' +
            (pr.taskTotal ? '已完成 <b>' + pr.done + ' / ' + pr.taskTotal + '</b> 条' : '还没有任务') +
          '</span></div></div>' +
      '</div>' +
      (store.address || store.remark
        ? '<div class="section-title">补充信息</div><div style="font-size:12.5px;color:var(--text-2);line-height:1.8">' +
            (store.address ? '<div>地址：' + U.esc(store.address) + '</div>' : '') +
            (store.remark ? '<div>备注：' + U.esc(store.remark) + '</div>' : '') +
          '</div>'
        : '') +
      '<div class="section-title sec-fold-head" data-fold="tasks">' +
        '<span>筹建任务（' + tasks.length + '）</span><i class="sec-fold-arrow"></i>' +
      '</div>' +
      '<div class="sec-body" data-fold-body="tasks">' +
        (tasks.length ? '<div class="tstack">' + taskCards + '</div>' : UI.empty('还没有任务')) +
      '</div>' +
      '<div class="section-title sec-fold-head" id="sdArrTitle" data-fold="arr">' +
        '<span>物料到货（<span id="arrCount">' + arrivals.length + '</span>）</span><i class="sec-fold-arrow"></i>' +
      '</div>' +
      '<div class="sec-body" data-fold-body="arr">' +
        '<div id="arrWrap">' + arrBody(store.id) + '</div>' +
      '</div>';

    UI.modal({
      title: store.name,
      sub: stageObj ? stageObj.key : '',
      size: 'lg',
      body: body,
      footer:
        '<button class="btn foot-left" data-act="more">更多</button>' +
        '<button class="btn" data-act="close">关闭</button>' +
        (S.templates().length ? '<button class="btn" data-act="dispatch">按清单补派任务</button>' : '') +
        '<button class="btn btn-primary" data-act="edit">编辑门店</button>',
      onMount: function (rootEl, close) {
        /* ---- 折叠：筹建任务 / 物料到货 两个分组可收起，默认收起不把弹窗拉太长 ---- */
        function setFold(key, open) {
          var head = rootEl.querySelector('.sec-fold-head[data-fold="' + key + '"]');
          var bodyEl = rootEl.querySelector('.sec-body[data-fold-body="' + key + '"]');
          if (head) head.classList.toggle('is-open', !!open);
          if (bodyEl) bodyEl.classList.toggle('is-open', !!open);
        }
        rootEl.addEventListener('click', function (e) {
          var head = e.target.closest('.sec-fold-head');
          if (!head || !rootEl.contains(head)) return;
          var key = head.getAttribute('data-fold');
          var bodyEl = rootEl.querySelector('.sec-body[data-fold-body="' + key + '"]');
          if (!bodyEl) return;
          var willOpen = !bodyEl.classList.contains('is-open');
          setFold(key, willOpen);
        });

        /* ---- 物料到货：增 / 改 / 标记完成 / 删 ---- */
        var arrWrap = rootEl.querySelector('#arrWrap');
        function repaintArr() {
          arrWrap.innerHTML = arrBody(store.id);
          var c = rootEl.querySelector('#arrCount');
          if (c) c.textContent = arrList(store.id).length;
        }

        rootEl.addEventListener('click', function (e) {
          /* 一键添加：把清单里还没有的物料一次性加进来 */
          if (e.target.closest('[data-arr-bulk]')) {
            var todo = arrMissing(store.id);
            if (!todo.length) { UI.toast('清单里的物料都已经加过了', 'info'); return; }
            /* 日期留空：不给一个假日期，等门店给了具体到货日再填（没日期就不误报倒计时） */
            todo.forEach(function (x) {
              S.addArrival({ storeId: store.id, item: x, qty: 0, etaDate: '' });
            });
            repaintArr();
            UI.toast('已添加 ' + todo.length + ' 条物料，数量和到货日期按门店给的填', 'success');
            return;
          }

          if (e.target.closest('[data-arr-add]')) {
            var a = S.addArrival({
              storeId: store.id,
              item: '',
              qty: 0,
              etaDate: ''
            });
            repaintArr();
            /* 新增行直接聚焦第一列（还没填名字的那一格），填完失焦自动锁定 */
            var sel = arrWrap.querySelector('[data-arr="' + a.id + '"] [data-arr-field="item"]');
            if (sel) sel.focus();
          }
        });

        /* 空状态里的常用物料：点一下就加一条，光标直接落到日期上 */
        arrWrap.addEventListener('click', function (e) {
          var chip = e.target.closest('[data-arr-quick]');
          if (!chip) return;
          var a = S.addArrival({
            storeId: store.id,
            item: chip.getAttribute('data-arr-quick'),
            qty: 0,
            etaDate: ''
          });
          repaintArr();
          var dt = arrWrap.querySelector('[data-arr="' + a.id + '"] [data-arr-field="etaDate"]');
          if (dt) dt.focus();
        });

        /* 数量：输入即存（不重绘，避免光标跳走）。
           其余字段都在 change 里存：物料 / 日期 / 备注都是「定下来才落库」 */
        arrWrap.addEventListener('input', function (e) {
          var el = e.target;
          if (el.getAttribute('data-arr-field') !== 'qty') return;
          var tr = el.closest('tr[data-arr]');
          if (!tr) return;
          var aid = tr.getAttribute('data-arr');
          /* 数量允许留空：空 = 0（显示为「—」），不是 1 */
          var digits = String(el.value).replace(/[^\d]/g, '');
          S.updateArrival(aid, { qty: digits === '' ? 0 : Math.max(1, parseInt(digits, 10)) });
        });

        arrWrap.addEventListener('change', function (e) {
          var el = e.target;


          var field = el.getAttribute('data-arr-field');
          if (field !== 'item' && field !== 'etaDate' && field !== 'remark') return;
          var tr = el.closest('tr[data-arr]');
          if (!tr) return;
          var aid = tr.getAttribute('data-arr');
          var rec = null;
          S.getState().arrivals.forEach(function (x) { if (x.id === aid) rec = x; });
          if (!rec) return;

          /* 物料：填好了就锁定（第一列不允许再改，也没有下拉） */
          if (field === 'item') {
            var v = String(el.value || '').trim();
            S.updateArrival(aid, { item: v });
            if (v) {
              /* 就地锁上这一格，不整表重绘——否则 Tab 去备注栏的光标会被打掉 */
              el.readOnly = true;
              el.classList.remove('is-new');
              el.title = '物料名定好就不改了；要新的点下面的「+ 添加物料」';
            }
            return;
          }

          /* 备注：存 settings.arrRemarks（Store 内部 500ms 防抖后推云端） */
          if (field === 'remark') {
            S.setArrRemark(aid, el.value);
            return;
          }

          /* 到货日期：解析「10/25」这类写法，认出来才落库 */
          var raw = String(el.value || '').trim();
          if (!raw) {
            /* 清空 = 不登记时间 */
            if (rec.etaDate) S.updateArrival(aid, { etaDate: '' });
            el.value = '';
            return;
          }

          var iso = U.parseDateLoose(raw);
          if (!iso) {
            el.value = etaDisplay(rec.etaDate);
            UI.toast('「' + raw + '」没认出来，试试 10/25 或 2026/10/25', 'error');
            return;
          }
          S.updateArrival(aid, { etaDate: iso });
          el.value = etaDisplay(iso);
        });

        /* 回车 = 确认这条日期（text 输入框按回车不会自动失焦） */
        arrWrap.addEventListener('keydown', function (e) {
          var el = e.target;
          if (el.getAttribute && el.getAttribute('data-arr-field') === 'etaDate' && e.key === 'Enter') {
            e.preventDefault();
            el.blur();
          }
        });

        arrWrap.addEventListener('click', function (e) {
          var tr = e.target.closest('tr[data-arr]');
          if (!tr) return;
          var aid = tr.getAttribute('data-arr');
          var rec = null;
          S.getState().arrivals.forEach(function (x) { if (x.id === aid) rec = x; });
          if (!rec) return;

          if (e.target.closest('[data-arr-done]')) {
            var was = S.arrNotified(rec);
            S.updateArrival(aid, { status: was ? 'pending' : 'notified' });
            repaintArr();
            UI.toast(was
              ? '已改回待通知，继续按登记的到货时间提醒你'
              : '已记下：' + (rec.item || '该物料') + ' 已通知供应商', 'success');
            return;
          }

          if (e.target.closest('[data-arr-del]')) {
            S.removeArrival(aid);
            repaintArr();
            UI.toast('已删除「' + (rec.item || '未命名物料') + '」', 'info');
          }
        });

        /* 关弹窗前把还没推的备注立刻推上去，别让最后几个字悬着 */
        rootEl.querySelector('[data-act="close"]').onclick = function () {
          S.flushArrRemarks();
          close();
        };
        rootEl.querySelector('[data-act="edit"]').onclick = function () {
          close();
          openForm(store);
        };
        var dp = rootEl.querySelector('[data-act="dispatch"]');
        if (dp) dp.onclick = function () {
          var n = S.dispatchTemplates(store.id);
          if (n) {
            UI.toast('已补派 ' + n + ' 条任务', 'success');
            close();
            openDetail(store.id);
          } else {
            UI.toast('没有可补派的任务（清单为空，或清单里的任务都已存在）', 'info');
          }
        };

        /* 更多：再叠一层更大的弹窗，下面这层详情不关 */
        rootEl.querySelector('[data-act="more"]').onclick = function () {
          openMore(store.id);
        };
      }
    });
  }

  /* ---------------- 更多：叠一层的「全档案」弹窗（z161） ----------------
     详情弹窗底部左边的「更多」→ 再叠一层更大的弹窗（UI.modal 的 stack），
     下面那层详情不关，关掉这层就回到详情。放详情里塞不下的东西：
       1) 完整档案（阶段 / 风险 / 开业 / 建档时间 / 地址 / 备注）
       2) 几线价格：版本 × 线级 的矩阵，行列名在设置里改
       3) 门店档案字段：字段清单由「系统设置 → 门店档案字段」决定，这里按类型渲染
       4) 任务 / 物料的汇总口径
     所有值都落 settings，跟着云端同步，不改表结构。
     ------------------------------------------------------------------ */
  function moneyOf(v) {
    var n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function fmtMoney(n) {
    var fixed = Math.round(n * 100) / 100;
    try {
      return fixed.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    } catch (e) {
      return String(fixed);
    }
  }

  /* 几线价格右边那块金额：没选档位 / 价目表里没填，分别提示 */
  function amountHtml(sel) {
    if (!sel || !sel.rowId) return '<span class="pp-none">未选择档位</span>';
    if (!String(sel.price || '')) return '<span class="pp-none">这一档还没填金额</span>';
    return '<span class="pp-cur">¥</span><b>' + fmtMoney(moneyOf(sel.price)) + '</b>';
  }

  /* 一个字段的输入控件。全部带 data-fid，改完由 openMore 里的事件统一收口 */
  function fieldInput(f, v) {
    var id = U.esc(f.id);
    var val = (v == null) ? '' : String(v);

    if (f.type === 'select') {
      var opts = (f.options || []).map(function (o) {
        return '<option value="' + U.esc(o) + '"' + (o === val ? ' selected' : '') + '>' +
          U.esc(o) + '</option>';
      }).join('');
      return '<select class="input" data-fid="' + id + '" data-ftype="select">' +
        '<option value=""' + (val ? '' : ' selected') + '>未选择</option>' + opts + '</select>';
    }
    if (f.type === 'date') {
      return '<input class="input" type="date" data-fid="' + id + '" data-ftype="date" ' +
        'value="' + U.esc(val) + '" />';
    }
    if (f.type === 'textarea') {
      return '<textarea class="input" rows="2" data-fid="' + id + '" data-ftype="textarea" ' +
        'placeholder="未填写">' + U.esc(val) + '</textarea>';
    }
    if (f.type === 'money') {
      return '<input class="input mono" type="text" inputmode="decimal" data-fid="' + id + '" ' +
        'data-ftype="money" value="' + U.esc(val) + '" placeholder="未填写" />';
    }
    return '<input class="input" type="text" data-fid="' + id + '" data-ftype="' + U.esc(f.type) + '" ' +
      'value="' + U.esc(val) + '" placeholder="未填写" />';
  }

  function openMore(id) {
    var store = S.storeById(id);
    if (!store) return;

    var owner = S.memberById(store.ownerId);
    var tasks = S.getState().tasks.filter(function (t) { return t.storeId === id; });
    var arrivals = S.getState().arrivals.filter(function (a) { return a.storeId === id; });
    /* 几线价格：门店只选档位，金额从设置里的价目表带出 */
    var priceSel = S.storePrice(store);
    var tierNames = S.priceTierNames();
    var fields = S.storeFields().filter(function (f) { return f.show !== false; });
    var vals = S.storeFieldVals(store);

    var stageObj = null;
    C.STAGES.forEach(function (x) { if (x.key === store.stage) stageObj = x; });

    var days = U.diffDays(U.today(), store.openDate);
    var pr = S.storeProgress(store);

    var cnt = { done: 0, doing: 0, pending: 0, overdue: 0, risk: 0 };
    tasks.forEach(function (t) {
      var c = S.classify(t);
      if (c === 'done' || c === 'doing' || c === 'overdue' || c === 'risk') cnt[c]++;
      else cnt.pending++;
    });
    var arrDone = arrivals.filter(function (a) { return S.arrNotified(a); }).length;

    /* ---- 几线价格：一个下拉选档位，右边只读显示这一档的金额 ---- */
    var priceOpts = priceSel.rows.map(function (r) {
      return '<option value="' + U.esc(r.id) + '"' +
        (r.id === priceSel.rowId ? ' selected' : '') + '>' + U.esc(r.name) + '</option>';
    }).join('');

    var priceBox =
      '<div class="price-pick">' +
        '<label class="pp-label" for="ppSel">档位</label>' +
        '<select class="input pp-sel" id="ppSel" data-act="pickPrice">' +
          '<option value=""' + (priceSel.rowId ? '' : ' selected') + '>未选择</option>' +
          priceOpts +
        '</select>' +
        '<div class="pp-amount" id="ppAmount">' + amountHtml(priceSel) + '</div>' +
      '</div>' +
      '<p class="pm-hint">价格在「系统设置 → 门店档案字段 → 几线价格价目表」里维护，改一次全部门店共用；这里只选档位。</p>';

    /* ---- 自定义档案字段 ---- */
    var fieldHtml = fields.map(function (f) {
      var cur = vals[f.id];

      if (f.type === 'tier3') {
        var obj = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur : {};
        var cells = tierNames.map(function (t) {
          return '<label class="mf-tier"><span>' + U.esc(t) + '</span>' +
            '<input class="input mono" type="text" inputmode="decimal" ' +
              'data-fid="' + U.esc(f.id) + '" data-ftype="tier3" data-tier="' + U.esc(t) + '" ' +
              'value="' + U.esc(obj[t] == null ? '' : obj[t]) + '" placeholder="—" /></label>';
        }).join('');
        return '<div class="mf-item is-wide"><div class="mf-label">' + U.esc(f.name) + '</div>' +
          '<div class="mf-tier-row">' + cells + '</div></div>';
      }

      var v = (cur == null || typeof cur === 'object') ? '' : String(cur);
      return '<div class="mf-item"><div class="mf-label">' + U.esc(f.name) + '</div>' +
        fieldInput(f, v) + '</div>';
    }).join('');

    if (!fields.length) {
      fieldHtml = '<p class="mf-empty">还没有配置字段。去「系统设置 → 门店档案字段」加几个，比如加盟商姓名、电话、区域经理。</p>';
    }

    function chip(n, label) {
      return '<span class="stat-chip"><b>' + n + '</b>' + label + '</span>';
    }

    var body =
      '<div class="section-title">门店档案</div>' +
      '<div class="desc-list is-3">' +
        '<div class="d-item"><div class="d-label">当前阶段</div><div class="d-val">' +
          UI.stageBadge(store.stage, S.storeSub(store)) + '</div></div>' +
        '<div class="d-item"><div class="d-label">风险等级</div><div class="d-val">' +
          UI.riskBadge(store.risk) + '</div></div>' +
        '<div class="d-item"><div class="d-label">省份</div><div class="d-val">' +
          U.esc(store.province || '—') + '</div></div>' +
        '<div class="d-item"><div class="d-label">负责人</div><div class="d-val">' +
          (owner ? U.esc(owner.name) : '<span class="dim">未指派</span>') + '</div></div>' +
        '<div class="d-item"><div class="d-label">计划开业</div><div class="d-val mono">' +
          (store.openDate
            ? store.openDate + ' <span class="dim" style="font-weight:400">（' +
              (days >= 0 ? '还剩 ' + days + ' 天' : '已过 ' + (-days) + ' 天') + '）</span>'
            : '<span class="dim">未设置</span>') + '</div></div>' +
        '<div class="d-item"><div class="d-label">建档提交时间</div><div class="d-val mono">' +
          (store.buildDate || '<span class="dim">未记录</span>') + '</div></div>' +
        '<div class="d-item"><div class="d-label">任务进度</div><div class="d-val">' +
          (pr.taskTotal
            ? '<b>' + pr.done + '</b> / ' + pr.taskTotal + ' 条（' + S.progressValue(store) + '%）'
            : '<span class="dim">还没有任务</span>') +
          '</div></div>' +
        '<div class="d-item"><div class="d-label">地址</div><div class="d-val">' +
          U.esc(store.address || '—') + '</div></div>' +
        '<div class="d-item"><div class="d-label">备注</div><div class="d-val">' +
          U.esc(store.remark || '—') + '</div></div>' +
      '</div>' +

      '<div class="section-title">几线价格</div>' +
      priceBox +

      '<div class="section-title">门店资料</div>' +
      '<div class="mf-grid">' + fieldHtml + '</div>' +

      '<div class="section-title">筹建任务</div>' +
      '<div class="stat-row">' +
        chip(tasks.length, '条总计') +
        chip(cnt.done, '已完成') +
        chip(cnt.doing, '进行中') +
        chip(cnt.pending, '待开始') +
        chip(cnt.overdue, '已逾期') +
        chip(cnt.risk, '有风险') +
      '</div>' +

      '<div class="section-title">物料到货</div>' +
      '<div class="stat-row">' +
        chip(arrivals.length, '项总计') +
        chip(arrDone, '已到 / 已通知') +
        chip(arrivals.length - arrDone, '还没到') +
      '</div>';

    UI.modal({
      title: store.name,
      sub: (stageObj ? stageObj.key + ' · ' : '') + '全档案',
      size: 'xl',
      stack: true,
      body: body,
      footer:
        '<button class="btn foot-left" data-act="back">返回详情</button>' +
        '<button class="btn btn-primary" data-act="edit">编辑门店</button>',
      onMount: function (rootEl, close) {
        /* ---- 几线价格：选中即存，右边金额立刻跟着换 ---- */
        var pick = rootEl.querySelector('[data-act="pickPrice"]');
        if (pick) {
          pick.addEventListener('change', function () {
            var got = S.setStorePrice(store.id, pick.value);
            var amt = rootEl.querySelector('#ppAmount');
            if (amt) amt.innerHTML = amountHtml(got);
          });
        }

        /* ---- 自定义字段：改完即存 ---- */
        rootEl.addEventListener('change', function (e) {
          var el = e.target;
          var fid = el.getAttribute && el.getAttribute('data-fid');
          if (!fid) return;

          var ft = el.getAttribute('data-ftype');
          if (ft === 'tier3') {
            /* 三档金额：把同组三格收集成一个对象 */
            var box = {};
            Array.prototype.forEach.call(
              rootEl.querySelectorAll('[data-fid="' + fid + '"][data-ftype="tier3"]'),
              function (x) {
                var t = x.getAttribute('data-tier');
                var v = String(x.value || '').replace(/[^\d.]/g, '');
                if (v) box[t] = v;
              }
            );
            S.setStoreFieldVal(store.id, fid, box);
            return;
          }

          var val = String(el.value == null ? '' : el.value).trim();
          S.setStoreFieldVal(store.id, fid, val);
        });

        rootEl.querySelector('[data-act="back"]').onclick = function () {
          close();     /* 只关这一层，下面的详情还在 */
        };
        rootEl.querySelector('[data-act="edit"]').onclick = function () {
          close();
          openForm(store);
        };
      }
    });
  }

  /* ---------------- 页面 ---------------- */
  function render() {
    var s = S.getState();
    var st = S.stats();

    var provinceOptions = C.PROVINCES.filter(function (p) {
      return s.stores.some(function (x) { return x.province === p; });
    });

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>门店管理</h1>' +
        '<p>共 ' + st.totalStores + ' 家门店，' + st.riskStores + ' 家需要重点关注</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn" data-act="refresh">' + UI.icon('refresh') + '刷新</button>' +
        '<button class="btn btn-primary" data-act="add">' + UI.icon('plus') + '新增门店</button>' +
      '</div>' +
    '</div>' +

    '<div class="card fade-up" style="animation-delay:.05s">' +
      '<div class="filter-bar">' +
        '<label class="mini-search">' + UI.icon('search') +
          '<input id="stSearch" placeholder="搜索门店 / 负责人" value="' + U.esc(state.q) + '" />' +
        '</label>' +
        UI.comboHtml({
          id: 'stProvince',
          value: state.province,
          items: provinceOptions,
          py: C.PROVINCE_PINYIN,
          allLabel: '全部省份',
          size: 'sm',
          placeholder: '全部省份'
        }) +
        '<select class="select" id="stStage">' +
          '<option value="">全部阶段</option>' + UI.options(C.STAGES.map(function (x) { return x.key; }), state.stage) +
        '</select>' +
        '<select class="select" id="stRisk">' +
          '<option value="">全部风险</option>' +
          '<option value="normal"' + (state.risk === 'normal' ? ' selected' : '') + '>正常</option>' +
          '<option value="attention"' + (state.risk === 'attention' ? ' selected' : '') + '>关注</option>' +
          '<option value="high"' + (state.risk === 'high' ? ' selected' : '') + '>高危</option>' +
          '<option value="overdue"' + (state.risk === 'overdue' ? ' selected' : '') + '>逾期</option>' +
        '</select>' +
        '<select class="select" id="stOwner">' +
          '<option value="">全部负责人</option>' + UI.options(s.members, state.owner, 'id', 'name') +
        '</select>' +
        '<span class="spacer"></span>' +
        '<span class="dim" style="font-size:11.5px" id="stCount"></span>' +
      '</div>' +
      '<div id="storeListWrap">' + listHtml() + '</div>' +
    '</div>';
  }

  function updateList(root) {
    var wrap = root.querySelector('#storeListWrap');
    if (wrap) wrap.innerHTML = listHtml();
    var cnt = root.querySelector('#stCount');
    if (cnt) cnt.textContent = '筛选结果 ' + filtered().length + ' 家';
  }

  var debouncedSearch = U.debounce(function (root, val) {
    state.q = val;
    state.page = 1;
    updateList(root);
  }, 240);

  function mount(root) {
    UI.initCombos(root);
    var cnt = root.querySelector('#stCount');
    if (cnt) cnt.textContent = '筛选结果 ' + filtered().length + ' 家';

    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act], [data-page]');
      if (!el || !root.contains(el)) return;

      if (el.hasAttribute('data-page')) {
        state.page = Number(el.getAttribute('data-page'));
        updateList(root);
        return;
      }

      var act = el.getAttribute('data-act');
      var id = el.getAttribute('data-id');

      if (act === 'add') openForm(null);
      else if (act === 'edit') openForm(S.storeById(id));
      else if (act === 'view') openDetail(id);
      else if (act === 'refresh') {
        state.page = 1;
        updateList(root);
        UI.toast('列表已刷新', 'info');
      } else if (act === 'del') {
        var store = S.storeById(id);
        if (!store) return;
        UI.confirm({
          title: '删除门店',
          text: '确定要删除 <b>' + U.esc(store.name) + '</b> 吗？',
          warn: '该门店下的任务和到货记录会一起删除，且无法恢复。',
          danger: true,
          okText: '删除',
          onOk: function () {
            S.removeStore(id);
            UI.toast('门店已删除', 'success');
            App.refresh({ keep: true });
          }
        });
      }
    });

    root.addEventListener('input', function (e) {
      if (e.target.id === 'stSearch') {
        debouncedSearch(root, e.target.value.trim());
      }
    });

    ['stProvince', 'stStage', 'stRisk', 'stOwner'].forEach(function (id) {
      var el = root.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('change', function () {
        state.province = root.querySelector('#stProvince').value;
        state.stage = root.querySelector('#stStage').value;
        state.risk = root.querySelector('#stRisk').value;
        state.owner = root.querySelector('#stOwner').value;
        state.page = 1;
        updateList(root);
      });
    });
  }

  function onEnter(params) {
    if (params && params.stage) {
      state.stage = params.stage;
      state.page = 1;
    }
    if (params && params.member) {
      state.owner = params.member;
      state.page = 1;
    }
    if (params && params.q) {
      state.q = params.q;
      state.page = 1;
    }
  }

  return {
    title: '门店管理',
    render: render,
    mount: mount,
    onEnter: onEnter,
    openDetail: openDetail,
    openForm: openForm
  };
})();
