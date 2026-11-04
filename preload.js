/**
 * 主界面 preload 桥接层
 * 负责：覆盖层窗口生命周期、显示器选择、截图、日志、IPC 中枢
 * 只向页面暴露 window.services，不暴露 Node/Electron 对象
 */
const { ipcRenderer } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const geometry = require('./src/shared/geometry.js');
const settingsModule = require('./src/shared/settings.js');

const SETTINGS_KEY = 'screen-callout.settings.v1';

const state = {
  win: null,
  sessionId: null,
  mode: null,
  display: null,
  settings: null,
  startedAt: 0,
  heartbeatTimer: null,
  revertTimer: null,
  passthrough: false,
  reentries: 0,
  retained: null
};

function readSettings() {
  try {
    return settingsModule.mergeSettings(utools.dbStorage.getItem(SETTINGS_KEY));
  } catch (err) {
    log('read settings failed: ' + err.message);
    return settingsModule.mergeSettings(null);
  }
}

function writeSettings(raw) {
  const merged = settingsModule.mergeSettings(raw);
  try {
    utools.dbStorage.setItem(SETTINGS_KEY, merged);
  } catch (err) {
    log('write settings failed: ' + err.message);
  }
  return merged;
}

/* ------------------------------------------------------------------ 日志 */

function logPath() {
  return path.join(utools.getPluginLocalDataPath(), 'spike.log');
}

function appendLog(line) {
  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.appendFileSync(logPath(), line + '\n', 'utf8');
  } catch (err) {
    // 日志失败不影响主流程
  }
  if (state.win && !state.win.isDestroyed()) {
    try {
      state.win.webContents.send('sc:log', line);
    } catch (err) {
      // 窗口可能正在关闭
    }
  }
}

function log(message) {
  appendLog('[' + new Date().toISOString() + '] ' + message);
}

function readLogTail(count) {
  try {
    const text = fs.readFileSync(logPath(), 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(-count);
  } catch (err) {
    return [];
  }
}

/* ---------------------------------------------------------------- 会话管理 */

function sendToOverlay(channel, payload) {
  if (state.win && !state.win.isDestroyed()) {
    try {
      state.win.webContents.send(channel, payload);
    } catch (err) {
      log('send to overlay failed: ' + err.message);
    }
  }
}

function publicDisplay(display) {
  return {
    id: display.id,
    label: display.label || '',
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height
    },
    workArea: {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height
    },
    scaleFactor: display.scaleFactor,
    rotation: display.rotation
  };
}

function pickTargetDisplay(choice) {
  if (choice === 'primary') {
    return utools.getPrimaryDisplay();
  }
  if (typeof choice === 'number' && isFinite(choice)) {
    const displays = utools.getAllDisplays();
    const matched = displays.find(function (display) {
      return display.id === choice;
    });
    if (matched) {
      return matched;
    }
  }
  return utools.getDisplayNearestPoint(utools.getCursorScreenPoint());
}

function restoreExistingSession(source) {
  state.reentries += 1;
  log('re-entry source=' + source + ' count=' + state.reentries + ' passthrough=' + state.passthrough);

  const win = state.win;
  if (win && !win.isDestroyed()) {
    clearTimeout(state.revertTimer);
    state.revertTimer = null;
    try {
      win.setIgnoreMouseEvents(false);
    } catch (err) {
      log('restore ignoreMouse failed: ' + err.message);
    }
    state.passthrough = false;
    try {
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver');
      win.focus();
    } catch (err) {
      log('restore focus failed: ' + err.message);
    }
    sendToOverlay('sc:restore', {
      sessionId: state.sessionId,
      count: state.reentries,
      source: source
    });
  }
  return { ok: true, already: true, count: state.reentries, sessionId: state.sessionId };
}

