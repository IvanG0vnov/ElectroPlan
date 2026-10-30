// Отрисовка плана на Canvas 2D. Все размеры значков остаются читаемыми
// при любом масштабе, а геометрия считается в метрах.

import { DEVICE_TYPES, getDeviceType, getSectionInfo, cableSpecLabel } from "./model.js";
import { polygonArea, polygonCentroid, formatMeters, formatArea } from "./geometry.js";
import { cableMetrics } from "./calc.js";

const DEVICE_COLORS = {
  socket: "#0369a1",
  socketDouble: "#0369a1",
  switch: "#b45309",
  switchDouble: "#b45309",
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

  if (!settings.showLabels || view.scale < 26) return;
  for (const room of floor.rooms) {
    if (!Array.isArray(room.points) || room.points.length < 3) continue;
    const center = worldToScreen(polygonCentroid(room.points), view);
    const area = polygonArea(room.points);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(30,41,59,0.75)";
    ctx.font = "700 12px Manrope, system-ui, sans-serif";
    ctx.fillText(room.name || "Комната", center.x, center.y - 7);
    ctx.fillStyle = "rgba(71,85,105,0.70)";
    ctx.font = "500 10px Manrope, system-ui, sans-serif";
    ctx.fillText(formatArea(area), center.x, center.y + 8);
    ctx.restore();
  }
}

function drawWalls(ctx, floor, view, settings, selectedId) {
  ctx.save();
  ctx.lineCap = "butt";
  for (const wall of floor.walls) {
    const a = worldToScreen(wall.a, view);
    const b = worldToScreen(wall.b, view);
    const width = Math.max(2, Number(wall.thickness || 0.1) * view.scale);
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
    color: getSectionInfo(cable.section).color,
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
    const section = getSectionInfo(cable.section);
    const selected = cable.id === selectedId;

    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = selected ? 7 : 5;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    ctx.strokeStyle = section.color;
    ctx.globalAlpha = selected ? 1 : 0.88;
    ctx.lineWidth = selected ? 3.5 : 2.4;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
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

function drawSocketSymbol(ctx, x, y, r, double = false) {
  const sockets = double ? [{ x: x - r * 0.42, y }, { x: x + r * 0.42, y }] : [{ x, y }];
  for (const socket of sockets) {
    const radius = double ? r * 0.56 : r;
    ctx.beginPath();
    ctx.arc(socket.x, socket.y, radius, Math.PI * 0.92, Math.PI * 0.08, false);
    ctx.strokeStyle = DEVICE_COLORS.socket;
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(socket.x, socket.y - radius * 0.56);
    ctx.lineTo(socket.x, socket.y - radius * 0.12);
    ctx.moveTo(socket.x - radius * 0.35, socket.y - radius * 0.56);
    ctx.lineTo(socket.x - radius * 0.35, socket.y - radius * 0.12);
    ctx.stroke();
  }
}

function drawSwitchSymbol(ctx, x, y, r, double = false) {
  const color = DEVICE_COLORS.switch;
  const sockets = double ? [{ x: x - r * 0.38, y }, { x: x + r * 0.38, y }] : [{ x, y }];
  for (const item of sockets) {
    const radius = double ? r * 0.42 : r * 0.72;
    ctx.beginPath();
    ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(item.x + radius * 0.22, item.y - radius * 0.20);
    ctx.lineTo(item.x + radius * 0.88, item.y - radius * 0.85);
    ctx.stroke();
  }
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
    case "socketDouble":
      drawSocketSymbol(ctx, screen.x, screen.y, radius, true);
      break;
    case "switch":
      drawSwitchSymbol(ctx, screen.x, screen.y, radius);
      break;
    case "switchDouble":
      drawSwitchSymbol(ctx, screen.x, screen.y, radius, true);
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
      const name = String(device.name || getDeviceType(device.type).short);
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

  if (draft.kind === "cable" && draft.points.length > 0) {
    const points = draft.points.map((point) => worldToScreen(point, view));
    const section = getSectionInfo(settings.defaultSection);
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
    ctx.strokeStyle = section.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = section.color;
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
  drawCables(
    ctx,
    floor,
    view,
    project.settings,
    selection?.type === "cable" ? selection.id : null,
    project
  );
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

  if (selection) {
    const collections = {
      wall: floor.walls,
      room: floor.rooms,
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
