/**
 * 画布渲染：按顺序绘制所有标注、预览图形与选中框
 */
(function (root) {
  'use strict';

  var OC = root.OC || (root.OC = {});

  function dashPattern(style, width) {
    var w = Math.max(1, width || 2);
    if (style === 'dashed') {
      return [w * 2.4, w * 1.8];
    }
    if (style === 'dotted') {
      return [0.1, w * 2];
    }
    if (style === 'dashdot') {
      return [w * 3.2, w * 1.5, 0.1, w * 1.5];
    }
    return [];
  }

  function hexToRgba(hex, alpha) {
    var value = String(hex || '#000000').replace('#', '');
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    var number = parseInt(value, 16);
    if (isNaN(number)) {
      return 'rgba(0,0,0,' + alpha + ')';
    }
    return (
      'rgba(' +
      ((number >> 16) & 255) +
      ',' +
      ((number >> 8) & 255) +
      ',' +
      (number & 255) +
      ',' +
      alpha +
      ')'
    );
  }

  function applyLineStyle(ctx, shape) {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width || 3;
    ctx.lineCap = shape.lineStyle === 'dotted' ? 'round' : 'butt';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashPattern(shape.lineStyle, shape.width));
  }

  function tracePath(ctx, points) {
    if (!points || points.length === 0) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      return;
    }
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      return;
    }
    for (var i = 1; i < points.length - 1; i++) {
      var midX = (points[i].x + points[i + 1].x) / 2;
      var midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  function roundRectPath(ctx, x, y, w, h, radius) {
    var r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawArrow(ctx, shape) {
    var start = shape.start;
    var end = shape.end;
    var angle = Math.atan2(end.y - start.y, end.x - start.x);
    var width = shape.width || 3;
    var head = shape.head || 'filled';
    var headLength = Math.max(12, width * 3.4) * (head === 'thin' ? 0.75 : 1);
    var headWidth = headLength * 0.62;
    var shaftEndX = end.x - Math.cos(angle) * headLength * 0.82;
    var shaftEndY = end.y - Math.sin(angle) * headLength * 0.82;
    var backX = end.x - Math.cos(angle) * headLength;
    var backY = end.y - Math.sin(angle) * headLength;
    var left = {
      x: backX + Math.cos(angle + Math.PI / 2) * headWidth * 0.5,
      y: backY + Math.sin(angle + Math.PI / 2) * headWidth * 0.5
    };
    var right = {
      x: backX - Math.cos(angle + Math.PI / 2) * headWidth * 0.5,
      y: backY - Math.sin(angle + Math.PI / 2) * headWidth * 0.5
    };

    ctx.save();
    applyLineStyle(ctx, shape);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (head === 'open' || head === 'thin') {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = shape.color;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLine(ctx, shape) {
    ctx.save();
    applyLineStyle(ctx, shape);
    ctx.beginPath();
    ctx.moveTo(shape.start.x, shape.start.y);
    ctx.lineTo(shape.end.x, shape.end.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRect(ctx, shape) {
    ctx.save();
    if (shape.fill) {
      ctx.fillStyle = hexToRgba(shape.color, 0.16);
      ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    }
    applyLineStyle(ctx, shape);
    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
    ctx.restore();
  }

  function drawEllipse(ctx, shape) {
    ctx.save();
    var cx = shape.x + shape.w / 2;
    var cy = shape.y + shape.h / 2;
    var rx = Math.max(0.5, shape.w / 2);
    var ry = Math.max(0.5, shape.h / 2);
    if (shape.fill) {
      ctx.fillStyle = hexToRgba(shape.color, 0.16);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    applyLineStyle(ctx, shape);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFreehand(ctx, shape) {
    var points = shape.points || [];
    var width = shape.width || 4;
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashPattern(shape.lineStyle, width));
    ctx.globalAlpha = shape.type === 'highlighter' ? shape.opacity || 0.35 : 1;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      tracePath(ctx, points);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawText(ctx, shape) {
    var fontSize = shape.fontSize || 22;
    var lineHeight = fontSize * 1.38;
    var lines = String(shape.text || '').split('\n');
    var family = shape.fontFamily || 'Microsoft YaHei';
    ctx.save();
    ctx.fillStyle = shape.color;
    ctx.font =
      (shape.italic ? 'italic ' : '') +
      (shape.bold ? '700 ' : '400 ') +
      fontSize +
      'px "' +
      family +
      '", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], shape.x, shape.y + i * lineHeight);
    }
    ctx.restore();
  }

  function drawSerial(ctx, shape) {
    var fontSize = shape.fontSize || 28;
    var radius = fontSize * 0.75;
    var label = root.SC.defaults.formatSerial(shape.n, shape.serialType || 'number');
    var scale = label.length > 2 ? Math.max(0.55, 2 / label.length) : 1;
    ctx.save();
    ctx.fillStyle = shape.color;
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 ' + Math.round(fontSize * 0.9 * scale) + 'px "Microsoft YaHei", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, shape.x, shape.y + 1);
    ctx.restore();
  }

  function drawSpotlight(ctx, shape, viewWidth, viewHeight) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, ' + (shape.opacity || 0.45) + ')';
    ctx.beginPath();
    ctx.rect(0, 0, viewWidth, viewHeight);
    ctx.rect(shape.x, shape.y, shape.w, shape.h);
    ctx.fill('evenodd');
    if (shape.stroke !== false && shape.strokeWidth > 0) {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
    }
    ctx.restore();
  }

  function drawMagnifier(ctx, shape, images) {
    var src = shape.src;
    var dst = shape.dst;
    if (!src) {
      return;
    }
    if (!dst) {
      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(src.x, src.y, src.w, src.h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(src.x, src.y, src.w, src.h);
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(40, 40, 40, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(src.x + src.w / 2, src.y + src.h / 2);
    ctx.lineTo(dst.x + dst.w / 2, dst.y + dst.h / 2);
    ctx.stroke();

    ctx.save();
    roundRectPath(ctx, dst.x, dst.y, dst.w, dst.h, 10);
    ctx.clip();
    var image = images && shape.imageId ? images[shape.imageId] : null;
    if (image && image.complete) {
      ctx.drawImage(image, dst.x, dst.y, dst.w, dst.h);
    } else {
      ctx.fillStyle = 'rgba(240, 240, 240, 0.95)';
      ctx.fillRect(dst.x, dst.y, dst.w, dst.h);
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    roundRectPath(ctx, dst.x, dst.y, dst.w, dst.h, 10);
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.borderWidth || 2;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function drawShape(ctx, shape, images, viewWidth, viewHeight) {
    switch (shape.type) {
      case 'arrow':
        return drawArrow(ctx, shape);
      case 'line':
        return drawLine(ctx, shape);
      case 'rect':
        return drawRect(ctx, shape);
      case 'ellipse':
        return drawEllipse(ctx, shape);
      case 'pen':
      case 'highlighter':
        return drawFreehand(ctx, shape);
      case 'text':
        return drawText(ctx, shape);
      case 'serial':
        return drawSerial(ctx, shape);
      case 'spotlight':
        return drawSpotlight(ctx, shape, viewWidth, viewHeight);
      case 'magnifier':
        return drawMagnifier(ctx, shape, images);
      default:
        return undefined;
    }
  }

  function drawSelection(ctx, shape) {
    var bbox = shape.bbox;
    if (!bbox) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(bbox.x - 4, bbox.y - 4, bbox.w + 8, bbox.h + 8);
    ctx.restore();
  }

  function draw(ctx, state) {
    ctx.clearRect(0, 0, state.width, state.height);
    var images = state.images || {};
    var shapes = state.shapes || [];
    var lastSpotlight = -1;
    for (var s = 0; s < shapes.length; s++) {
      if (shapes[s].type === 'spotlight') {
        lastSpotlight = s;
      }
    }
    for (var i = 0; i < shapes.length; i++) {
      // 聚光灯只绘制最后一层，兼容旧会话里可能存在的多层遮罩
      if (shapes[i].type === 'spotlight' && i !== lastSpotlight) {
        continue;
      }
      drawShape(ctx, shapes[i], images, state.width, state.height);
    }
    if (state.preview) {
      drawShape(ctx, state.preview, images, state.width, state.height);
    }
    if (state.selected) {
      drawSelection(ctx, state.selected);
    }
  }

  OC.render = { draw: draw };
})(window);
