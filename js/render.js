// Отрисовка плана на Canvas 2D. Все размеры значков остаются читаемыми
// при любом масштабе, а геометрия считается в метрах.

import {
  DEVICE_TYPES,
  getDeviceGangs,
  getDeviceType,
  getOpeningType,
  openingSpan,
  getSectionInfo,
  getUtpCategory,
  cableSpecLabel,
  cableColor,
  getCableKind
} from "./model.js";
import { polygonArea, boundsOfPoints, formatMeters, formatArea } from "./geometry.js";
import { cableMetrics } from "./calc.js";

const DEVICE_COLORS = {
  socket: "#0369a1",
  switch: "#b45309",
  switchPass: "#b45309",
  switchCross: "#7c3aed",
  network: "#0d9488",
  light: "#ca8a04",
  lightWall: "#ca8a04",
  panel: "#111827",
  junction: "#7c3aed"
};

const underlayImages = new Map();

function getUnderlayImage(source, onLoad) {
  if (!source) return null;
  if (underlayImages.has(source)) return underlayImages.get(source);
  const image = new Image();
  image.onload = () => onLoad?.();
  image.onerror = () => underlayImages.delete(source);
  image.src = source;
  underlayImages.set(source, image);
  return image;
}

export function worldToScreen(point, view) {
  return {
    x: point.x * view.scale + view.offsetX,
    y: point.y * view.scale + view.offsetY
  };
}

export function screenToWorld(point, view) {
  return {
    x: (point.x - view.offsetX) / view.scale,
    y: (point.y - view.offsetY) / view.scale
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPill(ctx, text, x, y, options = {}) {
  const {
    font = "600 11px Manrope, system-ui, sans-serif",
    paddingX = 6,
    paddingY = 3,
    background = "rgba(255,255,255,0.92)",
    color = "#0f172a",
    border = "rgba(148,163,184,0.35)",
    align = "center"
  } = options;
  ctx.save();
  ctx.font = font;
  const width = ctx.measureText(text).width + paddingX * 2;
  const height = 18 + paddingY;
  const left = align === "left" ? x : x - width / 2;
  roundRect(ctx, left, y - height / 2, width, height, 7);
  ctx.fillStyle = background;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + width / 2, y + 0.5);
  ctx.restore();
}

function gridStep(scale) {
  const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20];
  return candidates.find((step) => step * scale >= 22) || 20;
}

