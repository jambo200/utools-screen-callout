/**
 * 静态一致性检查：不依赖 uTools 运行时，验证配置与文件引用
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin.json'), 'utf8'));

function exist(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('plugin.json 基础字段合法', () => {
  assert.ok(plugin.main && plugin.main.endsWith('.html'), 'main 必须是 html');
  assert.ok(plugin.logo, '必须配置 logo');
  assert.ok(Array.isArray(plugin.features) && plugin.features.length >= 1, 'features 至少 1 个');
  const codes = plugin.features.map((feature) => feature.code);
  assert.deepStrictEqual([...new Set(codes)], codes, 'feature.code 不能重复');
});

test('plugin.json 引用的文件存在', () => {
  assert.ok(exist(plugin.main), 'main 文件不存在: ' + plugin.main);
  assert.ok(exist(plugin.logo), 'logo 文件不存在: ' + plugin.logo);
  if (plugin.preload) {
    assert.ok(exist(plugin.preload), 'preload 文件不存在: ' + plugin.preload);
  }
});

test('每个 feature 都有指令，且至少一个功能指令', () => {
  let textCmdCount = 0;
  for (const feature of plugin.features) {
    assert.ok(Array.isArray(feature.cmds) && feature.cmds.length > 0, feature.code + ' 缺少 cmds');
    for (const cmd of feature.cmds) {
      if (typeof cmd === 'string') {
        textCmdCount += 1;
        assert.ok(cmd.trim().length > 0, '指令不能为空');
      } else {
        assert.ok(cmd && cmd.type && cmd.label, feature.code + ' 的匹配指令缺少 type/label');
      }
    }
  }
  assert.ok(textCmdCount >= 1, '至少需要一个功能指令');
});

test('plugin.json 未声明 tools（未实现 AI 工具能力）', () => {
  assert.strictEqual(plugin.tools, undefined, '未实现 tools 时不得声明');
});

test('HTML 引用的本地脚本与样式都存在', () => {
  const pages = ['index.html', 'overlay.html', 'dev/spike.html', 'dev/preview.html'].filter(exist);
  for (const page of pages) {
    const html = read(page);
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const ref of refs) {
      if (/^(https?:|data:|#)/.test(ref)) {
        continue;
      }
      const cleanRef = ref.split(/[?#]/)[0];
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page), cleanRef));
      assert.ok(exist(resolved), page + ' 引用了不存在的文件: ' + ref);
    }
  }
});

test('覆盖层页面脚本不得直接调用 utools.*（必须走 bridge）', () => {
  const overlayScripts = [
    'dev/spike.js',
    'dev/preview.js',
    'dev/mock-bridge.js',
    'src/overlay/overlay.js',
    'src/overlay/render.js',
    'src/overlay/toolbar.js',
    'src/overlay/icons.js'
  ].filter(exist);
  for (const script of overlayScripts) {
    const source = read(script);
    assert.ok(!/\butools\s*\./.test(source), script + ' 直接使用了 utools.*，必须通过预加载桥接');
  }
});

test('preload 暴露统一命名空间且不直接挂载 Node 对象', () => {
  const source = read('preload.js');
  assert.ok(/window\.services\s*=/.test(source), 'preload 应暴露 window.services');
  assert.ok(!/window\.fs\s*=/.test(source), '不得把 fs 挂到 window');
  assert.ok(!/window\.ipcRenderer\s*=/.test(source), '不得把 ipcRenderer 挂到 window');
});
