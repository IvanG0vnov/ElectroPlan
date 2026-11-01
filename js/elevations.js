// Развёртки стен: каждая стена активного этажа показывается в прямоугольной
// проекции с проёмами, устройствами и размерами от пола и углов.

import {
  getDeviceGangs,
  getDeviceType,
  getOpeningType,
  openingSpan
} from "./model.js";
import { clamp, formatNumber, pointToSegment } from "./geometry.js";
import { escapeHtml, icon } from "./icons.js";

const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 720;
const AREA = { x: 90, y: 52, width: 930, height: 470 };
const DEVICE_WALL_GAP = 0.8;

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

function formatMeters(value) {
  return `${formatNumber(value, 2)} м`;
}

function assignDevicesToWalls(floor) {
  const result = new Map();
  for (const device of floor.devices || []) {
    let best = null;
    for (const wall of floor.walls || []) {
      const hit = pointToSegment(device, wall.a, wall.b);
      if (hit.distance > DEVICE_WALL_GAP) continue;
      if (!best || hit.distance < best.distance) best = { wall, ...hit };
    }
    if (!best) continue;
    if (!result.has(best.wall.id)) result.set(best.wall.id, []);
    const length = Math.hypot(best.wall.b.x - best.wall.a.x, best.wall.b.y - best.wall.a.y);
    result.get(best.wall.id).push({
      device,
      position: best.t * length,
      distance: best.distance
    });
  }
  return result;
}

function ticks(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const tick = 5;
  return `
    <path d="M${(x1 + nx * tick).toFixed(2)} ${(y1 + ny * tick).toFixed(2)} L${(x1 - nx * tick).toFixed(2)} ${(y1 - ny * tick).toFixed(2)}" />
    <path d="M${(x2 + nx * tick).toFixed(2)} ${(y2 + ny * tick).toFixed(2)} L${(x2 - nx * tick).toFixed(2)} ${(y2 - ny * tick).toFixed(2)}" />
  `;
}

function dimensionLine(x1, y1, x2, y2, text, options = {}) {
  const { offset = 0, rotate = 0 } = options;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const label = escapeHtml(text);
  const transform = rotate
    ? `transform="rotate(${rotate} ${cx.toFixed(2)} ${(cy + offset).toFixed(2)})"`
    : "";
  return `
    <g class="dimension">
      <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />
      ${ticks(x1, y1, x2, y2)}
      <text x="${cx.toFixed(2)}" y="${(cy + offset).toFixed(2)}" ${transform}>${label}</text>
    </g>
  `;
}

function deviceGlyph(type, color) {
  if (type === "socket") {
    return `
      <path d="M-5 2a5 5 0 0 1 10 0" fill="none" stroke="${color}" stroke-width="1.7" />
      <path d="M-2 -1v3M2 -1v3" stroke="${color}" stroke-width="1.7" stroke-linecap="round" />
    `;
  }
  if (type === "network") {
    return `<rect x="-6.5" y="-4" width="13" height="8" rx="1.4" fill="none" stroke="${color}" stroke-width="1.5" />`;
  }
  if (type === "light" || type === "lightWall") {
    return `
      <circle cx="0" cy="0" r="4.6" fill="none" stroke="${color}" stroke-width="1.5" />
      <path d="M-2.6 -2.6 2.6 2.6M2.6 -2.6 -2.6 2.6" stroke="${color}" stroke-width="1.4" />
    `;
  }
  if (type === "panel") {
    return `<rect x="-4.5" y="-6" width="9" height="12" rx="1.2" fill="none" stroke="${color}" stroke-width="1.5" />`;
  }
  if (type === "junction") {
    return `<circle cx="0" cy="0" r="3.6" fill="none" stroke="${color}" stroke-width="1.5" /><path d="M0 -6v12M-6 0h12" stroke="${color}" stroke-width="1.3" />`;
  }
  return `
    <circle cx="0" cy="0" r="4.4" fill="none" stroke="${color}" stroke-width="1.6" />
    <path d="M0.8 -1.6 3.3 2.2" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />
  `;
}

function deviceLabel(device) {
  const info = getDeviceType(device.type);
  const gangs = getDeviceGangs(device);
  const base = String(device.name || info.short);
  const short = base.length > 20 ? `${base.slice(0, 19)}…` : base;
  return gangs > 1 && !/×\s*\d/.test(short) ? `${short} ×${gangs}` : short;
}

