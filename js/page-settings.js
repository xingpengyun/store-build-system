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

  function mount(root) {
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.getAttribute('data-act');

      if (act === 'logout') {
        App.logout();
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
