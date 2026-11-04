/**
 * 配置清洗、合并与编辑（纯函数）
 * 任何来源的配置都必须经过 mergeSettings，保证结构完整、取值合法
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./defaults.js'));
  } else {
    root.SC = root.SC || {};
    root.SC.settings = factory(root.SC.defaults);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (defaults) {
  'use strict';

  var TOOL_IDS = defaults.toolIds();
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var KEY_NAME = /^(Escape|Backspace|Delete|Space|Tab|Enter|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-2])|[A-Z0-9])$/;
  var MODIFIERS = { ctrl: 'Ctrl', control: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Meta' };
  var KEY_CANONICAL = {
    esc: 'Escape',
    escape: 'Escape',
    backspace: 'Backspace',
    delete: 'Delete',
    del: 'Delete',
    space: 'Space',
    spacebar: 'Space',
    tab: 'Tab',
    enter: 'Enter',
    return: 'Enter',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight'
  };

  function isHex(value) {
    return typeof value === 'string' && HEX.test(value);
  }

  function clampNumber(value, min, max, fallback) {
    var number = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function isToolId(value) {
    return TOOL_IDS.indexOf(value) !== -1;
  }

  function isOneOf(value, list) {
    return list.some(function (item) {
      return item.id === value;
    });
  }

  function sanitizeToolbar(raw) {
    if (!raw || (!Array.isArray(raw.primary) && !Array.isArray(raw.secondary))) {
      return defaults.clone(defaults.DEFAULT_SETTINGS.toolbar);
    }
    var primary = [];
    var secondary = [];

    function add(list, id) {
      if (!isToolId(id)) {
        return;
      }
      if (primary.indexOf(id) !== -1 || secondary.indexOf(id) !== -1) {
        return;
      }
      list.push(id);
    }

    if (Array.isArray(raw.primary)) {
      raw.primary.forEach(function (id) {
        add(primary, id);
      });
    }
    if (Array.isArray(raw.secondary)) {
      raw.secondary.forEach(function (id) {
        add(secondary, id);
      });
    }
    TOOL_IDS.forEach(function (id) {
      if (primary.indexOf(id) === -1 && secondary.indexOf(id) === -1) {
        primary.push(id);
      }
    });

    return { primary: primary, secondary: secondary };
  }

  function normalizeKeyName(rawKey) {
    var key = String(rawKey).trim();
    var lower = key.toLowerCase();
    if (KEY_CANONICAL[lower]) {
      return KEY_CANONICAL[lower];
    }
    if (/^f\d{1,2}$/.test(lower)) {
      return lower.toUpperCase();
    }
    if (/^[a-z0-9]$/.test(lower)) {
      return lower.toUpperCase();
    }
    return key;
  }

  function normalizeShortcut(value, fallback) {
    if (typeof value !== 'string') {
      return fallback;
    }
    var parts = value
      .split('+')
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
    if (!parts.length) {
      return fallback;
    }
    var key = normalizeKeyName(parts.pop());
    if (!KEY_NAME.test(key)) {
      return fallback;
    }
    var modifiers = [];
    for (var i = 0; i < parts.length; i++) {
      var modifier = MODIFIERS[parts[i].toLowerCase()];
      if (!modifier || modifiers.indexOf(modifier) !== -1) {
        return fallback;
      }
      modifiers.push(modifier);
    }
    var order = ['Ctrl', 'Alt', 'Shift', 'Meta'].filter(function (name) {
      return modifiers.indexOf(name) !== -1;
    });
    return order.concat([key]).join('+');
  }

  function parseShortcut(value) {
    var normalized = normalizeShortcut(value, null);
    if (!normalized) {
      return null;
    }
    var parts = normalized.split('+');
    var key = parts.pop();
    return {
      ctrl: parts.indexOf('Ctrl') !== -1,
      alt: parts.indexOf('Alt') !== -1,
      shift: parts.indexOf('Shift') !== -1,
      meta: parts.indexOf('Meta') !== -1,
      key: key
    };
  }

  function sanitizePalette(raw) {
    var list = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (color) {
        if (isHex(color) && list.indexOf(color.toLowerCase()) === -1 && list.length < 12) {
          list.push(color.toLowerCase());
        }
      });
    }
    if (list.length < 2) {
      return defaults.PALETTE.slice();
    }
    return list;
  }

  function sanitizeOptionValue(key, value, fallback) {
    switch (key) {
      case 'width':
        return Math.round(clampNumber(value, 1, 60, fallback));
      case 'strokeWidth':
        return Math.round(clampNumber(value, 0, 20, fallback));
      case 'fontSize':
        return Math.round(clampNumber(value, 8, 160, fallback));
      case 'opacity':
        return clampNumber(value, 0.1, 0.9, fallback);
      case 'zoom':
        return clampNumber(value, 1, 8, fallback);
      case 'borderWidth':
        return Math.round(clampNumber(value, 1, 12, fallback));
      case 'lineStyle':
        return isOneOf(value, defaults.LINE_STYLES) ? value : fallback;
      case 'head':
        return isOneOf(value, defaults.ARROW_HEADS) ? value : fallback;
      case 'serialType':
        return isOneOf(value, defaults.SERIAL_TYPES) ? value : fallback;
      case 'fontFamily':
        return isOneOf(value, defaults.FONT_FAMILIES) ? value : fallback;
      case 'fill':
      case 'bold':
      case 'italic':
      case 'stroke':
        return typeof value === 'boolean' ? value : fallback;
      default:
        return fallback;
    }
  }

  function buildToolOptions(raw, legacyWidths, legacySizes) {
    var result = {};
    Object.keys(defaults.DEFAULT_TOOL_OPTIONS).forEach(function (toolId) {
      var base = defaults.defaultToolOptions(toolId);
      var saved = raw && typeof raw === 'object' && raw[toolId] && typeof raw[toolId] === 'object' ? raw[toolId] : {};

      // 兼容旧版 widths / sizes 配置
      if (legacyWidths && typeof legacyWidths === 'object') {
        if (toolId === 'spotlight' && legacyWidths.spotlightStroke !== undefined) {
          base.strokeWidth = legacyWidths.spotlightStroke;
        } else if (legacyWidths[toolId] !== undefined) {
          base.width = legacyWidths[toolId];
        }
      }
      if (legacySizes && typeof legacySizes === 'object') {
        if (toolId === 'text' && legacySizes.text !== undefined) {
          base.fontSize = legacySizes.text;
        }
        if (toolId === 'serial' && legacySizes.serial !== undefined) {
          base.fontSize = legacySizes.serial;
        }
      }

      var merged = {};
      Object.keys(base).forEach(function (key) {
        merged[key] = sanitizeOptionValue(key, saved[key], base[key]);
      });
      result[toolId] = merged;
    });
    return result;
  }

  function mergeSettings(raw) {
    var base = defaults.defaultSettings();
    var source = raw && typeof raw === 'object' ? raw : {};

    base.toolbar = sanitizeToolbar(source.toolbar);

    var colors = source.colors && typeof source.colors === 'object' ? source.colors : {};
    base.colors.shared = typeof colors.shared === 'boolean' ? colors.shared : base.colors.shared;
    base.colors.default = isHex(colors.default) ? colors.default.toLowerCase() : base.colors.default;
    base.colors.palette = sanitizePalette(colors.palette);
    if (colors.perTool && typeof colors.perTool === 'object') {
      Object.keys(colors.perTool).forEach(function (toolId) {
        if (isToolId(toolId) && isHex(colors.perTool[toolId])) {
          base.colors.perTool[toolId] = colors.perTool[toolId].toLowerCase();
        }
      });
    }

    base.toolOptions = buildToolOptions(source.toolOptions, source.widths, source.sizes);

    var session = source.session && typeof source.session === 'object' ? source.session : {};
    if (session.display === 'cursor' || session.display === 'primary') {
      base.session.display = session.display;
    } else if (typeof session.display === 'number' && isFinite(session.display)) {
      base.session.display = session.display;
    } else {
      base.session.display = 'cursor';
    }
    base.session.clearOnExit =
      typeof session.clearOnExit === 'boolean' ? session.clearOnExit : base.session.clearOnExit;
    base.session.hideToolbarOnStart =
      typeof session.hideToolbarOnStart === 'boolean'
        ? session.hideToolbarOnStart
        : base.session.hideToolbarOnStart;
    base.session.activationTool =
      session.activationTool === 'none' || isToolId(session.activationTool)
        ? session.activationTool
        : base.session.activationTool;

    var shortcuts = source.shortcuts && typeof source.shortcuts === 'object' ? source.shortcuts : {};
    Object.keys(base.shortcuts).forEach(function (key) {
      base.shortcuts[key] = normalizeShortcut(shortcuts[key], base.shortcuts[key]);
    });

    base.version = defaults.DEFAULT_SETTINGS.version;
    return base;
  }

  function clone(settings) {
    return JSON.parse(JSON.stringify(settings));
  }

  function moveTool(settings, toolId, area) {
    var next = clone(settings);
    var target = area === 'secondary' ? 'secondary' : 'primary';
    next.toolbar.primary = next.toolbar.primary.filter(function (id) {
      return id !== toolId;
    });
    next.toolbar.secondary = next.toolbar.secondary.filter(function (id) {
      return id !== toolId;
    });
    if (isToolId(toolId)) {
      next.toolbar[target].push(toolId);
    }
    return next;
  }

  function resetToolOptions(source, toolId) {
    var next = mergeSettings(source);
    if (!isToolId(toolId)) {
      return next;
    }
    next.toolOptions[toolId] = defaults.defaultToolOptions(toolId);
    return next;
  }

  function reorderTool(settings, toolId, delta) {
    var next = clone(settings);
    ['primary', 'secondary'].some(function (area) {
      var list = next.toolbar[area];
      var index = list.indexOf(toolId);
      if (index === -1) {
        return false;
      }
      var target = Math.min(list.length - 1, Math.max(0, index + delta));
      if (target !== index) {
        list.splice(index, 1);
        list.splice(target, 0, toolId);
      }
      return true;
    });
    return next;
  }

  function insertTool(settings, toolId, area, index) {
    var next = clone(settings);
    if (!isToolId(toolId)) {
      return next;
    }
    var target = area === 'secondary' ? 'secondary' : 'primary';
    next.toolbar.primary = next.toolbar.primary.filter(function (id) {
      return id !== toolId;
    });
    next.toolbar.secondary = next.toolbar.secondary.filter(function (id) {
      return id !== toolId;
    });
    var list = next.toolbar[target];
    var position = Math.min(Math.max(0, index), list.length);
    list.splice(position, 0, toolId);
    return next;
  }

  function addPaletteColor(settings, color) {
    var next = clone(settings);
    if (isHex(color) && next.colors.palette.length < 12) {
      var normalized = color.toLowerCase();
      if (next.colors.palette.indexOf(normalized) === -1) {
        next.colors.palette.push(normalized);
      }
    }
    return next;
  }

  function removePaletteColor(settings, color) {
    var next = clone(settings);
    if (next.colors.palette.length > 2) {
      next.colors.palette = next.colors.palette.filter(function (item) {
        return item.toLowerCase() !== String(color).toLowerCase();
      });
    }
    return next;
  }

  function setPaletteColor(settings, index, color) {
    var next = clone(settings);
    if (isHex(color) && index >= 0 && index < next.colors.palette.length) {
      next.colors.palette[index] = color.toLowerCase();
    }
    return next;
  }

  return {
    isHex: isHex,
    isToolId: isToolId,
    sanitizeToolbar: sanitizeToolbar,
    normalizeShortcut: normalizeShortcut,
    parseShortcut: parseShortcut,
    sanitizePalette: sanitizePalette,
    mergeSettings: mergeSettings,
    clone: clone,
    moveTool: moveTool,
    resetToolOptions: resetToolOptions,
    reorderTool: reorderTool,
    insertTool: insertTool,
    addPaletteColor: addPaletteColor,
    removePaletteColor: removePaletteColor,
    setPaletteColor: setPaletteColor
  };
});
