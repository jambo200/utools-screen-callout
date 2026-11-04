/**
 * 预览脚本：模拟指针事件画几笔，用于静态视觉检查（不参与 uTools 运行）
 */
(function () {
  function canvas() {
    return document.getElementById('csc-canvas');
  }

  function pointer(type, x, y, target) {
    var node = target || canvas();
    node.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse'
      })
    );
  }

  function down(x, y) {
    pointer('pointerdown', x, y);
  }

  function move(x, y) {
    pointer('pointermove', x, y, window);
  }

  function up() {
    pointer('pointerup', 0, 0, window);
  }

  function selectTool(id) {
    var button = document.querySelector('[data-tool="' + id + '"]');
    if (button) {
      button.click();
    }
  }

  function drawArrow() {
    down(240, 200);
    move(430, 280);
    up();
  }

  function drawRect() {
    selectTool('rect');
    down(520, 180);
    move(760, 320);
    up();
  }

  function drawEllipse() {
    selectTool('ellipse');
    down(820, 180);
    move(1040, 310);
    up();
  }

  function drawPen() {
    selectTool('pen');
    down(260, 420);
    for (var i = 1; i <= 40; i++) {
      move(260 + i * 9, 420 + Math.sin(i / 4) * 34);
    }
    up();
  }

  function drawSerial() {
    selectTool('serial');
    down(700, 430);
    up();
    down(760, 430);
    up();
    down(820, 430);
    up();
  }

  function drawSpotlight() {
    selectTool('spotlight');
    down(600, 500);
    move(900, 640);
    up();
  }

  function drawText() {
    selectTool('text');
    down(300, 540);
    up();
    var editor = document.getElementById('csc-editor');
    if (!editor) {
      return;
    }
    editor.value = '演讲标注测试';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      if (window.location.search.indexOf('empty') !== -1) {
        return;
      }
      var params = new URLSearchParams(window.location.search);
      if (params.get('solo')) {
        selectTool(params.get('solo'));
        if (params.get('hidetext')) {
          setTimeout(function () {
            selectTool(params.get('solo'));
          }, 150);
        }
        return;
      }
      drawArrow();
      drawRect();
      drawEllipse();
      drawPen();
      drawSerial();
      drawSpotlight();
      drawText();
      var toast = document.getElementById('csc-toast');
      if (toast) {
        toast.hidden = true;
      }
      if (window.location.search.indexOf('undo') !== -1) {
        setTimeout(function () {
          var undoBtn = document.querySelector('[data-action="undo"]');
          if (undoBtn) {
            undoBtn.click();
            undoBtn.click();
          }
        }, 80);
      }
      if (window.location.search.indexOf('arrow') !== -1) {
        selectTool('arrow');
        setTimeout(function () {
          var choice = document.querySelector('.csc-context .csc-choice');
          if (choice) {
            choice.click();
          }
        }, 120);
      }
      var params = new URLSearchParams(window.location.search);
      if (params.get('tool')) {
        selectTool(params.get('tool'));
      }
      if (params.get('hidetext')) {
        selectTool('text');
      }
      if (params.get('tip')) {
        var tipTarget = document.querySelector('[data-tool="' + params.get('tip') + '"]');
        if (tipTarget) {
          setTimeout(function () {
            tipTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          }, 160);
        }
      }
    }, 200);
  });
})();
