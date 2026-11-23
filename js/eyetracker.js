/* ==========================================================
   eyetracker.js — 登录页机器人（Bencho「Eye tracker」移植）
   MIT License · bencho.dev/licence
   ==========================================================
   原组件是 Bencho 的 <Watcher>（React + TSX）。本项目纯前端、
   无构建、无 React，所以把它忠实改成原生 DOM 直写的版本。

   ── 眼睛在球上，不在球前 ──────────────────────────────
   偷懒的做法是让两个形状朝指针滑过去，看起来像贴在圆盘上的
   贴纸。这里每只眼睛都是球面上的一个点：往左看等于转动球，
   眼睛沿着弧线走——转向边缘的那只动得少、越转越窄，像背过去
   一样，另一只则摆得更开。这个「透视缩短」就是全部的机关，
   它让一个平面圆读起来像圆的。

   一个转向（yaw 偏航 + pitch 俯仰）就是状态，朝着指针的方向
   用弹簧趋近；两只眼睛都从这个转向读出来，所以它们永远不会
   互相矛盾。指针离开窗口时它回到正对你，偶尔自己眨一下眼。

   每一帧直接写 DOM，从不走 state：一次指针移动不是一次渲染。

   ── 内联自 lab/spring（单个弹簧，管所有需要停下来的东西） ──
   速度朝目标累积、做阻尼，位移和速度都小于 0.02 时「啪」地
   归零。dt 以六十分之一秒为单位，阻尼是「乘到 dt 上」而不是
   「乘以 dt」——丢一帧衰减的能量正好等于它替换掉的那两帧。
   乘法的版本会让弹簧在繁忙的页面上表现不同，那是最难发现的 bug。
   值一旦稳定，循环就停住（park），不常驻 requestAnimationFrame。 */