function drawGrid(ctx, width, height, view, settings) {
  if (!settings.showGrid) return;
  const step = gridStep(view.scale);
  const left = Math.floor((-view.offsetX / view.scale) / step) * step;
  const top = Math.floor((-view.offsetY / view.scale) / step) * step;
  const right = (width - view.offsetX) / view.scale;
  const bottom = (height - view.offsetY) / view.scale;

  ctx.save();
  ctx.lineWidth = 1;
  for (let x = left; x <= right + step; x += step) {
    const screenX = Math.round(x * view.scale + view.offsetX) + 0.5;
    const isMeter = Math.abs(x - Math.round(x)) < 1e-6;
    ctx.strokeStyle = isMeter ? "rgba(100,116,139,0.20)" : "rgba(148,163,184,0.12)";
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, height);
    ctx.stroke();
  }
  for (let y = top; y <= bottom + step; y += step) {
    const screenY = Math.round(y * view.scale + view.offsetY) + 0.5;
    const isMeter = Math.abs(y - Math.round(y)) < 1e-6;
    ctx.strokeStyle = isMeter ? "rgba(100,116,139,0.20)" : "rgba(148,163,184,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, screenY);
    ctx.lineTo(width, screenY);
    ctx.stroke();
  }

  // Оси X и Y помогают ориентироваться при рисовании.
  if (view.offsetY > 0 && view.offsetY < height) {
    ctx.strokeStyle = "rgba(37,99,235,0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, view.offsetY + 0.5);
    ctx.lineTo(width, view.offsetY + 0.5);
    ctx.stroke();
  }
  if (view.offsetX > 0 && view.offsetX < width) {
    ctx.strokeStyle = "rgba(37,99,235,0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(view.offsetX + 0.5, 0);
    ctx.lineTo(view.offsetX + 0.5, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawUnderlay(ctx, floor, view, onImageLoad) {
  const underlay = floor.underlay;
  if (!underlay?.image) return;
  const image = getUnderlayImage(underlay.image, onImageLoad);
  if (!image?.complete || !image.naturalWidth) return;
  const start = worldToScreen({ x: underlay.x || 0, y: underlay.y || 0 }, view);
  const width = Number(underlay.width) * view.scale;
  const height = Number(underlay.height) * view.scale;
  ctx.save();
  ctx.globalAlpha = Number(underlay.opacity ?? 0.45);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, start.x, start.y, width, height);
  ctx.restore();
}

function drawRooms(ctx, floor, view, settings, selectedId) {
  for (const room of floor.rooms) {
    if (!Array.isArray(room.points) || room.points.length < 3) continue;
    const points = room.points.map((point) => worldToScreen(point, view));
    ctx.save();
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fillStyle = room.color || "#dbeafe";
    ctx.globalAlpha = 0.62;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = room.id === selectedId ? 2.5 : 1;
    ctx.strokeStyle = room.id === selectedId ? "#f59e0b" : "rgba(71,85,105,0.30)";
    ctx.setLineDash(room.id === selectedId ? [] : [5, 5]);
    ctx.stroke();
    ctx.restore();
  }

}

function drawRoomLabels(ctx, floor, view, settings) {
  if (!settings.showLabels || view.scale < 26) return;
  for (const room of floor.rooms) {
    if (!Array.isArray(room.points) || room.points.length < 3) continue;
    const bounds = boundsOfPoints(room.points);
    if (!bounds) continue;
    // Подпись — в левом верхнем углу комнаты, чтобы не спорить с
    // устройствами и светильниками в центре помещения.
    const anchor = worldToScreen(
      { x: bounds.minX + 0.22, y: bounds.minY + 0.32 },
      view
    );
    const name = room.name || "Комната";
    const area = formatArea(polygonArea(room.points));
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(248,250,252,0.92)";
    ctx.font = "700 12px Manrope, system-ui, sans-serif";
    ctx.strokeText(name, anchor.x, anchor.y);
    ctx.fillStyle = "rgba(30,41,59,0.82)";
    ctx.fillText(name, anchor.x, anchor.y);
    ctx.font = "500 10px Manrope, system-ui, sans-serif";
    ctx.strokeText(area, anchor.x, anchor.y + 15);
    ctx.fillStyle = "rgba(71,85,105,0.76)";
    ctx.fillText(area, anchor.x, anchor.y + 15);
    ctx.restore();
  }
}

function drawWalls(ctx, floor, view, settings, selectedId) {
  ctx.save();
  ctx.lineCap = "butt";
  for (const wall of floor.walls) {
    const width = Math.max(2, Number(wall.thickness || 0.1) * view.scale);
    const segments = wallSegments(wall, openingsOnWall(floor, wall));
    for (const segment of segments) {
      const a = worldToScreen(pointOnWall(wall, segment.start), view);
      const b = worldToScreen(pointOnWall(wall, segment.end), view);
      ctx.strokeStyle = wall.id === selectedId ? "#f59e0b" : "#334155";
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (wall.id === selectedId) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  ctx.restore();

  if (!settings.showDimensions) return;
  for (const wall of floor.walls) {
    const a = worldToScreen(wall.a, view);
    const b = worldToScreen(wall.b, view);
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (length < 0.35) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    drawPill(ctx, formatMeters(length), mid.x, mid.y, {
      font: "600 10px Manrope, system-ui, sans-serif",
      background: "rgba(248,250,252,0.90)"
    });
  }
}

function wallLengthOf(wall) {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
}

function pointOnWall(wall, offset) {
  const length = wallLengthOf(wall);
  if (length < 1e-9) return { ...wall.a };
  const t = offset / length;
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t
  };
}

function openingsOnWall(floor, wall) {
  return (floor.openings || [])
    .filter((opening) => opening.wallId === wall.id)
    .map((opening) => ({ opening, ...openingSpan(opening, wall) }))
    .filter((span) => span.length > 0.001)
    .sort((a, b) => a.start - b.start);
}

function wallSegments(wall, spans) {
  const length = wallLengthOf(wall);
  const segments = [];
  let cursor = 0;
  for (const span of spans) {
    const start = Math.max(0, Math.min(length, span.start));
    const end = Math.max(start, Math.min(length, span.end));
    if (start > cursor + 1e-4) segments.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < length - 1e-4) segments.push({ start: cursor, end: length });
  return segments;
}

function drawOpeningSymbol(ctx, opening, wall, view, options = {}) {
  const { selected = false, alpha = 1, preview = false } = options;
  const span = openingSpan(opening, wall);
  if (span.length < 0.001 || span.width < 0.02) return;
  const start = worldToScreen(pointOnWall(wall, span.start), view);
  const end = worldToScreen(pointOnWall(wall, span.end), view);
  const lengthPx = Math.hypot(end.x - start.x, end.y - start.y);
  if (lengthPx < 1) return;
  const ux = (end.x - start.x) / lengthPx;
  const uy = (end.y - start.y) / lengthPx;
  const nx = -uy;
  const ny = ux;
  const thickness = Math.max(2, Number(wall.thickness || 0.1) * view.scale);
  const jamb = Math.max(3, thickness * 0.8);
  const type = getOpeningType(opening.type);
  const color = selected || preview ? "#f59e0b" : type.color;
  const frameWidth = Math.max(1.6, Math.min(3, thickness * 0.2));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = selected || preview ? "#f59e0b" : "#334155";
  ctx.lineWidth = Math.max(1.4, Math.min(2.5, thickness * 0.16));
  for (const point of [start, end]) {
    ctx.beginPath();
    ctx.moveTo(point.x + nx * jamb / 2, point.y + ny * jamb / 2);
    ctx.lineTo(point.x - nx * jamb / 2, point.y - ny * jamb / 2);
    ctx.stroke();
  }

  if (opening.type === "window") {
    ctx.strokeStyle = color;
    ctx.lineWidth = frameWidth;
    for (const side of [-1, 1]) {
      const offset = thickness * 0.2 * side;
      ctx.beginPath();
      ctx.moveTo(start.x + nx * offset, start.y + ny * offset);
      ctx.lineTo(end.x + nx * offset, end.y + ny * offset);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else {
    const hingeAtStart = opening.hinge !== "end";
    const hinge = hingeAtStart ? start : end;
    const dirX = hingeAtStart ? ux : -ux;
    const dirY = hingeAtStart ? uy : -uy;
    const swing = Number(opening.swing) === -1 ? -1 : 1;
    const openX = hinge.x + nx * lengthPx * swing;
    const openY = hinge.y + ny * lengthPx * swing;

    ctx.strokeStyle = color;
    ctx.lineWidth = frameWidth;
    ctx.beginPath();
    ctx.moveTo(hinge.x, hinge.y);
    ctx.lineTo(openX, openY);
    ctx.stroke();

    const startAngle = Math.atan2(dirY, dirX);
    let delta = Math.atan2(ny * swing, nx * swing) - startAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    ctx.globalAlpha = alpha * 0.65;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, lengthPx, startAngle, startAngle + delta, delta < 0);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawOpeningSelection(ctx, opening, wall, view) {
  const span = openingSpan(opening, wall);
  if (span.length < 0.001) return;
  const start = worldToScreen(pointOnWall(wall, span.start), view);
  const end = worldToScreen(pointOnWall(wall, span.end), view);
  const lengthPx = Math.hypot(end.x - start.x, end.y - start.y);
  if (lengthPx < 1) return;
  const nx = -(end.y - start.y) / lengthPx;
  const ny = (end.x - start.x) / lengthPx;
  const offset = Math.max(7, Number(wall.thickness || 0.1) * view.scale + 7) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(start.x + nx * offset, start.y + ny * offset);
  ctx.lineTo(end.x + nx * offset, end.y + ny * offset);
  ctx.lineTo(end.x - nx * offset, end.y - ny * offset);
  ctx.lineTo(start.x - nx * offset, start.y - ny * offset);
  ctx.closePath();
  ctx.fillStyle = "rgba(245,158,11,0.15)";
  ctx.fill();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  ctx.beginPath();
  ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawOpenings(ctx, floor, view, settings, selectedId) {
  for (const opening of floor.openings || []) {
    const wall = floor.walls.find((item) => item.id === opening.wallId);
    if (!wall) continue;
    const selected = opening.id === selectedId;
    if (selected) drawOpeningSelection(ctx, opening, wall, view);
    drawOpeningSymbol(ctx, opening, wall, view, { selected });
  }

  if (!settings.showLabels || view.scale < 30) return;
  for (const opening of floor.openings || []) {
    const wall = floor.walls.find((item) => item.id === opening.wallId);
    if (!wall) continue;
    const span = openingSpan(opening, wall);
    if (span.width < 0.05) continue;
    const mid = worldToScreen(pointOnWall(wall, span.center), view);
    const ux = (wall.b.x - wall.a.x) / span.length;
    const uy = (wall.b.y - wall.a.y) / span.length;
    const nx = -uy;
    const ny = ux;
    const swing = opening.type === "door" && Number(opening.swing) === -1 ? -1 : 1;
    const side = opening.type === "door" ? -swing : 1;
    const reach = Math.max(4, Number(wall.thickness || 0.1) * view.scale / 2) + 12;
    const type = getOpeningType(opening.type);
    const text = view.scale >= 56
      ? `${type.short} · ${formatMeters(span.width, 2)}`
      : formatMeters(span.width, 2);
    drawPill(ctx, text, mid.x + nx * reach * side, mid.y + ny * reach * side, {
      font: "600 9px Manrope, system-ui, sans-serif",
      background: "rgba(255,255,255,0.9)",
      color: opening.type === "window" ? "#0369a1" : "#92400e",
      border: "rgba(148,163,184,0.3)",
      paddingX: 4
    });
  }
}

function drawOpeningPreview(ctx, preview, view) {
  if (!preview?.wall) return;
  if (preview.width < 0.02) return;
  drawOpeningSymbol(ctx, preview, preview.wall, view, { preview: true, alpha: 0.75 });
  const span = openingSpan(preview, preview.wall);
  const mid = worldToScreen(pointOnWall(preview.wall, span.center), view);
  const type = getOpeningType(preview.type);
  drawPill(ctx, `${type.label} · ${formatMeters(span.width, 2)}`, mid.x, mid.y - 20, {
    font: "600 10px Manrope, system-ui, sans-serif",
    background: "rgba(245,158,11,0.94)",
    color: "#fff",
    border: "none"
  });
}

function drawCableLabel(ctx, cable, metrics, view) {
  if (!cable.points || cable.points.length < 2) return;
  let best = null;
  for (let i = 0; i < cable.points.length - 1; i += 1) {
    const a = cable.points[i];
    const b = cable.points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!best || length > best.length) best = { a, b, length };
  }
  if (!best) return;
  const mid = worldToScreen({ x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 }, view);
  const text = `${cableSpecLabel(cable)} · ${formatMeters(metrics.total, 1)}`;
  drawPill(ctx, text, mid.x, mid.y - 9, {
    font: "600 9px Manrope, system-ui, sans-serif",
    background: "rgba(255,255,255,0.92)",
    color: cableColor(cable),
    border: "rgba(148,163,184,0.28)"
  });
}

function drawCables(ctx, floor, view, settings, selectedId, project) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const cable of floor.cables) {
    if (!cable.points || cable.points.length < 2) continue;
    const points = cable.points.map((point) => worldToScreen(point, view));
    const color = cableColor(cable);
    const selected = cable.id === selectedId;
    const dashed = getCableKind(cable) === "utp";

    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = selected ? 7 : 5;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.globalAlpha = selected ? 1 : 0.88;
    ctx.lineWidth = selected ? 3.5 : 2.4;
    if (dashed) ctx.setLineDash([8, 4]);
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (selected) {
      ctx.save();
      ctx.shadowColor = "rgba(245,158,11,0.65)";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // Подписи трасс показываем только при достаточном масштабе, чтобы не
  // перекрывать устройства на обзорном плане. Выбранная трасса — всегда.
  const labelScale = 100;
  for (const cable of floor.cables) {
    const selected = cable.id === selectedId;
    if (!selected && (!settings.showLabels || view.scale < labelScale)) continue;
    const metrics = cableMetrics(cable, floor, project.settings);
    drawCableLabel(ctx, cable, metrics, view);
  }
}

function drawSocketSymbol(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 0.92, Math.PI * 0.08, false);
  ctx.strokeStyle = DEVICE_COLORS.socket;
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.56);
  ctx.lineTo(x, y - r * 0.12);
  ctx.moveTo(x - r * 0.35, y - r * 0.56);
  ctx.lineTo(x - r * 0.35, y - r * 0.12);
  ctx.stroke();
}

function drawSwitchSymbol(ctx, x, y, r, variant = "switch") {
  const color = DEVICE_COLORS[variant] || DEVICE_COLORS.switch;
  const radius = r * 0.72;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + radius * 0.22, y - radius * 0.20);
  ctx.lineTo(x + radius * 0.88, y - radius * 0.85);
  ctx.stroke();
  if (variant === "switchPass") {
    const d = radius * 0.48;
    ctx.beginPath();
    ctx.moveTo(x - d, y + radius * 0.52);
    ctx.lineTo(x + d, y + radius * 0.52);
    ctx.moveTo(x + d * 0.35, y + radius * 0.28);
    ctx.lineTo(x + d, y + radius * 0.52);
    ctx.lineTo(x + d * 0.35, y + radius * 0.76);
    ctx.stroke();
  } else if (variant === "switchCross") {
    const d = radius * 0.44;
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
}

function drawNetworkSymbol(ctx, x, y, r) {
  ctx.strokeStyle = DEVICE_COLORS.network;
  ctx.lineWidth = 1.7;
  const width = r * 1.55;
  const height = r * 0.9;
  roundRect(ctx, x - width / 2, y - height / 2, width, height, 1.5);
  ctx.stroke();
  for (let i = 0; i < 4; i += 1) {
    const px = x - width * 0.34 + i * width * 0.22;
    ctx.beginPath();
    ctx.moveTo(px, y - height / 2);
    ctx.lineTo(px, y - height * 0.08);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x, y + height / 2);
  ctx.lineTo(x, y + r * 0.92);
  ctx.stroke();
}

function drawLightSymbol(ctx, x, y, r, wall = false) {
  const color = DEVICE_COLORS.light;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.7;
  if (wall) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, Math.PI * 0.15, Math.PI * 0.85, false);
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      const angle = Math.PI * (0.25 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * r * 0.84, y + Math.sin(angle) * r * 0.84);
      ctx.lineTo(x + Math.cos(angle) * r * 1.20, y + Math.sin(angle) * r * 1.20);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    const d = r * 0.40;
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
}

function drawPanelSymbol(ctx, x, y, r) {
  ctx.strokeStyle = DEVICE_COLORS.panel;
  ctx.lineWidth = 1.7;
  ctx.strokeRect(x - r * 0.78, y - r * 0.92, r * 1.56, r * 1.84);
  ctx.beginPath();
  for (let i = -1; i <= 1; i += 1) {
    ctx.moveTo(x - r * 0.46, y + i * r * 0.48 - r * 0.12);
    ctx.lineTo(x + r * 0.46, y + i * r * 0.48 - r * 0.12);
  }
  ctx.stroke();
}

function drawJunctionSymbol(ctx, x, y, r) {
  ctx.strokeStyle = DEVICE_COLORS.junction;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
  ctx.stroke();
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * r * 0.65, y + Math.sin(angle) * r * 0.65);
    ctx.lineTo(x + Math.cos(angle) * r * 1.12, y + Math.sin(angle) * r * 1.12);
    ctx.stroke();
  }
}

