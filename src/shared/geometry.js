/**
 * 几何计算：矩形归一化、命中测试、图形包围盒、放大镜布局与裁剪换算
 * 纯函数，可在浏览器与 Node 中复用
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SC = root.SC || {};
    root.SC.geometry = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, min, max) {
    if (max < min) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  }

  function normalizeRect(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1)
    };
  }

  function rectContains(rect, point, pad) {
    var p = pad || 0;
    return (
      point.x >= rect.x - p &&
      point.x <= rect.x + rect.w + p &&
      point.y >= rect.y - p &&
      point.y <= rect.y + rect.h + p
    );
  }

  function ellipseContains(rect, point, pad) {
    var p = pad || 0;
    var rx = Math.max(0.5, rect.w / 2 + p);
    var ry = Math.max(0.5, rect.h / 2 + p);
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;
    var dx = (point.x - cx) / rx;
    var dy = (point.y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function distancePointToSegment(point, start, end) {
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }
    var t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    t = clamp(t, 0, 1);
    var px = start.x + t * dx;
    var py = start.y + t * dy;
    return Math.hypot(point.x - px, point.y - py);
  }

  function polylineHit(points, point, tolerance) {
    if (!points || points.length === 0) {
      return false;
    }
    if (points.length === 1) {
      return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= tolerance;
    }
    for (var i = 0; i < points.length - 1; i++) {
      if (distancePointToSegment(point, points[i], points[i + 1]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  function pointsBBox(points, pad) {
    var p = pad || 0;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxX = Math.max(maxX, points[i].x);
      maxY = Math.max(maxY, points[i].y);
    }
    if (!isFinite(minX)) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    return { x: minX - p, y: minY - p, w: maxX - minX + p * 2, h: maxY - minY + p * 2 };
  }

  function computeBBox(shape) {
    var width = shape.width || 0;
    switch (shape.type) {
      case 'rect':
      case 'ellipse':
      case 'spotlight':
        return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
      case 'magnifier':
        return { x: shape.dst.x, y: shape.dst.y, w: shape.dst.w, h: shape.dst.h };
      case 'arrow':
      case 'line': {
        var padLine = Math.max(6, width / 2 + 2);
        return pointsBBox([shape.start, shape.end], padLine);
      }
      case 'pen':
      case 'highlighter':
        return pointsBBox(shape.points || [], Math.max(4, width / 2 + 2));
      case 'text':
        if (shape.bbox) {
          return shape.bbox;
        }
        return {
          x: shape.x,
          y: shape.y,
          w: Math.max(12, (shape.text || '').length * (shape.fontSize || 20) * 0.6),
          h: (shape.fontSize || 20) * 1.4
        };
      case 'serial': {
        if (shape.bbox) {
          return shape.bbox;
        }
        var radius = (shape.fontSize || 28) * 0.75;
        return {
          x: shape.x - radius,
          y: shape.y - radius,
          w: radius * 2,
          h: radius * 2
        };
      }
      default:
        return { x: shape.x || 0, y: shape.y || 0, w: shape.w || 0, h: shape.h || 0 };
    }
  }

  function shapeHit(shape, point) {
    var bbox = shape.bbox || computeBBox(shape);
    var tolerance = Math.max(6, (shape.width || 2) / 2 + 4);
    if (!rectContains(bbox, point, tolerance)) {
      return false;
    }
    switch (shape.type) {
      case 'line':
      case 'arrow':
        return distancePointToSegment(point, shape.start, shape.end) <= tolerance;
      case 'pen':
      case 'highlighter':
        return polylineHit(shape.points, point, Math.max(6, (shape.width || 2) / 2 + 3));
      case 'ellipse':
        return ellipseContains({ x: shape.x, y: shape.y, w: shape.w, h: shape.h }, point, 2);
      default:
        return rectContains(bbox, point, 0);
    }
  }

  function translateShape(shape, dx, dy) {
    var next = JSON.parse(JSON.stringify(shape));
    if (next.bbox) {
      next.bbox = {
        x: next.bbox.x + dx,
        y: next.bbox.y + dy,
        w: next.bbox.w,
        h: next.bbox.h
      };
    }
    if (next.points) {
      next.points = next.points.map(function (point) {
        return { x: point.x + dx, y: point.y + dy };
      });
    }
    if (next.start) {
      next.start = { x: next.start.x + dx, y: next.start.y + dy };
    }
    if (next.end) {
      next.end = { x: next.end.x + dx, y: next.end.y + dy };
    }
    if (next.src) {
      next.src = { x: next.src.x + dx, y: next.src.y + dy, w: next.src.w, h: next.src.h };
    }
    if (next.dst) {
      next.dst = { x: next.dst.x + dx, y: next.dst.y + dy, w: next.dst.w, h: next.dst.h };
    }
    if (typeof next.x === 'number') {
      next.x += dx;
    }
    if (typeof next.y === 'number') {
      next.y += dy;
    }
    return next;
  }

  function magnifierLensRect(src, view, zoom, margin) {
    var gap = margin || 16;
    var maxW = Math.max(40, view.w * 0.9);
    var maxH = Math.max(40, view.h * 0.9);
    var aspect = src.w > 0 && src.h > 0 ? src.h / src.w : 0.75;
    var width = Math.min(Math.max(60, src.w * (zoom || 2)), maxW);
    var height = width * aspect;
    if (height > maxH) {
      height = maxH;
      width = height / aspect;
    }
    var x = src.x + src.w + gap;
    if (x + width > view.w - 8) {
      x = src.x - width - gap;
    }
    if (x < 8) {
      x = view.w - width - 8;
    }
    var y = src.y;
    return {
      x: clamp(x, 8, Math.max(8, view.w - width - 8)),
      y: clamp(y, 8, Math.max(8, view.h - height - 8)),
      w: width,
      h: height
    };
  }

  function cropRectForDisplay(src, imageWidth, imageHeight, displayWidth, displayHeight) {
    var rx = displayWidth > 0 ? imageWidth / displayWidth : 1;
    var ry = displayHeight > 0 ? imageHeight / displayHeight : 1;
    var x = clamp(Math.round(src.x * rx), 0, Math.max(0, imageWidth - 1));
    var y = clamp(Math.round(src.y * ry), 0, Math.max(0, imageHeight - 1));
    var width = clamp(Math.round(src.w * rx), 1, Math.max(1, imageWidth - x));
    var height = clamp(Math.round(src.h * ry), 1, Math.max(1, imageHeight - y));
    return { x: x, y: y, width: width, height: height };
  }

  return {
    clamp: clamp,
    normalizeRect: normalizeRect,
    rectContains: rectContains,
    ellipseContains: ellipseContains,
    distancePointToSegment: distancePointToSegment,
    polylineHit: polylineHit,
    pointsBBox: pointsBBox,
    computeBBox: computeBBox,
    shapeHit: shapeHit,
    translateShape: translateShape,
    magnifierLensRect: magnifierLensRect,
    cropRectForDisplay: cropRectForDisplay
  };
});
