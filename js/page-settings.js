/* ==========================================================
   page-settings.js — 系统设置
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

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>系统设置</h1>' +
        '<p>数据保存在当前浏览器的 localStorage 里，换电脑或换浏览器不会自动同步</p>' +
      '</div>' +
    '</div>' +

    '<section class="home-grid-2 fade-up" style="animation-delay:.05s">' +
      '<div class="card">' +
        '<div class="card-head"><h3>基本信息</h3><span class="card-sub">改完点保存</span></div>' +
        '<form autocomplete="off" id="settingForm">' +
          '<div class="field-row">' +
            '<div class="field"><label>系统名称</label>' +
              '<input class="input" name="brand" value="' + U.esc(set.brand || '') + '" /></div>' +
            '<div class="field"><label>标语</label>' +
              '<input class="input" name="slogan" value="' + U.esc(set.slogan || '') + '" /></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label>团队称呼</label>' +
              '<input class="input" name="teamName" value="' + U.esc(set.teamName || '团队') + '" placeholder="例如：华南团队" /></div>' +
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
        '<div class="card-head"><h3>数据管理</h3></div>' +
        '<div class="mini-stats" style="margin-bottom:14px">' +
          '<div class="mini-stat"><div class="ms-label">门店</div><div class="ms-val">' + s.stores.length + '</div></div>' +
          '<div class="mini-stat"><div class="ms-label">任务</div><div class="ms-val">' + s.tasks.length + '</div></div>' +
          '<div class="mini-stat"><div class="ms-label">成员</div><div class="ms-val">' + s.members.length + '</div></div>' +
          '<div class="mini-stat"><div class="ms-label">到货记录</div><div class="ms-val">' + s.arrivals.length + '</div></div>' +
        '</div>' +
        '<div class="field" style="margin-bottom:10px">' +
          '<label>占用空间</label>' +
          '<div style="font-size:13px;font-weight:600">' + U.bytes(bytes) + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">' +
          '<button class="btn" data-act="export">' + UI.icon('download') + '导出备份（JSON）</button>' +
          '<button class="btn" data-act="import">' + UI.icon('upload') + '从备份文件导入</button>' +
          '<button class="btn btn-danger" data-act="reset">' + UI.icon('refresh') + '恢复演示数据</button>' +
        '</div>' +
        '<input type="file" id="importFile" accept=".json,application/json" style="display:none" />' +
        '<p style="margin-top:12px;font-size:11.5px;color:var(--text-3);line-height:1.7">' +
          '建议定期导出备份。清除浏览器缓存 / 使用无痕窗口会导致数据丢失。' +
        '</p>' +
      '</div>' +
    '</section>' +

    '<div class="card fade-up" style="animation-delay:.1s">' +
      '<div class="card-head"><h3>数据说明</h3><span class="card-sub">修改代码时的参考</span></div>' +
      '<div class="desc-list">' +
        '<div class="d-item"><div class="d-label">存储位置</div><div class="d-val mono" style="font-size:11.5px">localStorage · ' + window.CONST.STORAGE_KEY + '</div></div>' +
        '<div class="d-item"><div class="d-label">数据结构版本</div><div class="d-val">v' + ((s.meta && s.meta.version) || 1) + '</div></div>' +
        '<div class="d-item"><div class="d-label">最后保存</div><div class="d-val mono" style="font-size:11.5px">' +
          (s.meta && s.meta.updatedAt ? new Date(s.meta.updatedAt).toLocaleString('zh-CN') : '—') + '</div></div>' +
        '<div class="d-item"><div class="d-label">阶段 / 风险 / 任务模板</div><div class="d-val">js/constants.js</div></div>' +
        '<div class="d-item"><div class="d-label">数据读写逻辑</div><div class="d-val">js/store.js</div></div>' +
        '<div class="d-item"><div class="d-label">演示数据生成</div><div class="d-val">js/seed.js</div></div>' +
      '</div>' +
    '</div>';
  }

  function mount(root) {
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.getAttribute('data-act');

      if (act === 'saveSetting') {
        var form = root.querySelector('#settingForm');
        S.getState().settings.brand = UI.formValue(form, 'brand') || '门店筹建管理系统';
        S.getState().settings.slogan = UI.formValue(form, 'slogan');
        S.getState().settings.teamName = UI.formValue(form, 'teamName') || '团队';
        S.getState().settings.warnDays = U.clamp(Number(UI.formValue(form, 'warnDays')) || 3, 1, 30);
        S.getState().settings.weatherTemp = Number(UI.formValue(form, 'weatherTemp')) || 26;
        S.getState().settings.weatherText = UI.formValue(form, 'weatherText') || '多云';
        S.save();
        UI.toast('设置已保存', 'success');
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
          title: '恢复演示数据',
          text: '这会用初始演示数据覆盖当前所有记录。',
          warn: '当前门店、任务、成员、到货记录会全部丢失，建议先导出备份。',
          danger: true,
          okText: '确认恢复',
          onOk: function () {
            S.resetData();
            UI.toast('已恢复演示数据', 'success');
            App.refresh();
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
          try {
            S.importJSON(String(reader.result));
            UI.toast('导入成功', 'success');
            App.refresh();
          } catch (err) {
            UI.toast('导入失败：' + err.message, 'error');
          }
          file.value = '';
        };
        reader.readAsText(f, 'utf-8');
      });
    }
  }

  return { title: '系统设置', render: render, mount: mount };
})();
