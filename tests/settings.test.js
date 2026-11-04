const test = require('node:test');
const assert = require('node:assert');
const defaults = require('../src/shared/defaults.js');
const settings = require('../src/shared/settings.js');

test('mergeSettings 对空值返回完整默认配置', () => {
  const merged = settings.mergeSettings(null);
  assert.deepStrictEqual(merged, defaults.defaultSettings());
});

test('mergeSettings 不修改默认配置对象', () => {
  const before = JSON.stringify(defaults.DEFAULT_SETTINGS);
  settings.mergeSettings({ colors: { default: '#123456' }, toolOptions: { arrow: { width: 9 } } });
  assert.strictEqual(JSON.stringify(defaults.DEFAULT_SETTINGS), before);
});

test('非法工具与重复工具会被清理，缺失工具补回主选', () => {
  const merged = settings.mergeSettings({
    toolbar: { primary: ['arrow', 'arrow', 'nope'], secondary: [] }
  });
  const ids = merged.toolbar.primary.concat(merged.toolbar.secondary);
  assert.strictEqual(ids.length, defaults.toolIds().length);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(merged.toolbar.primary.includes('arrow'));
});

test('工具参数被收敛到合法区间', () => {
  const merged = settings.mergeSettings({
    toolOptions: {
      arrow: { width: 999, lineStyle: 'nope' },
      line: { width: -3 },
      pen: { width: 'x' },
      text: { fontSize: 9999 },
      serial: { fontSize: 1 },
      spotlight: { opacity: 100 },
      magnifier: { zoom: 0 }
    }
  });
  assert.strictEqual(merged.toolOptions.arrow.width, 60);
  assert.strictEqual(merged.toolOptions.arrow.lineStyle, 'solid');
  assert.strictEqual(merged.toolOptions.line.width, 1);
  assert.strictEqual(merged.toolOptions.pen.width, 4);
  assert.strictEqual(merged.toolOptions.text.fontSize, 160);
  assert.strictEqual(merged.toolOptions.serial.fontSize, 8);
  assert.strictEqual(merged.toolOptions.spotlight.opacity, 0.9);
  assert.strictEqual(merged.toolOptions.magnifier.zoom, 1);
});

test('旧版 widths / sizes 配置迁移到工具参数', () => {
  const merged = settings.mergeSettings({
    widths: { arrow: 7, spotlightStroke: 4, eraser: 20 },
    sizes: { text: 36, serial: 44 }
  });
  assert.strictEqual(merged.toolOptions.arrow.width, 7);
  assert.strictEqual(merged.toolOptions.spotlight.strokeWidth, 4);
  assert.strictEqual(merged.toolOptions.eraser.width, 20);
  assert.strictEqual(merged.toolOptions.text.fontSize, 36);
  assert.strictEqual(merged.toolOptions.serial.fontSize, 44);
});

test('序号格式支持数字、字母与罗马数字', () => {
  assert.strictEqual(defaults.formatSerial(1, 'number'), '1');
  assert.strictEqual(defaults.formatSerial(26, 'letter'), 'Z');
  assert.strictEqual(defaults.formatSerial(27, 'letter'), 'AA');
  assert.strictEqual(defaults.formatSerial(9, 'roman'), 'IX');
  assert.strictEqual(defaults.formatSerial(44, 'roman'), 'XLIV');
  assert.strictEqual(defaults.formatSerial(0, 'number'), '1');
});

test('色板清洗：非法色值、重复色、数量上限', () => {
  const merged = settings.mergeSettings({
    colors: { palette: ['#ff0000', '#FF0000', 'red', '#00ff00'] }
  });
  assert.deepStrictEqual(merged.colors.palette, ['#ff0000', '#00ff00']);
  const fallback = settings.mergeSettings({ colors: { palette: ['oops'] } });
  assert.deepStrictEqual(fallback.colors.palette, defaults.PALETTE);
  const many = settings.mergeSettings({
    colors: {
      palette: Array.from({ length: 20 }, (_, i) => '#' + String(i + 1).padStart(6, '0'))
    }
  });
  assert.ok(many.colors.palette.length <= 12);
});

test('默认颜色不在色板时保持色板不变', () => {
  const merged = settings.mergeSettings({
    colors: { default: '#abcdef', palette: ['#111111', '#222222'] }
  });
  assert.deepStrictEqual(merged.colors.palette, ['#111111', '#222222']);
  assert.strictEqual(merged.colors.default, '#abcdef');
});

test('快捷键归一化与回退', () => {
  assert.strictEqual(settings.normalizeShortcut('ctrl+z', 'F9'), 'Ctrl+Z');
  assert.strictEqual(settings.normalizeShortcut('Shift+Digit1', 'F9'), 'F9');
  assert.strictEqual(settings.normalizeShortcut('esc', 'F9'), 'Escape');
  assert.strictEqual(settings.normalizeShortcut('Ctrl+Alt+F12', 'F9'), 'Ctrl+Alt+F12');
  assert.strictEqual(settings.normalizeShortcut('F13', 'F9'), 'F9');
  assert.strictEqual(settings.normalizeShortcut('Ctrl+Ctrl+Z', 'F9'), 'F9');
  assert.strictEqual(settings.normalizeShortcut('', 'F9'), 'F9');
});

test('parseShortcut 解析修饰键与主键', () => {
  assert.deepStrictEqual(settings.parseShortcut('Ctrl+Shift+Z'), {
    ctrl: true,
    alt: false,
    shift: true,
    meta: false,
    key: 'Z'
  });
  assert.deepStrictEqual(settings.parseShortcut('F10'), {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: 'F10'
  });
  assert.strictEqual(settings.parseShortcut('Nope'), null);
});

