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
        '<td class="muted mono">' + store.openDate + '</td>' +
        '<td>' + UI.progress(store.progress) + '</td>' +
        '<td>' + UI.stageBadge(store.stage) + '</td>' +
        '<td>' + UI.riskBadge(store.risk) + '</td>' +
        '<td>' + (owner
          ? '<div class="store-cell">' + UI.avatar(owner.name, owner.color, 'sm') + '<span>' + U.esc(owner.name) + '</span></div>'
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
        '<th>门店名称</th><th>省份</th><th>开业日期</th><th>整体进度</th>' +
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
      '<div class="field">' +
        '<label>门店名称 <span class="req">*</span></label>' +
        '<input class="input" name="name" value="' + U.esc(s.name || '') + '" placeholder="例如：广州天河店" />' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>省份</label>' +
          '<select class="select" name="province">' +
            '<option value="">未选择</option>' +
            UI.options(provinceOptions, s.province || '') +
          '</select>' +
        '</div>' +
        '<div class="field"><label>计划开业日期 <span class="req">*</span></label>' +
          '<input class="input" type="date" name="openDate" value="' + (s.openDate || U.addDays(U.today(), 30)) + '" />' +
        '</div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>当前阶段</label>' +
          '<select class="select" name="stage">' +
            UI.options(C.STAGES.map(function (x) { return x.key; }), s.stage || '未出图') +
          '</select>' +
        '</div>' +
        '<div class="field"><label>风险等级</label>' +
          '<select class="select" name="risk">' + riskOptions(s.risk || 'normal') + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>整体进度（%）</label>' +
          '<input class="input" type="number" min="0" max="100" name="progress" value="' + (s.progress == null ? 0 : s.progress) + '" />' +
        '</div>' +
        '<div class="field"><label>门店负责人</label>' +
          '<select class="select" name="ownerId">' +
            UI.options(S.getState().members, s.ownerId || '', 'id', 'name') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>门店地址</label>' +
        '<input class="input" name="address" value="' + U.esc(s.address || '') + '" placeholder="选填" />' +
      '</div>' +
      '<div class="field"><label>备注</label>' +
        '<textarea class="textarea" name="remark" placeholder="选填，比如选址情况、特殊要求">' + U.esc(s.remark || '') + '</textarea>' +
      '</div>' +
      (isNew
        ? '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text-2);margin-top:4px">' +
            '<input type="checkbox" name="autoTasks" /> 顺便自动派发 ' + C.TASK_TEMPLATES.length + ' 条标准筹建任务（不需要就留空，任务自己建）' +
          '</label>'
        : '') +
    '</form>';
  }

  /* 风险下拉需要正确的 value/label，单独生成 */
  function riskOptions(selected) {
    return Object.keys(C.RISKS).map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + C.RISKS[k].label + '</option>';
    }).join('');
  }

  function openForm(store) {
    var isNew = !store;

    UI.modal({
      title: isNew ? '新增门店' : '编辑门店',
      sub: isNew ? '保存后会自动派发标准任务' : (store.name || ''),
      body: formHtml(store),
      footer:
        '<button class="btn" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" data-act="save">保存</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-act="cancel"]').onclick = close;
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
            progress: Number(UI.formValue(rootEl, 'progress')) || 0,
            ownerId: UI.formValue(rootEl, 'ownerId'),
            openDate: UI.formValue(rootEl, 'openDate'),
            address: UI.formValue(rootEl, 'address'),
            remark: UI.formValue(rootEl, 'remark')
          };

          if (isNew) {
            var auto = rootEl.querySelector('[name="autoTasks"]');
            payload.autoTasks = auto ? auto.checked : true;
            S.addStore(payload);
            UI.toast('门店已创建', 'success');
          } else {
            S.updateStore(store.id, payload);
            UI.toast('门店信息已更新', 'success');
          }
          close();
          App.refresh();
        };
      }
    });
  }

  /* ---------------- 详情 ---------------- */
  function openDetail(id) {
    var store = S.storeById(id);
    if (!store) return;

    var owner = S.memberById(store.ownerId);
    var tasks = S.getState().tasks.filter(function (t) { return t.storeId === id; });
    var arrivals = S.getState().arrivals.filter(function (a) { return a.storeId === id; });

    var taskRows = tasks.map(function (t) {
      var cls = S.classify(t);
      var m = S.memberById(t.assigneeId);
      return '<tr>' +
        '<td>' + U.esc(t.title) + '</td>' +
        '<td>' + UI.stageBadge(t.stage) + '</td>' +
        '<td class="muted">' + U.esc(m ? m.name : '未指派') + '</td>' +
        '<td class="mono muted">' + U.monthDay(t.dueDate) + '</td>' +
        '<td>' + UI.statusBadge(cls) + '</td>' +
      '</tr>';
    }).join('');

    var arrivalRows = arrivals.slice(0, 6).map(function (a) {
      return '<tr>' +
        '<td>' + U.esc(a.item) + '</td>' +
        '<td class="mono muted">× ' + a.qty + '</td>' +
        '<td class="mono muted">' + U.monthDay(a.etaDate) + '</td>' +
        '<td>' + (a.status === 'arrived'
          ? '<span class="badge" style="color:var(--green);background:var(--green-soft)">已到货</span>'
          : '<span class="badge" style="color:var(--primary);background:var(--primary-soft)">待到货</span>') + '</td>' +
      '</tr>';
    }).join('');

    var stageObj = null;
    C.STAGES.forEach(function (x) { if (x.key === store.stage) stageObj = x; });
    var days = U.diffDays(U.today(), store.openDate);

    var body =
      '<div class="desc-list">' +
        '<div class="d-item"><div class="d-label">当前阶段</div><div class="d-val">' + UI.stageBadge(store.stage) + '</div></div>' +
        '<div class="d-item"><div class="d-label">风险等级</div><div class="d-val">' + UI.riskBadge(store.risk) + '</div></div>' +
        '<div class="d-item"><div class="d-label">省份</div><div class="d-val">' + U.esc(store.province || '—') + '</div></div>' +
        '<div class="d-item"><div class="d-label">负责人</div><div class="d-val">' + U.esc(owner ? owner.name : '未指派') + '</div></div>' +
        '<div class="d-item"><div class="d-label">计划开业</div><div class="d-val mono">' + store.openDate +
          ' <span class="dim" style="font-weight:400">（' + (days >= 0 ? '还剩 ' + days + ' 天' : '已过 ' + (-days) + ' 天') + '）</span></div></div>' +
        '<div class="d-item"><div class="d-label">整体进度</div><div class="d-val">' + UI.progress(store.progress) + '</div></div>' +
      '</div>' +
      (store.address || store.remark
        ? '<div class="section-title">补充信息</div><div style="font-size:12.5px;color:var(--text-2);line-height:1.8">' +
            (store.address ? '<div>地址：' + U.esc(store.address) + '</div>' : '') +
            (store.remark ? '<div>备注：' + U.esc(store.remark) + '</div>' : '') +
          '</div>'
        : '') +
      '<div class="section-title">筹建任务（' + tasks.length + '）</div>' +
      (tasks.length
        ? '<div class="table-wrap"><table class="tbl" style="min-width:520px">' +
            '<thead><tr><th>任务</th><th>阶段</th><th>负责人</th><th>截止</th><th>状态</th></tr></thead>' +
            '<tbody>' + taskRows + '</tbody></table></div>'
        : UI.empty('还没有任务')) +
      '<div class="section-title">物料到货（' + arrivals.length + '）</div>' +
      (arrivals.length
        ? '<div class="table-wrap"><table class="tbl" style="min-width:420px">' +
            '<thead><tr><th>物料</th><th>数量</th><th>到货日</th><th>状态</th></tr></thead>' +
            '<tbody>' + arrivalRows + '</tbody></table></div>'
        : UI.empty('暂无到货记录'));

    UI.modal({
      title: store.name,
      sub: stageObj ? stageObj.key : '',
      size: 'lg',
      body: body,
      footer:
        '<button class="btn" data-act="close">关闭</button>' +
        '<button class="btn btn-primary" data-act="edit">编辑门店</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-act="close"]').onclick = close;
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
        '<select class="select" id="stProvince">' +
          '<option value="">全部省份</option>' + UI.options(provinceOptions, state.province) +
        '</select>' +
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
            App.refresh();
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