function drawDeviceSymbol(ctx, device, screen, radius, muted = false) {
  const color = DEVICE_COLORS[device.type] || "#475569";
  ctx.save();
  if (muted) ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius + 2.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  switch (device.type) {
    case "socket":
      drawSocketSymbol(ctx, screen.x, screen.y, radius);
      break;
    case "switch":
      drawSwitchSymbol(ctx, screen.x, screen.y, radius);
      break;
    case "switchPass":
      drawSwitchSymbol(ctx, screen.x, screen.y, radius, "switchPass");
      break;
    case "switchCross":
      drawSwitchSymbol(ctx, screen.x, screen.y, radius, "switchCross");
      break;
    case "network":
      drawNetworkSymbol(ctx, screen.x, screen.y, radius);
      break;
    case "light":
      drawLightSymbol(ctx, screen.x, screen.y, radius);
      break;
    case "lightWall":
      drawLightSymbol(ctx, screen.x, screen.y, radius, true);
      break;
    case "panel":
      drawPanelSymbol(ctx, screen.x, screen.y, radius);
      break;
    case "junction":
      drawJunctionSymbol(ctx, screen.x, screen.y, radius);
      break;
    default:
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
  }

  const gangs = getDeviceGangs(device);
  if (gangs > 1) {
    const bx = screen.x + radius * 0.78;
    const by = screen.y - radius * 0.78;
    ctx.beginPath();
    ctx.arc(bx, by, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = "#b45309";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "700 7px Manrope, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(gangs), bx, by + 0.3);
  }
  ctx.restore();
}

function drawDevices(ctx, floor, view, settings, selectedId) {
  const radius = Math.max(10, Math.min(16, view.scale * 0.15));
  for (const device of floor.devices) {
    const screen = worldToScreen(device, view);
    if (device.id === selectedId) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius + 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245,158,11,0.16)";
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    }
    drawDeviceSymbol(ctx, device, screen, radius);
  }

  if (settings.showLabels && view.scale >= 54) {
    for (const device of floor.devices) {
      const screen = worldToScreen(device, view);
      const gangs = getDeviceGangs(device);
      let name = String(device.name || getDeviceType(device.type).short);
      if (gangs > 1 && !/×\s*\d/.test(name)) name += ` ×${gangs}`;
      const shortName = name.length > 18 ? `${name.slice(0, 17)}…` : name;
      drawPill(ctx, shortName, screen.x, screen.y + radius + 14, {
        font: "600 9px Manrope, system-ui, sans-serif",
        background: "rgba(255,255,255,0.88)",
        color: "#334155",
        border: "rgba(203,213,225,0.5)",
        paddingX: 4
      });
    }
  }
}