function startSession(mode, options) {
  if (state.win && !state.win.isDestroyed()) {
    return restoreExistingSession('startSession');
  }

  const opts = options || {};
  const settings = opts.settings || null;
  const choice = settings && settings.session ? settings.session.display : 'cursor';
  const display = pickTargetDisplay(choice);
  const startedAt = Date.now();
  const sessionId = 'sc_' + startedAt + '_' + Math.random().toString(36).slice(2, 7);
  const isSpike = mode === 'spike';
  const page = isSpike ? 'dev/spike.html' : 'overlay.html';
  const preload = isSpike ? 'dev/spike-preload.js' : 'overlay-preload.js';
  const bounds = display.bounds;

  state.sessionId = sessionId;
  state.mode = mode;
  state.display = display;
  state.settings = settings;
  state.startedAt = startedAt;

  log(
    'session start id=' +
      sessionId +
      ' mode=' +
      mode +
      ' display=' +
      display.id +
      ' bounds=' +
      JSON.stringify(bounds) +
      ' scaleFactor=' +
      display.scaleFactor +
      ' displayChoice=' +
      choice +
      ' fullscreen=' +
      utools.isWindows() +
      ' platform=' +
      process.platform
  );

  const win = utools.createBrowserWindow(
    page,
    {
      show: false,
      title: '屏幕标注诊断',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      backgroundColor: 'rgba(255,255,255,0.01)',
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      fullscreenable: utools.isWindows(),
      fullscreen: utools.isWindows(),
      autoHideMenuBar: true,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      alwaysOnTop: true,
      roundedCorners: false,
      hasShadow: false,
      focusable: true,
      webPreferences: { preload: preload }
    },
    function () {
      try {
        win.show();
        win.setAlwaysOnTop(true, 'screen-saver');
        win.focus();
        log('window shown bounds=' + JSON.stringify(win.getBounds()) + ' visible=' + win.isVisible());
      } catch (err) {
        log('window show failed: ' + err.message);
      }
    }
  );

  state.win = win;
  state.passthrough = false;
  state.reentries = 0;

  clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = setInterval(function () {
    log(
      'heartbeat alive=' +
        Math.round((Date.now() - state.startedAt) / 1000) +
        's passthrough=' +
        state.passthrough +
        ' windowAlive=' +
        !!(state.win && !state.win.isDestroyed())
    );
  }, 30000);

  return {
    ok: true,
    sessionId: sessionId,
    display: publicDisplay(display),
    startedAt: startedAt,
    logPath: logPath()
  };
}

function endSession(reason) {
  const alive = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
  log('session end reason=' + reason + ' alive=' + alive + 's');

  clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = null;
  clearTimeout(state.revertTimer);
  state.revertTimer = null;

  const win = state.win;
  state.win = null;
  if (win && !win.isDestroyed()) {
    try {
      win.destroy();
    } catch (err) {
      log('destroy failed: ' + err.message);
    }
  }

  state.sessionId = null;
  state.display = null;
  state.settings = null;
  state.passthrough = false;
  state.startedAt = 0;

  try {
    utools.outPlugin();
  } catch (err) {
    log('outPlugin failed: ' + err.message);
  }
}

