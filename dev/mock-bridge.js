/**
 * 预览用桥接模拟（仅用于浏览器静态预览，不参与 uTools 运行）
 */
(function () {
  var initCallback = null;

  window.cscBridge = {
    ready: function () {
      setTimeout(function () {
        if (initCallback) {
          initCallback({
            sessionId: 'preview',
            settings: null,
            display: {
              id: 1,
              label: 'Preview',
              bounds: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
              scaleFactor: 1,
              rotation: 0
            }
          });
        }
      }, 30);
    },
    log: function () {},
    setPassthrough: function () {},
    capture: function () {},
    exit: function () {},
    onInit: function (callback) {
      initCallback = callback;
    },
    onRestore: function () {},
    onCapture: function () {},
    onPassthrough: function () {}
  };
})();
