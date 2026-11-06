/**
 * 运行时兼容层：确保旧版 uTools 缺少 8.0 新增 API 时不会导致插件启动失败
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const compat = require('../src/shared/compat.js');

const ROOT = path.join(__dirname, '..');

function fakeApi(overrides) {
  return Object.assign({}, overrides);
}

test('hasApi 只认函数', () => {
  assert.strictEqual(compat.hasApi(fakeApi({ a: function () {} }), 'a'), true);
  assert.strictEqual(compat.hasApi(fakeApi({ a: 'x' }), 'a'), false);
  assert.strictEqual(compat.hasApi(fakeApi({}), 'a'), false);
  assert.strictEqual(compat.hasApi(null, 'a'), false);
});

test('missingApis 列出缺失的 API', () => {
  const api = fakeApi({ getPath: function () {}, captureDisplay: function () {} });
  const missing = compat.missingApis(api, ['getPath', 'captureDisplay', 'getPluginLocalDataPath']);
  assert.deepStrictEqual(missing, ['getPluginLocalDataPath']);
});

test('REQUIRED_APIS 覆盖 8.0 新增 API', () => {
  for (const name of ['captureDisplay', 'getPluginLocalDataPath', 'getCmdHotKey']) {
    assert.ok(compat.REQUIRED_APIS.indexOf(name) !== -1, 'REQUIRED_APIS 缺少 ' + name);
  }
});

test('dataDir 优先使用 getPluginLocalDataPath', () => {
  const api = fakeApi({
    getPluginLocalDataPath: function () {
      return 'C:/data/plugin';
    },
    getPath: function () {
      return 'C:/userData';
    }
  });
  assert.strictEqual(compat.dataDir(api, path.join), 'C:/data/plugin');
});

test('dataDir 在旧版 uTools 上退回到 userData 子目录', () => {
  const api = fakeApi({
    getPath: function (name) {
      assert.strictEqual(name, 'userData');
      return 'C:/userData';
    }
  });
  assert.strictEqual(compat.dataDir(api, path.join), path.join('C:/userData', 'plugin-data', 'screen-callout'));
});

test('dataDir 在 getPluginLocalDataPath 抛错时降级', () => {
  const api = fakeApi({
    getPluginLocalDataPath: function () {
      throw new Error('boom');
    },
    getPath: function () {
      return 'C:/userData';
    }
  });
  assert.strictEqual(compat.dataDir(api, path.join), path.join('C:/userData', 'plugin-data', 'screen-callout'));
});

test('dataDir 在没有任何目录 API 时返回 null', () => {
  assert.strictEqual(compat.dataDir(fakeApi({}), path.join), null);
  assert.strictEqual(compat.dataDir(null, path.join), null);
});

test('supportsCaptureDisplay 用于放大镜降级判断', () => {
  assert.strictEqual(compat.supportsCaptureDisplay(fakeApi({ captureDisplay: function () {} })), true);
  assert.strictEqual(compat.supportsCaptureDisplay(fakeApi({})), false);
});

test('appVersion 缺失或抛错时返回空字符串', () => {
  assert.strictEqual(compat.appVersion(fakeApi({})), '');
  assert.strictEqual(
    compat.appVersion(
      fakeApi({
        getAppVersion: function () {
          throw new Error('boom');
        }
      })
    ),
    ''
  );
  assert.strictEqual(compat.appVersion(fakeApi({ getAppVersion: function () { return '7.3.2'; } })), '7.3.2');
});

test('preload 不再直接调用 uTools 8.0 新增 API', () => {
  const source = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  assert.ok(!/utools\.getPluginLocalDataPath\s*\(/.test(source), 'getPluginLocalDataPath 必须经 compat 调用');
  assert.ok(!/utools\.getPluginTempPath\s*\(/.test(source), 'getPluginTempPath 必须经 compat 调用');
  assert.ok(/compat\.dataDir\(utools/.test(source), '日志目录应使用 compat.dataDir');
  assert.ok(/compat\.supportsCaptureDisplay\(utools\)/.test(source), '放大镜应先做能力检测');
});

test('日志路径在无数据目录时返回 null 而非抛错', () => {
  const source = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  assert.ok(/const dir = compat\.dataDir\(utools, path\.join\);/.test(source));
  assert.ok(/return dir \? path\.join\(dir, 'spike\.log'\) : null;/.test(source));
});