function setPassthrough(on, source) {
  const win = state.win;
  if (!win || win.isDestroyed()) {
    return;
  }
  const next = !!on;
  try {
    if (next) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
  } catch (err) {
    log('setIgnoreMouseEvents failed: ' + err.message);
  }
  state.passthrough = next;
  log('passthrough=' + next + ' source=' + source);

  clearTimeout(state.revertTimer);
  state.revertTimer = null;
  if (next && state.mode === 'spike') {
    // 诊断模式的安全阀：20 秒后自动恢复，避免热键失效时无法退出
    state.revertTimer = setTimeout(function () {
      if (state.passthrough) {
        log('passthrough auto-revert after 20s');
        setPassthrough(false, 'auto-revert');
      }
    }, 20000);
  } else if (!next) {
    try {
      win.focus();
    } catch (err) {
      log('focus after passthrough failed: ' + err.message);
    }
  }
  sendToOverlay('sc:passthrough-ack', {
    on: next,
    autoRevertAt: next && state.mode === 'spike' ? Date.now() + 20000 : 0
  });
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function captureForOverlay(requestId, srcRect) {
  const win = state.win;
  if (!win || win.isDestroyed()) {
    return;
  }
  const display = state.display;
  const startedAt = Date.now();
  log('capture start request=' + requestId + ' display=' + display.id);

  try {
    win.hide();
    await delay(150);
    const captures = await utools.captureDisplay({ displayId: display.id });
    const capture =
      captures.find(function (item) {
        return item.display && item.display.id === display.id;
      }) || captures[0];
    if (!capture) {
      throw new Error('no capture returned');
    }

    const image = capture.image;
    const size = image.getSize();
    let output = image;
    let cropped = false;
    if (srcRect && srcRect.w >= 2 && srcRect.h >= 2) {
      const crop = geometry.cropRectForDisplay(
        srcRect,
        size.width,
        size.height,
        display.bounds.width,
        display.bounds.height
      );
      output = image.crop(crop);
      cropped = true;
    } else {
      output = image.resize({ width: 960 });
    }
    const dataUrl = output.toDataURL();
    const outputSize = output.getSize();

    log(
      'capture ok ' +
        size.width +
        'x' +
        size.height +
        ' output=' +
        outputSize.width +
        'x' +
        outputSize.height +
        ' cropped=' +
        cropped +
        ' cost=' +
        (Date.now() - startedAt) +
        'ms'
    );

    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.focus();
    win.webContents.send('sc:capture-result', {
      requestId: requestId,
      dataUrl: dataUrl,
      imageWidth: outputSize.width,
      imageHeight: outputSize.height,
      displayWidth: display.bounds.width,
      displayHeight: display.bounds.height,
      cropped: cropped,
      costMs: Date.now() - startedAt,
      srcRect: srcRect || null
    });
  } catch (err) {
    log('capture failed: ' + err.message);
    if (!win.isDestroyed()) {
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver');
      win.focus();
      win.webContents.send('sc:capture-result', {
        requestId: requestId,
        error: err.message
      });
    }
  }
}

/* -------------------------------------------------------------------- IPC */

ipcRenderer.on('sc:overlay-ready', function () {
  log('overlay ready');
  const keepState =
    state.settings &&
    state.settings.session &&
    state.settings.session.clearOnExit === false &&
    state.retained &&
    state.display &&
    state.retained.displayId === state.display.id;
  sendToOverlay('sc:session-init', {
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    mode: state.mode,
    display: state.display ? publicDisplay(state.display) : null,
    settings: state.settings,
    retained: keepState ? state.retained : null,
    platform: process.platform,
    isWindows: utools.isWindows(),
    isMac: utools.isMacOS(),
    logPath: logPath()
  });
});

ipcRenderer.on('sc:exit', function () {
  endSession('user-exit');
});

ipcRenderer.on('sc:passthrough', function (event, payload) {
  setPassthrough(payload && payload.on, 'overlay-request');
});

ipcRenderer.on('sc:ignore-mouse', function (event, payload) {
  const win = state.win;
  if (!win || win.isDestroyed()) {
    return;
  }
  const ignore = !!(payload && payload.ignore);
  try {
    if (ignore) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
  } catch (err) {
    log('ignore-mouse failed: ' + err.message);
  }
});

ipcRenderer.on('sc:capture-source', function (event, payload) {
  captureForOverlay(payload && payload.requestId, payload && payload.srcRect);
});

ipcRenderer.on('sc:log', function (event, message) {
  appendLog('[' + new Date().toISOString() + '] page: ' + message);
});

ipcRenderer.on('sc:session-state', function (event, payload) {
  if (payload && Array.isArray(payload.shapes)) {
    state.retained = {
      displayId: payload.displayId,
      shapes: payload.shapes,
      images: payload.images || {}
    };
    log('session state retained shapes=' + payload.shapes.length);
  } else {
    state.retained = null;
    log('session state cleared');
  }
});

ipcRenderer.on('sc:tool-state', function (event, payload) {
  if (!payload) {
    return;
  }
  const current = readSettings();
  if (payload.toolOptions && typeof payload.toolOptions === 'object') {
    current.toolOptions = payload.toolOptions;
  }
  if (payload.colors && typeof payload.colors === 'object') {
    if (typeof payload.colors.shared === 'boolean') {
      current.colors.shared = payload.colors.shared;
    }
    if (typeof payload.colors.default === 'string') {
      current.colors.default = payload.colors.default;
    }
    if (payload.colors.perTool && typeof payload.colors.perTool === 'object') {
      current.colors.perTool = payload.colors.perTool;
    }
  }
  writeSettings(current);
  log('tool state saved');
});

ipcRenderer.on('sc:open-log', function () {
  try {
    utools.shellShowItemInFolder(logPath());
  } catch (err) {
    log('open log folder failed: ' + err.message);
  }
});

/* --------------------------------------------------------------- 对外接口 */

window.services = {
  startSession: function (mode, options) {
    try {
      return startSession(mode || 'overlay', options);
    } catch (err) {
      log('startSession failed: ' + err.message);
      return { ok: false, error: err.message };
    }
  },
  endSession: endSession,
  getSettings: readSettings,
  saveSettings: writeSettings,
  notifyEnter: function (action) {
    log('plugin enter code=' + action.code + ' from=' + action.from + ' type=' + action.type);
  },
  notifyOut: function (isKill) {
    log('plugin out isKill=' + isKill + ' windowAlive=' + !!(state.win && !state.win.isDestroyed()));
    if (isKill) {
      clearInterval(state.heartbeatTimer);
      clearTimeout(state.revertTimer);
      state.win = null;
      state.sessionId = null;
    }
  },
  getSessionInfo: function () {
    return {
      active: !!(state.win && !state.win.isDestroyed()),
      sessionId: state.sessionId,
      mode: state.mode,
      reentries: state.reentries
    };
  },
  getLogPath: logPath,
  readLogTail: readLogTail,
  openLogFolder: function () {
    try {
      utools.shellShowItemInFolder(logPath());
    } catch (err) {
      log('open log folder failed: ' + err.message);
    }
  },
  exportLog: function () {
    try {
      const stamp = new Date();
      const pad = function (value) {
        return value < 10 ? '0' + value : String(value);
      };
      const name =
        'screen-callout-' +
        stamp.getFullYear() +
        pad(stamp.getMonth() + 1) +
        pad(stamp.getDate()) +
        '-' +
        pad(stamp.getHours()) +
        pad(stamp.getMinutes()) +
        pad(stamp.getSeconds()) +
        '.log';
      let defaultPath = name;
      try {
        defaultPath = path.join(utools.getPath('downloads'), name);
      } catch (err) {
        defaultPath = name;
      }
      const savePath = utools.showSaveDialog({
        title: '保存诊断日志',
        defaultPath: defaultPath,
        buttonLabel: '保存',
        filters: [{ name: '日志文件', extensions: ['log', 'txt'] }]
      });
      if (!savePath) {
        return { ok: false, cancelled: true };
      }
      fs.copyFileSync(logPath(), savePath);
      return { ok: true, path: savePath };
    } catch (err) {
      log('export log failed: ' + err.message);
      return { ok: false, error: err.message };
    }
  },
  getCmdHotKey: function (label) {
    try {
      return utools.getCmdHotKey(label);
    } catch (err) {
      return null;
    }
  },
  openHotkeySetting: function (label) {
    try {
      utools.redirectHotKeySetting(label);
      return true;
    } catch (err) {
      log('open hotkey setting failed: ' + err.message);
      return false;
    }
  }
};
