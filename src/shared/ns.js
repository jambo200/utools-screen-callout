/**
 * 共享命名空间初始化：其他模块会把能力挂到 window.SC / window.OC 上
 */
(function (root) {
  root.SC = root.SC || {};
  root.OC = root.OC || {};
})(typeof globalThis !== 'undefined' ? globalThis : this);
