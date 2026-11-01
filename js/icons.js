// Небольшой набор SVG-иконок интерфейса. Иконки не зависят от внешних библиотек.

const paths = {
  select: '<path d="M5 3.5 19 12l-6 .9-3.2 5.2L5 3.5Z"/>',
  wall: '<path d="M4 19h16M6 19V9m0 4h12m0 6V7"/>',
  room: '<path d="M4 6.5 12 3l8 3.5v11L12 21l-8-3.5v-11Z"/><path d="M4 6.5 12 10l8-3.5M12 10v11"/>',
  door: '<path d="M6 21V3.5h9V21M6 21h12M11 12.5h.01"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  cable: '<path d="M4 18c3.5 0 3.5-4 7-4s3.5 4 7 4"/><path d="M4 18v-2m16 2v-2"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h8.5a5.5 5.5 0 0 1 0 11H10"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12h-8.5a5.5 5.5 0 0 0 0 11H14"/>',
  folder: '<path d="M3.5 6.5h6l2 2h9v10.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 19V6.5Z"/>',
  report: '<path d="M6 3.5h9l3 3V21H6V3.5Z"/><path d="M15 3.5V7h3M9 11h6M9 15h6M9 18h4"/>',
  printer: '<path d="M7 9V3.5h10V9M7 17H4.5V10h15v7H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2.5 12h2m15 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9 7V4.5h6V7m-8 0 1 13h8l1-13M10 10.5v6M14 10.5v6"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  layers: '<path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5M10.5 7.5v6M7.5 10.5h6"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5M7.5 10.5h6"/>',
  fit: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9a2.4 2.4 0 1 1 3.8 2c-.9.7-1.5 1.2-1.5 2.5M12 17h.01"/>',
  save: '<path d="M5 4h12l2 2v14H5V4Z"/><path d="M8 4v5h8V4M8 20v-7h8v7"/>',
  print: '<path d="M7 9V3.5h10V9M7 17H4.5V10h15v7H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"/>',
  upload: '<path d="M12 20V9m0 0 4 4m-4-4-4 4M5 4h14"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M16 5V4H5v12h1"/>',
  bolt: '<path d="m13.5 2-8 11h6L10.5 22l8-12h-6l1-8Z"/>',
  plug: '<path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8ZM12 16.5V21"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 10.5V17M12 7h.01"/>',
  warning: '<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  location: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10" r="2.2"/>',
  network: '<rect x="3.5" y="8.5" width="17" height="10" rx="1.5"/><path d="M7 12h2m2 0h2m2 0h2M7 15.5h2m2 0h2m2 0h2"/>',
  elevation: '<rect x="4" y="4" width="16" height="12" rx="1"/><path d="M4 20h16M8 16v4m8-4v4M8 8h8M8 11h4"/>'
};

const deviceIcons = {
  socket: '<circle cx="12" cy="10" r="6.2"/><path d="M10 7.5v3.2M14 7.5v3.2M8.5 19h7M12 16.2V19"/>',
  switch: '<circle cx="9.5" cy="13.5" r="4.2"/><path d="m12 11 6-6M5 20h14"/>',
  switchPass: '<circle cx="6" cy="13.5" r="3.2"/><circle cx="18" cy="13.5" r="3.2"/><path d="M9.2 13.5h5.6m-2-2 2 2-2 2M4 20h16"/>',
  switchCross: '<circle cx="12" cy="12" r="5.6"/><path d="m9 9 6 6m0-6-6 6M4 20h16"/>',
  network: '<rect x="3.5" y="7.5" width="17" height="9" rx="1.5"/><path d="M6.5 7.5v4m3-4v4m5-4v4m3-4v4M12 16.5V21"/>',
  light: '<circle cx="12" cy="12" r="6"/><path d="m8 8 8 8m0-8-8 8"/>',
  lightWall: '<path d="M5 4v7a7 7 0 0 0 14 0V4M5 8h3M16 8h3M2.5 5.5 4 7M21.5 5.5 20 7"/>',
  panel: '<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M8 7h8M8 10.5h8M8 14h8M8 17.5h8"/>',
  junction: '<circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>'
};

export function icon(name, className = "") {
  const body = paths[name] || paths.info;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function deviceIcon(type, className = "") {
  const body = deviceIcons[type] || deviceIcons.socket;
  return `<svg class="icon device-svg ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function dateLabel(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
