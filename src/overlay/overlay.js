/**
 * 覆盖层主控制器：会话状态、标注工具、工具级参数、撤销/重做、穿透、快捷键
 */
(function () {
  'use strict';

  var SC = window.SC;
  var OC = window.OC;
  var bridge = window.cscBridge;

  var canvas = null;
  var ctx = null;
  var editor = null;
  var toolbar = null;

  var settings = null;
  var display = null;
  var shapes = [];
  var images = {};
  var history = null;
  var tool = null;
  var toolState = {};
  var currentOptions = null;
  var selectedId = null;
  var preview = null;
  var gesture = null;
  var busy = false;
  var initialized = false;
  var serialNext = 1;
  var editing = null;
  var editorCancelled = false;
  var commitTimer = null;
  var persistTimer = null;
  var toolbarVisible = true;
  var passOn = false;
  var passHover = false;
  var lastPointer = { x: -1, y: -1 };
  var pendingCapture = null;
  var toolHintShown = false;

  function $(selector) {
    return document.querySelector(selector);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshot() {
    return clone(shapes);
  }

  function newId() {
    return 's_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
  }

  function pointOf(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function findShape(id) {
    for (var i = 0; i < shapes.length; i++) {
      if (shapes[i].id === id) {
        return shapes[i];
      }
    }
    return null;
  }

  function topmostAt(point) {
    for (var i = shapes.length - 1; i >= 0; i--) {
      if (SC.geometry.shapeHit(shapes[i], point)) {
        return shapes[i];
      }
    }
    return null;
  }

  function magnifierAt(point) {
    for (var i = shapes.length - 1; i >= 0; i--) {
      var shape = shapes[i];
      if (shape.type === 'magnifier' && shape.dst && SC.geometry.rectContains(shape.dst, point, 2)) {
        return shape;
      }
    }
    return null;
  }

  function showFatal(message) {
    var node = document.createElement('div');
    node.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99;' +
      'padding:18px 22px;border-radius:12px;background:rgba(18,22,30,.95);color:#ffb3b5;' +
      'font:14px "Microsoft YaHei",sans-serif;border:1px solid rgba(255,90,95,.5);max-width:70vw;';
    node.textContent = message;
    document.body.appendChild(node);
  }

  /* ------------------------------------------------------------ 画布 */

  function resizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function render() {
    if (!ctx) {
      return;
    }
    var selected = selectedId ? findShape(selectedId) : null;
    var renderShapes = shapes;
    if (preview && preview.type === 'spotlight') {
      // 拖拽新聚光灯时先隐藏旧聚光灯，避免两层遮罩叠加变暗
      renderShapes = shapes.filter(function (shape) {
        return shape.type !== 'spotlight';
      });
    }
    OC.render.draw(ctx, {
      width: window.innerWidth,
      height: window.innerHeight,
      shapes: renderShapes,
      preview: preview,
      selected: selected,
      images: images
    });
  }

  /* ------------------------------------------------------------ 历史 */

  function updateHistoryButtons() {
    if (toolbar && history) {
      toolbar.setUndoRedo(history.canUndo(), history.canRedo());
    }
  }

  function commitHistory() {
    if (!history) {
      return;
    }
    history.push(snapshot());
    updateHistoryButtons();
  }

  function commitSoon() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(function () {
      commitHistory();
    }, 350);
  }

  function undo() {
    if (!history) {
      return;
    }
    var state = history.undo();
    if (!state) {
      return;
    }
    shapes = state;
    dedupeSpotlights();
    selectedId = null;
    render();
    updateHistoryButtons();
  }

  function redo() {
    if (!history) {
      return;
    }
    var state = history.redo();
    if (!state) {
      return;
    }
    shapes = state;
    dedupeSpotlights();
    selectedId = null;
    render();
    updateHistoryButtons();
  }

  function dedupeSpotlights() {
    var last = null;
    for (var i = 0; i < shapes.length; i++) {
      if (shapes[i].type === 'spotlight') {
        last = shapes[i];
      }
    }
    if (!last) {
      return;
    }
    shapes = shapes.filter(function (shape) {
      return shape.type !== 'spotlight' || shape === last;
    });
  }

  /* ------------------------------------------------------------ 工具参数 */

  function buildToolState() {
    toolState = {};
    SC.defaults.TOOLS.forEach(function (meta) {
      var options = SC.defaults.getToolOptions(meta.id, settings);
      if (options && (SC.defaults.TOOL_OPTION_KEYS[meta.id] || []).indexOf('color') !== -1) {
        options.color = settings.colors.shared
          ? settings.colors.default
          : settings.colors.perTool[meta.id] || settings.colors.default;
      }
      toolState[meta.id] = options;
    });
  }

  function persistToolState() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      if (!bridge || typeof bridge.saveToolState !== 'function') {
        return;
      }
      var payload = {
        toolOptions: {},
        colors: {
          shared: settings.colors.shared,
          default: settings.colors.default,
          perTool: settings.colors.perTool
        }
      };
      Object.keys(toolState).forEach(function (id) {
        var options = clone(toolState[id]);
        delete options.color;
        payload.toolOptions[id] = options;
      });
      bridge.saveToolState(payload);
    }, 400);
  }

  function sanitizeOptionValue(key, value) {
    var meta = SC.defaults.OPTION_META[key];
    if (!meta) {
      return value;
    }
    if (meta.type === 'stepper' || meta.type === 'slider') {
      var number = Number(value);
      if (!isFinite(number)) {
        return currentOptions[key];
      }
      return SC.geometry.clamp(
        Math.round(number / (meta.step || 1)) * (meta.step || 1),
        meta.min,
        meta.max
      );
    }
    if (meta.type === 'toggle') {
      return !!value;
    }
    if (meta.type === 'lineStyle' || meta.type === 'head' || meta.type === 'segmented') {
      return value;
    }
    return value;
  }

  function onOptionChange(key, value) {
    if (!currentOptions) {
      return;
    }
    var normalized = sanitizeOptionValue(key, value);
    currentOptions[key] = normalized;

    if (key === 'color') {
      if (settings.colors.shared) {
        settings.colors.default = normalized;
        Object.keys(toolState).forEach(function (id) {
          if (toolState[id] && toolState[id].color !== undefined) {
            toolState[id].color = normalized;
          }
        });
      } else {
        settings.colors.perTool[tool] = normalized;
      }
    }

    if (toolbar) {
      toolbar.updateOptions(currentOptions);
    }
    applyOptionToSelected(key, normalized);
    persistToolState();
  }

  function applyOptionToSelected(key, value) {
    var shape = findShape(selectedId);
    if (!shape) {
      return;
    }
    var applicable = [
      'color',
      'width',
      'lineStyle',
      'head',
      'fill',
      'opacity',
      'fontSize',
      'fontFamily',
      'bold',
      'italic',
      'serialType',
      'stroke',
      'strokeWidth',
      'zoom',
      'borderWidth'
    ];
    if (applicable.indexOf(key) === -1) {
      return;
    }
    shape[key] = value;
    if (shape.type === 'magnifier' && key === 'zoom') {
      resizeMagnifierLens(shape);
    }
    if (shape.type === 'text' && (key === 'fontSize' || key === 'fontFamily')) {
      shape.bbox = measureTextBBox(shape);
    }
    if (shape.type === 'serial' && key === 'fontSize') {
      var radius = shape.fontSize * 0.75;
      shape.bbox = { x: shape.x - radius, y: shape.y - radius, w: radius * 2, h: radius * 2 };
    }
    commitSoon();
    render();
  }

  function measureTextBBox(shape) {
    var lines = String(shape.text || '').split('\n');
    ctx.save();
    ctx.font = buildFont(shape.fontSize, shape.bold, shape.italic, shape.fontFamily);
    var width = 0;
    for (var i = 0; i < lines.length; i++) {
      width = Math.max(width, ctx.measureText(lines[i]).width);
    }
    ctx.restore();
    var lineHeight = shape.fontSize * 1.38;
    return { x: shape.x - 2, y: shape.y - 2, w: width + 4, h: lines.length * lineHeight + 4 };
  }

  function buildFont(size, bold, italic, family) {
    var fontFamily = family || 'Microsoft YaHei';
    return (
      (italic ? 'italic ' : '') +
      (bold ? '700 ' : '400 ') +
      size +
      'px "' +
      fontFamily +
      '", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif'
    );
  }

  function colorFor(toolId) {
    if (!settings) {
      return '#ff3b30';
    }
    if (settings.colors.shared) {
      return settings.colors.default;
    }
    return settings.colors.perTool[toolId] || settings.colors.default;
  }

  function applyTool(toolId) {
    if (passOn) {
      togglePassthrough(false);
    }
    if (tool === toolId && currentOptions) {
      toolbar.toggleContext();
      return;
    }
    tool = toolId;
    currentOptions = toolState[toolId] || {};
    if (currentOptions.color === undefined && (SC.defaults.TOOL_OPTION_KEYS[toolId] || []).indexOf('color') !== -1) {
      currentOptions.color = colorFor(toolId);
    }
    toolbar.setTool(toolId, currentOptions);
    selectedId = null;
    render();
  }

  function handleInit(data) {
    if (!data) {
      return;
    }
    settings = SC.settings.mergeSettings(data.settings);
    display = data.display || null;
    serialNext = 1;
    shapes = [];
    images = {};

    if (data.retained && Array.isArray(data.retained.shapes) && data.retained.shapes.length) {
      shapes = data.retained.shapes;
      dedupeSpotlights();
      var storedImages = data.retained.images || {};
      Object.keys(storedImages).forEach(function (imageId) {
        var stored = new Image();
        stored.onload = function () {
          render();
        };
        stored.src = storedImages[imageId];
        images[imageId] = stored;
      });
      shapes.forEach(function (shape) {
        if (shape.type === 'serial' && shape.n >= serialNext) {
          serialNext = shape.n + 1;
        }
      });
    }

    buildToolState();
    history = SC.history.createHistory(80);
    history.reset(snapshot());

    toolbar.build(settings);
    toolbarVisible = !settings.session.hideToolbarOnStart;
    toolbar.setVisible(toolbarVisible);

    tool = null;
    currentOptions = null;
    toolbar.clearTool();
    if (settings.session.activationTool && settings.session.activationTool !== 'none') {
      applyTool(settings.session.activationTool);
    }
    updateHistoryButtons();
    render();

    initialized = true;
    window.focus();
    if (bridge) {
      bridge.log(
        'overlay init display=' +
          (display ? display.id : '?') +
          ' ' +
          window.innerWidth +
          'x' +
          window.innerHeight +
          ' dpr=' +
          (window.devicePixelRatio || 1)
      );
    }
  }

  /* ------------------------------------------------------------ 创建图形 */

  function styleFromOptions(extra) {
    var shape = {
      color: currentOptions.color,
      lineStyle: currentOptions.lineStyle || 'solid'
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        shape[key] = extra[key];
      });
    }
    return shape;
  }

  function startCreate(point) {
    switch (tool) {
      case 'arrow':
        preview = styleFromOptions({
          type: 'arrow',
          start: point,
          end: point,
          width: currentOptions.width || 4,
          head: currentOptions.head || 'filled'
        });
        break;
      case 'line':
        preview = styleFromOptions({
          type: 'line',
          start: point,
          end: point,
          width: currentOptions.width || 4
        });
        break;
      case 'rect':
      case 'ellipse':
        preview = styleFromOptions({
          type: tool,
          x: point.x,
          y: point.y,
          w: 0,
          h: 0,
          width: currentOptions.width || 3,
          fill: !!currentOptions.fill
        });
        break;
      case 'spotlight':
        preview = styleFromOptions({
          type: 'spotlight',
          x: point.x,
          y: point.y,
          w: 0,
          h: 0,
          opacity: currentOptions.opacity || 0.45,
          stroke: currentOptions.stroke !== false,
          strokeWidth: currentOptions.strokeWidth || 2
        });
        break;
      case 'pen':
      case 'highlighter':
        preview = {
          type: tool,
          points: [point],
          color: currentOptions.color,
          width: currentOptions.width || 4,
          opacity: currentOptions.opacity || 0.35
        };
        break;
      case 'magnifier':
        preview = {
          type: 'magnifier',
          src: { x: point.x, y: point.y, w: 0, h: 0 },
          dst: null,
          zoom: currentOptions.zoom || 2,
          borderWidth: currentOptions.borderWidth || 2,
          color: currentOptions.color
        };
        break;
      default:
        preview = null;
        return;
    }
    gesture = { kind: 'create', start: point };
    render();
  }

  function snap45(start, point) {
    var dx = point.x - start.x;
    var dy = point.y - start.y;
    var distance = Math.hypot(dx, dy);
    var angle = Math.atan2(dy, dx);
    var step = Math.PI / 4;
    var snapped = Math.round(angle / step) * step;
    return { x: start.x + Math.cos(snapped) * distance, y: start.y + Math.sin(snapped) * distance };
  }

  function squareRect(rect) {
    var side = Math.max(rect.w, rect.h);
    return {
      x: rect.w >= rect.h ? rect.x : rect.x - (side - rect.w),
      y: rect.h >= rect.w ? rect.y : rect.y - (side - rect.h),
      w: side,
      h: side
    };
  }

  function updateCreate(point, shift) {
    if (!preview) {
      return;
    }
    switch (preview.type) {
      case 'arrow':
      case 'line':
        preview.end = shift ? snap45(gesture.start, point) : point;
        break;
      case 'rect':
      case 'ellipse': {
        var rect = SC.geometry.normalizeRect(gesture.start.x, gesture.start.y, point.x, point.y);
        if (shift) {
          rect = squareRect(rect);
        }
        preview.x = rect.x;
        preview.y = rect.y;
        preview.w = rect.w;
        preview.h = rect.h;
        break;
      }
      case 'spotlight': {
        var spotlightRect = SC.geometry.normalizeRect(gesture.start.x, gesture.start.y, point.x, point.y);
        if (shift) {
          spotlightRect = squareRect(spotlightRect);
        }
        preview.x = spotlightRect.x;
        preview.y = spotlightRect.y;
        preview.w = spotlightRect.w;
        preview.h = spotlightRect.h;
        break;
      }
      case 'pen':
      case 'highlighter': {
        if (shift) {
          preview.points = [gesture.start, point];
          break;
        }
        var points = preview.points;
        var last = points[points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 1.5) {
          points.push(point);
        }
        break;
      }
      case 'magnifier': {
        var src = SC.geometry.normalizeRect(gesture.start.x, gesture.start.y, point.x, point.y);
        if (shift) {
          src = squareRect(src);
        }
        preview.src = src;
        break;
      }
      default:
        break;
    }
    render();
  }

  function finishCreate() {
    if (!preview) {
      return;
    }
    var shape = preview;
    preview = null;
    gesture = null;

    if (shape.type === 'magnifier') {
      if (shape.src.w < 8 || shape.src.h < 8) {
        render();
        return;
      }
      requestMagnifier(shape.src);
      render();
      return;
    }

    var valid = true;
    if (shape.type === 'arrow' || shape.type === 'line') {
      valid = Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y) >= 3;
    } else if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'spotlight') {
      valid = shape.w >= 3 || shape.h >= 3;
    } else if (shape.type === 'pen' || shape.type === 'highlighter') {
      valid = shape.points.length >= 2;
    }
    if (valid) {
      commitShape(shape);
    }
    render();
  }

  function commitShape(shape) {
    shape.id = newId();
    shape.bbox = SC.geometry.computeBBox(shape);
    if (shape.type === 'spotlight') {
      // 聚光灯只保留一层：新的替换旧的，避免多次标注叠加降低亮度
      shapes = shapes.filter(function (item) {
        return item.type !== 'spotlight';
      });
    }
    shapes.push(shape);
    commitHistory();
    render();
  }

  /* -------------------------------------------------------- 选择/擦除 */

  function selectAt(point) {
    var hit = topmostAt(point);
    if (!hit) {
      selectedId = null;
      render();
      return;
    }
    selectedId = hit.id;
    gesture = { kind: 'move', id: hit.id, start: point, original: clone(hit), moved: false };
    render();
  }

  function moveSelected(point) {
    if (!gesture || gesture.kind !== 'move') {
      return;
    }
    var index = -1;
    for (var i = 0; i < shapes.length; i++) {
      if (shapes[i].id === gesture.id) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      return;
    }
    var dx = point.x - gesture.start.x;
    var dy = point.y - gesture.start.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      gesture.moved = true;
    }
    shapes[index] = SC.geometry.translateShape(gesture.original, dx, dy);
    render();
  }

  function eraseAt(point) {
    var radius = currentOptions.width || 14;
    var removed = false;
    shapes = shapes.filter(function (shape) {
      var bbox = shape.bbox || SC.geometry.computeBBox(shape);
      var near =
        point.x >= bbox.x - radius &&
        point.x <= bbox.x + bbox.w + radius &&
        point.y >= bbox.y - radius &&
        point.y <= bbox.y + bbox.h + radius;
      if (!near) {
        return true;
      }
      if (SC.geometry.shapeHit(shape, point)) {
        removed = true;
        if (selectedId === shape.id) {
          selectedId = null;
        }
        return false;
      }
      return true;
    });
    if (removed) {
      gesture.erased = true;
      render();
    }
  }

  function deleteSelected() {
    if (!selectedId) {
      return;
    }
    shapes = shapes.filter(function (shape) {
      return shape.id !== selectedId;
    });
    selectedId = null;
    commitHistory();
    render();
  }

  function clearAll() {
    shapes = [];
    selectedId = null;
    commitHistory();
    render();
    toolbar.toast('已清空（Ctrl+Z 可撤销）');
  }

  /* ------------------------------------------------------------ 文字 */

  function openEditor(point) {
    editing = { point: point };
    editorCancelled = false;
    editor.hidden = false;
    editor.value = '';
    editor.style.left = point.x + 'px';
    editor.style.top = point.y + 'px';
    editor.style.fontSize = currentOptions.fontSize + 'px';
    editor.style.fontFamily = '"' + (currentOptions.fontFamily || 'Microsoft YaHei') + '", "Microsoft YaHei", sans-serif';
    editor.style.color = currentOptions.color;
    editor.style.fontWeight = currentOptions.bold ? '700' : '400';
    editor.style.fontStyle = currentOptions.italic ? 'italic' : 'normal';
    editor.style.height = 'auto';
    editor.focus();
  }

  function closeEditor() {
    editing = null;
    editor.hidden = true;
    editor.value = '';
  }

  function commitEditor() {
    if (!editing) {
      return;
    }
    var point = editing.point;
    var text = editor.value.replace(/\s+$/, '');
    var cancelled = editorCancelled;
    closeEditor();
    if (cancelled || !text.trim()) {
      return;
    }
    var shape = {
      type: 'text',
      x: point.x,
      y: point.y,
      text: text,
      fontFamily: currentOptions.fontFamily || 'Microsoft YaHei',
      fontSize: currentOptions.fontSize,
      bold: !!currentOptions.bold,
      italic: !!currentOptions.italic,
      color: currentOptions.color
    };
    shape.bbox = measureTextBBox(shape);
    commitShape(shape);
  }

  function insertSerial(point) {
    var fontSize = currentOptions.fontSize;
    var radius = fontSize * 0.75;
    commitShape({
      type: 'serial',
      x: point.x,
      y: point.y,
      n: serialNext,
      fontSize: fontSize,
      serialType: currentOptions.serialType || 'number',
      color: currentOptions.color,
      bbox: { x: point.x - radius, y: point.y - radius, w: radius * 2, h: radius * 2 }
    });
    serialNext += 1;
  }

  /* ------------------------------------------------------------ 放大镜 */

  function requestMagnifier(src) {
    busy = true;
    toolbar.setBusy(true);
    var requestId = 'cap_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    pendingCapture = { requestId: requestId, src: { x: src.x, y: src.y, w: src.w, h: src.h } };
    toolbar.toast('正在截屏…');
    if (bridge) {
      bridge.capture(requestId, pendingCapture.src);
    }
  }

  function clampLens(dst) {
    var viewWidth = window.innerWidth;
    var viewHeight = window.innerHeight;
    dst.w = Math.min(dst.w, viewWidth * 0.9);
    dst.h = Math.min(dst.h, viewHeight * 0.9);
    dst.x = SC.geometry.clamp(dst.x, 8, Math.max(8, viewWidth - dst.w - 8));
    dst.y = SC.geometry.clamp(dst.y, 8, Math.max(8, viewHeight - dst.h - 8));
    return dst;
  }

  function resizeMagnifierLens(shape) {
    var ratio = shape.src.h / shape.src.w;
    var maxWidth = (window.innerWidth * 0.9) / shape.src.w;
    var maxHeight = (window.innerHeight * 0.9) / (shape.src.h || 1);
    var zoom = Math.max(1, Math.min(shape.zoom || 2, maxWidth, maxHeight));
    shape.zoom = zoom;
    shape.dst.w = shape.src.w * zoom;
    shape.dst.h = shape.dst.w * ratio;
    clampLens(shape.dst);
    shape.bbox = { x: shape.dst.x, y: shape.dst.y, w: shape.dst.w, h: shape.dst.h };
  }

  function handleCapture(payload) {
    if (!pendingCapture || !payload || payload.requestId !== pendingCapture.requestId) {
      return;
    }
    var src = pendingCapture.src;
    pendingCapture = null;
    busy = false;
    toolbar.setBusy(false);
    if (payload.error) {
      toolbar.toast('截屏失败：' + payload.error);
      return;
    }
    var imageId = 'img_' + Date.now();
    var image = new Image();
    image.onload = function () {
      render();
    };
    image.src = payload.dataUrl;
    images[imageId] = image;

    var dst = SC.geometry.magnifierLensRect(
      src,
      { w: window.innerWidth, h: window.innerHeight },
      currentOptions.zoom || 2
    );
    commitShape({
      type: 'magnifier',
      src: src,
      dst: dst,
      zoom: currentOptions.zoom || 2,
      borderWidth: currentOptions.borderWidth || 2,
      imageId: imageId,
      color: currentOptions.color
    });
    toolbar.toast('放大镜已创建 · 滚轮调倍数');
  }

  function zoomMagnifier(shape, direction) {
    shape.zoom = SC.geometry.clamp((shape.zoom || 2) + direction * 0.25, 1, 8);
    resizeMagnifierLens(shape);
    commitSoon();
    render();
    toolbar.toast('放大 ' + Number(shape.zoom).toFixed(1) + '×');
  }

  /* ------------------------------------------------------------ 指针 */

  function onPointerDown(event) {
    if (!initialized || busy || event.button !== 0) {
      return;
    }
    if (event.target !== canvas) {
      return;
    }
    if (!tool) {
      if (!toolHintShown) {
        toolHintShown = true;
        toolbar.toast('先在工具栏选择一个工具');
      }
      return;
    }
    if (editing) {
      commitEditor();
      return;
    }
    toolbar.closePopovers();
    gesture = null;
    var point = pointOf(event);
    switch (tool) {
      case 'select':
        selectAt(point);
        break;
      case 'eraser':
        gesture = { kind: 'erase', erased: false };
        eraseAt(point);
        break;
      case 'text':
        openEditor(point);
        break;
      case 'serial':
        insertSerial(point);
        break;
      case 'magnifier': {
        var lens = magnifierAt(point);
        if (lens) {
          selectedId = lens.id;
          gesture = { kind: 'move', id: lens.id, start: point, original: clone(lens), moved: false };
          render();
        } else {
          startCreate(point);
        }
        break;
      }
      default:
        startCreate(point);
        break;
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!initialized || !gesture) {
      return;
    }
    var point = pointOf(event);
    if (gesture.kind === 'create') {
      updateCreate(point, event.shiftKey);
    } else if (gesture.kind === 'move') {
      moveSelected(point);
    } else if (gesture.kind === 'erase') {
      eraseAt(point);
    }
    event.preventDefault();
  }

  function onPointerUp() {
    if (!initialized || !gesture) {
      return;
    }
    if (gesture.kind === 'create') {
      finishCreate();
      return;
    }
    if (gesture.kind === 'move') {
      if (gesture.moved) {
        commitHistory();
      }
      gesture = null;
      return;
    }
    if (gesture.kind === 'erase') {
      if (gesture.erased) {
        commitHistory();
      }
      gesture = null;
    }
  }

  function onWheel(event) {
    if (!initialized || busy) {
      return;
    }
    if (event.target !== canvas) {
      return;
    }
    if (!tool) {
      return;
    }
    event.preventDefault();
    var direction = event.deltaY < 0 ? 1 : -1;
    var point = pointOf(event);

    var lens = magnifierAt(point);
    if (lens) {
      zoomMagnifier(lens, direction);
      return;
    }

    if (tool === 'spotlight') {
      var spotlights = shapes.filter(function (shape) {
        return shape.type === 'spotlight';
      });
      for (var i = spotlights.length - 1; i >= 0; i--) {
        var spot = spotlights[i];
        if (SC.geometry.rectContains(spot, point, 2)) {
          spot.opacity = SC.geometry.clamp(spot.opacity + direction * 0.05, 0.1, 0.9);
          commitSoon();
          render();
          toolbar.toast('遮罩 ' + Math.round(spot.opacity * 100) + '%');
          return;
        }
      }
      onOptionChange('opacity', SC.geometry.clamp((currentOptions.opacity || 0.45) + direction * 0.05, 0.1, 0.9));
      toolbar.toast('遮罩 ' + Math.round((currentOptions.opacity || 0.45) * 100) + '%');
      return;
    }

    if (tool === 'magnifier') {
      onOptionChange('zoom', SC.geometry.clamp((currentOptions.zoom || 2) + direction * 0.5, 1, 8));
      toolbar.toast('倍数 ' + Number(currentOptions.zoom).toFixed(1) + '×');
      return;
    }

    var key = tool === 'text' || tool === 'serial' ? 'fontSize' : 'width';
    var meta = SC.defaults.OPTION_META[key];
    if (!meta || currentOptions[key] === undefined) {
      return;
    }
    var current = Number(currentOptions[key]);
    var next = SC.geometry.clamp(current + direction * (meta.step || 1), meta.min, meta.max);
    onOptionChange(key, next);
    toolbar.toast((key === 'fontSize' ? '字号 ' : '粗细 ') + next);
  }

  /* ------------------------------------------------------------ 快捷键 */

  function matchesShortcut(event, value) {
    var parsed = SC.settings.parseShortcut(value);
    if (!parsed) {
      return false;
    }
    if (parsed.ctrl !== event.ctrlKey || parsed.alt !== event.altKey) {
      return false;
    }
    if (parsed.shift !== event.shiftKey || parsed.meta !== event.metaKey) {
      return false;
    }
    if (parsed.key.length === 1) {
      return event.key.toUpperCase() === parsed.key;
    }
    return event.key === parsed.key;
  }

  function toggleToolbar(force) {
    toolbarVisible = typeof force === 'boolean' ? force : !toolbarVisible;
    toolbar.setVisible(toolbarVisible);
    if (!toolbarVisible) {
      toolbar.toast('工具栏已隐藏 · 按 ' + settings.shortcuts.toggleToolbar + ' 恢复');
    }
  }

  function togglePassthrough(force) {
    var next = typeof force === 'boolean' ? force : !passOn;
    if (next === passOn) {
      return;
    }
    passOn = next;
    toolbarVisible = true;
    toolbar.setVisible(true);
    if (toolbar.setPassthrough) {
      toolbar.setPassthrough(next);
    }

    if (next) {
      var overToolbar =
        lastPointer.x >= 0 &&
        lastPointer.y >= 0 &&
        toolbar.containsPoint(lastPointer.x, lastPointer.y);
      passHover = overToolbar;
      if (bridge) {
        bridge.setPassthrough(true);
        if (overToolbar && bridge.setIgnoreMouse) {
          bridge.setIgnoreMouse(false);
        }
      }
      toolbar.toast('鼠标穿透已开启 · 点击工具或按 F10 退出');
    } else {
      passHover = false;
      if (bridge) {
        bridge.setPassthrough(false);
        if (bridge.setIgnoreMouse) {
          bridge.setIgnoreMouse(false);
        }
      }
      toolbar.toast('已恢复标注');
    }
  }

  function onPassthroughMove(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
    if (!passOn || !toolbar) {
      return;
    }
    var over = toolbar.containsPoint(event.clientX, event.clientY);
    if (over === passHover) {
      return;
    }
    passHover = over;
    if (bridge && bridge.setIgnoreMouse) {
      bridge.setIgnoreMouse(!over);
    }
  }

  function exitSession() {
    if (!bridge) {
      return;
    }
    if (settings && settings.session && settings.session.clearOnExit === false) {
      bridge.saveState({
        displayId: display ? display.id : null,
        shapes: shapes,
        images: collectImageSources()
      });
    } else if (bridge.saveState) {
      bridge.saveState(null);
    }
    bridge.exit();
  }

  function collectImageSources() {
    var sources = {};
    Object.keys(images).forEach(function (imageId) {
      var image = images[imageId];
      if (image && typeof image.src === 'string' && image.src.indexOf('data:') === 0) {
        sources[imageId] = image.src;
      }
    });
    return sources;
  }

  function onKeyDown(event) {
    if (!initialized) {
      return;
    }
    if (document.activeElement === editor && !editor.hidden) {
      return;
    }
    if (event.key === 'Escape' && toolbar.isPopoverOpen()) {
      toolbar.closePopovers();
      event.preventDefault();
      return;
    }
    if (matchesShortcut(event, settings.shortcuts.exit)) {
      event.preventDefault();
      exitSession();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      var key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
        return;
      }
    }
    if (matchesShortcut(event, settings.shortcuts.toggleToolbar)) {
      event.preventDefault();
      toggleToolbar();
      return;
    }
    if (matchesShortcut(event, settings.shortcuts.passthrough)) {
      event.preventDefault();
      togglePassthrough();
      return;
    }
    if (matchesShortcut(event, settings.shortcuts.clear)) {
      event.preventDefault();
      clearAll();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    for (var i = 0; i < SC.defaults.TOOLS.length; i++) {
      var meta = SC.defaults.TOOLS[i].key;
      if (event.code === meta.code && event.shiftKey === !!meta.shift) {
        event.preventDefault();
        applyTool(SC.defaults.TOOLS[i].id);
        return;
      }
    }
  }

  /* ------------------------------------------------------------ 工具栏 */

  function handleAction(action) {
    switch (action) {
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'clear':
        clearAll();
        break;
      case 'hide':
        toggleToolbar(false);
        break;
      case 'passthrough':
        togglePassthrough();
        break;
      case 'exit':
        exitSession();
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------ 启动 */

  function init() {
    canvas = $('#csc-canvas');
    ctx = canvas.getContext('2d');
    editor = $('#csc-editor');
    resizeCanvas();

    toolbar = OC.createToolbar({
      onTool: function (toolId) {
        applyTool(toolId);
      },
      onAction: handleAction,
      onOptionChange: onOptionChange
    });

    bindEvents();

    if (!bridge) {
      showFatal('覆盖层桥接未加载，无法初始化');
      return;
    }
    bridge.onInit(handleInit);
    bridge.onRestore(function (payload) {
      passOn = false;
      passHover = false;
      toolbarVisible = true;
      toolbar.setVisible(true);
      if (toolbar.setPassthrough) {
        toolbar.setPassthrough(false);
      }
      toolbar.closePopovers();
      toolbar.toast('已恢复标注' + (payload && payload.count ? '（第 ' + payload.count + ' 次）' : ''));
      window.focus();
      render();
    });
    bridge.onCapture(handleCapture);
    bridge.onPassthrough(function (payload) {
      passOn = !!(payload && payload.on);
      if (toolbar.setPassthrough) {
        toolbar.setPassthrough(passOn);
      }
      if (!passOn) {
        passHover = false;
        toolbarVisible = true;
        toolbar.setVisible(true);
      }
    });
    bridge.ready();
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('mousemove', onPassthroughMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', resizeCanvas);

    editor.addEventListener('input', function () {
      editor.style.height = 'auto';
      editor.style.height = Math.min(360, editor.scrollHeight) + 'px';
    });
    editor.addEventListener('keydown', function (event) {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        editorCancelled = true;
        closeEditor();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commitEditor();
      }
    });
    editor.addEventListener('blur', function () {
      if (editing) {
        commitEditor();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
