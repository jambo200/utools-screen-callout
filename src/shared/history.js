/**
 * 快照式撤销/重做
 * 每次提交把完整标注快照压栈，撤销/重做返回对应快照
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SC = root.SC || {};
    root.SC.history = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createHistory(limit) {
    var capacity = limit && limit > 1 ? limit : 60;
    var entries = [];
    var index = -1;

    function reset(snapshot) {
      entries = [snapshot];
      index = 0;
    }

    function push(snapshot) {
      entries = entries.slice(0, index + 1);
      entries.push(snapshot);
      if (entries.length > capacity) {
        entries.shift();
      }
      index = entries.length - 1;
    }

    function undo() {
      if (index <= 0) {
        return null;
      }
      index -= 1;
      return entries[index];
    }

    function redo() {
      if (index >= entries.length - 1) {
        return null;
      }
      index += 1;
      return entries[index];
    }

    return {
      reset: reset,
      push: push,
      undo: undo,
      redo: redo,
      canUndo: function () {
        return index > 0;
      },
      canRedo: function () {
        return index < entries.length - 1;
      },
      size: function () {
        return entries.length;
      },
      position: function () {
        return index;
      }
    };
  }

  return { createHistory: createHistory };
});
