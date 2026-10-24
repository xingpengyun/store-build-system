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
  var ROLES = ['售前', '售后', '接单'];

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
      var sa = S.suggestDateOf(a), sb = S.suggestDateOf(b);
      return sa < sb ? -1 : 1;
    });

    var rows = tasks.map(function (t) {
      var store = S.storeById(t.storeId);
      var due = S.suggestDateOf(t);
      return '<tr>' +
        '<td>' + U.esc(t.title) + '</td>' +
        '<td class="muted">' + U.esc(store ? store.name : '—') + '</td>' +
        '<td class="mono muted">' + (due
          ? U.monthDay(due)
          : '<span class="dim">开业前 ' + S.taskBeforeOf(t) + ' 天</span>') + '</td>' +
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
      /* 只留关闭：任务状态一目了然，大家都在跟，不需要「派任务」这个动作 */
      footer: '<button class="btn" data-act="close">关闭</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-act="close"]').onclick = close;
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
              '<input class="input" name="role" list="roleList" value="' + U.esc(m.role || '') + '" placeholder="例如：售前" />' +
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
            role: UI.formValue(rootEl, 'role') || '售前',
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

  /* ================= 留言板 =================
     存在云端配置里（settings.board），谁留言都能看到，换台电脑刷新也在。
     发言人从成员里选，选中的人记在本机，下次进来还是你。
     --------------------------------------------------------- */

  var BOARD_FOLD = 5;          /* 超过 5 条先折起来 */
  var WHO_KEY = 'sbs.boardWho';
  var GUEST_KEY = 'sbs.boardGuest';

  var bs = {
    who: '',                   /* 当前发言人 memberId */
    guest: '',                 /* 没有成员时手填的昵称 */
    draft: '',                 /* 草稿：自动同步重绘时不丢正在写的内容 */
    open: false                /* 展开全部留言 */
  };

  function lsGet(k) {
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  function boardWho() {
    var members = S.getState().members || [];
    if (!bs.who) bs.who = lsGet(WHO_KEY) || '';
    var m = null;
    for (var i = 0; i < members.length; i++) {
      if (members[i].id === bs.who) { m = members[i]; break; }
    }
    /* 本机记住的人被删了 / 没选过 → 落到第一个成员 */
    if (!m && members.length) { m = members[0]; bs.who = m.id; }
    return m;
  }

  function boardAuthor() {
    var m = boardWho();
    if (m) return { id: m.id, name: m.name, color: m.color || COLORS[0] };
    if (!bs.guest) bs.guest = lsGet(GUEST_KEY) || '';
    return { id: '', name: bs.guest.trim() || '匿名', color: COLORS[0] };
  }

  function boardComposerHtml() {
    var members = S.getState().members || [];
    var me = boardWho();
    var author = boardAuthor();

    var whoHtml;
    if (members.length) {
      whoHtml = UI.avatar(author.name, author.color, 'md').replace('class="avatar', 'data-board-ava class="avatar') +
        '<select class="select board-who-sel" data-board-who>' +
          members.map(function (m) {
            return '<option value="' + m.id + '"' + (me && m.id === me.id ? ' selected' : '') + '>' +
              U.esc(m.name) + (m.role ? '（' + U.esc(m.role) + '）' : '') + '</option>';
          }).join('') +
        '</select>';
    } else {
      whoHtml = UI.avatar(author.name, author.color, 'md').replace('class="avatar', 'data-board-ava class="avatar') +
        '<input class="input board-guest" data-board-guest maxlength="12" autocomplete="off"' +
          ' value="' + U.esc(bs.guest) + '" placeholder="你的名字" />';
    }

    return '<div class="board-compose">' +
      '<div class="board-who">' + whoHtml +
        '<span class="board-hint">这里留的东西，团队所有人都能看到</span>' +
      '</div>' +
      '<textarea class="textarea board-input" data-board-input maxlength="800"' +
        ' placeholder="说点什么…比如：深圳店明天验场地，物料先别发。">' + U.esc(bs.draft) + '</textarea>' +
      '<div class="board-foot">' +
        '<span class="board-tip">Ctrl + Enter 发送 · 支持换行</span>' +
        '<button class="btn btn-primary" type="button" data-board-send>' + UI.icon('send') + '发送</button>' +
      '</div>' +
    '</div>';
  }

  function boardNoteHtml(n, author) {
    var name = n.authorName || '匿名';
    var color = n.color || COLORS[0];
    var isMine = author && ((n.authorId && n.authorId === author.id) ||
      (!n.authorId && !author.id && name === author.name));
    return '<div class="note' + (isMine ? ' mine' : '') + '" data-note-id="' + U.esc(n.id) + '">' +
      UI.avatar(name, color, 'md') +
      '<div class="note-main">' +
        '<div class="note-head">' +
          '<span class="note-name">' + U.esc(name) + '</span>' +
          '<span class="note-time" title="' + U.esc(fullTime(n.at)) + '">' + U.esc(U.timeAgo(n.at)) + '</span>' +
          '<span class="note-del" data-del-note="' + U.esc(n.id) + '" title="删除这条留言">' + UI.icon('close') + '</span>' +
        '</div>' +
        '<div class="note-text">' + U.esc(n.text) + '</div>' +
      '</div>' +
    '</div>';
  }

  function fullTime(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return U.cnDate(iso) + ' ' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  }

  function boardCardHtml() {
    var notes = S.boardNotes();
    var author = boardAuthor();
    var fold = !bs.open && notes.length > BOARD_FOLD;
    var head = notes.slice(0, fold ? BOARD_FOLD : notes.length);
    var rest = fold ? notes.slice(BOARD_FOLD) : [];

    var listHtml = notes.length
      ? '<div class="board-list' + (fold ? ' collapsed' : '') + '">' +
          head.map(function (n) { return boardNoteHtml(n, author); }).join('') +
          (rest.length
            ? '<div class="board-rest">' + rest.map(function (n) { return boardNoteHtml(n, author); }).join('') + '</div>'
            : '') +
        '</div>' +
        (notes.length > BOARD_FOLD
          ? '<button class="board-more" type="button" data-board-more>' +
              (bs.open ? '收起' : '展开全部 ' + notes.length + ' 条') +
            '</button>'
          : '')
      : UI.empty('还没有留言', '写第一句吧，同事打开就能看到');

    return '<div class="card board-card" id="boardCard">' +
      '<div class="card-head"><h3>留言板</h3>' +
        '<span class="card-sub">' + (notes.length ? '共 ' + notes.length + ' 条 · ' : '') +
          '谁都能留，云端同步，团队都看得到</span></div>' +
      '<div class="board-body">' + boardComposerHtml() + listHtml + '</div>' +
    '</div>';
  }

  /* 只重画留言板：发完留言不用整页 refresh（整页会滚回顶部） */
  function repaintBoard(root) {
    var el = root && root.querySelector('#boardCard');
    if (!el) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = boardCardHtml();
    var fresh = tmp.firstChild;
    el.parentNode.replaceChild(fresh, el);
  }

  function sendNote(root) {
    var ta = root.querySelector('[data-board-input]');
    var text = ta ? ta.value : bs.draft;
    if (!text || !text.trim()) {
      UI.toast('写点什么再发吧', 'error');
      if (ta) ta.focus();
      return;
    }
    var author = boardAuthor();
    if (!author.id && author.name === '匿名' && !(S.getState().members || []).length) {
      UI.toast('先填个名字，大家才知道是谁留的', 'error');
      var g = root.querySelector('[data-board-guest]');
      if (g) g.focus();
      return;
    }
    var r = S.addBoardNote({ text: text, authorId: author.id, authorName: author.name, color: author.color });
    if (!r.ok) { UI.toast(r.error, 'error'); return; }

    bs.draft = '';
    repaintBoard(root);
    UI.toast('留言已发', 'success');

    /* 发完把光标放回输入框，方便连着补一句（preventScroll 免得页面跳） */
    var again = root.querySelector('[data-board-input]');
    if (again && again.focus) {
      try { again.focus({ preventScroll: true }); } catch (err) { again.focus(); }
    }
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
            '<span class="tlink" data-act="edit" data-id="' + m.id + '">编辑</span>' +
            '<span class="tlink danger" data-act="del" data-id="' + m.id + '">删除</span>' +
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
    '</div>' +

    boardCardHtml();
  }

  function mount(root) {
    root.addEventListener('click', function (e) {
      /* ---- 留言板：这些分支必须排在 [data-act] 前面，别被别的动作吃掉 ---- */
      if (e.target.closest('[data-board-send]')) {
        sendNote(root);
        return;
      }
      var moreBtn = e.target.closest('[data-board-more]');
      if (moreBtn) {
        bs.open = !bs.open;
        var card = root.querySelector('#boardCard');
        var list = card && card.querySelector('.board-list');
        if (list) list.classList.toggle('collapsed', !bs.open);
        moreBtn.textContent = bs.open
          ? '收起'
          : '展开全部 ' + S.boardNotes().length + ' 条';
        return;
      }
      var delBtn = e.target.closest('[data-del-note]');
      if (delBtn) {
        deleteNote(root, delBtn.getAttribute('data-del-note'));
        return;
      }

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
            UI.loading('正在删除…');
            S.removeMember(id).then(function () {
              UI.hideLoading();
              UI.toast('成员已移除', 'success');
              App.refresh();
            }).catch(function (e) {
              UI.hideLoading();
              UI.toast('删除失败：' + (e.message || e), 'error');
            });
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

    /* ---- 留言板：草稿、发言人都先记在本地，自动同步重绘也不会丢 ---- */
    root.addEventListener('input', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-board-input')) {
        bs.draft = e.target.value;
      }
    });

    root.addEventListener('change', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-board-who')) {
        bs.who = e.target.value;
        lsSet(WHO_KEY, bs.who);
        var m = S.memberById(bs.who);
        var ava = root.querySelector('[data-board-ava]');
        if (m && ava) {
          ava.style.background = m.color || COLORS[0];
          ava.textContent = (m.name || '?').slice(0, 1);
        }
        return;
      }
      if (e.target.hasAttribute && e.target.hasAttribute('data-board-guest')) {
        bs.guest = e.target.value;
        lsSet(GUEST_KEY, bs.guest);
        var g = root.querySelector('[data-board-ava]');
        if (g) g.textContent = (bs.guest.trim() || '匿').slice(0, 1);
      }
    });

    root.addEventListener('keydown', function (e) {
      var el = e.target;
      if (!el || el.tagName !== 'TEXTAREA') return;
      if (!el.hasAttribute('data-board-input')) return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendNote(root);
      }
    });
  }

  function deleteNote(root, id) {
    var n = S.boardNotes().filter(function (x) { return x.id === id; })[0];
    if (!n) return;
    var preview = String(n.text || '').replace(/\s+/g, ' ').slice(0, 40);
    UI.confirm({
      title: '删除留言',
      text: '确定删掉 <b>' + U.esc(n.authorName || '匿名') + '</b> 的这条留言吗？',
      warn: '「' + U.esc(preview) + (String(n.text || '').length > 40 ? '…' : '') + '」删除后所有人都看不到了。',
      danger: true,
      okText: '删除',
      onOk: function () {
        S.removeBoardNote(id).then(function () {
          UI.toast('留言已删除', 'success');
          repaintBoard(root);
        }).catch(function (e) {
          UI.toast('删除失败：' + (e.message || e), 'error');
        });
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
