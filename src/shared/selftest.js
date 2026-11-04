/**
 * 纯逻辑自检：配置页「运行自检」与 Node 测试共用同一套断言
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./geometry.js'),
      require('./history.js'),
      require('./settings.js'),
      require('./defaults.js')
    );
  } else {
    root.SC = root.SC || {};
    root.SC.selftest = factory(root.SC.geometry, root.SC.history, root.SC.settings, root.SC.defaults);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geometry, history, settings, defaults) {
  'use strict';

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function run() {
    var results = [];

    function check(name, fn) {
      try {
        fn();
        results.push({ name: name, ok: true });
      } catch (err) {
        results.push({ name: name, ok: false, message: err.message });
      }
    }

    check('反向拖拽的矩形会被归一化', function () {
      var rect = geometry.normalizeRect(200, 160, 100, 80);
      assert(rect.x === 100 && rect.y === 80 && rect.w === 100 && rect.h === 80, JSON.stringify(rect));
    });

    check('矩形命中测试包含边缘外扩', function () {
      assert(geometry.rectContains({ x: 10, y: 10, w: 100, h: 50 }, { x: 105, y: 30 }), '右边缘内应命中');
      assert(!geometry.rectContains({ x: 10, y: 10, w: 100, h: 50 }, { x: 200, y: 30 }), '远处不应命中');
    });

    check('线段命中按容差判断', function () {
      var shape = {
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        width: 4,
        bbox: { x: 0, y: -5, w: 100, h: 10 }
      };
      assert(geometry.shapeHit(shape, { x: 50, y: 3 }), '线段附近应命中');
      assert(!geometry.shapeHit(shape, { x: 50, y: 40 }), '远处不应命中');
    });

    check('椭圆命中不落在包围盒四角', function () {
      var shape = {
        type: 'ellipse',
        x: 0,
        y: 0,
        w: 100,
        h: 60,
        width: 2,
        bbox: { x: 0, y: 0, w: 100, h: 60 }
      };
      assert(geometry.shapeHit(shape, { x: 50, y: 30 }), '中心应命中');
      assert(!geometry.shapeHit(shape, { x: 2, y: 2 }), '左上角不应命中');
    });

    check('放大镜镜片始终落在可视区域内', function () {
      var view = { w: 1280, h: 720 };
      var lens = geometry.magnifierLensRect({ x: 1100, y: 600, w: 160, h: 100 }, view, 3);
      assert(lens.x >= 8 && lens.y >= 8, '镜片左上越界: ' + JSON.stringify(lens));
      assert(lens.x + lens.w <= view.w - 8, '镜片右侧越界: ' + JSON.stringify(lens));
      assert(lens.y + lens.h <= view.h - 8, '镜片底部越界: ' + JSON.stringify(lens));
    });

    check('裁剪换算为整数且不越界', function () {
      var crop = geometry.cropRectForDisplay(
        { x: 100, y: 100, w: 300, h: 200 },
        2560,
        1440,
        1280,
        720
      );
      assert(crop.width > 0 && crop.height > 0, '裁剪尺寸必须为正');
      assert(crop.x % 1 === 0 && crop.y % 1 === 0, '裁剪坐标必须为整数');
      assert(crop.x + crop.width <= 2560 && crop.y + crop.height <= 1440, '裁剪越界');
    });

    check('撤销/重做顺序正确且新操作会清空重做', function () {
      var stack = history.createHistory(10);
      stack.reset(['a']);
      stack.push(['b']);
      stack.push(['c']);
      assert(stack.undo().join('') === 'b', '第一次撤销应回到 b');
      assert(stack.undo().join('') === 'a', '第二次撤销应回到 a');
      assert(stack.undo() === null, '栈底继续撤销应返回 null');
      assert(stack.redo().join('') === 'b', '重做应回到 b');
      stack.push(['d']);
      assert(!stack.canRedo(), '新操作后不应还能重做');
    });

    check('配置缺省时补全默认值', function () {
      var merged = settings.mergeSettings(null);
      assert(merged.toolbar.primary.length > 0, '默认主选工具栏不能为空');
      assert(merged.colors.palette.length >= 2, '默认色板不能为空');
      assert(merged.shortcuts.exit === 'Escape', '默认退出键应保留');
    });

    check('非法配置被回退而不是崩溃', function () {
      var merged = settings.mergeSettings({
        toolbar: { primary: ['arrow', 'not-a-tool', 'arrow'], secondary: ['text'] },
        toolOptions: { arrow: { width: 999, lineStyle: 'nope' }, pen: { width: 'abc' } },
        colors: { palette: ['oops'], default: 'red' },
        shortcuts: { exit: 'NotAKey' },
        session: { display: {} }
      });
      var ids = merged.toolbar.primary.concat(merged.toolbar.secondary);
      defaults.toolIds().forEach(function (id) {
        assert(ids.indexOf(id) !== -1, '工具缺失: ' + id);
      });
      assert(merged.toolbar.primary.filter(function (id) { return id === 'arrow'; }).length === 1, '工具重复');
      assert(merged.toolOptions.arrow.width <= 60, '线宽应被收敛');
      assert(merged.toolOptions.arrow.lineStyle === 'solid', '非法线型应回退');
      assert(merged.colors.default === '#ff3b30', '非法颜色应回退默认');
      assert(merged.shortcuts.exit === 'Escape', '非法快捷键应回退默认');
      assert(merged.session.display === 'cursor', '非法屏幕设置应回退');
    });

    check('序号支持数字、字母与罗马数字', function () {
      assert(defaults.formatSerial(1, 'number') === '1', '数字序号');
      assert(defaults.formatSerial(27, 'letter') === 'AA', '字母序号');
      assert(defaults.formatSerial(9, 'roman') === 'IX', '罗马序号');
    });

    check('拖拽插入会保留全部工具且不重复', function () {
      var merged = settings.mergeSettings(null);
      var moved = settings.insertTool(merged, 'eraser', 'primary', 0);
      assert(moved.toolbar.primary[0] === 'eraser', '插入位置不正确');
      var ids = moved.toolbar.primary.concat(moved.toolbar.secondary);
      assert(ids.length === defaults.toolIds().length, '工具数量不符');
      assert(new Set(ids).size === ids.length, '工具重复');
    });

    check('工具栏始终包含全部工具且不重复', function () {
      var merged = settings.mergeSettings({ toolbar: { primary: ['select'], secondary: [] } });
      var ids = merged.toolbar.primary.concat(merged.toolbar.secondary);
      assert(ids.length === defaults.toolIds().length, '工具数量不符: ' + ids.length);
      assert(new Set(ids).size === ids.length, '工具出现重复');
    });

    check('快捷键解析正确处理修饰键', function () {
      var parsed = settings.parseShortcut('ctrl+shift+z');
      assert(parsed && parsed.ctrl && parsed.shift && parsed.key === 'Z', JSON.stringify(parsed));
      assert(settings.normalizeShortcut('NotAKey', 'F9') === 'F9', '非法快捷键应回退');
    });

    var failed = results.filter(function (item) {
      return !item.ok;
    }).length;

    return {
      passed: results.length - failed,
      failed: failed,
      results: results
    };
  }

  return { run: run };
});
