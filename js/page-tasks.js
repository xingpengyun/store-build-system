/* ==========================================================
   page-tasks.js — 任务管理
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.tasks = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  var state = { tab: 'all', q: '', owner: '', store: '', page: 1, per: 12 };

  var TABS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待处理' },
    { key: 'doing', label: '进行中' },
    { key: 'overdue', label: '已逾期' },
    { key: 'risk', label: '风险' },
    { key: 'done', label: '已完成' }
  ];

  function tabCount(key) {
    var tasks = S.getState().tasks;
    if (key === 'all') return tasks.length;
    return tasks.filter(function (t) { return S.classify(t) === key; }).length;
  }

  function filtered() {
    var q = state.q.toLowerCase();
    var rows = S.getState().tasks.filter(function (t) {
      var cls = S.classify(t);
      if (state.tab !== 'all' && cls !== state.tab) return false;
      if (state.owner && t.assigneeId !== state.owner) return false;
      if (state.store && t.storeId !== state.store) return false;
      if (q) {
        var store = S.storeById(t.storeId);
        var m = S.memberById(t.assigneeId);
        var hay = (t.title + ' ' + (store ? store.name : '') + ' ' + (m ? m.name : '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    rows.sort(function (a, b) {
      var ca = S.classify(a), cb = S.classify(b);
      var da = ca === 'done' ? 1 : 0;
      var db = cb === 'done' ? 1 : 0;
      if (da !== db) return da - db;
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });
    return rows;
  }

  function actionHtml(t) {
    if (t.status === 'done') {
      return '<span class="tlink" data-act="reopen" data-id="' + t.id + '">重开</span>';
    }
    if (t.status === 'pending') {
      return '<span class="tlink" data-act="start" data-id="' + t.id + '">开始</span>';
    }
    return '<span class="tlink" data-act="finish" data-id="' + t.id + '">完成</span>';
  }

  function listHtml() {
    var all = filtered();
    var totalPages = Math.max(1, Math.ceil(all.length / state.per));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.per;
    var rows = all.slice(start, start + state.per);

    if (!rows.length) {
      return UI.empty('这个条件下没有任务', '换个筛选条件，或者新建一条任务');
    }

    var body = rows.map(function (t) {
      var store = S.storeById(t.storeId);
      var m = S.memberById(t.assigneeId);
      var cls = S.classify(t);
      var late = cls === 'overdue';
      var days = U.diffDays(U.today(), t.dueDate);

      return '<tr>' +
        '<td>' +
          '<div class="store-name" style="cursor:default">' + U.esc(t.title) + '</div>' +
          (t.priority === 'high'
            ? '<div style="font-size:10.5px;color:var(--red);margin-top:2px">高优先级</div>'
            : '') +
        '</td>' +
        '<td class="muted">' + U.esc(store ? store.name : '—') + '</td>' +
        '<td>' + UI.stageBadge(t.stage) + '</td>' +
        '<td>' + (m
          ? '<div class="store-cell">' + UI.avatar(m.name, m.color, 'sm') + '<span>' + U.esc(m.name) + '</span></div>'
          : '<span class="dim">未指派</span>') + '</td>' +
        '<td class="mono ' + (late ? 'text-red' : 'muted') + ' nowrap">' + t.dueDate +
          '<span class="dim" style="font-size:10.5px;margin-left:5px">' +
          (cls === 'done' ? '' : late ? '逾期' + Math.abs(days) + '天' : days === 0 ? '今天' : days + '天后') +
          '</span></td>' +
        '<td>' + UI.statusBadge(cls) + '</td>' +
        '<td class="nowrap">' + actionHtml(t) +
          '<span class="tlink" data-act="edit" data-id="' + t.id + '">编辑</span>' +
          '<span class="tlink danger" data-act="del" data-id="' + t.id + '">删除</span>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<div class="table-wrap"><table class="tbl">' +
      '<thead><tr>' +
        '<th>任务</th><th>所属门店</th><th>阶段</th><th>负责人</th>' +
        '<th>截止日期</th><th>状态</th><th>操作</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      UI.pager(state.page, totalPages, all.length);
  }

  function formHtml(task) {
    var isNew = !task;
    var t = task || {};
    var stores = S.getState().stores;

    return '<form autocomplete="off">' +
      '<div class="field"><label>任务名称 <span class="req">*</span></label>' +
        '<input class="input" name="title" value="' + U.esc(t.title || '') + '" placeholder="例如：门店招牌安装验收" />' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>所属门店 <span class="req">*</span></label>' +
          '<select class="select" name="storeId">' + UI.options(stores, t.storeId || '', 'id', 'name') + '</select>' +
        '</div>' +
        '<div class="field"><label>所属阶段</label>' +
          '<select class="select" name="stage">' + UI.options(C.STAGES.map(function (x) { return x.key; }), t.stage || '未出图') + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>负责人</label>' +
          '<select class="select" name="assigneeId">' + UI.options(S.getState().members, t.assigneeId || '', 'id', 'name') + '</select>' +
        '</div>' +
        '<div class="field"><label>截止日期 <span class="req">*</span></label>' +
          '<input class="input" type="date" name="dueDate" value="' + (t.dueDate || U.addDays(U.today(), 7)) + '" />' +
        '</div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>状态</label>' +
          '<select class="select" name="status">' +
            '<option value="pending"' + (t.status === 'pending' ? ' selected' : '') + '>待处理</option>' +
            '<option value="doing"' + (t.status === 'doing' ? ' selected' : '') + '>进行中</option>' +
            '<option value="done"' + (t.status === 'done' ? ' selected' : '') + '>已完成</option>' +
          '</select>' +
        '</div>' +
        '<div class="field"><label>优先级</label>' +
          '<select class="select" name="priority">' +
            '<option value="normal"' + (t.priority !== 'high' ? ' selected' : '') + '>普通</option>' +
            '<option value="high"' + (t.priority === 'high' ? ' selected' : '') + '>高</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>备注</label>' +
        '<textarea class="textarea" name="remark" placeholder="选填">' + U.esc(t.remark || '') + '</textarea>' +
      '</div>' +
    '</form>';
  }

  function openForm(task) {
    var isNew = !task;
    if (isNew && !S.getState().stores.length) {
      UI.toast('请先创建门店', 'error');
      return;
    }

    UI.modal({
      title: isNew ? '新增任务' : '编辑任务',
      sub: isNew ? '' : (task.title || ''),
      body: formHtml(task),
      footer:
        '<button class="btn" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" data-act="save">保存</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-act="cancel"]').onclick = close;
        rootEl.querySelector('[data-act="save"]').onclick = function () {
          var title = UI.formValue(rootEl, 'title');
          if (!title) {
            UI.toast('任务名称不能为空', 'error');
            return;
          }
          var payload = {
            title: title,
            storeId: UI.formValue(rootEl, 'storeId'),
            stage: UI.formValue(rootEl, 'stage'),
            assigneeId: UI.formValue(rootEl, 'assigneeId'),
            dueDate: UI.formValue(rootEl, 'dueDate'),
            status: UI.formValue(rootEl, 'status'),
            priority: UI.formValue(rootEl, 'priority'),
            remark: UI.formValue(rootEl, 'remark')
          };
          if (isNew) {
            S.addTask(payload);
            UI.toast('任务已创建', 'success');
          } else {
            S.updateTask(task.id, payload);
            UI.toast('任务已更新', 'success');
          }
          close();
          App.refresh();
        };
      }
    });
  }

  function render() {
    var tabs = TABS.map(function (tb) {
      return '<div class="tab' + (state.tab === tb.key ? ' active' : '') + '" data-tab="' + tb.key + '">' +
        tb.label + '<span class="cnt">' + tabCount(tb.key) + '</span></div>';
    }).join('');

    var st = S.stats();

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>任务管理</h1>' +
        '<p>共 ' + st.taskCounts.total + ' 条任务，其中 ' + st.taskCounts.overdue + ' 条已逾期</p>' +
      '</div>' +
      '<button class="btn btn-primary" data-act="add">' + UI.icon('plus') + '新增任务</button>' +
    '</div>' +

    '<div class="card fade-up" style="animation-delay:.05s">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
        '<div class="tabs" id="taskTabs">' + tabs + '</div>' +
        '<span class="spacer" style="margin-left:auto"></span>' +
        '<label class="mini-search">' + UI.icon('search') +
          '<input id="tkSearch" placeholder="搜索任务 / 门店 / 负责人" value="' + U.esc(state.q) + '" />' +
        '</label>' +
        '<select class="select" id="tkOwner" style="width:auto;height:31px;font-size:12px">' +
          '<option value="">全部负责人</option>' + UI.options(S.getState().members, state.owner, 'id', 'name') +
        '</select>' +
        '<select class="select" id="tkStore" style="width:auto;height:31px;font-size:12px;max-width:160px">' +
          '<option value="">全部门店</option>' + UI.options(S.getState().stores, state.store, 'id', 'name') +
        '</select>' +
      '</div>' +
      '<div id="taskListWrap">' + listHtml() + '</div>' +
    '</div>';
  }

  function updateList(root) {
    var wrap = root.querySelector('#taskListWrap');
    if (wrap) wrap.innerHTML = listHtml();
    root.querySelectorAll('#taskTabs .tab').forEach(function (el) {
      var key = el.getAttribute('data-tab');
      el.classList.toggle('active', key === state.tab);
      var cnt = el.querySelector('.cnt');
      if (cnt) cnt.textContent = tabCount(key);
    });
  }

  var debouncedSearch = U.debounce(function (root, val) {
    state.q = val;
    state.page = 1;
    updateList(root);
  }, 240);

  function mount(root) {
    root.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]');
      if (tab && root.contains(tab)) {
        state.tab = tab.getAttribute('data-tab');
        state.page = 1;
        updateList(root);
        return;
      }

      var el = e.target.closest('[data-act], [data-page]');
      if (!el || !root.contains(el)) return;

      if (el.hasAttribute('data-page')) {
        state.page = Number(el.getAttribute('data-page'));
        updateList(root);
        return;
      }

      var act = el.getAttribute('data-act');
      var id = el.getAttribute('data-id');
      var task = id ? S.taskById(id) : null;

      if (act === 'add') openForm(null);
      else if (act === 'edit' && task) openForm(task);
      else if (act === 'start' && task) {
        S.updateTask(task.id, { status: 'doing' });
        UI.toast('任务已开始', 'success');
        App.refresh();
      } else if (act === 'finish' && task) {
        S.updateTask(task.id, { status: 'done' });
        UI.toast('任务已完成', 'success');
        App.refresh();
      } else if (act === 'reopen' && task) {
        S.updateTask(task.id, { status: 'pending' });
        UI.toast('任务已重新打开', 'info');
        App.refresh();
      } else if (act === 'del' && task) {
        UI.confirm({
          title: '删除任务',
          text: '确定删除任务 <b>' + U.esc(task.title) + '</b> 吗？',
          danger: true,
          okText: '删除',
          onOk: function () {
            S.removeTask(task.id);
            UI.toast('任务已删除', 'success');
            App.refresh();
          }
        });
      }
    });

    root.addEventListener('input', function (e) {
      if (e.target.id === 'tkSearch') debouncedSearch(root, e.target.value.trim());
    });

    root.addEventListener('change', function (e) {
      if (e.target.id === 'tkOwner') {
        state.owner = e.target.value;
        state.page = 1;
        updateList(root);
      } else if (e.target.id === 'tkStore') {
        state.store = e.target.value;
        state.page = 1;
        updateList(root);
      }
    });
  }

  function onEnter(params) {
    if (params && params.task) {
      var t = S.taskById(params.task);
      if (t) {
        state.tab = 'all';
        state.page = 1;
        setTimeout(function () { openForm(t); }, 60);
      }
    }
    if (params && params.member) {
      state.owner = params.member;
    }
    if (params && params.store) {
      state.store = params.store;
    }
  }

  return { title: '任务管理', render: render, mount: mount, onEnter: onEnter };
})();
