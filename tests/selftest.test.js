const test = require('node:test');
const assert = require('node:assert');
const selftest = require('../src/shared/selftest.js');

test('内置自检全部通过', () => {
  const result = selftest.run();
  const failures = result.results.filter((item) => !item.ok);
  assert.strictEqual(
    result.failed,
    0,
    '自检失败: ' + failures.map((item) => item.name + ' -> ' + item.message).join('; ')
  );
  assert.ok(result.passed >= 10, '自检用例数量异常: ' + result.passed);
});
