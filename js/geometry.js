// Геометрия и форматирование. Все расстояния — в метрах.

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared > 0
    ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
    : 0;
  t = clamp(t, 0, 1);
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return {
    distance: Math.hypot(point.x - x, point.y - y),
    t,
    point: { x, y }
  };
}

export function pointToPolyline(point, points) {
  if (!points || points.length === 0) {
    return { distance: Infinity, index: -1, t: 0, point: null };
  }
  if (points.length === 1) {
    return { distance: dist(point, points[0]), index: 0, t: 0, point: { ...points[0] } };
  }
  let best = { distance: Infinity, index: 0, t: 0, point: null };
  for (let i = 0; i < points.length - 1; i += 1) {
    const result = pointToSegment(point, points[i], points[i + 1]);
    if (result.distance < best.distance) {
      best = { ...result, index: i };
    }
  }
  return best;
}

export function polylineLength(points) {
  if (!points || points.length < 2) return 0;
  let length = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    length += dist(points[i], points[i + 1]);
  }
  return length;
}

export function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
  }

  let areaFactor = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    areaFactor += factor;
    cx += (current.x + next.x) * factor;
    cy += (current.y + next.y) * factor;
  }
  if (Math.abs(areaFactor) < 1e-9) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
  }
  return {
    x: cx / (3 * areaFactor),
    y: cy / (3 * areaFactor)
  };
}

export function pointInPolygon(point, points) {
  if (!points || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const crosses = (yi > point.y) !== (yj > point.y);
    if (crosses && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function snapValue(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapPoint(point, step) {
  return { x: snapValue(point.x, step), y: snapValue(point.y, step) };
}

export function constrainToAxis(origin, point, enabled) {
  if (!enabled) return { ...point };
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: point.x, y: origin.y };
  }
  return { x: origin.x, y: point.y };
}

export function projectPointOnSegment(point, a, b) {
  return pointToSegment(point, a, b);
}

export function angleDegrees(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function boundsOfPoints(points) {
  if (!points || points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function expandBounds(bounds, margin) {
  if (!bounds) return null;
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin
  };
}

export function unionBounds(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

export function boundsOfFloor(floor) {
  let bounds = null;
  for (const wall of floor.walls || []) {
    bounds = unionBounds(bounds, boundsOfPoints([wall.a, wall.b]));
  }
  for (const room of floor.rooms || []) {
    bounds = unionBounds(bounds, boundsOfPoints(room.points));
  }
  for (const device of floor.devices || []) {
    bounds = unionBounds(bounds, boundsOfPoints([device]));
  }
  for (const cable of floor.cables || []) {
    bounds = unionBounds(bounds, boundsOfPoints(cable.points));
  }
  if (floor.underlay) {
    const { x, y, width, height } = floor.underlay;
    bounds = unionBounds(bounds, {
      minX: x, minY: y, maxX: x + width, maxY: y + height
    });
  }
  return bounds;
}

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(digits).replace(".", ",");
}

export function formatMeters(value, digits = 2) {
  return `${formatNumber(value, digits)} м`;
}

export function formatArea(value, digits = 2) {
  return `${formatNumber(value, digits)} м²`;
}

// Русское склонение после числа: 1 трасса, 2 трассы, 5 трасс.
export function pluralRu(count, one, few, many) {
  const value = Math.abs(Number(count) || 0) % 100;
  const tail = value % 10;
  if (value >= 11 && value <= 14) return many;
  if (tail === 1) return one;
  if (tail >= 2 && tail <= 4) return few;
  return many;
}