function openingMarkup(opening, wall, x0, bottom, scale, openingIndex) {
  const span = openingSpan(opening, wall);
  const width = Math.max(0, span.width);
  const height = Number(opening.height) || getOpeningType(opening.type).defaultHeight;
  const isDoor = opening.type === "door";
  const sill = isDoor ? 0 : Math.max(0, Number(opening.sill) || 0);
  const x = x0 + span.start * scale;
  const widthPx = width * scale;
  const yTop = bottom - (sill + height) * scale;
  const yBottom = bottom - sill * scale;
  const color = isDoor ? "#b45309" : "#0369a1";
  const fill = isDoor ? "rgba(251,191,36,0.10)" : "rgba(125,211,252,0.18)";
  const label = getOpeningType(opening.type).label;
  const showLabel = widthPx > 66;
  const showWidth = widthPx > 34;
  const dimX = Math.min(x + widthPx + 12 + openingIndex * 0, SHEET_WIDTH - 24);
  return `
    <g class="elevation-opening">
      <rect x="${x.toFixed(2)}" y="${yTop.toFixed(2)}" width="${widthPx.toFixed(2)}" height="${(yBottom - yTop).toFixed(2)}" fill="${fill}" stroke="${color}" stroke-width="2" rx="1" />
      ${isDoor ? `
        <path d="M${x.toFixed(2)} ${bottom.toFixed(2)} L${(x + widthPx * 0.92).toFixed(2)} ${(bottom - widthPx * 0.92).toFixed(2)}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="4 3" />
      ` : `
        <line x1="${x.toFixed(2)}" y1="${(yBottom - (yBottom - yTop) * 0.5).toFixed(2)}" x2="${(x + widthPx).toFixed(2)}" y2="${(yBottom - (yBottom - yTop) * 0.5).toFixed(2)}" stroke="${color}" stroke-width="1" stroke-dasharray="3 3" />
      `}
      ${showLabel ? `
        <text class="opening-label" x="${(x + widthPx / 2).toFixed(2)}" y="${((yTop + yBottom) / 2 - 3).toFixed(2)}">${escapeHtml(label)}</text>
        <text class="opening-size" x="${(x + widthPx / 2).toFixed(2)}" y="${((yTop + yBottom) / 2 + 13).toFixed(2)}">${formatNumber(width)} × ${formatNumber(height)} м</text>
      ` : ""}
      ${showWidth ? dimensionLine(
        x, bottom + 18, x + widthPx, bottom + 18,
        `${formatNumber(width)} м`,
        { offset: 13 }
      ) : ""}
      <g class="dimension">
        <line x1="${dimX.toFixed(2)}" y1="${bottom.toFixed(2)}" x2="${dimX.toFixed(2)}" y2="${yTop.toFixed(2)}" />
        ${ticks(dimX, bottom, dimX, yTop)}
        <text x="${(dimX + 9).toFixed(2)}" y="${((bottom + yTop) / 2).toFixed(2)}" transform="rotate(-90 ${(dimX + 9).toFixed(2)} ${((bottom + yTop) / 2).toFixed(2)})">${isDoor ? `от пола ${formatNumber(height)} м` : `верх ${formatNumber(sill + height)} м`}</text>
      </g>
      ${!isDoor && sill > 0.05 ? `
        <g class="dimension">
          <line x1="${(dimX + 24).toFixed(2)}" y1="${bottom.toFixed(2)}" x2="${(dimX + 24).toFixed(2)}" y2="${yBottom.toFixed(2)}" />
          ${ticks(dimX + 24, bottom, dimX + 24, yBottom)}
          <text x="${(dimX + 33).toFixed(2)}" y="${((bottom + yBottom) / 2).toFixed(2)}" transform="rotate(-90 ${(dimX + 33).toFixed(2)} ${((bottom + yBottom) / 2).toFixed(2)})">подоконник ${formatNumber(sill)} м</text>
        </g>
      ` : ""}
    </g>
  `;
}

function deviceMarkup(item, x0, bottom, scale, wallHeight) {
  const { device, position } = item;
  const info = getDeviceType(device.type);
  const color = DEVICE_COLORS[device.type] || "#475569";
  const height = clamp(Number(device.mountHeight) || 0, 0, wallHeight);
  const x = x0 + position * scale;
  const y = bottom - height * scale;
  const label = deviceLabel(device);
  const labelWidth = Math.max(72, label.length * 6.2 + 16);
  const labelX = clamp(x - labelWidth / 2, 8, SHEET_WIDTH - labelWidth - 8);
  const labelY = Math.max(18, y - 34);
  return `
    <g class="elevation-device">
      <line x1="${x.toFixed(2)}" y1="${bottom.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${color}" stroke-width="1" stroke-dasharray="3 4" opacity="0.55" />
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="11" fill="#fff" stroke="${color}" stroke-width="1.8" />
      <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${deviceGlyph(device.type, color)}</g>
      <rect x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}" width="${labelWidth.toFixed(2)}" height="27" rx="7" fill="#fff" stroke="rgba(148,163,184,0.55)" />
      <text class="device-label" x="${(labelX + labelWidth / 2).toFixed(2)}" y="${(labelY + 12).toFixed(2)}">${escapeHtml(label)}</text>
      <text class="device-height" x="${(labelX + labelWidth / 2).toFixed(2)}" y="${(labelY + 22).toFixed(2)}">${escapeHtml(info.short)} · от пола ${formatNumber(height)} м</text>
    </g>
  `;
}