function drawDraft(ctx, draft, view, floor, deviceType, settings) {
  if (!draft) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (draft.kind === "wall" && draft.start) {
    const a = worldToScreen(draft.start, view);
    const b = worldToScreen(draft.current || draft.start, view);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    for (const point of [a, b]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const length = Math.hypot(draft.current.x - draft.start.x, draft.current.y - draft.start.y);
    if (length > 0.01) {
      drawPill(ctx, formatMeters(length), (a.x + b.x) / 2, (a.y + b.y) / 2 - 16, {
        background: "rgba(15,23,42,0.86)",
        color: "#fff",
        border: "none"
      });
    }
  }

  if (draft.kind === "room" && draft.points.length > 0) {
    const points = draft.points.map((point) => worldToScreen(point, view));
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    if (draft.current && points.length > 1) {
      const current = worldToScreen(draft.current, view);
      ctx.lineTo(current.x, current.y);
      if (points.length >= 2) {
        ctx.lineTo(points[0].x, points[0].y);
      }
    } else if (points.length >= 3 && draft.closing !== false) {
      ctx.lineTo(points[0].x, points[0].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  if ((draft.kind === "cable" || draft.kind === "utp") && draft.points.length > 0) {
    const points = draft.points.map((point) => worldToScreen(point, view));
    const utp = draft.kind === "utp";
    const color = utp
      ? getUtpCategory({ category: settings.defaultUtpCategory }).color
      : getSectionInfo(settings.defaultSection).color;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    if (draft.current) {
      const current = worldToScreen(draft.current, view);
      ctx.lineTo(current.x, current.y);
    }
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash(utp ? [9, 5] : [8, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const length = points.reduce((sum, point, index) => {
      if (index === 0) return 0;
      const previous = points[index - 1];
      return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0) / view.scale;
    if (length > 0.01) {
      const last = points[points.length - 1];
      drawPill(ctx, formatMeters(length), last.x, last.y - 20, {
        background: "rgba(15,23,42,0.86)",
        color: "#fff",
        border: "none"
      });
    }
  }

  if (draft.kind === "device" && draft.current) {
    const screen = worldToScreen(draft.current, view);
    const preview = {
      type: deviceType,
      gangs: draft.gangs ?? 1,
      x: draft.current.x,
      y: draft.current.y
    };
    const radius = Math.max(10, Math.min(16, view.scale * 0.15));
    ctx.globalAlpha = 0.65;
    drawDeviceSymbol(ctx, preview, screen, radius, true);
  }
  ctx.restore();
}

function drawHandles(ctx, item, type, view) {
  if (!item) return;
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2;

  const drawPoint = (point) => {
    const screen = worldToScreen(point, view);
    roundRect(ctx, screen.x - 4.5, screen.y - 4.5, 9, 9, 2);
    ctx.fill();
    ctx.stroke();
  };

  if (type === "wall") {
    drawPoint(item.a);
    drawPoint(item.b);
  } else if (type === "room") {
    item.points.forEach(drawPoint);
  } else if (type === "cable") {
    item.points.forEach((point) => {
      const screen = worldToScreen(point, view);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 4.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawSnapMarker(ctx, snap) {
  if (!snap?.point) return;
  const screen = worldToScreen(snap.point, { scale: 1, offsetX: 0, offsetY: 0 });
  if (!screen) return;
  ctx.save();
  ctx.strokeStyle = "#0ea5e9";
  ctx.fillStyle = "#0ea5e9";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(snap.screen.x, snap.screen.y, snap.kind === "device" ? 11 : 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(snap.screen.x, snap.screen.y, 2, 0, Math.PI * 2);
  ctx.fill();
  if (snap.label) {
    drawPill(ctx, snap.label, snap.screen.x, snap.screen.y - 19, {
      font: "600 9px Manrope, system-ui, sans-serif",
      background: "rgba(14,165,233,0.94)",
      color: "#fff",
      border: "none"
    });
  }
  ctx.restore();
}

function drawScaleBar(ctx, width, height, view) {
  const candidates = [0.2, 0.5, 1, 2, 5, 10, 20];
  const meters = candidates.find((value) => value * view.scale >= 62) || 20;
  const pixels = meters * view.scale;
  const margin = 16;
  const x = margin + 10;
  const y = height - margin - 18;
  ctx.save();
  roundRect(ctx, margin, y - 18, pixels + 20, 34, 8);
  ctx.fillStyle = "rgba(15,23,42,0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + pixels, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x + pixels, y - 4);
  ctx.lineTo(x + pixels, y + 4);
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.font = "600 10px Manrope, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(formatMeters(meters, meters < 1 ? 1 : 0), x + pixels / 2, y - 8);
  ctx.restore();
}

export function renderPlan(canvas, options) {
  const {
    project,
    floor,
    view,
    selection,
    draft,
    snap,
    deviceType,
    openingPreview,
    onImageLoad
  } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height, view, project.settings);
  drawUnderlay(ctx, floor, view, onImageLoad);
  drawRooms(ctx, floor, view, project.settings, selection?.type === "room" ? selection.id : null);
  drawWalls(ctx, floor, view, project.settings, selection?.type === "wall" ? selection.id : null);
  drawOpenings(
    ctx,
    floor,
    view,
    project.settings,
    selection?.type === "opening" ? selection.id : null
  );
  drawCables(
    ctx,
    floor,
    view,
    project.settings,
    selection?.type === "cable" ? selection.id : null,
    project
  );
  drawRoomLabels(ctx, floor, view, project.settings);
  drawDevices(
    ctx,
    floor,
    view,
    project.settings,
    selection?.type === "device" ? selection.id : null
  );

  if (draft) {
    drawDraft(ctx, draft, view, floor, deviceType, project.settings);
  }
  if (openingPreview) drawOpeningPreview(ctx, openingPreview, view);

  if (selection) {
    const collections = {
      wall: floor.walls,
      room: floor.rooms,
      opening: floor.openings || [],
      cable: floor.cables,
      device: floor.devices
    };
    const item = collections[selection.type]?.find((entry) => entry.id === selection.id);
    drawHandles(ctx, item, selection.type, view);
  }
  if (snap) drawSnapMarker(ctx, snap);
  drawScaleBar(ctx, width, height, view);
}

export function deviceTypeInfo(type) {
  return DEVICE_TYPES[type] || DEVICE_TYPES.socket;
}
