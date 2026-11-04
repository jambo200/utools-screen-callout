/**
 * 覆盖层（Spike）preload：只暴露诊断所需的桥接方法
 */
const { ipcRenderer } = require('electron');

const handlers = {};

function on(name, callback) {
  if (!handlers[name]) {
    handlers[name] = [];
  }
  handlers[name].push(callback);
}

function fire(name, payload) {
  (handlers[name] || []).forEach(function (callback) {
    try {
      callback(payload);
    } catch (err) {
      console.error('[spike-preload] handler error', err);
    }
  });
}

ipcRenderer.on('sc:session-init', function (event, payload) {
  fire('init', payload);
});
ipcRenderer.on('sc:restore', function (event, payload) {
  fire('restore', payload);
});
ipcRenderer.on('sc:capture-result', function (event, payload) {
  fire('capture', payload);
});
ipcRenderer.on('sc:log', function (event, line) {
  fire('log', line);
});
ipcRenderer.on('sc:passthrough-ack', function (event, payload) {
  fire('passthrough', payload);
});

window.spikeBridge = {
  ready: function () {
    utools.sendToParent('sc:overlay-ready');
  },
  log: function (message) {
    utools.sendToParent('sc:log', String(message));
  },
  passthrough: function (on) {
    utools.sendToParent('sc:passthrough', { on: !!on });
  },
  capture: function (requestId, srcRect) {
    utools.sendToParent('sc:capture-source', { requestId: requestId, srcRect: srcRect || null });
  },
  exit: function () {
    utools.sendToParent('sc:exit');
  },
  openLog: function () {
    utools.sendToParent('sc:open-log');
  },
  onInit: function (callback) {
    on('init', callback);
  },
  onRestore: function (callback) {
    on('restore', callback);
  },
  onCapture: function (callback) {
    on('capture', callback);
  },
  onLog: function (callback) {
    on('log', callback);
  },
  onPassthrough: function (callback) {
    on('passthrough', callback);
  }
};
