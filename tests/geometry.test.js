const test = require('node:test');
const assert = require('node:assert');
const geometry = require('../src/shared/geometry.js');

test('normalizeRect 支持四个方向拖拽', () => {
  assert.deepStrictEqual(geometry.normalizeRect(100, 100, 200, 180), { x: 100, y: 100, w: 100, h: 80 });
  assert.deepStrictEqual(geometry.normalizeRect(200, 180, 100, 100), { x: 100, y: 100, w: 100, h: 80 });
  assert.deepStrictEqual(geometry.normalizeRect(100, 180, 200, 100), { x: 100, y: 100, w: 100, h: 80 });
});

test('rectContains 支持外扩容差', () => {
  const rect = { x: 10, y: 10, w: 100, h: 50 };
  assert.ok(geometry.rectContains(rect, { x: 110, y: 60 }));
  assert.ok(geometry.rectContains(rect, { x: 6, y: 60 }, 5));
  assert.ok(!geometry.rectContains(rect, { x: 4, y: 60 }, 5));
  assert.ok(!geometry.rectContains(rect, { x: 0, y: 0 }));
});

test('ellipseContains 排除包围盒四角', () => {
  const rect = { x: 0, y: 0, w: 100, h: 60 };
  assert.ok(geometry.ellipseContains(rect, { x: 50, y: 30 }));
  assert.ok(!geometry.ellipseContains(rect, { x: 1, y: 1 }));
});

test('distancePointToSegment 计算垂距与端点距', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  assert.strictEqual(geometry.distancePointToSegment({ x: 50, y: 10 }, start, end), 10);
  assert.strictEqual(geometry.distancePointToSegment({ x: -30, y: 0 }, start, end), 30);
  assert.strictEqual(geometry.distancePointToSegment({ x: 0, y: 0 }, start, start), 0);
});

test('polylineHit 命中折线与单点', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 50, y: 50 },
    { x: 100, y: 0 }
  ];
  assert.ok(geometry.polylineHit(points, { x: 25, y: 26 }, 3));
  assert.ok(!geometry.polylineHit(points, { x: 25, y: 80 }, 3));
  assert.ok(geometry.polylineHit([{ x: 5, y: 5 }], { x: 6, y: 5 }, 2));
  assert.ok(!geometry.polylineHit([], { x: 0, y: 0 }, 5));
});

test('computeBBox 覆盖各图形类型', () => {
  assert.deepStrictEqual(geometry.computeBBox({ type: 'rect', x: 1, y: 2, w: 3, h: 4 }), {
    x: 1,
    y: 2,
    w: 3,
    h: 4
  });
  assert.deepStrictEqual(
    geometry.computeBBox({ type: 'magnifier', dst: { x: 10, y: 20, w: 30, h: 40 } }),
    { x: 10, y: 20, w: 30, h: 40 }
  );
  const arrowBox = geometry.computeBBox({
    type: 'arrow',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 50 },
    width: 4
  });
  assert.ok(arrowBox.x < 0 && arrowBox.y < 0 && arrowBox.w > 100 && arrowBox.h > 50);
  const serialBox = geometry.computeBBox({ type: 'serial', x: 100, y: 100, n: 1, fontSize: 40 });
  assert.strictEqual(serialBox.w, 60);
  assert.strictEqual(serialBox.x, 70);
});

test('shapeHit 按类型判断', () => {
  assert.ok(
    geometry.shapeHit({ type: 'rect', x: 0, y: 0, w: 100, h: 100, width: 3, bbox: { x: 0, y: 0, w: 100, h: 100 } }, { x: 50, y: 50 })
  );
  const line = {
    type: 'line',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    width: 4,
    bbox: { x: 0, y: -5, w: 100, h: 10 }
  };
  assert.ok(geometry.shapeHit(line, { x: 50, y: 2 }));
  assert.ok(!geometry.shapeHit(line, { x: 50, y: 20 }));
  const pen = {
    type: 'pen',
    points: [
      { x: 0, y: 0 },
      { x: 50, y: 50 }
    ],
    width: 6,
    bbox: { x: -5, y: -5, w: 60, h: 60 }
  };
  assert.ok(geometry.shapeHit(pen, { x: 25, y: 25 }));
  assert.ok(!geometry.shapeHit(pen, { x: 0, y: 60 }));
});

test('translateShape 平移所有坐标字段', () => {
  const moved = geometry.translateShape(
    {
      type: 'magnifier',
      x: 10,
      y: 10,
      bbox: { x: 10, y: 10, w: 20, h: 20 },
      src: { x: 1, y: 2, w: 3, h: 4 },
      dst: { x: 5, y: 6, w: 7, h: 8 }
    },
    5,
    -5
  );
  assert.strictEqual(moved.x, 15);
  assert.strictEqual(moved.y, 5);
  assert.strictEqual(moved.bbox.x, 15);
  assert.strictEqual(moved.src.x, 6);
  assert.strictEqual(moved.dst.y, 1);
  const original = { type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, width: 2 };
  const next = geometry.translateShape(original, 10, 10);
  assert.deepStrictEqual(next.start, { x: 10, y: 10 });
  assert.deepStrictEqual(original.start, { x: 0, y: 0 }, '不得修改原对象');
});

test('magnifierLensRect 靠右时翻到左侧且不越界', () => {
  const view = { w: 1280, h: 720 };
  const right = geometry.magnifierLensRect({ x: 900, y: 300, w: 200, h: 150 }, view, 2);
  assert.ok(right.x >= 8 && right.x + right.w <= view.w - 8);
  const bottom = geometry.magnifierLensRect({ x: 100, y: 650, w: 400, h: 300 }, view, 3);
  assert.ok(bottom.y >= 8 && bottom.y + bottom.h <= view.h - 8);
  assert.ok(bottom.w <= view.w * 0.9 + 0.001);
});

test('cropRectForDisplay 缩放正确、取整且不越界', () => {
  const crop = geometry.cropRectForDisplay({ x: 100, y: 100, w: 300, h: 200 }, 2560, 1440, 1280, 720);
  assert.deepStrictEqual(crop, { x: 200, y: 200, width: 600, height: 400 });
  const overflow = geometry.cropRectForDisplay({ x: 1200, y: 700, w: 400, h: 300 }, 2560, 1440, 1280, 720);
  assert.ok(overflow.x + overflow.width <= 2560);
  assert.ok(overflow.y + overflow.height <= 1440);
  assert.ok(overflow.width >= 1 && overflow.height >= 1);
});