function wallSheet(project, floor, wall, index, deviceMap) {
  const settings = project.settings || {};
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const wallHeight = Math.max(0.5, Number(wall.height) || Number(settings.defaultWallHeight) || 2.7);
  if (length < 0.02) return "";
  const scale = Math.min(AREA.width / length, AREA.height / wallHeight);
  const widthPx = length * scale;
  const heightPx = wallHeight * scale;
  const x0 = AREA.x + (AREA.width - widthPx) / 2;
  const bottom = AREA.y + AREA.height;
  const top = bottom - heightPx;
  const openings = (floor.openings || [])
    .filter((opening) => opening.wallId === wall.id)
    .map((opening) => openingSpan(opening, wall))
    .filter((span) => span.end > 0.01 && span.start < length - 0.01);
  const filteredOpenings = (floor.openings || [])
    .filter((opening) => opening.wallId === wall.id)
    .filter((opening) => {
      const span = openingSpan(opening, wall);
      return span.end > 0.01 && span.start < length - 0.01;
    });
  const devices = (deviceMap.get(wall.id) || []).sort((a, b) => a.position - b.position);
  const id = String(wall.id || index).replace(/[^\w-]/g, "");

  return `
    <article class="elevation-sheet">
      <header class="elevation-sheet-head">
        <div>
          <span class="elevation-kicker">Развёртка стены · ${escapeHtml(floor.name)}</span>
          <h2>Стена ${index + 1}</h2>
        </div>
        <div class="elevation-meta">
          <span>Длина ${formatMeters(length)}</span>
          <span>Высота ${formatMeters(wallHeight)}</span>
          <span>Толщина ${formatMeters(Number(wall.thickness) || 0.1)}</span>
        </div>
      </header>
      <svg class="elevation-drawing" viewBox="0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}" role="img" aria-label="Развёртка стены ${index + 1}">
        <defs>
          <pattern id="wall-hatch-${id}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="12" stroke="rgba(148,163,184,0.18)" stroke-width="1" />
          </pattern>
        </defs>
        <rect x="${x0.toFixed(2)}" y="${top.toFixed(2)}" width="${widthPx.toFixed(2)}" height="${heightPx.toFixed(2)}" fill="url(#wall-hatch-${id})" stroke="#334155" stroke-width="2.2" />
        <line x1="${(x0 - 28).toFixed(2)}" y1="${bottom.toFixed(2)}" x2="${(x0 + widthPx + 28).toFixed(2)}" y2="${bottom.toFixed(2)}" stroke="#0f172a" stroke-width="2.6" />

        ${dimensionLine(x0, bottom + 58, x0 + widthPx, bottom + 58, `длина стены ${formatMeters(length)}`, { offset: 16 })}
        ${dimensionLine(x0 - 54, bottom, x0 - 54, top, `высота ${formatMeters(wallHeight)}`, { offset: -10, rotate: -90 })}

        ${filteredOpenings.map((opening, openingIndex) => openingMarkup(opening, wall, x0, bottom, scale, openingIndex)).join("")}
        ${devices.map((item) => deviceMarkup(item, x0, bottom, scale, wallHeight)).join("")}

        <text class="sheet-note" x="${SHEET_WIDTH - 26}" y="${SHEET_HEIGHT - 22}">Размеры от пола и углов стены · ${formatMeters(length)} × ${formatMeters(wallHeight)}</text>
      </svg>
      <footer class="elevation-sheet-foot">
        <span>Проёмы: ${openings.length} · устройства у стены: ${devices.length}</span>
        <span>${escapeHtml(project.name)}</span>
      </footer>
    </article>
  `;
}

export function buildElevationsMarkup(project, floor) {
  if (!floor?.walls?.length) {
    return `
      <div class="elevations-empty">
        ${icon("elevation")}
        <h3>Пока нет стен</h3>
        <p>Нарисуйте стены на плане — для каждой из них появится развёртка с проёмами, устройствами и размерами.</p>
      </div>
    `;
  }
  const deviceMap = assignDevicesToWalls(floor);
  return floor.walls
    .map((wall, index) => wallSheet(project, floor, wall, index, deviceMap))
    .filter(Boolean)
    .join("");
}

export function renderElevations(container, { project, floor }) {
  if (!container) return;
  container.innerHTML = buildElevationsMarkup(project, floor);
}
