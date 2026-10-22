/* ==========================================================
   login.js — 登录页
   两种模式（由 cloud.js 的 AUTH_MODE 决定）：
     simple = 账号密码（admin / 123）
     phone  = 手机号 + 短信验证码
   ========================================================== */
window.Login = (function () {
  'use strict';

  var pending = null;     /* 手机模式：{ phone, verificationId, isExistingUser } */
  var layer = null;
  var timer = null;
  var remain = 0;
  var onDone = null;

  function q(sel) { return layer ? layer.querySelector(sel) : null; }

  function isSimple() {
    return (window.Cloud && window.Cloud.authMode) !== 'phone';
  }

  /* ---------------- 模板 ---------------- */
  function head() {
    return [
      '<div class="login-head">',
      '  <span class="login-mark">🏪</span>',
      '  <h1>门店筹建管理系统</h1>',
      '  <p>阿蛮团队 · 云端协作版</p>',
      '</div>'
    ].join('');
  }

  function tplSimple() {
    return '<div class="login-card">' + head() +
      '<form class="login-form" id="lgForm" autocomplete="off">' +
        '<div class="field">' +
          '<label>账号</label>' +
          '<input class="input" id="lgUser" type="text" placeholder="请输入账号" autocomplete="username" />' +
        '</div>' +
        '<div class="field">' +
          '<label>密码</label>' +
          '<input class="input" id="lgPass" type="password" placeholder="请输入密码" autocomplete="current-password" />' +
        '</div>' +
        '<p class="login-err" id="lgErr"></p>' +
        '<button type="submit" class="btn btn-primary btn-block login-submit" id="lgSubmit">登 录</button>' +
      '</form>' +
      '<p class="login-tip">数据保存在云端，团队成员共享同一份。</p>' +
    '</div>';
  }

  function tplPhone() {
    return '<div class="login-card">' + head() +
      '<form class="login-form" id="lgForm" autocomplete="off">' +
        '<div class="field">' +
          '<label>手机号</label>' +
          '<input class="input" id="lgPhone" type="tel" inputmode="numeric" maxlength="11"' +
          '       placeholder="请输入 11 位手机号" autocomplete="tel" />' +
        '</div>' +
        '<div class="field">' +
          '<label>验证码</label>' +
          '<div class="login-code-row">' +
            '<input class="input" id="lgCode" type="text" inputmode="numeric" maxlength="6"' +
            '       placeholder="6 位数字" autocomplete="one-time-code" />' +
            '<button type="button" class="btn btn-code" id="lgSend" disabled>获取验证码</button>' +
          '</div>' +
        '</div>' +
        '<p class="login-err" id="lgErr"></p>' +
        '<button type="submit" class="btn btn-primary btn-block login-submit" id="lgSubmit">登 录</button>' +
      '</form>' +
      '<p class="login-tip">首次登录自动创建账号，无需注册。<br>数据保存在云端，团队成员共享同一份。</p>' +
    '</div>';
  }

  /* ---------------- 公共 ---------------- */
  function show(callback) {
    onDone = callback;
    if (layer) return;

    layer = document.createElement('div');
    layer.className = 'login-layer';
    layer.innerHTML = isSimple() ? tplSimple() : tplPhone();
    document.body.appendChild(layer);

    if (isSimple()) bindSimple();
    else bindPhone();
  }

  function hide() {
    if (timer) { clearInterval(timer); timer = null; }
    if (layer) { layer.remove(); layer = null; }
    pending = null;
  }

  function err(msg, ok) {
    var e = q('#lgErr');
    if (!e) return;
    e.textContent = msg || '';
    e.className = 'login-err' + (ok ? ' ok' : '');
  }

  /* ---------------- 简单账号密码 ---------------- */
  function bindSimple() {
    var form = q('#lgForm');
    var userEl = q('#lgUser');

    setTimeout(function () { if (userEl) userEl.focus(); }, 120);

    userEl.addEventListener('input', function () { err(''); });
    q('#lgPass').addEventListener('input', function () { err(''); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = (q('#lgUser').value || '').trim();
      var p = q('#lgPass').value || '';

      if (!u || !p) { err('请输入账号和密码'); return; }

      if (window.Cloud.simpleLogin(u, p)) {
        hide();
        if (onDone) onDone({ name: u });
      } else {
        err('账号或密码不正确');
        q('#lgPass').value = '';
        q('#lgPass').focus();
      }
    });
  }

  /* ---------------- 手机验证码 ---------------- */
  function phoneValue() {
    var p = q('#lgPhone');
    return p ? p.value.replace(/\D/g, '').slice(0, 11) : '';
  }

  function codeValue() {
    var c = q('#lgCode');
    return c ? c.value.replace(/\D/g, '').slice(0, 6) : '';
  }

  function refreshSendBtn() {
    var btn = q('#lgSend');
    if (!btn) return;
    if (remain > 0) {
      btn.disabled = true;
      btn.textContent = remain + ' 秒后重发';
      return;
    }
    btn.disabled = !/^1\d{10}$/.test(phoneValue());
    btn.textContent = pending ? '重新获取' : '获取验证码';
  }

  function startCountdown() {
    remain = 60;
    refreshSendBtn();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      remain -= 1;
      if (remain <= 0) {
        clearInterval(timer);
        timer = null;
        remain = 0;
      }
      refreshSendBtn();
    }, 1000);
  }

  function bindPhone() {
    var phone = q('#lgPhone');
    var code = q('#lgCode');
    var send = q('#lgSend');
    var form = q('#lgForm');

    setTimeout(function () { phone.focus(); }, 120);

    phone.addEventListener('input', function () {
      err('');
      refreshSendBtn();
    });
    code.addEventListener('input', function () { err(''); });

    send.addEventListener('click', function () {
      var val = phoneValue();
      if (!/^1\d{10}$/.test(val)) { err('请输入正确的 11 位手机号'); return; }

      send.disabled = true;
      send.textContent = '发送中…';
      err('');

      window.Cloud.sendCode(val).then(function (data) {
        pending = {
          phone: val,
          verificationId: data.verificationId,
          isExistingUser: data.isExistingUser
        };
        startCountdown();
        err('验证码已发送', true);
        var c = q('#lgCode');
        if (c) c.focus();
      }).catch(function (e) {
        pending = null;
        remain = 0;
        refreshSendBtn();
        err(e.message || '发送失败，请稍后重试');
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var p = phoneValue();
      var c = codeValue();

      if (!pending || pending.phone !== p) { err('请先获取验证码'); return; }
      if (!/^\d{4,6}$/.test(c)) { err('请输入收到的验证码'); return; }

      var btn = q('#lgSubmit');
      btn.disabled = true;
      btn.textContent = '登录中…';
      err('');

      window.Cloud.verifyCode({
        phone: pending.phone,
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: c
      }).then(function (data) {
        hide();
        if (onDone) onDone(data && data.user);
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = '登 录';
        err(e.message || '登录失败，请检查验证码');
      });
    });
  }

  return { show: show, hide: hide };
})();
