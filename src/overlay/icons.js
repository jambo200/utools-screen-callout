/**
 * 线性图标集：24 网格 / 1.6 描边，工具栏、配置页预览共用
 */
(function (root) {
  'use strict';

  var OC = root.OC || (root.OC = {});

  function svg(body, opts) {
    var size = opts && opts.size ? opts.size : 20;
    return (
      '<svg viewBox="0 0 24 24" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body +
      '</svg>'
    );
  }

  OC.icons = {
    select: svg('<path d="M5.5 3.8l5.8 14.4 2.1-5.6 5.6-2.1z"/>'),
    arrow: svg('<path d="M4.5 19.5L19.5 4.5"/><path d="M12.4 4.5h7.1v7.1"/>'),
    line: svg('<path d="M4.5 19.5L19.5 4.5"/>'),
    rect: svg('<rect x="4" y="6.2" width="16" height="11.6" rx="1.2"/>'),
    ellipse: svg('<ellipse cx="12" cy="12" rx="8" ry="6"/>'),
    pen: svg('<path d="M4.2 20l4.3-1 9.4-9.4-3.3-3.3L5.2 15.7z"/><path d="M14.6 6.3l3.3 3.3"/>'),
    highlighter: svg('<path d="M7.2 14.8l6.4-8.6 4.2 3.1-6.4 8.6z"/><path d="M5 20h9"/>'),
    text: svg('<path d="M5 5.6h14"/><path d="M12 5.6v13"/>'),
    serial: svg('<circle cx="12" cy="12" r="8"/><path d="M10.2 9.4l2-1.2v7.4"/>'),
    spotlight: svg('<circle cx="12" cy="11" r="4"/><path d="M12 2.6v2.2M12 17.2v2.2M2.8 11h2.2M19 11h2.2M5.5 4.5l1.6 1.6M16.9 15.9l1.6 1.6M18.5 4.5l-1.6 1.6M7.1 15.9l-1.6 1.6"/>'),
    magnifier: svg('<circle cx="10.6" cy="10.6" r="6.1"/><path d="M15.2 15.2L20 20"/>'),
    eraser: svg('<path d="M6.6 15.2l7.2-7.2 4 4-7.2 7.2H7.4z"/><path d="M4 20h16"/>'),
    undo: svg('<path d="M9 5.5L4.5 10l4.5 4.5"/><path d="M4.5 10h9.2a5 5 0 010 10h-2.4"/>'),
    redo: svg('<path d="M15 5.5L19.5 10 15 14.5"/><path d="M19.5 10h-9.2a5 5 0 000 10h2.4"/>'),
    trash: svg('<path d="M4.8 7h14.4"/><path d="M9.2 7V5h5.6v2"/><path d="M7.8 7l.9 13h6.6l.9-13"/>'),
    hide: svg('<path d="M3 3l18 18"/><path d="M10.6 6.2A8.8 8.8 0 0112 6c5.1 0 8.6 4.4 9.1 6-.3.6-1.1 2-2.5 3.4"/><path d="M6.2 7.8C4.4 9.2 3.3 11.1 3 12c.5 1.6 4 6 9 6 1.3 0 2.5-.3 3.6-.8"/>'),
    mouseOff: svg('<rect x="6.4" y="3.4" width="11.2" height="17.2" rx="5.6"/><path d="M12 7v3.6"/><path d="M3 3l18 18"/>'),
    mouseOn: svg('<rect x="6.4" y="3.4" width="11.2" height="17.2" rx="5.6"/><path d="M12 7v3.6"/><circle cx="12" cy="6.2" r="1.15" fill="currentColor" stroke="none"/>'),
    exit: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
    more: svg('<circle cx="5.4" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="18.6" cy="12" r="1.25" fill="currentColor" stroke="none"/>'),
    caret: svg('<path d="M7 10l5 5 5-5"/>', { size: 12 }),
    grip: svg('<circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none"/>', { size: 15 }),
    download: svg('<path d="M12 3v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>', { size: 15 }),
    check: svg('<path d="M5 12.5l4.4 4.4L19 7.5"/>', { size: 14 })
  };
})(window);
