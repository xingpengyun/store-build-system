/* ==========================================================
   page-team.js — 团队工作台
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.team = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  var COLORS = ['#3f6bf5', '#7a5af8', '#f79009', '#17b26a', '#06aed4', '#f04438', '#ef7cab', '#0d9488'];
  var ROLES = ['门店统筹', '采购/供应商', '广告/物料', '培训/人员', '建店/系统', '财务/行政', '进度审核'];

  function memberStats() {
    var tasks = S.getState().tasks;
    return S.getState().members.map(function (m) {
      var mine = tasks.filter(function (t) { return t.assigneeId === m.id; });
      var done = 0, late = 0, doing = 0;
      mine.forEach(function (t) {
        var c = S.classify(t);
        if (c === 'done') done += 1;
        else if (c === 'overdue') late += 1;
        else if (c === 'doing') doing += 1;
      });
      var storeIds = {};
      mine.forEach(function (t) { storeIds[t.storeId] = 1; });
      return {
        member: m,
        total: mine.length,
        done: done,
        todo: mine.length - done,
        late: late,
        doing: doing,
        stores: Object.keys(storeIds).length,
        percent: mine.length ? Math.round(done / mine.length * 100) : 0
      };
    });
  }

  function openDetail(member) {
    var tasks = S.getState().tasks.filter(function (t) { return t.assigneeId === member.id; });
    tasks.sort(function (a, b) {
      var ca = S.classify(a), cb = S.classify(b);
      if ((ca === 'done') !== (cb === 'done')) return ca === 'done' ? 1 : -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    });

    var rows = tasks.map(function (t) {
      var store = S.storeById(t.storeId);
      return '<tr>' +
        '<td>' + U.esc(t.title) + '</td>' +
        '<td class="muted">' + U.esc(store ? store.name : '—') + '</td>' +
        '<td class="mono muted">' + U.monthDay(t.dueDate) + '</td>' +
        '<td>' + UI.statusBadge(S.classify(t)) + '</td>' +
      '</tr>';
    }).join('');

    UI.modal({
      title: member.name + ' 的任务',
      sub: member.role,
      size: 'lg',
      body: tasks.length
        ? '<div class="table-wrap"><table class="tbl" style="min-width:520px">' +
            '<thead><tr><th>任务</th><th>门店</th><th>截止</th><th>状态</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>'
        : UI.empty('还没有分配任务'),
      footer:
        '<button class="btn" data-act="close">关闭</button>' +
        '<button class="btn btn-primary" data-act="assign">给他派任务</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-act="close"]').onclick = close;
        rootEl.querySelector('[data-act="assign"]').onclick = function () {
          close();
          App.go('tasks');
        };
      }
    });
  }

  function openForm(member) {
    var isNew = !member;
    var m = member || {};
    var picked = m.color || COLORS[0];

    var colorDots = COLORS.map(function (c) {
      return '<label class="color-opt" style="display:inline-flex;margin-right:6px;cursor:pointer">' +
        '<input type="radio" name="color" value="' + c + '"' + (c === picked ? ' checked' : '') +
          ' style="display:none" />' +
        '<span class="color-dot" style="width:20px;height:20px;border-radius:50%;background:' + c +
          ';display:block;outline:' + (c === picked ? '2px solid #cfdcff' : 'none') + ';outline-offset:2px"></span>' +
      '</label>';
    }).join('');

    UI.modal({
      title: isNew ? '新增成员' : '编辑成员',
      body:
        '<form autocomplete="off">' +
          '<div class="field-row">' +
            '<div class="field"><label>姓名 <span class="req">*</span></label>' +
              '<input class="input" name="name" value="' + U.esc(m.name || '') + '" placeholder="例如：张三" /></div>' +
            '<div class="field"><label>负责模块</label>' +
              '<input class="input" name="role" list="roleList" value="' + U.esc(m.role || '') + '" placeholder="例如：采购/供应商" />' +
              '<datalist id="roleList">' + ROLES.map(function (r) { return '<option value="' + r + '"></option>'; }).join('') + '</datalist>' +
            '</div>' +
          '</div>' +
          '<div class="field"><label>头像颜色</label><div id="colorPicker">' + colorDots + '</div></div>' +
        '</form>',
      footer:
        '<button class="btn" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" data-act="save">保存</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelectorAll('.color-opt input').forEach(function (input) {
          input.addEventListener('change', function () {
            rootEl.querySelectorAll('.color-dot').forEach(function (dot) {
              dot.style.outline = 'none';
            });
            input.nextElementSibling.style.outline = '2px solid #cfdcff';
            input.nextElementSibling.style.outlineOffset = '2px';
          });
        });

        rootEl.querySelector('[data-act="cancel"]').onclick = close;
        rootEl.querySelector('[data-act="save"]').onclick = function () {
          var name = UI.formValue(rootEl, 'name');
          if (!name) {
            UI.toast('姓名不能为空', 'error');
            return;
          }
          var checked = rootEl.querySelector('input[name="color"]:checked');
          var payload = {
            name: name,
            role: UI.formValue(rootEl, 'role') || '门店统筹',
            color: checked ? checked.value : COLORS[0]
          };
          if (isNew) {
            S.addMember(payload);
            UI.toast('成员已添加', 'success');
          } else {
            S.updateMember(member.id, payload);
            UI.toast('成员信息已更新', 'success');
          }
          close();
          App.refresh();
        };
      }
    });
  }

  function render() {
    var rows = memberStats();
    var totalTodo = U.sum(rows, function (r) { return r.todo; });
    var totalLate = U.sum(rows, function (r) { return r.late; });
    var avg = rows.length ? Math.round(U.sum(rows, function (r) { return r.percent; }) / rows.length) : 0;

    var cards = rows.map(function (r) {
      var m = r.member;
      return '<div class="member-card" data-member="' + m.id + '">' +
        '<div class="mc-head">' +
          UI.avatar(m.name, m.color, 'lg') +
          '<div><div class="mc-name">' + U.esc(m.name) + '</div>' +
            '<div class="mc-role">' + U.esc(m.role) + '</div></div>' +
          '<div class="mc-tools">' +
            '<span class="tlink" data-act="edit" data-id="' + m.id + '">' + UI.icon('edit') + '</span>' +
            '<span class="tlink danger" data-act="del" data-id="' + m.id + '">' + UI.icon('trash') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="mc-stats">' +
          '<div><b>' + r.todo + '</b><span>待办</span></div>' +
          '<div><b style="' + (r.late > 0 ? 'color:var(--red)' : '') + '">' + r.late + '</b><span>逾期</span></div>' +
          '<div><b>' + r.stores + '</b><span>门店</span></div>' +
        '</div>' +
        '<div class="mini-progress" style="min-width:0">' +
          '<span class="mini-track"><i style="width:' + r.percent + '%;background:' +
            (r.percent >= 80 ? '#17b26a' : r.percent >= 60 ? '#3f6bf5' : '#f79009') + '"></i></span>' +
          '<span class="mini-num">' + r.percent + '%</span>' +
        '</div>' +
      '</div>';
    }).join('');

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>团队工作台</h1>' +
        '<p>' + rows.length + ' 位成员，共 ' + totalTodo + ' 项待办，' + totalLate + ' 项逾期</p>' +
      '</div>' +
      '<button class="btn btn-primary" data-act="add">' + UI.icon('plus') + '新增成员</button>' +
    '</div>' +

    '<section class="kpi-grid fade-up" style="grid-template-columns:repeat(4,minmax(0,1fr));animation-delay:.04s">' +
      '<div class="kpi"><span class="kpi-icon" style="background:#edf2fe;color:#3f6bf5">' + UI.icon('users') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">团队成员</div><div class="kpi-value">' + rows.length + '</div>' +
        '<div class="kpi-foot">在岗人数</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#fef4e6;color:#f79009">' + UI.icon('list') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">总待办</div><div class="kpi-value">' + totalTodo + '</div>' +
        '<div class="kpi-foot">未完成任务</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#feeceb;color:#f04438">' + UI.icon('alert') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">逾期任务</div><div class="kpi-value">' + totalLate + '</div>' +
        '<div class="kpi-foot">需要跟进</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#e6f8ef;color:#17b26a">' + UI.icon('target') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">平均完成率</div><div class="kpi-value">' + avg + '%</div>' +
        '<div class="kpi-foot">按任务数计算</div></div></div>' +
    '</section>' +

    '<div class="card fade-up" style="animation-delay:.08s">' +
      '<div class="card-head"><h3>成员概览</h3>' +
        '<span class="card-sub">点击卡片查看该成员全部任务</span></div>' +
      (rows.length ? '<div class="team-grid">' + cards + '</div>' : UI.empty('还没有团队成员')) +
    '</div>';
  }

  function mount(root) {
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act], [data-member]');
      if (!el || !root.contains(el)) return;

      var act = el.getAttribute('data-act');
      var id = el.getAttribute('data-id');

      if (act === 'add') { openForm(null); e.stopPropagation(); return; }
      if (act === 'edit') { openForm(S.memberById(id)); e.stopPropagation(); return; }
      if (act === 'del') {
        e.stopPropagation();
        var m = S.memberById(id);
        if (!m) return;
        var count = S.memberTaskCount(id);
        UI.confirm({
          title: '移除成员',
          text: '确定要移除 <b>' + U.esc(m.name) + '</b> 吗？',
          warn: count > 0 ? '该成员名下还有 ' + count + ' 条任务，移除后会变成「未指派」。' : '',
          danger: true,
          okText: '移除',
          onOk: function () {
            S.removeMember(id);
            UI.toast('成员已移除', 'success');
            App.refresh();
          }
        });
        return;
      }

      var mid = el.getAttribute('data-member');
      if (mid) {
        var mm = S.memberById(mid);
        if (mm) openDetail(mm);
      }
    });
  }

  function onEnter(params) {
    if (params && params.member) {
      var m = S.memberById(params.member);
      if (m) setTimeout(function () { openDetail(m); }, 60);
    }
  }

  return { title: '团队工作台', render: render, mount: mount, onEnter: onEnter };
})();