test('moveTool 在区域间移动且不丢失其他工具', () => {
  const merged = settings.mergeSettings(null);
  const moved = settings.moveTool(merged, 'magnifier', 'secondary');
  assert.ok(moved.toolbar.secondary.includes('magnifier'));
  assert.ok(!moved.toolbar.primary.includes('magnifier'));
  const ids = moved.toolbar.primary.concat(moved.toolbar.secondary);
  assert.strictEqual(ids.length, defaults.toolIds().length);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('reorderTool 只在本区域内调整顺序', () => {
  const merged = settings.mergeSettings(null);
  const arrowIndex = merged.toolbar.primary.indexOf('arrow');
  const moved = settings.reorderTool(merged, 'arrow', 1);
  assert.strictEqual(moved.toolbar.primary.indexOf('arrow'), arrowIndex + 1);
  const atStart = settings.reorderTool(moved, 'arrow', -5);
  assert.strictEqual(atStart.toolbar.primary.indexOf('arrow'), 0);
  const atEnd = settings.reorderTool(atStart, 'arrow', 20);
  assert.strictEqual(atEnd.toolbar.primary[atEnd.toolbar.primary.length - 1], 'arrow');
});

test('insertTool 支持跨区拖拽插入且不丢失工具', () => {
  const merged = settings.mergeSettings(null);
  const moved = settings.insertTool(merged, 'eraser', 'primary', 0);
  assert.strictEqual(moved.toolbar.primary[0], 'eraser');
  assert.ok(!moved.toolbar.secondary.includes('eraser'));
  const ids = moved.toolbar.primary.concat(moved.toolbar.secondary);
  assert.strictEqual(ids.length, defaults.toolIds().length);
  assert.strictEqual(new Set(ids).size, ids.length);
  const clamped = settings.insertTool(merged, 'arrow', 'secondary', 999);
  assert.strictEqual(clamped.toolbar.secondary[clamped.toolbar.secondary.length - 1], 'arrow');
});

test('色板增删改保持合法', () => {
  const merged = settings.mergeSettings(null);
  const added = settings.addPaletteColor(merged, '#123456');
  assert.ok(added.colors.palette.includes('#123456'));
  const duplicated = settings.addPaletteColor(added, '#123456');
  assert.strictEqual(duplicated.colors.palette.filter((c) => c === '#123456').length, 1);
  const invalid = settings.addPaletteColor(added, 'blue');
  assert.deepStrictEqual(invalid.colors.palette, added.colors.palette);
  const removed = settings.removePaletteColor(added, '#123456');
  assert.ok(!removed.colors.palette.includes('#123456'));
  const changed = settings.setPaletteColor(merged, 0, '#00AAFF');
  assert.strictEqual(changed.colors.palette[0], '#00aaff');
  const tooFew = settings.removePaletteColor(
    settings.mergeSettings({ colors: { palette: ['#111111', '#222222'] } }),
    '#111111'
  );
  assert.strictEqual(tooFew.colors.palette.length, 2);
});

test('会话配置清洗：非法屏幕回退 cursor，布尔项保持默认', () => {
  const merged = settings.mergeSettings({
    session: { display: { x: 1 }, clearOnExit: 'yes', hideToolbarOnStart: 1 }
  });
  assert.strictEqual(merged.session.display, 'cursor');
  assert.strictEqual(merged.session.clearOnExit, true);
  assert.strictEqual(merged.session.hideToolbarOnStart, false);
  const byId = settings.mergeSettings({ session: { display: 12345 } });
  assert.strictEqual(byId.session.display, 12345);
});

test('默认激活工具只接受 none 或合法工具 id', () => {
  assert.strictEqual(settings.mergeSettings(null).session.activationTool, 'none');
  assert.strictEqual(
    settings.mergeSettings({ session: { activationTool: 'text' } }).session.activationTool,
    'text'
  );
  assert.strictEqual(
    settings.mergeSettings({ session: { activationTool: 'not-a-tool' } }).session.activationTool,
    'none'
  );
  assert.strictEqual(
    settings.mergeSettings({ session: { activationTool: 'none' } }).session.activationTool,
    'none'
  );
});

test('重置全部工具参数恢复默认值并保留其他配置', () => {
  const merged = settings.mergeSettings({
    toolOptions: { arrow: { width: 9 }, text: { fontSize: 40 } },
    colors: { default: '#123456' }
  });
  const reset = settings.resetAllToolOptions(merged);
  assert.deepStrictEqual(reset.toolOptions, defaults.defaultSettings().toolOptions);
  assert.strictEqual(reset.colors.default, '#123456');
  assert.deepStrictEqual(reset.toolbar, merged.toolbar);
  assert.strictEqual(merged.toolOptions.arrow.width, 9, '不得修改传入配置');
});

test('重置工具参数只影响指定工具', () => {
  const merged = settings.mergeSettings({
    toolOptions: { arrow: { width: 9, lineStyle: 'dashed' }, pen: { width: 11 } }
  });
  const reset = settings.resetToolOptions(merged, 'arrow');
  assert.deepStrictEqual(reset.toolOptions.arrow, defaults.defaultToolOptions('arrow'));
  assert.strictEqual(reset.toolOptions.pen.width, 11);
  assert.strictEqual(merged.toolOptions.arrow.width, 9, '不得修改传入配置');
  const invalid = settings.resetToolOptions(merged, 'nope');
  assert.deepStrictEqual(invalid.toolOptions, merged.toolOptions);
});
