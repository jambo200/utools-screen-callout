/**
 * 覆盖层诊断页（P0-A Spike）
 * 观测点：存活计时 / 穿透恢复 / 截屏自捕获 / 输入法 / 置顶 / 坐标对齐
 */
(function () {
  var bridge = window.spikeBridge;
  var startedAt = 0;
  var sessionId = '';
  var reentryCount = 0;
  var autoRevertAt = 0;
  var passOn = false;
  var lastCaptureRequest = '';
  var maxLogs = 80;

  var canvas;
  var ctx;
  var mouse = null;
  var dots = [];
  var drawQueued = false;
  var timerHandle = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function formatDuration(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = total % 60;
    return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
  }

  function logLine(text) {
    var list = $('#logs');
    if (!list) {
      return;
    }
    var item = document.createElement('li');
    item.textContent = text;
    item.title = text;
    list.appendChild(item);
    while (list.children.length > maxLogs) {
      list.removeChild(list.firstChild);
    }
    list.scrollTop = list.scrollHeight;
  }

  function showBanner(text, ok) {
    var banner = $('#banner');
    banner.textContent = text;
    banner.hidden = false;
    banner.classList.toggle('ok', !!ok);
    clearTimeout(showBanner._timer);
    showBanner._timer = setTimeout(function () {
      banner.hidden = true;
    }, 4200);
  }

  /* ------------------------------------------------------------ canvas */

  function resizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    queueDraw();
  }

  function queueDraw() {
    if (drawQueued) {
      return;
    }
    drawQueued = true;
    requestAnimationFrame(function () {
      drawQueued = false;
      draw();
    });
  }

  function draw() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);

    // 落点
    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 145, 0, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText('#' + (i + 1) + ' (' + Math.round(dot.x) + ',' + Math.round(dot.y) + ')', dot.x + 10, dot.y - 10);
    }

    // 准星
    if (mouse) {
      ctx.strokeStyle = 'rgba(79, 140, 255, 0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(0, mouse.y);
      ctx.lineTo(width, mouse.y);
      ctx.moveTo(mouse.x, 0);
      ctx.lineTo(mouse.x, height);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(79, 140, 255, 0.95)';
      ctx.fillRect(mouse.x - 1.5, mouse.y - 1.5, 3, 3);

      ctx.font = '12px Consolas, monospace';
      var label = Math.round(mouse.x) + ', ' + Math.round(mouse.y);
      var textWidth = ctx.measureText(label).width;
      var boxX = Math.min(mouse.x + 14, width - textWidth - 22);
      var boxY = Math.min(mouse.y + 16, height - 30);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.82)';
      ctx.fillRect(boxX - 5, boxY - 13, textWidth + 10, 20);
      ctx.fillStyle = '#cfe0ff';
      ctx.fillText(label, boxX, boxY + 2);
    }
  }

  /* ------------------------------------------------------------- timer */

  function tick() {
    if (!startedAt) {
      return;
    }
    $('#timer').textContent = formatDuration(Date.now() - startedAt);

    if (passOn && autoRevertAt) {
      var remain = Math.max(0, Math.ceil((autoRevertAt - Date.now()) / 1000));
      $('#i-pass').textContent = '穿透中 · ' + remain + 's 后自动恢复';
    }
  }

  /* ------------------------------------------------------------ actions */

  function requestPassthrough() {
    if (!bridge) {
      return;
    }
    bridge.log('request passthrough on');
    bridge.passthrough(true);
  }

  function requestCapture() {
    if (!bridge) {
      return;
    }
    var button = $('#btn-capture');
    button.disabled = true;
    lastCaptureRequest = 'cap_' + Date.now();
    $('#cap-meta').textContent = '截屏中…（覆盖层会短暂隐藏）';
    bridge.log('request capture ' + lastCaptureRequest);
    bridge.capture(lastCaptureRequest, null);
  }

  function requestExit() {
    if (!bridge) {
      return;
    }
    bridge.log('request exit');
    bridge.exit();
  }

  /* -------------------------------------------------------------- init */

  function applyInfo(data) {
    var display = data.display || {};
    var bounds = display.bounds || {};
    $('#i-display').textContent =
      '#' + (display.id != null ? display.id : '?') +
      '　' + (bounds.width || '?') + 'x' + (bounds.height || '?') +
      ' @' + (bounds.x || 0) + ',' + (bounds.y || 0);
    $('#i-size').textContent = window.innerWidth + ' x ' + window.innerHeight + ' CSS px';
    $('#i-scale').textContent =
      'scaleFactor ' + (display.scaleFactor != null ? display.scaleFactor : '?') +
      ' / DPR ' + (window.devicePixelRatio || 1);
    $('#i-session').textContent = data.sessionId || '-';
    $('#i-session').title = data.sessionId || '';
    $('#i-log').textContent = data.logPath || '-';
    $('#i-log').title = data.logPath || '';
    $('#badge').textContent = '运行中';
  }

  function handleInit(data) {
    if (!data) {
      return;
    }
    sessionId = data.sessionId || '';
    startedAt = data.startedAt || Date.now();
    applyInfo(data);
    $('#i-focus').textContent = document.hasFocus() ? '有焦点' : '无焦点';
    logLine('init session=' + sessionId);
    if (bridge) {
      bridge.log(
        'overlay init dpr=' + (window.devicePixelRatio || 1) +
        ' inner=' + window.innerWidth + 'x' + window.innerHeight
      );
    }
    tick();
  }

  function bind() {
    $('#btn-pass').addEventListener('click', requestPassthrough);
    $('#btn-capture').addEventListener('click', requestCapture);
    $('#btn-open-log').addEventListener('click', function () {
      bridge.openLog();
    });
    $('#btn-exit').addEventListener('click', requestExit);

    var ime = $('#ime');
    ime.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        var value = ime.value.trim();
        if (value) {
          logLine('IME 提交: ' + value);
          bridge.log('ime commit: ' + value);
          ime.value = '';
        }
      }
      if (event.key === 'Escape') {
        ime.blur();
      }
    });

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', function (event) {
      mouse = { x: event.clientX, y: event.clientY };
      $('#i-cursor').textContent = Math.round(mouse.x) + ', ' + Math.round(mouse.y);
      queueDraw();
    });
    window.addEventListener('mouseleave', function () {
      mouse = null;
      queueDraw();
    });
    window.addEventListener('pointerdown', function (event) {
      if (event.target && event.target.closest && event.target.closest('.panel')) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      dots.push({ x: event.clientX, y: event.clientY });
      if (dots.length > 12) {
        dots.shift();
      }
      queueDraw();
    });
    window.addEventListener('focus', function () {
      $('#i-focus').textContent = '有焦点';
      if (bridge) {
        bridge.log('overlay focus');
      }
    });
    window.addEventListener('blur', function () {
      $('#i-focus').textContent = '无焦点';
      if (bridge) {
        bridge.log('overlay blur');
      }
    });
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !(event.target && event.target.tagName === 'TEXTAREA')) {
        requestExit();
      }
    });
  }

  function registerBridge() {
    if (!bridge) {
      $('#badge').textContent = '桥接未加载';
      logLine('spikeBridge 未加载：请检查 dev/spike-preload.js 是否被加载');
      return;
    }

    bridge.onInit(handleInit);
    bridge.onLog(function (line) {
      logLine(line);
    });
    bridge.onCapture(function (payload) {
      if (!payload || payload.requestId !== lastCaptureRequest) {
        return;
      }
      $('#btn-capture').disabled = false;
      if (payload.error) {
        $('#cap-meta').textContent = '失败：' + payload.error;
        $('#cap-tip').textContent = '截屏失败。请记录此错误，属于 S4 的失败事实。';
        logLine('capture error: ' + payload.error);
        return;
      }
      var img = $('#cap-img');
      img.src = payload.dataUrl;
      $('#cap-wrap').hidden = false;
      $('#cap-meta').textContent =
        payload.imageWidth + 'x' + payload.imageHeight + ' 物理像素 · ' + payload.costMs + 'ms';
      $('#cap-tip').textContent =
        '判断：若上图能看到本面板、准星或边缘虚线，说明覆盖层被拍进去了（S4 失败）；看不到则通过。';
      logLine('capture ok ' + payload.imageWidth + 'x' + payload.imageHeight);
    });
    bridge.onPassthrough(function (payload) {
      if (!payload) {
        return;
      }
      var on = !!payload.on;
      var wasOn = passOn;
      passOn = on;
      autoRevertAt = on ? payload.autoRevertAt || Date.now() + 20000 : 0;
      if (on) {
        $('#i-pass').textContent = '穿透中 · 20s 后自动恢复';
        showBanner('鼠标已穿透：现在去点击 PPT / 桌面，再按一次全局快捷键测试恢复', false);
      } else {
        $('#i-pass').textContent = '关';
        if (wasOn) {
          showBanner('已恢复交互', true);
        }
      }
      logLine('passthrough ack on=' + on);
    });
    bridge.onRestore(function (payload) {
      reentryCount = (payload && payload.count) || reentryCount + 1;
      $('#i-reentry').textContent = reentryCount + ' 次';
      showBanner('热键重入成功（第 ' + reentryCount + ' 次）：交互已恢复', true);
      logLine('hotkey re-entry count=' + reentryCount);
      passOn = false;
      autoRevertAt = 0;
      $('#i-pass').textContent = '关';
    });

    bridge.ready();
  }

  function init() {
    canvas = $('#cv');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    bind();
    registerBridge();
    timerHandle = setInterval(tick, 200);
    window.addEventListener('beforeunload', function () {
      clearInterval(timerHandle);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
