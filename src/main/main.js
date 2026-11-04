/**
 * 主界面控制器：页签式配置 + 拖拽排序 + 实时预览
 */
(function () {
  'use strict';

  var SC = window.SC;
  var OC = window.OC;
  var HOTKEY_CMD = '屏幕标注';
  var settings = null;
  var displays = [];
  var activeTab = 'general';
  var logTimer = null;
  var dragState = null;
  var openToolId = 'arrow';
  var toolsHintTimer = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function hasUtools() {
    return typeof window.utools !== 'undefined';
  }

  function hasServices() {
    return typeof window.services !== 'undefined';
  }

  function toolMeta(id) {
    return SC.defaults.toolById(id) || { id: id, name: id, hotkey: '' };
  }

  function saveSettings(next, options) {
    settings = hasServices() ? window.services.saveSettings(next) : SC.settings.mergeSettings(next);
    refreshStatus();
    if (options && options.toolbar) {
      renderToolbarLists();
      renderPreview();
    }
    if (options && options.palette) {
      renderPalette();
    }
  }

  function showToolsHint(text) {
    var hint = $('#tools-hint');
    if (!hint) {
      return;
    }
    hint.textContent = text;
    hint.classList.add('is-visible');
    clearTimeout(toolsHintTimer);
    toolsHintTimer = setTimeout(function () {
      hint.classList.remove('is-visible');
    }, 2400);
  }

  /* ------------------------------------------------------------- 状态 */

  function refreshStatus() {
    var hotkey = hasServices() ? window.services.getCmdHotKey(HOTKEY_CMD) : null;
    var chip = $('#btn-hotkey');
    chip.textContent = hotkey || '设置快捷键';
    chip.classList.toggle('has-hotkey', !!hotkey);
    chip.title = hotkey ? '全局快捷键 ' + hotkey + '，点击修改' : '点击设置全局快捷键';
  }

  /* ------------------------------------------------------------- 页签 */

  function activateTab(name) {
    activeTab = name;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (panel) {
      panel.classList.toggle('is-active', panel.dataset.panel === name);
    });
    if (name === 'toolbar') {
      renderToolbarLists();
      renderPreview();
    }
    if (name === 'tools') {
      renderToolSettings();
    }
  }

  function bindTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () {
        activateTab(tab.dataset.tab);
      });
    });
  }

  /* ------------------------------------------------------------- 常规 */

  function loadDisplays() {
    try {
      displays = hasUtools() ? window.utools.getAllDisplays() : [];
    } catch (err) {
      displays = [];
    }
  }

  function renderGeneral() {
    var displaySelect = $('#opt-display');
    displaySelect.innerHTML = '';
    var cursorOption = document.createElement('option');
    cursorOption.value = 'cursor';
    cursorOption.textContent = '鼠标所在屏幕';
    var primaryOption = document.createElement('option');
    primaryOption.value = 'primary';
    primaryOption.textContent = '主显示器';
    displaySelect.appendChild(cursorOption);
    displaySelect.appendChild(primaryOption);

    var saved = settings.session.display;
    var savedFound = false;
    displays.forEach(function (display, index) {
      var option = document.createElement('option');
      option.value = String(display.id);
      var label = display.label ? display.label : '显示器 ' + (index + 1);
      option.textContent = label + ' · ' + display.bounds.width + '×' + display.bounds.height;
      if (String(display.id) === String(saved)) {
        option.selected = true;
        savedFound = true;
      }
      displaySelect.appendChild(option);
    });
    if (typeof saved === 'number' && !savedFound) {
      var missing = document.createElement('option');
      missing.value = String(saved);
      missing.textContent = '原指定屏幕已断开';
      missing.selected = true;
      displaySelect.appendChild(missing);
    }
    if (saved === 'cursor' || saved === 'primary') {
      displaySelect.value = saved;
    }

    var activationSelect = $('#opt-activation-tool');
    activationSelect.innerHTML = '';
    var noneOption = document.createElement('option');
    noneOption.value = 'none';
    noneOption.textContent = '不选中任何工具';
    activationSelect.appendChild(noneOption);
    SC.defaults.TOOLS.forEach(function (tool) {
      var option = document.createElement('option');
      option.value = tool.id;
      option.textContent = tool.name;
      if (tool.id === settings.session.activationTool) {
        option.selected = true;
      }
      activationSelect.appendChild(option);
    });
    activationSelect.value = settings.session.activationTool || 'none';

    $('#opt-clear').checked = settings.session.clearOnExit;
    $('#opt-hide-toolbar').checked = settings.session.hideToolbarOnStart;
  }

  /* --------------------------------------------------------- 工具栏列表 */

  function renderToolbarLists() {
    renderList($('#primary-list'), settings.toolbar.primary, 'primary');
    renderList($('#secondary-list'), settings.toolbar.secondary, 'secondary');
  }

  function renderList(listEl, ids, area) {
    listEl.innerHTML = '';
    ids.forEach(function (id) {
      var meta = toolMeta(id);
      var item = document.createElement('li');
      item.className = 'drag-item';
      item.draggable = true;
      item.tabIndex = 0;
      item.dataset.tool = id;
      item.dataset.area = area;
      item.innerHTML =
        '<span class="drag-grip">' +
        OC.icons.grip +
        '</span><span class="drag-icon">' +
        (OC.icons[id] || OC.icons.select) +
        '</span><span class="drag-name">' +
        meta.name +
        '</span><span class="drag-hotkey">' +
        meta.hotkey +
        '</span>';
      item.addEventListener('dragstart', function (event) {
        dragState = { tool: id, area: area };
        item.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
      });
      item.addEventListener('dragend', function () {
        item.classList.remove('is-dragging');
        clearDropMarks();
        dragState = null;
        Array.prototype.forEach.call(document.querySelectorAll('.drag-list'), function (list) {
          list.classList.remove('is-over');
        });
      });
      item.addEventListener('keydown', function (event) {
        if (!event.altKey) {
          return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          var delta = event.key === 'ArrowUp' ? -1 : 1;
          saveSettings(SC.settings.reorderTool(settings, id, delta), { toolbar: true });
          focusTool(id);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          var target = area === 'primary' ? 'secondary' : 'primary';
          saveSettings(SC.settings.moveTool(settings, id, target), { toolbar: true });
          focusTool(id);
        }
      });
      listEl.appendChild(item);
    });
  }

  function focusTool(id) {
    var node = document.querySelector('.drag-item[data-tool="' + id + '"]');
    if (node) {
      node.focus();
    }
  }

  function clearDropMarks() {
    Array.prototype.forEach.call(document.querySelectorAll('.drag-item'), function (item) {
      item.classList.remove('drop-before', 'drop-after');
    });
  }

  function dropIndex(listEl, clientY) {
    var items = Array.prototype.slice.call(listEl.querySelectorAll('.drag-item'));
    for (var i = 0; i < items.length; i++) {
      var rect = items[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return i;
      }
    }
    return items.length;
  }

  function bindDragLists() {
    Array.prototype.forEach.call(document.querySelectorAll('.drag-list'), function (listEl) {
      listEl.addEventListener('dragover', function (event) {
        if (!dragState) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        listEl.classList.add('is-over');
        clearDropMarks();
        var index = dropIndex(listEl, event.clientY);
        var items = listEl.querySelectorAll('.drag-item');
        if (!items.length) {
          return;
        }
        if (index >= items.length) {
          items[items.length - 1].classList.add('drop-after');
        } else {
          items[index].classList.add('drop-before');
        }
      });
      listEl.addEventListener('dragleave', function (event) {
        if (!listEl.contains(event.relatedTarget)) {
          listEl.classList.remove('is-over');
          clearDropMarks();
        }
      });
      listEl.addEventListener('drop', function (event) {
        if (!dragState) {
          return;
        }
        event.preventDefault();
        var index = dropIndex(listEl, event.clientY);
        var area = listEl.dataset.area;
        var fromIndex = settings.toolbar[dragState.area].indexOf(dragState.tool);
        if (dragState.area === area && fromIndex !== -1 && fromIndex < index) {
          index -= 1;
        }
        var moved = SC.settings.insertTool(settings, dragState.tool, area, index);
        clearDropMarks();
        listEl.classList.remove('is-over');
        var tool = dragState.tool;
        dragState = null;
        saveSettings(moved, { toolbar: true });
        focusTool(tool);
      });
    });
  }

  /* --------------------------------------------------------------- 预览 */

  function previewToolButton(id, active) {
    var meta = toolMeta(id);
    return (
      '<span class="pv-btn' +
      (active ? ' is-active' : '') +
      '" data-tool="' +
      id +
      '" title="' +
      meta.name +
      ' · ' +
      meta.hotkey +
      '">' +
      (OC.icons[id] || OC.icons.select) +
      '</span>'
    );
  }

  function renderPreview() {
    var stage = $('#preview-stage');
    if (!stage) {
      return;
    }
    stage.innerHTML = '';
    var showMore = $('#preview-more') && $('#preview-more').checked;

    if (showMore && settings.toolbar.secondary.length) {
      var more = document.createElement('div');
      more.className = 'pv-more';
      more.innerHTML =
        '<div class="pv-more-title">更多工具</div>' +
        settings.toolbar.secondary
          .map(function (id) {
            var meta = toolMeta(id);
            return (
              '<div class="pv-more-item"><span>' +
              (OC.icons[id] || OC.icons.select) +
              '</span><span class="pv-more-name">' +
              meta.name +
              '</span><span class="pv-more-key">' +
              meta.hotkey +
              '</span></div>'
            );
          })
          .join('');
      stage.appendChild(more);
    }

    var bar = document.createElement('div');
    bar.className = 'preview-bar';
    var activeId = settings.toolbar.primary.indexOf('arrow') !== -1 ? 'arrow' : settings.toolbar.primary[0];
    bar.innerHTML =
      settings.toolbar.primary
        .map(function (id) {
          return previewToolButton(id, id === activeId);
        })
        .join('') +
      '<span class="pv-btn" title="更多工具">' +
      OC.icons.more +
      '</span>';
    stage.appendChild(bar);
  }

  /* ------------------------------------------------------------ 工具参数 */

  function renderToolSettings() {
    var host = $('#tool-settings');
    if (!host) {
      return;
    }
    host.innerHTML = '';
    SC.defaults.TOOLS.forEach(function (tool) {
      var keys = (SC.defaults.TOOL_OPTION_KEYS[tool.id] || []).filter(function (key) {
        return key !== 'color';
      });
      var options = settings.toolOptions[tool.id] || {};
      var details = document.createElement('details');
      details.className = 'tool-setting';
      details.open = tool.id === openToolId;
      details.addEventListener('toggle', function () {
        if (details.open) {
          openToolId = tool.id;
        } else if (openToolId === tool.id) {
          openToolId = null;
        }
      });
      var summary = document.createElement('summary');
      summary.innerHTML =
        '<span class="tool-setting-icon">' +
        (OC.icons[tool.id] || OC.icons.select) +
        '</span><span class="tool-setting-name">' +
        tool.name +
        '</span><span class="tool-setting-count">' +
        (keys.length ? keys.length + ' 项参数' : '无参数') +
        '</span><span class="tool-setting-key">' +
        tool.hotkey +
        '</span>';
      details.appendChild(summary);

      if (keys.length) {
        var body = document.createElement('div');
        body.className = 'tool-setting-body';
        keys.forEach(function (key) {
          body.appendChild(buildOptionRow(tool.id, key, options[key]));
        });
        var actions = document.createElement('div');
        actions.className = 'tool-actions';
        var reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'button ghost small';
        reset.textContent = '重置此工具参数';
        reset.addEventListener('click', function (event) {
          event.stopPropagation();
          openToolId = tool.id;
          saveSettings(SC.settings.resetToolOptions(settings, tool.id));
          renderToolSettings();
        });
        actions.appendChild(reset);
        body.appendChild(actions);
        details.appendChild(body);
      }
      host.appendChild(details);
    });
  }

  function buildOptionRow(toolId, key, value) {
    var meta = SC.defaults.OPTION_META[key] || { label: key, type: 'stepper' };
    var row = document.createElement('label');
    row.className = 'option-row';
    var label = document.createElement('span');
    label.textContent = meta.label;
    row.appendChild(label);

    function commit(nextValue) {
      var next = SC.settings.clone(settings);
      next.toolOptions[toolId][key] = nextValue;
      saveSettings(next);
    }

    if (meta.type === 'toggle') {
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!value;
      checkbox.addEventListener('change', function () {
        commit(checkbox.checked);
      });
      row.appendChild(checkbox);
      return row;
    }

    if (meta.type === 'stepper') {
      var number = document.createElement('input');
      number.type = 'number';
      number.min = String(meta.min);
      number.max = String(meta.max);
      number.step = String(meta.step || 1);
      number.value = String(value);
      number.addEventListener('change', function () {
        var next = Math.min(meta.max, Math.max(meta.min, Number(number.value) || meta.min));
        number.value = String(next);
        commit(next);
      });
      row.appendChild(number);
      return row;
    }

    if (meta.type === 'slider') {
      var wrap = document.createElement('span');
      wrap.className = 'option-slider';
      var range = document.createElement('input');
      range.type = 'range';
      range.min = String(meta.min);
      range.max = String(meta.max);
      range.step = String(meta.step);
      range.value = String(value);
      var text = document.createElement('span');
      text.className = 'option-value';
      text.textContent = Math.round(value * 100) + '%';
      range.addEventListener('input', function () {
        text.textContent = Math.round(Number(range.value) * 100) + '%';
        commit(Number(range.value));
      });
      wrap.appendChild(range);
      wrap.appendChild(text);
      row.appendChild(wrap);
      return row;
    }

    // lineStyle / head / segmented / serialType
    var choices =
      meta.type === 'lineStyle'
        ? SC.defaults.LINE_STYLES
        : meta.type === 'head'
          ? SC.defaults.ARROW_HEADS
          : meta.type === 'font'
            ? SC.defaults.FONT_FAMILIES
            : meta.options || [];
    var select = document.createElement('select');
    choices.forEach(function (choice) {
      var option = document.createElement('option');
      option.value = choice.id;
      option.textContent = choice.name;
      if (choice.id === value) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    select.addEventListener('change', function () {
      commit(select.value);
    });
    row.appendChild(select);
    return row;
  }

  /* --------------------------------------------------------------- 颜色 */

  function renderPalette() {
    var host = $('#palette');
    host.innerHTML = '';
    settings.colors.palette.forEach(function (color, index) {
      var wrap = document.createElement('div');
      wrap.className = 'palette-item';
      var input = document.createElement('input');
      input.type = 'color';
      input.value = color;
      input.dataset.index = String(index);
      input.title = color;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'palette-remove';
      remove.textContent = '×';
      remove.dataset.index = String(index);
      remove.title = '删除颜色';
      remove.disabled = settings.colors.palette.length <= 2;
      wrap.appendChild(input);
      wrap.appendChild(remove);
      host.appendChild(wrap);
    });
    $('#opt-shared').checked = settings.colors.shared;
    $('#opt-default-color').value = settings.colors.default;
  }

  /* ------------------------------------------------------------- 快捷键 */

  function renderShortcuts() {
    $('#sc-exit').value = settings.shortcuts.exit;
    $('#sc-toggle').value = settings.shortcuts.toggleToolbar;
    $('#sc-pass').value = settings.shortcuts.passthrough;
  }

  function shortcutConflict(key, value) {
    var keys = Object.keys(settings.shortcuts);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== key && settings.shortcuts[keys[i]] === value) {
        return keys[i];
      }
    }
    return null;
  }

  function bindShortcutInput(selector, key) {
    var input = $(selector);
    input.addEventListener('keydown', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
        return;
      }
      var parts = [];
      if (event.ctrlKey) {
        parts.push('Ctrl');
      }
      if (event.altKey) {
        parts.push('Alt');
      }
      if (event.shiftKey) {
        parts.push('Shift');
      }
      if (event.metaKey) {
        parts.push('Meta');
      }
      parts.push(event.key === ' ' ? 'Space' : event.key);
      var normalized = SC.settings.normalizeShortcut(parts.join('+'), null);
      if (!normalized || shortcutConflict(key, normalized)) {
        input.classList.add('invalid');
        setTimeout(function () {
          input.classList.remove('invalid');
        }, 900);
        return;
      }
      var next = SC.settings.clone(settings);
      next.shortcuts[key] = normalized;
      saveSettings(next);
      input.value = normalized;
      input.blur();
    });
  }

  /* ---------------------------------------------------------------- 日志 */

  function refreshLog() {
    if (!hasServices()) {
      return;
    }
    var log = $('#log');
    var lines = window.services.readLogTail(40);
    log.textContent = lines.length ? lines.join('\n') : '暂无日志';
    log.scrollTop = log.scrollHeight;
  }

  function runSelftest() {
    var host = $('#selftest-result');
    var result = SC.selftest.run();
    host.innerHTML = '';
    var summary = document.createElement('div');
    summary.className = result.failed ? 'selftest-fail' : 'selftest-pass';
    summary.textContent = '通过 ' + result.passed + ' 项' + (result.failed ? '，失败 ' + result.failed + ' 项' : '，全部通过');
    host.appendChild(summary);
    result.results.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'selftest-row-item ' + (item.ok ? 'ok' : 'fail');
      row.textContent = (item.ok ? '✓ ' : '✗ ') + item.name + (item.ok ? '' : ' — ' + item.message);
      host.appendChild(row);
    });
  }

  /* ---------------------------------------------------------------- 会话 */

  function startSession(mode) {
    if (!hasServices()) {
      return;
    }
    var result = window.services.startSession(mode, { settings: settings });
    if (!result || !result.ok) {
      window.alert('启动失败：' + ((result && result.error) || '未知错误'));
      return;
    }
    if (hasUtools() && window.utools.getWindowType() === 'main') {
      window.utools.hideMainWindow();
    }
    refreshStatus();
    setTimeout(refreshLog, 400);
  }

  /* ---------------------------------------------------------------- 绑定 */

  function bindEvents() {
    bindTabs();
    bindDragLists();

    $('#btn-start').addEventListener('click', function () {
      startSession('overlay');
    });
    $('#btn-spike').addEventListener('click', function () {
      startSession('spike');
    });
    $('#btn-hotkey').addEventListener('click', function () {
      if (hasServices()) {
        window.services.openHotkeySetting(HOTKEY_CMD);
      }
    });
    $('#btn-hotkey-row').addEventListener('click', function () {
      if (hasServices()) {
        window.services.openHotkeySetting(HOTKEY_CMD);
      }
    });

    $('#opt-display').addEventListener('change', function (event) {
      var value = event.target.value;
      var next = SC.settings.clone(settings);
      next.session.display = value === 'cursor' || value === 'primary' ? value : Number(value);
      saveSettings(next);
    });
    $('#opt-clear').addEventListener('change', function (event) {
      var next = SC.settings.clone(settings);
      next.session.clearOnExit = event.target.checked;
      saveSettings(next);
    });
    $('#opt-hide-toolbar').addEventListener('change', function (event) {
      var next = SC.settings.clone(settings);
      next.session.hideToolbarOnStart = event.target.checked;
      saveSettings(next);
    });
    $('#opt-activation-tool').addEventListener('change', function (event) {
      var next = SC.settings.clone(settings);
      next.session.activationTool = event.target.value;
      saveSettings(next);
    });

    $('#btn-toolbar-reset').addEventListener('click', function () {
      var next = SC.settings.clone(settings);
      next.toolbar = SC.settings.clone(SC.defaults.DEFAULT_SETTINGS.toolbar);
      saveSettings(next, { toolbar: true });
    });
    $('#btn-reset-all-tools').addEventListener('click', function () {
      saveSettings(SC.settings.resetAllToolOptions(settings));
      renderToolSettings();
      showToolsHint('已重置全部工具参数');
    });
    $('#preview-more').addEventListener('change', renderPreview);

    $('#opt-shared').addEventListener('change', function (event) {
      var next = SC.settings.clone(settings);
      next.colors.shared = event.target.checked;
      saveSettings(next);
    });
    $('#opt-default-color').addEventListener('input', function (event) {
      var next = SC.settings.clone(settings);
      next.colors.default = event.target.value;
      saveSettings(next);
    });
    $('#palette').addEventListener('input', function (event) {
      var input = event.target;
      if (input.type !== 'color') {
        return;
      }
      saveSettings(SC.settings.setPaletteColor(settings, Number(input.dataset.index), input.value));
    });
    $('#palette').addEventListener('click', function (event) {
      var button = event.target.closest('.palette-remove');
      if (!button) {
        return;
      }
      var color = settings.colors.palette[Number(button.dataset.index)];
      saveSettings(SC.settings.removePaletteColor(settings, color), { palette: true });
    });
    $('#btn-palette-add').addEventListener('click', function () {
      saveSettings(SC.settings.addPaletteColor(settings, $('#palette-new').value), { palette: true });
    });
    $('#btn-palette-reset').addEventListener('click', function () {
      var next = SC.settings.clone(settings);
      next.colors.palette = SC.defaults.PALETTE.slice();
      saveSettings(next, { palette: true });
    });

    bindShortcutInput('#sc-exit', 'exit');
    bindShortcutInput('#sc-toggle', 'toggleToolbar');
    bindShortcutInput('#sc-pass', 'passthrough');

    $('#btn-log-download').addEventListener('click', function () {
      if (!hasServices() || typeof window.services.exportLog !== 'function') {
        return;
      }
      var result = window.services.exportLog();
      var hint = $('#log-hint');
      if (!result) {
        return;
      }
      if (result.cancelled) {
        hint.textContent = '已取消保存';
      } else if (result.ok) {
        hint.textContent = '已保存到 ' + result.path;
      } else {
        hint.textContent = '保存失败：' + result.error;
      }
      setTimeout(function () {
        hint.textContent = '';
      }, 8000);
    });
    $('#btn-log').addEventListener('click', function () {
      if (hasServices()) {
        window.services.openLogFolder();
      }
    });
    $('#btn-selftest').addEventListener('click', runSelftest);
  }

  /* ---------------------------------------------------------------- 启动 */

  function init() {
    bindEvents();

    if (hasServices()) {
      settings = window.services.getSettings() || SC.settings.mergeSettings(null);
    } else {
      settings = SC.settings.mergeSettings(null);
    }

    loadDisplays();
    renderGeneral();
    renderToolbarLists();
    renderPreview();
    renderToolSettings();
    renderPalette();
    renderShortcuts();
    refreshStatus();
    refreshLog();
    clearInterval(logTimer);
    logTimer = setInterval(refreshLog, 2500);

    var initialTab = '';
    try {
      var params = new URLSearchParams(window.location.search || '');
      initialTab = params.get('tab') || '';
    } catch (err) {
      initialTab = '';
    }
    if (!initialTab) {
      initialTab = String(window.location.hash || '').replace('#', '');
    }
    if (initialTab && document.querySelector('.tab[data-tab="' + initialTab + '"]')) {
      activateTab(initialTab);
    }

    if (!hasUtools()) {
      return;
    }

    window.utools.onPluginEnter(function (action) {
      if (hasServices()) {
        window.services.notifyEnter(action);
      }
      if (action.code === 'annotate' && (action.from === 'hotkey' || action.from === 'panel')) {
        startSession('overlay');
        return;
      }
      if (hasServices()) {
        settings = window.services.getSettings() || SC.settings.mergeSettings(null);
      }
      loadDisplays();
      renderGeneral();
      renderToolbarLists();
      renderPreview();
      renderToolSettings();
      renderPalette();
      renderShortcuts();
      refreshStatus();
      refreshLog();
    });

    window.utools.onPluginOut(function (isKill) {
      if (hasServices()) {
        window.services.notifyOut(isKill);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
