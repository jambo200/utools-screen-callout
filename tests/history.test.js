const test = require('node:test');
const assert = require('node:assert');
const { createHistory } = require('../src/shared/history.js');

test('初始状态不能撤销或重做', () => {
  const stack = createHistory(10);
  stack.reset(['a']);
  assert.strictEqual(stack.undo(), null);
  assert.strictEqual(stack.redo(), null);
  assert.strictEqual(stack.canUndo(), false);
  assert.strictEqual(stack.canRedo(), false);
});

test('撤销重做按顺序返回快照', () => {
  const stack = createHistory(10);
  stack.reset([]);
  stack.push(['a']);
  stack.push(['a', 'b']);
  assert.deepStrictEqual(stack.undo(), ['a']);
  assert.deepStrictEqual(stack.undo(), []);
  assert.deepStrictEqual(stack.redo(), ['a']);
  assert.deepStrictEqual(stack.redo(), ['a', 'b']);
  assert.strictEqual(stack.redo(), null);
});

test('新操作会清空重做栈', () => {
  const stack = createHistory(10);
  stack.reset([]);
  stack.push(['a']);
  stack.push(['a', 'b']);
  stack.undo();
  stack.push(['c']);
  assert.strictEqual(stack.canRedo(), false);
  assert.deepStrictEqual(stack.undo(), ['a']);
  assert.deepStrictEqual(stack.redo(), ['c']);
});

test('超出容量时丢弃最旧快照', () => {
  const stack = createHistory(3);
  stack.reset([0]);
  stack.push([1]);
  stack.push([2]);
  stack.push([3]);
  assert.strictEqual(stack.size(), 3);
  assert.deepStrictEqual(stack.undo(), [2]);
  assert.deepStrictEqual(stack.undo(), [1]);
  assert.strictEqual(stack.canUndo(), false);
});
