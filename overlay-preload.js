/**
 * 覆盖层 preload：最小暴露，仅提供标注页需要的桥接方法
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
      console.error('[csc-bridge] handler error', err);
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
ipcRenderer.on('sc:passthrough-ack', function (event, payload) {
  fire('passthrough', payload);
});

window.cscBridge = {
  ready: function () {
    utools.sendToParent('sc:overlay-ready');
  },
  log: function (message) {
    utools.sendToParent('sc:log', String(message));
  },
  setPassthrough: function (on) {
    utools.sendToParent('sc:passthrough', { on: !!on });
  },
  capture: function (requestId, srcRect) {
    utools.sendToParent('sc:capture-source', { requestId: requestId, srcRect: srcRect });
  },
  exit: function () {
    utools.sendToParent('sc:exit');
  },
  saveState: function (payload) {
    utools.sendToParent('sc:session-state', payload || null);
  },
  saveToolState: function (payload) {
    utools.sendToParent('sc:tool-state', payload || null);
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
  onPassthrough: function (callback) {
    on('passthrough', callback);
  }
};
