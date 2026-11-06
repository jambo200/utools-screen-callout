/**
 * uTools 运行时兼容层
 *
 * 部分 API 仅 uTools 8.0 及以上提供（getPluginLocalDataPath、captureDisplay、getCmdHotKey 等），
 * 旧版本上直接调用会抛 "xxx is not a function" 并导致插件启动失败，因此统一在此做能力检测与降级。
 * 纯函数，可在浏览器与 Node 中复用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SC = root.SC || {};
    root.SC.compat = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 主界面桥接实际依赖的 uTools API，用于启动时报告缺失项 */
  var REQUIRED_APIS = [
    'createBrowserWindow',
    'getAllDisplays',
    'getPrimaryDisplay',
    'getDisplayNearestPoint',
    'getCursorScreenPoint',
    'getPath',
    'showSaveDialog',
    'shellShowItemInFolder',
    'outPlugin',
    'captureDisplay',
    'getPluginLocalDataPath',
    'getCmdHotKey',
    'redirectHotKeySetting'
  ];

  function hasApi(api, name) {
    return !!api && typeof api[name] === 'function';
  }

  function missingApis(api, names) {
    return (names || REQUIRED_APIS).filter(function (name) {
      return !hasApi(api, name);
    });
  }

  /** 放大镜依赖 utools.captureDisplay，仅 uTools 8.0+ 提供 */
  function supportsCaptureDisplay(api) {
    return hasApi(api, 'captureDisplay');
  }

  /**
   * 插件本地数据目录
   * 优先 utools.getPluginLocalDataPath()；旧版本退回到用户数据目录下的固定子目录。
   * 两者都不可用时返回 null，调用方需容忍无文件日志。
   */
  function dataDir(api, join) {
    if (hasApi(api, 'getPluginLocalDataPath')) {
      try {
        return api.getPluginLocalDataPath();
      } catch (err) {
        // 继续走降级路径
      }
    }
    if (hasApi(api, 'getPath')) {
      try {
        return join(api.getPath('userData'), 'plugin-data', 'screen-callout');
      } catch (err) {
        // 无可用目录
      }
    }
    return null;
  }

  /** uTools 版本号；API 缺失时返回空字符串 */
  function appVersion(api) {
    if (!hasApi(api, 'getAppVersion')) {
      return '';
    }
    try {
      return String(api.getAppVersion() || '');
    } catch (err) {
      return '';
    }
  }

  return {
    REQUIRED_APIS: REQUIRED_APIS,
    hasApi: hasApi,
    missingApis: missingApis,
    supportsCaptureDisplay: supportsCaptureDisplay,
    dataDir: dataDir,
    appVersion: appVersion
  };
});
