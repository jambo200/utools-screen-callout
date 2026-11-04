/**
 * 默认配置与工具元数据（纯数据，无依赖）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SC = root.SC || {};
    root.SC.defaults = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TOOLS = [
    { id: 'select', name: '选择', hotkey: 'Shift+A', key: { shift: true, code: 'KeyA' } },
    { id: 'arrow', name: '箭头', hotkey: 'Shift+3', key: { shift: true, code: 'Digit3' } },
    { id: 'line', name: '直线', hotkey: 'Shift+2', key: { shift: true, code: 'Digit2' } },
    { id: 'rect', name: '矩形', hotkey: 'Shift+1', key: { shift: true, code: 'Digit1' } },
    { id: 'ellipse', name: '椭圆', hotkey: 'Shift+E', key: { shift: true, code: 'KeyE' } },
    { id: 'pen', name: '铅笔', hotkey: 'Shift+5', key: { shift: true, code: 'Digit5' } },
    { id: 'highlighter', name: '荧光笔', hotkey: 'Shift+6', key: { shift: true, code: 'Digit6' } },
    { id: 'text', name: '文字', hotkey: 'Shift+8', key: { shift: true, code: 'Digit8' } },
    { id: 'serial', name: '序号', hotkey: 'Shift+4', key: { shift: true, code: 'Digit4' } },
    { id: 'spotlight', name: '聚光灯', hotkey: 'Shift+0', key: { shift: true, code: 'Digit0' } },
    { id: 'magnifier', name: '放大镜', hotkey: 'Shift+M', key: { shift: true, code: 'KeyM' } },
    { id: 'eraser', name: '橡皮擦', hotkey: 'Shift+9', key: { shift: true, code: 'Digit9' } }
  ];

  var PALETTE = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ffffff', '#1c1c1e'];

  var LINE_STYLES = [
    { id: 'solid', name: '实线' },
    { id: 'dashed', name: '虚线' },
    { id: 'dotted', name: '点线' },
    { id: 'dashdot', name: '点划线' }
  ];

  var ARROW_HEADS = [
    { id: 'filled', name: '实心箭头' },
    { id: 'open', name: '开口箭头' },
    { id: 'thin', name: '细箭头' }
  ];

  var SERIAL_TYPES = [
    { id: 'number', name: '数字' },
    { id: 'letter', name: '字母' },
    { id: 'roman', name: '罗马' }
  ];

  var FONT_FAMILIES = [
    { id: 'Microsoft YaHei', name: '微软雅黑' },
    { id: 'SimSun', name: '宋体' },
    { id: 'SimHei', name: '黑体' },
    { id: 'KaiTi', name: '楷体' },
    { id: 'Consolas', name: 'Consolas' }
  ];

  var DEFAULT_TOOL_OPTIONS = {
    select: {},
    arrow: { width: 4, lineStyle: 'solid', head: 'filled' },
    line: { width: 4, lineStyle: 'solid' },
    rect: { width: 3, lineStyle: 'solid', fill: false },
    ellipse: { width: 3, lineStyle: 'solid', fill: false },
    pen: { width: 4 },
    highlighter: { width: 18, opacity: 0.35 },
    text: { fontFamily: 'Microsoft YaHei', fontSize: 22, bold: false, italic: false },
    serial: { fontSize: 28, serialType: 'number' },
    spotlight: { opacity: 0.45, strokeWidth: 2, stroke: true },
    magnifier: { zoom: 2, borderWidth: 2 },
    eraser: { width: 14 }
  };

  var TOOL_OPTION_KEYS = {
    select: [],
    arrow: ['lineStyle', 'head', 'width', 'color'],
    line: ['lineStyle', 'width', 'color'],
    rect: ['lineStyle', 'fill', 'width', 'color'],
    ellipse: ['lineStyle', 'fill', 'width', 'color'],
    pen: ['width', 'color'],
    highlighter: ['width', 'opacity', 'color'],
    text: ['bold', 'italic', 'fontFamily', 'fontSize', 'color'],
    serial: ['serialType', 'fontSize', 'color'],
    spotlight: ['opacity', 'stroke', 'strokeWidth', 'color'],
    magnifier: ['zoom', 'borderWidth', 'color'],
    eraser: ['width']
  };

  var OPTION_META = {
    lineStyle: { label: '线条', type: 'lineStyle' },
    head: { label: '箭头', type: 'head' },
    width: { label: '粗细', type: 'stepper', min: 1, max: 60, step: 1 },
    fill: { label: '填充', type: 'toggle' },
    opacity: { label: '透明度', type: 'slider', min: 0.1, max: 0.9, step: 0.05 },
    fontSize: { label: '字号', type: 'stepper', min: 8, max: 160, step: 1 },
    fontFamily: { label: '字体', type: 'font' },
    bold: { label: '粗体', type: 'toggle' },
    italic: { label: '斜体', type: 'toggle' },
    serialType: { label: '编号', type: 'segmented', options: SERIAL_TYPES },
    stroke: { label: '描边', type: 'toggle' },
    strokeWidth: { label: '描边粗细', type: 'stepper', min: 0, max: 20, step: 1 },
    zoom: { label: '倍数', type: 'stepper', min: 1, max: 8, step: 0.5 },
    borderWidth: { label: '边框', type: 'stepper', min: 1, max: 12, step: 1 },
    color: { label: '颜色', type: 'color' }
  };

  var DEFAULT_SETTINGS = {
    version: 1,
    toolbar: {
      primary: ['arrow', 'rect', 'ellipse', 'text', 'pen', 'highlighter', 'serial', 'spotlight', 'magnifier'],
      secondary: ['select', 'line', 'eraser']
    },
    colors: {
      shared: true,
      default: '#ff3b30',
      palette: PALETTE.slice(),
      perTool: {}
    },
    toolOptions: JSON.parse(JSON.stringify(DEFAULT_TOOL_OPTIONS)),
    session: {
      display: 'cursor',
      clearOnExit: true,
      hideToolbarOnStart: false,
      activationTool: 'none'
    },
    shortcuts: {
      exit: 'Escape',
      toggleToolbar: 'F9',
      passthrough: 'F10',
      clear: 'Ctrl+Shift+Backspace'
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultSettings() {
    return clone(DEFAULT_SETTINGS);
  }

  function toolById(id) {
    for (var i = 0; i < TOOLS.length; i++) {
      if (TOOLS[i].id === id) {
        return TOOLS[i];
      }
    }
    return null;
  }

  function toolIds() {
    return TOOLS.map(function (tool) {
      return tool.id;
    });
  }

  function defaultToolOptions(toolId) {
    return clone(DEFAULT_TOOL_OPTIONS[toolId] || {});
  }

  function getToolOptions(toolId, settings) {
    var base = defaultToolOptions(toolId);
    var saved = settings && settings.toolOptions ? settings.toolOptions[toolId] : null;
    if (saved) {
      Object.keys(saved).forEach(function (key) {
        base[key] = saved[key];
      });
    }
    return base;
  }

  function formatSerial(n, type) {
    var number = Math.max(1, Math.floor(n));
    if (type === 'letter') {
      var result = '';
      var value = number;
      while (value > 0) {
        value -= 1;
        result = String.fromCharCode(65 + (value % 26)) + result;
        value = Math.floor(value / 26);
      }
      return result;
    }
    if (type === 'roman') {
      var map = [
        [1000, 'M'],
        [900, 'CM'],
        [500, 'D'],
        [400, 'CD'],
        [100, 'C'],
        [90, 'XC'],
        [50, 'L'],
        [40, 'XL'],
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I']
      ];
      var roman = '';
      var rest = Math.min(3999, number);
      map.forEach(function (pair) {
        while (rest >= pair[0]) {
          roman += pair[1];
          rest -= pair[0];
        }
      });
      return roman;
    }
    return String(number);
  }

  return {
    TOOLS: TOOLS,
    PALETTE: PALETTE,
    LINE_STYLES: LINE_STYLES,
    ARROW_HEADS: ARROW_HEADS,
    SERIAL_TYPES: SERIAL_TYPES,
    FONT_FAMILIES: FONT_FAMILIES,
    DEFAULT_TOOL_OPTIONS: DEFAULT_TOOL_OPTIONS,
    TOOL_OPTION_KEYS: TOOL_OPTION_KEYS,
    OPTION_META: OPTION_META,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    clone: clone,
    defaultSettings: defaultSettings,
    toolById: toolById,
    toolIds: toolIds,
    defaultToolOptions: defaultToolOptions,
    getToolOptions: getToolOptions,
    formatSerial: formatSerial
  };
});