window.EyeTracker = (function () {
  'use strict';

  /* 只读一次（跟滚轮、胶囊导航一致）：是偏好，不是实时输入。 */
  function stillness() {
    return typeof window !== 'undefined' &&
      !!window.matchMedia && !!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var R = 50; /* 球的半径，在 100 单位的 viewBox 里 */

  /* ── 眼睛：一种样式，和它们休息的位置 ───────────────────
     每种样式都是两个圆角矩形，彼此大小一致——样式之间的差别只在
     宽、高和圆角——所以它们都骑在同一个球上、用同样的方式眨眼。
     两只眼睛之间的任何大小差都是「深度」，由转向算出来，绝不画进去。

     脸朝你所在的地方去：你在它正上方时正对、水平，指针离开窗口时
     回到中心。 */
  var STYLES = {
    Slant: { w: 9, h: 15, r: 4.5 },
    Dots: { w: 11, h: 11, r: 5.5 },
    Squares: { w: 12, h: 12, r: 3.5 }
  };
  /* 两只眼睛之间间距的一半，按半径的比例 */
  var GAP = 0.19;
  /* 看向一个角落时整对眼睛倾斜多少度（在边缘处）——
     向右上看让它们往后仰，像 logo 那样 */
  var TILT = 64;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ── 戳它它会回话 ─────────────────────────────────────
     按一下玩具（不是标记）会在它右下角张开一个小气泡——宠物气泡，
     同样的形状和色调——一次一个字地打出一行短句，停一会儿让你读完，
     再折起来。绝不连续重复同一句。 */
  var LINES = [
    '嗨，我看到你啦。',
    '啵。',
    '哎呀，好痒。',
    '你好呀！',
    '别戳我啦。',
    '我一直看着你呢。',
    '又来？好吧。',
    '被你发现啦。'
  ];
  /* 气泡底色：跟登录页圣诞配色的松绿 / 暖红 / 主题蓝呼应 */
  var TINTS = ['#3e63dd', '#17b26a', '#e2564c'];
  var KEY_MS = 38;    /* 每打一个字的间隔（加一点随机抖动） */
  var HOLD_MS = 1500; /* 打完停多久再收起 */

  /* ── 身体，三种形状 ──────────────────────────────────
     眼睛无论身体是什么形状都按球面算，所以三种形状上的转向读起来
     一致；身体只是它们被裁剪到的轮廓。这里登录页固定用立方体
     （一个圆角软方块），其余形状留着备用。 */
  var SHAPES = {
    Ball: 'M50 0 A50 50 0 1 1 49.99 0 Z',
    Circle: 'M50 7 A43 43 0 1 1 49.99 7 Z',
    Cube: 'M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z',
    Pill: 'M34 17 H66 A33 33 0 0 1 66 83 H34 A33 33 0 0 1 34 17 Z',
    Hexagon: 'M59.53 8.50 L81.18 21.00 Q90.70 26.50 90.70 37.50 L90.70 62.50 Q90.70 73.50 81.18 79.00 L59.53 91.50 Q50.00 97.00 40.47 91.50 L18.82 79.00 Q9.30 73.50 9.30 62.50 L9.30 37.50 Q9.30 26.50 18.82 21.00 L40.47 8.50 Q50.00 3.00 59.53 8.50 Z',
    'Hex flat': 'M91.50 59.53 L79.00 81.18 Q73.50 90.70 62.50 90.70 L37.50 90.70 Q26.50 90.70 21.00 81.18 L8.50 59.53 Q3.00 50.00 8.50 40.47 L21.00 18.82 Q26.50 9.30 37.50 9.30 L62.50 9.30 Q73.50 9.30 79.00 18.82 L91.50 40.47 Q97.00 50.00 91.50 59.53 Z'
  };

  var clipSeq = 0;

  /* ------------------------------------------------------------------
     mount(el, opts)
       把机器人挂到 el 上，返回 destroy()。
       opts：{ size, shape, eyes, follow, bounce, within }
       - size    整体尺寸（px），默认 120
       - shape   身体形状（SHAPES 的键），默认 Cube
       - eyes    眼睛样式（STYLES 的键），默认 Slant
       - follow  转向跟随强度 0..100，默认 60
       - bounce  转向过冲后回弹 0..100，默认 30
       - within  鼠标在哪个盒子里才跟随（CSS 选择器），默认 .login-layer
     ------------------------------------------------------------------ */
  function mount(el, opts) {
    opts = opts || {};
    var follow = opts.follow != null ? opts.follow : 60;
    var bounce = opts.bounce != null ? opts.bounce : 30;
    var size = clamp(opts.size != null ? opts.size : 120, 16, 180);
    var shape = opts.shape || 'Cube';
    var eyesStyle = opts.eyes || 'Slant';
    var within = opts.within || '.login-layer';
    var still = stillness();

    var body = SHAPES[shape] || SHAPES.Ball;
    var base = STYLES[eyesStyle] || STYLES.Slant;
    var eye = { w: base.w, h: base.h, r: base.r };
    var clipId = 'eyt-clip-' + (++clipSeq);

    /* ---------------- 结构 ----------------
       body 是身体轮廓，clip 用它把眼睛裁在身体里（眼睛转到边缘
       时不会越出方块）。两只眼睛各包在一个 <g> 里，每帧只改
       <rect> 的宽高 + <g> 的 transform，别的都不动。 */
    el.classList.add('eyt');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', '一只会跟着鼠标转、还会眨眼的小机器人');
    el.style.setProperty('--eyt-size', size + 'px');
    el.innerHTML =
      '<svg class="eyt-ball" viewBox="0 0 100 100" data-poke>' +
        '<defs><clipPath id="' + clipId + '"><path d="' + body + '"/></clipPath></defs>' +
        '<path class="eyt-body" d="' + body + '"/>' +
        '<g clip-path="url(#' + clipId + ')">' +
          '<g class="eyt-eye-g"><rect class="eyt-eye" x="' + (-eye.w / 2) + '" y="' + (-eye.h / 2) +
            '" width="' + eye.w + '" height="' + eye.h + '" rx="' + eye.r + '"/></g>' +
          '<g class="eyt-eye-g"><rect class="eyt-eye" x="' + (-eye.w / 2) + '" y="' + (-eye.h / 2) +
            '" width="' + eye.w + '" height="' + eye.h + '" rx="' + eye.r + '"/></g>' +
        '</g>' +
      '</svg>' +
      '<span class="eyt-say" aria-live="polite"><span class="eyt-typed"></span><span class="eyt-caret"></span></span>';

    var ball = el.querySelector('.eyt-ball');
    var eyeGs = Array.prototype.slice.call(el.querySelectorAll('.eyt-eye-g'));
    var sayEl = el.querySelector('.eyt-say');
    var typedEl = el.querySelector('.eyt-typed');

    /* 说话状态：turn 自增取消上一段还没打完的话 */
    var turnCounter = 0;
    var lastLine = -1;

    /* 脸在球上的位置（半径的分数）、速度、以及它要去哪——一个点上的
       一个弹簧，画眼睛时读成一次转向 */
    var t = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    var raf = 0;
    var prev = 0;
    var blink = 0;
    var nextBlink = performance.now() + 2200;
    var seen = true;

    /* 眨眼：160ms 下去再上来，是每只眼睛上的一次挤压 */
    function draw(now) {
      var lid = 1;
      if (now > nextBlink) {
        blink = now;
        nextBlink = now + 2600 + Math.random() * 3200;
      }
      var since = now - blink;
      if (since < 160) lid = 1 - 0.9 * Math.sin((since / 160) * Math.PI);

      /* 把球的前面转到脸所在位置的转向：绕竖直轴的 yaw、绕水平轴的 pitch */
      var as = function (v) { return Math.asin(clamp(v, -0.92, 0.92)); };
      var yaw = as(t.x);
      var pitch = -as(t.y);
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      /* 对角看时整对眼睛斜一点，轴线上保持水平：右上和左下往一边斜，
         另两个角往另一边，正对时完全不斜 */
      var tilt = TILT * t.x * t.y;
      /* 眼睛越大，间距也稍微拉开一点 */
      var g0 = GAP;

      [-g0, g0].forEach(function (x0, i) {
        var g = eyeGs[i];
        if (!g) return;
        /* 眼睛是单位球面上的一点，在前面的两侧，随球一起转 */
        var z0 = Math.sqrt(1 - x0 * x0);
        var x1 = x0 * cy + z0 * sy;
        var z1 = -x0 * sy + z0 * cy;
        var y2 = -z1 * sp;
        var z2 = z1 * cp;
        /* 深度：越靠边缘的那只离你越远，所以整体更小，转向方向上更窄 */
        var near = clamp(z2, 0, 1);
        var k = 0.45 + 0.55 * near;
        var sx = k * (0.7 + 0.3 * near);
        /* ── 大小写成大小，绝不写成 scale ──────────────────
           scale 会连圆角一起拉伸：为深度变窄、或被眨眼压扁的眼睛，
           圆角会变成椭圆、一边比另一边圆。直接写宽高让每个圆角半径
           都一样，且钳住不超过半条边。 */
        var w = eye.w * sx;
        var h = Math.max(0.6, eye.h * k * lid);
        var rect = g.firstElementChild;
        if (rect) {
          rect.setAttribute('x', (-w / 2).toFixed(2));
          rect.setAttribute('y', (-h / 2).toFixed(2));
          rect.setAttribute('width', w.toFixed(2));
          rect.setAttribute('height', h.toFixed(2));
          rect.setAttribute('rx', Math.min(eye.r, w / 2, h / 2).toFixed(2));
        }
        g.setAttribute('transform',
          'translate(' + (50 + x1 * R).toFixed(2) + ' ' + (50 + y2 * R).toFixed(2) + ') rotate(' + tilt.toFixed(2) + ')');
        g.style.opacity = z2 < 0.05 ? '0' : '1';
      });
    }

    /* ── 只有在看得见时才跑 ─────────────────────────────
       滚出屏幕或切到后台标签页，循环停住；回到视野里的瞬间重新启动 */
    function tick(now) {
      if (!seen || document.hidden) { raf = 0; prev = 0; return; }
      var dt = prev ? Math.min(2.5, (now - prev) / 16.67) : 1;
      prev = now;
      if (still) {
        t.x = t.tx;
        t.y = t.ty;
      } else {
        /* 两个轴共用一个弹簧；bounce 越大阻尼越松（过冲越明显） */
        var k = 0.06;
        var d = 0.34 - (clamp(bounce, 0, 100) / 100) * 0.22;
        t.vx += ((t.tx - t.x) * k - t.vx * d) * dt;
        t.vy += ((t.ty - t.y) * k - t.vy * d) * dt;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    }
    function resume() {
      if (!raf && seen && !document.hidden) raf = requestAnimationFrame(tick);
    }

    var io = new IntersectionObserver(function (entries) {
      seen = entries[0].isIntersecting;
      resume();
    });
    io.observe(el);

    /* ── 脸朝你所在的地方去 ─────────────────────────────
       沿着指针方向往外的一点，离得越远越靠外——所以你在它正上方时
       脸在正中心，在角落时它转到那个角落的边，一只眼变小、整对斜过去。 */
    /* ── 只在它的卡片里时才看着你 ───────────────────────
       指针在它所在的卡片 / 看板里时它才跟，一离开就回正——一整墙
       机器人跟着跨页的鼠标一起转读起来像噪音。取的是相对那个卡片的
       距离，所以你到卡片边时眼睛也正好转到边缘。 */
    var frame = el.closest(within) || el;
    function aim(e) {
      var f = frame.getBoundingClientRect();
      if (e.clientX < f.left || e.clientX > f.right || e.clientY < f.top || e.clientY > f.bottom) {
        t.tx = 0;
        t.ty = 0;
        return;
      }
      var r = el.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      var d = Math.hypot(dx, dy) || 1;
      var reach = Math.max(60, Math.min(f.width, f.height) * 0.28);
      var far = Math.min(0.85, Math.tanh(d / reach) * (clamp(follow, 0, 100) / 100) * 1.5);
      t.tx = (dx / d) * far;
      t.ty = (dy / d) * far;
    }
    function rest() { t.tx = 0; t.ty = 0; }

    /* 戳一下：逐字打出一句话，停一会儿，再收起 */
    function poke() {
      var mine = ++turnCounter;
      var pool = [];
      for (var i = 0; i < LINES.length; i++) { if (i !== lastLine) pool.push(i); }
      var idx = pool[Math.floor(Math.random() * pool.length)];
      lastLine = idx;
      var line = LINES[idx];
      sayEl.style.setProperty('--tint', TINTS[Math.floor(Math.random() * TINTS.length)]);
      typedEl.textContent = '';
      sayEl.setAttribute('data-on', '');
      (function typeAt(k) {
        if (k > line.length) {
          setTimeout(function () {
            if (mine === turnCounter) sayEl.removeAttribute('data-on');
          }, HOLD_MS);
          return;
        }
        setTimeout(function () {
          if (mine !== turnCounter) return;
          typedEl.textContent = line.slice(0, k);
          typeAt(k + 1);
        }, KEY_MS + Math.random() * 30);
      })(1);
    }

    ball.addEventListener('click', poke);
    window.addEventListener('pointermove', aim, { passive: true });
    document.documentElement.addEventListener('pointerleave', rest);
    document.addEventListener('visibilitychange', resume);

    draw(performance.now());   /* 先定位一次，避免首帧眼睛还在原点 */
    raf = requestAnimationFrame(tick);

    return function destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ball.removeEventListener('click', poke);
      window.removeEventListener('pointermove', aim);
      document.documentElement.removeEventListener('pointerleave', rest);
      document.removeEventListener('visibilitychange', resume);
    };
  }

  return { mount: mount };
})();
