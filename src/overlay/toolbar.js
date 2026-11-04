/**
 * 悬浮工具栏：主工具条 + 当前工具的参数条（PixPin 式两段结构）
 */
(function (root) {
  'use strict';

  var OC = root.OC || (root.OC = {});
  var defaults = root.SC.defaults;

  function element(tag, className, html) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (html !== undefined) {
      node.innerHTML = html;
    }
    return node;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toolMeta(id) {
    return defaults.toolById(id);
  }

  function lineSample(style, width) {
    var dash = '';
    if (style === 'dashed') {
      dash = ' stroke-dasharray="7 5"';
    } else if (style === 'dotted') {
      dash = ' stroke-dasharray="1.6 4.6" stroke-linecap="round"';
    } else if (style === 'dashdot') {
      dash = ' stroke-dasharray="9 4 2 4"';
    }
    return (
      '<svg class="csc-sample-line" viewBox="0 0 52 12" width="52" height="12" fill="none" ' +
      'stroke="currentColor" stroke-width="' +
      (width || 2) +
      '"' +
      dash +
      '><path d="M2 6h48"/></svg>'
    );
  }

  function headSample(head) {
    if (head === 'open') {
      return (
        '<svg viewBox="0 0 46 12" width="46" height="12" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h30"/><path d="M32 2.4L40 6l-8 3.6"/></svg>'
      );
    }
    if (head === 'thin') {
      return (
        '<svg viewBox="0 0 46 12" width="46" height="12" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h30"/><path d="M31 3l7 3-7 3"/></svg>'
      );
    }
    return (
      '<svg viewBox="0 0 46 12" width="46" height="12" fill="currentColor" stroke="currentColor" stroke-width="1.6">' +
      '<path d="M2 6h28" fill="none"/><path d="M31 2l9 4-9 4z"/></svg>'
    );
  }

  function formatValue(key, value) {
    if (key === 'opacity') {
      return Math.round(value * 100) + '%';
    }
    if (key === 'zoom') {
      return Number(value).toFixed(1) + '×';
    }
    return String(value);
  }

  function findOptionMeta(key) {
    return defaults.OPTION_META[key] || { label: key, type: 'stepper' };
  }

  OC.createToolbar = function (options) {
    var host = document.getElementById('csc-toolbar');
    var toastEl = document.getElementById('csc-toast');
    var handlers = options || {};
    var settings = null;
    var currentTool = null;
    var currentOptions = {};
    var contextEl = null;
    var mainEl = null;
    var tipEl = null;
    var morePop = null;
    var choicePop = null;
    var colorPop = null;
    var toolRefs = {};
    var optionRefs = {};
    var undoBtn = null;
    var redoBtn = null;
    var passthroughBtn = null;
    var moreBtn = null;
    var toastTimer = null;
    var tipTimer = null;

    function build(initialSettings) {
      settings = initialSettings;
      host.innerHTML = '';
      toolRefs = {};
      optionRefs = {};

      mainEl = element('div', 'csc-main');
      host.appendChild(mainEl);

      var grip = element('span', 'csc-grip');
      grip.title = '拖动工具栏';
      grip.innerHTML = OC.icons.grip;
      mainEl.appendChild(grip);

      var tools = element('div', 'csc-group csc-tools');
      settings.toolbar.primary.forEach(function (toolId) {
        var button = makeToolButton(toolId);
        toolRefs[toolId] = button;
        tools.appendChild(button);
      });
      mainEl.appendChild(tools);

      mainEl.appendChild(element('span', 'csc-divider'));

      var actions = element('div', 'csc-group csc-actions');
      undoBtn = makeActionButton('undo', OC.icons.undo, '撤销（Ctrl+Z）');
      redoBtn = makeActionButton('redo', OC.icons.redo, '重做（Ctrl+Y）');
      actions.appendChild(undoBtn);
      actions.appendChild(redoBtn);
      actions.appendChild(makeActionButton('clear', OC.icons.trash, '清空全部'));
      actions.appendChild(makeActionButton('hide', OC.icons.hide, '隐藏工具栏（F9）'));
      passthroughBtn = makeActionButton('passthrough', OC.icons.mouseOff, '鼠标穿透（F10）');
      actions.appendChild(passthroughBtn);
      actions.appendChild(makeActionButton('exit', OC.icons.exit, '退出标注（Esc）', true));
      mainEl.appendChild(actions);

      moreBtn = element('button', 'csc-btn csc-more');
      moreBtn.type = 'button';
      moreBtn.title = '更多工具';
      moreBtn.innerHTML = OC.icons.more;
      mainEl.appendChild(moreBtn);

      contextEl = element('div', 'csc-context');
      contextEl.hidden = true;
      host.appendChild(contextEl);

      bindGripDrag(grip);
      buildMorePopover(settings);
      buildTip();
      setUndoRedo(false, false);
      host.hidden = false;
    }

    function makeToolButton(toolId) {
      var meta = toolMeta(toolId);
      var hasOptions = (defaults.TOOL_OPTION_KEYS[toolId] || []).length > 0;
      var button = element('button', 'csc-btn csc-tool' + (hasOptions ? ' has-options' : ''));
      button.type = 'button';
      button.dataset.tool = toolId;
      button.innerHTML =
        '<span class="csc-tool-icon">' +
        (OC.icons[toolId] || OC.icons.select) +
        '</span>' +
        (hasOptions ? '<span class="csc-caret">' + OC.icons.caret + '</span>' : '');
      button.title = meta.name + '（' + meta.hotkey + '）' + (hasOptions ? ' · 可调整参数' : '');
      return button;
    }

    function bindGripDrag(grip) {
      var dragging = null;
      grip.addEventListener('pointerdown', function (event) {
        var rect = host.getBoundingClientRect();
        host.style.transform = 'none';
        host.style.left = rect.left + 'px';
        host.style.top = rect.top + 'px';
        host.style.bottom = 'auto';
        dragging = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          w: rect.width,
          h: rect.height
        };
        try {
          grip.setPointerCapture(event.pointerId);
        } catch (err) {
          // 忽略不支持指针捕获的环境
        }
        event.preventDefault();
      });
      window.addEventListener('pointermove', function (event) {
        if (!dragging) {
          return;
        }
        var x = Math.min(Math.max(8, event.clientX - dragging.x), window.innerWidth - dragging.w - 8);
        var y = Math.min(Math.max(8, event.clientY - dragging.y), window.innerHeight - dragging.h - 8);
        host.style.left = x + 'px';
        host.style.top = y + 'px';
      });
      window.addEventListener('pointerup', function () {
        dragging = null;
      });
    }

    function makeActionButton(action, icon, title, danger) {
      var button = element('button', 'csc-btn' + (danger ? ' csc-danger' : ''));
      button.type = 'button';
      button.dataset.action = action;
      button.title = title;
      button.innerHTML = icon;
      return button;
    }

    /* ------------------------------------------------------------ 参数条 */

    function buildContext(toolId, toolOptions) {
      contextEl.innerHTML = '';
      optionRefs = {};
      var keys = defaults.TOOL_OPTION_KEYS[toolId] || [];
      if (!keys.length) {
        contextEl.hidden = true;
        return;
      }
      contextEl.hidden = false;

      keys.forEach(function (key) {
        if (key === 'color') {
          return;
        }
        var meta = findOptionMeta(key);
        var node = null;
        if (meta.type === 'lineStyle') {
          node = buildChoice(key, toolOptions, lineStyleChoices(), lineSample, '线条样式');
        } else if (meta.type === 'head') {
          node = buildChoice(key, toolOptions, headChoices(), headSample, '箭头样式');
        } else if (meta.type === 'stepper') {
          node = buildStepper(key, toolOptions, meta);
        } else if (meta.type === 'toggle') {
          node = buildToggle(key, toolOptions, meta);
        } else if (meta.type === 'slider') {
          node = buildSlider(key, toolOptions, meta);
        } else if (meta.type === 'segmented') {
          node = buildSegmented(key, toolOptions, meta);
        } else if (meta.type === 'font') {
          node = buildFontSelect(key, toolOptions, meta);
        }
        if (node) {
          contextEl.appendChild(node);
        }
      });

      if (keys.indexOf('color') !== -1) {
        contextEl.appendChild(buildPalette(toolOptions));
      }
    }

    function buildFontSelect(key, toolOptions, meta) {
      var group = element('div', 'csc-opt csc-font');
      var select = element('select');
      select.title = meta.label;
      defaults.FONT_FAMILIES.forEach(function (item) {
        var option = element('option');
        option.value = item.id;
        option.textContent = item.name;
        if (item.id === toolOptions[key]) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      select.addEventListener('change', function () {
        handlers.onOptionChange && handlers.onOptionChange(key, select.value);
      });
      group.appendChild(select);
      optionRefs[key] = {
        update: function (next) {
          select.value = next[key];
        }
      };
      return group;
    }

    function buildPalette(toolOptions) {
      var group = element('div', 'csc-ctx-group csc-palette');
      var custom = element('label', 'csc-custom-color');
      custom.title = '自定义颜色';
      custom.style.setProperty('--custom-color', toolOptions.color || '#ff3b30');
      var input = element('input');
      input.type = 'color';
      input.value = toolOptions.color || '#ffffff';
      custom.appendChild(input);
      group.appendChild(custom);

      settings.colors.palette.forEach(function (color) {
        var button = element('button', 'csc-swatch');
        button.type = 'button';
        button.dataset.color = color;
        button.title = color;
        button.style.background = color;
        if (color === toolOptions.color) {
          button.classList.add('is-active');
        }
        group.appendChild(button);
      });

      group.addEventListener('click', function (event) {
        var swatch = event.target.closest('[data-color]');
        if (swatch) {
          handlers.onOptionChange && handlers.onOptionChange('color', swatch.dataset.color);
        }
      });
      input.addEventListener('input', function () {
        handlers.onOptionChange && handlers.onOptionChange('color', input.value);
      });
      optionRefs.color = {
        update: function (next) {
          var buttons = group.querySelectorAll('[data-color]');
          for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('is-active', buttons[i].dataset.color === next.color);
          }
          input.value = next.color || '#ffffff';
          custom.style.setProperty('--custom-color', next.color || '#ff3b30');
        }
      };
      return group;
    }

    function buildChoice(key, toolOptions, choices, sampler, title) {
      var button = element('button', 'csc-opt csc-choice');
      button.type = 'button';
      button.title = title;
      button.innerHTML =
        '<span class="csc-choice-sample">' +
        sampler(toolOptions[key], 2) +
        '</span>' +
        '<span class="csc-choice-caret">' +
        OC.icons.caret +
        '</span>';
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        openChoicePopover(button, choices, key);
      });
      optionRefs[key] = {
        update: function (next) {
          button.querySelector('.csc-choice-sample').innerHTML = sampler(next[key], 2);
        }
      };
      return button;
    }

    function buildStepper(key, toolOptions, meta) {
      var group = element('div', 'csc-opt csc-stepper');
      group.innerHTML =
        '<span class="csc-opt-label">' +
        meta.label +
        '</span><button type="button" class="csc-step" data-step="-1">−</button>' +
        '<span class="csc-step-value">' +
        formatValue(key, toolOptions[key]) +
        '</span><button type="button" class="csc-step" data-step="1">+</button>';
      var valueEl = group.querySelector('.csc-step-value');
      group.addEventListener('click', function (event) {
        var button = event.target.closest('[data-step]');
        if (!button) {
          return;
        }
        var step = Number(button.dataset.step) * (meta.step || 1);
        var current = Number(currentOptions[key]) || meta.min || 0;
        var next = clamp(Math.round((current + step) * 10) / 10, meta.min, meta.max);
        handlers.onOptionChange && handlers.onOptionChange(key, next);
      });
      optionRefs[key] = {
        update: function (next) {
          valueEl.textContent = formatValue(key, next[key]);
        }
      };
      return group;
    }

    function buildToggle(key, toolOptions, meta) {
      var isFormat = key === 'bold' || key === 'italic';
      var button = element(
        'button',
        (isFormat ? 'csc-format' : 'csc-opt csc-toggle') + (toolOptions[key] ? ' is-active' : '')
      );
      button.type = 'button';
      button.title = meta.label;
      if (isFormat) {
        button.innerHTML =
          key === 'bold' ? '<span class="fmt-bold">B</span>' : '<span class="fmt-italic">I</span>';
      } else {
        button.innerHTML = '<span class="csc-toggle-mark"></span><span>' + meta.label + '</span>';
      }
      button.addEventListener('click', function () {
        handlers.onOptionChange && handlers.onOptionChange(key, !currentOptions[key]);
      });
      optionRefs[key] = {
        update: function (next) {
          button.classList.toggle('is-active', !!next[key]);
        }
      };
      return button;
    }

    function buildSlider(key, toolOptions, meta) {
      var group = element('div', 'csc-opt csc-slider');
      group.innerHTML =
        '<span class="csc-opt-label">' +
        meta.label +
        '</span><input type="range" min="' +
        meta.min +
        '" max="' +
        meta.max +
        '" step="' +
        meta.step +
        '" value="' +
        toolOptions[key] +
        '"><span class="csc-step-value">' +
        formatValue(key, toolOptions[key]) +
        '</span>';
      var input = group.querySelector('input');
      var valueEl = group.querySelector('.csc-step-value');
      input.addEventListener('input', function () {
        handlers.onOptionChange && handlers.onOptionChange(key, Number(input.value));
      });
      optionRefs[key] = {
        update: function (next) {
          input.value = String(next[key]);
          valueEl.textContent = formatValue(key, next[key]);
        }
      };
      return group;
    }

    function buildSegmented(key, toolOptions, meta) {
      var group = element('div', 'csc-opt csc-segmented');
      group.innerHTML = '<span class="csc-opt-label">' + meta.label + '</span>';
      var wrap = element('div', 'csc-segmented-wrap');
      meta.options.forEach(function (item) {
        var button = element('button', 'csc-segment' + (toolOptions[key] === item.id ? ' is-active' : ''));
        button.type = 'button';
        button.dataset.value = item.id;
        button.textContent = item.name;
        wrap.appendChild(button);
      });
      group.appendChild(wrap);
      group.addEventListener('click', function (event) {
        var button = event.target.closest('[data-value]');
        if (button) {
          handlers.onOptionChange && handlers.onOptionChange(key, button.dataset.value);
        }
      });
      optionRefs[key] = {
        update: function (next) {
          var buttons = group.querySelectorAll('[data-value]');
          for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('is-active', buttons[i].dataset.value === next[key]);
          }
        }
      };
      return group;
    }

    function lineStyleChoices() {
      return defaults.LINE_STYLES.map(function (item) {
        return { id: item.id, name: item.name, sample: lineSample(item.id, 2) };
      });
    }

    function headChoices() {
      return defaults.ARROW_HEADS.map(function (item) {
        return { id: item.id, name: item.name, sample: headSample(item.id) };
      });
    }

    function openChoicePopover(anchor, choices, key) {
      closePopovers();
      choicePop = element('div', 'csc-popover csc-choice-pop');
      choices.forEach(function (choice) {
        var item = element('button', 'csc-choice-item');
        item.type = 'button';
        item.dataset.value = choice.id;
        item.innerHTML = '<span class="csc-choice-item-sample">' + choice.sample + '</span><span>' + choice.name + '</span>';
        if (currentOptions[key] === choice.id) {
          item.classList.add('is-active');
        }
        choicePop.appendChild(item);
      });
      choicePop.addEventListener('click', function (event) {
        var item = event.target.closest('[data-value]');
        if (!item) {
          return;
        }
        handlers.onOptionChange && handlers.onOptionChange(key, item.dataset.value);
        closePopovers();
      });
      host.appendChild(choicePop);
      positionPopover(choicePop, anchor);
    }

    function positionPopover(popover, anchor) {
      var hostRect = host.getBoundingClientRect();
      var anchorRect = anchor.getBoundingClientRect();
      popover.style.bottom = host.offsetHeight + 8 + 'px';
      popover.style.left = anchorRect.left - hostRect.left + 'px';
      popover.style.transform = 'translateX(-50%)';
      var rect = popover.getBoundingClientRect();
      if (rect.left < 8) {
        popover.style.left = anchorRect.left - hostRect.left + (8 - rect.left) + 'px';
      } else if (rect.right > window.innerWidth - 8) {
        popover.style.left =
          anchorRect.left - hostRect.left - (rect.right - (window.innerWidth - 8)) + 'px';
      }
    }

    /* ------------------------------------------------------------ 预览 */

    function buildMorePopover(initialSettings) {
      morePop = element('div', 'csc-popover csc-more-pop');
      morePop.hidden = true;
      var title = element('div', 'csc-pop-title', '更多工具');
      morePop.appendChild(title);
      if (!initialSettings.toolbar.secondary.length) {
        morePop.appendChild(element('div', 'csc-pop-hint', '全部工具已在主工具条'));
      }
      initialSettings.toolbar.secondary.forEach(function (toolId) {
        var meta = toolMeta(toolId);
        var item = element('button', 'csc-more-item');
        item.type = 'button';
        item.dataset.tool = toolId;
        item.innerHTML =
          '<span class="csc-more-icon">' +
          (OC.icons[toolId] || OC.icons.select) +
          '</span><span class="csc-more-name">' +
          meta.name +
          '</span><span class="csc-more-key">' +
          meta.hotkey +
          '</span>';
        morePop.appendChild(item);
      });
      host.appendChild(morePop);
    }

    function buildTip() {
      tipEl = element('div', 'csc-tip');
      tipEl.hidden = true;
      host.appendChild(tipEl);
    }

    function showTip(button) {
      var toolId = button.dataset.tool;
      var meta = toolMeta(toolId);
      if (!meta) {
        return;
      }
      var hasOptions = (defaults.TOOL_OPTION_KEYS[toolId] || []).length > 0;
      tipEl.innerHTML =
        '<span class="csc-tip-name">' +
        meta.name +
        '</span><span class="csc-tip-key">' +
        meta.hotkey +
        '</span>' +
        (hasOptions ? '<span class="csc-tip-adjust">调整</span>' : '');
      tipEl.hidden = false;
      var hostRect = host.getBoundingClientRect();
      var rect = button.getBoundingClientRect();
      tipEl.style.left = rect.left - hostRect.left + rect.width / 2 + 'px';
      tipEl.style.bottom = host.offsetHeight + 8 + 'px';
      var tipRect = tipEl.getBoundingClientRect();
      if (tipRect.left < 8) {
        tipEl.style.left = rect.left - hostRect.left + (8 - tipRect.left) + 'px';
      } else if (tipRect.right > window.innerWidth - 8) {
        tipEl.style.left =
          rect.left - hostRect.left - (tipRect.right - (window.innerWidth - 8)) + 'px';
      }
    }

    function hideTip() {
      if (tipEl) {
        tipEl.hidden = true;
      }
    }

    /* --------------------------------------------------------- 事件绑定 */

    host.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || !host.contains(button)) {
        return;
      }
      event.stopPropagation();
      if (button.dataset.tool) {
        closePopovers();
        hideTip();
        handlers.onTool && handlers.onTool(button.dataset.tool);
        return;
      }
      if (button === moreBtn) {
        toggleMore();
        return;
      }
      var action = button.dataset.action;
      if (action) {
        closePopovers();
        handlers.onAction && handlers.onAction(action);
      }
    });

    host.addEventListener('mouseover', function (event) {
      var button = event.target.closest('[data-tool]');
      if (!button) {
        return;
      }
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () {
        showTip(button);
      }, 120);
    });

    host.addEventListener('mouseout', function (event) {
      var button = event.target.closest('[data-tool]');
      if (!button) {
        return;
      }
      clearTimeout(tipTimer);
      hideTip();
    });

    document.addEventListener('pointerdown', function (event) {
      if (host.contains(event.target)) {
        return;
      }
      closePopovers();
      hideTip();
    });

    function toggleMore() {
      var wasHidden = morePop.hidden;
      closePopovers();
      if (wasHidden) {
        morePop.hidden = false;
        var hostRect = host.getBoundingClientRect();
        var rect = moreBtn.getBoundingClientRect();
        morePop.style.bottom = host.offsetHeight + 8 + 'px';
        morePop.style.left = rect.left - hostRect.left + 'px';
        morePop.style.transform = 'translateX(-50%)';
        var popRect = morePop.getBoundingClientRect();
        if (popRect.left < 8) {
          morePop.style.left = rect.left - hostRect.left + (8 - popRect.left) + 'px';
        } else if (popRect.right > window.innerWidth - 8) {
          morePop.style.left =
            rect.left - hostRect.left - (popRect.right - (window.innerWidth - 8)) + 'px';
        }
      }
    }

    function closePopovers() {
      if (morePop) {
        morePop.hidden = true;
      }
      if (choicePop) {
        choicePop.remove();
        choicePop = null;
      }
      if (colorPop) {
        colorPop.remove();
        colorPop = null;
      }
    }

    function isPopoverOpen() {
      return !!(morePop && !morePop.hidden) || !!choicePop;
    }

    /* --------------------------------------------------------- 对外接口 */

    function setTool(toolId, toolOptions) {
      currentTool = toolId;
      currentOptions = toolOptions || {};
      Object.keys(toolRefs).forEach(function (id) {
        toolRefs[id].classList.toggle('is-active', id === toolId);
      });
      if (moreBtn) {
        var inSecondary = morePop
          ? Array.prototype.some.call(morePop.querySelectorAll('[data-tool]'), function (node) {
              return node.dataset.tool === toolId;
            })
          : false;
        moreBtn.classList.toggle('is-active', inSecondary);
      }
      closePopovers();
      buildContext(toolId, currentOptions);
    }

    function clearTool() {
      currentTool = null;
      currentOptions = {};
      Object.keys(toolRefs).forEach(function (id) {
        toolRefs[id].classList.remove('is-active');
      });
      if (moreBtn) {
        moreBtn.classList.remove('is-active');
      }
      closePopovers();
      hideTip();
      contextEl.innerHTML = '';
      contextEl.hidden = true;
    }

    function toggleContext() {
      if (!currentTool) {
        return;
      }
      if (!(defaults.TOOL_OPTION_KEYS[currentTool] || []).length) {
        return;
      }
      if (contextEl.hidden) {
        contextEl.hidden = false;
      } else {
        closePopovers();
        contextEl.hidden = true;
      }
    }

    function updateOptions(toolOptions) {
      currentOptions = toolOptions || currentOptions;
      Object.keys(optionRefs).forEach(function (key) {
        if (optionRefs[key] && typeof optionRefs[key].update === 'function') {
          optionRefs[key].update(currentOptions);
        }
      });
    }

    function setUndoRedo(canUndo, canRedo) {
      if (undoBtn) {
        undoBtn.disabled = !canUndo;
      }
      if (redoBtn) {
        redoBtn.disabled = !canRedo;
      }
    }

    function setVisible(visible) {
      host.hidden = !visible;
      if (!visible) {
        closePopovers();
        hideTip();
      }
    }

    function setPassthrough(on) {
      if (!passthroughBtn) {
        return;
      }
      passthroughBtn.classList.toggle('is-active', !!on);
      passthroughBtn.innerHTML = on ? OC.icons.mouseOn : OC.icons.mouseOff;
      passthroughBtn.title = on ? '鼠标穿透已开启，点击退出（F10）' : '鼠标穿透（F10）';
    }

    function containsPoint(x, y) {
      var rect = host.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function setBusy(busy) {
      host.classList.toggle('csc-busy', !!busy);
    }

    function toast(message) {
      if (!toastEl) {
        return;
      }
      toastEl.textContent = message;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.hidden = true;
      }, 2200);
    }

    return {
      build: build,
      setTool: setTool,
      clearTool: clearTool,
      toggleContext: toggleContext,
      updateOptions: updateOptions,
      setUndoRedo: setUndoRedo,
      setVisible: setVisible,
      setPassthrough: setPassthrough,
      containsPoint: containsPoint,
      isVisible: function () {
        return !host.hidden;
      },
      setBusy: setBusy,
      toast: toast,
      closePopovers: closePopovers,
      isPopoverOpen: isPopoverOpen
    };
  };
})(window);
