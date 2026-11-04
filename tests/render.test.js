const test = require('node:test');
const assert = require('node:assert');

global.window = {};
require('../src/overlay/render.js');

function mockContext() {
  const rects = [];
  const state = { fills: 0 };
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    rect(x, y, w, h) {
      rects.push([x, y, w, h]);
    },
    fill() {
      state.fills += 1;
    },
    strokeRect() {},
    setLineDash() {},
    clearRect() {},
    measureText() {
      return { width: 10 };
    }
  };
  return { ctx, rects, state };
}

test('聚光灯只绘制最后一层，避免叠加变暗', () => {
  const { ctx, rects, state } = mockContext();
  const shapes = [
    { type: 'spotlight', x: 10, y: 10, w: 50, h: 50, opacity: 0.4, stroke: false },
    { type: 'spotlight', x: 100, y: 100, w: 60, h: 60, opacity: 0.4, stroke: false }
  ];
  window.OC.render.draw(ctx, { width: 800, height: 600, shapes });

  assert.strictEqual(state.fills, 1, '两层聚光灯只应产生一次遮罩填充');
  assert.deepStrictEqual(
    rects,
    [
      [0, 0, 800, 600],
      [100, 100, 60, 60]
    ],
    '应只使用最后一层聚光灯的洞口'
  );
});
