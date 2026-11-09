// Модель данных проекта «ЭлектроПлан».
// Координаты — в метрах. Ось Y направлена вниз, как на экране.

export const APP_ID = "electroplan";
export const APP_VERSION = 2;

export const CABLE_SECTIONS = [
  { value: 1.5, label: "1,5 мм²", color: "#16a34a" },
  { value: 2.5, label: "2,5 мм²", color: "#2563eb" },
  { value: 4, label: "4 мм²", color: "#f59e0b" },
  { value: 6, label: "6 мм²", color: "#dc2626" },
  { value: 10, label: "10 мм²", color: "#7c3aed" }
];

export const CORES = [2, 3, 5];

export const CABLE_KINDS = {
  power: { label: "Силовой", short: "Силовой" },
  utp: { label: "UTP (витая пара)", short: "UTP" }
};

export const UTP_CATEGORIES = [
  { value: "Cat5e", label: "UTP Cat5e", color: "#0d9488" },
  { value: "Cat6", label: "UTP Cat6", color: "#0891b2" },
  { value: "Cat6a", label: "UTP Cat6a", color: "#7c3aed" }
];

// Корпуса щитов: ширина ряда и количество DIN-рейок.
export const PANEL_LAYOUTS = [
  { value: "12x1", columns: 12, rows: 1, label: "12 модулей · 1×12" },
  { value: "18x1", columns: 18, rows: 1, label: "18 модулей · 1×18" },
  { value: "12x2", columns: 12, rows: 2, label: "24 модуля · 2×12" },
  { value: "12x3", columns: 12, rows: 3, label: "36 модулей · 3×12" },
  { value: "18x3", columns: 18, rows: 3, label: "54 модуля · 3×18" }
];

// Каталог модулей щита. Ширина указана в модулях DIN (17,5 мм).
// Номиналы и характеристики не подбираются автоматически — их задаёт пользователь.
export const PANEL_MODULE_TYPES = {
  main2: {
    label: "Вводной автомат 2P", short: "Ввод 2P", width: 2,
    group: "breaker", rating: true, curve: true
  },
  main3: {
    label: "Вводной автомат 3P", short: "Ввод 3P", width: 3,
    group: "breaker", rating: true, curve: true
  },
  breaker1: {
    label: "Автомат 1P", short: "1P", width: 1,
    group: "breaker", rating: true, curve: true
  },
  breaker2: {
    label: "Автомат 2P", short: "2P", width: 2,
    group: "breaker", rating: true, curve: true
  },
  breaker3: {
    label: "Автомат 3P", short: "3P", width: 3,
    group: "breaker", rating: true, curve: true
  },
  breaker4: {
    label: "Автомат 4P", short: "4P", width: 4,
    group: "breaker", rating: true, curve: true
  },
  rcd2: {
    label: "УЗО 2P", short: "УЗО 2P", width: 2,
    group: "rcd", rating: true, leakage: true
  },
  rcd4: {
    label: "УЗО 4P", short: "УЗО 4P", width: 4,
    group: "rcd", rating: true, leakage: true
  },
  diff2: {
    label: "Дифавтомат 1P+N", short: "Диф 2P", width: 2,
    group: "diff", rating: true, curve: true, leakage: true
  },
  diff4: {
    label: "Дифавтомат 3P+N", short: "Диф 4P", width: 4,
    group: "diff", rating: true, curve: true, leakage: true
  },
  relay: {
    label: "Реле напряжения", short: "Реле", width: 2,
    group: "relay"
  },
  contactor: {
    label: "Контактор", short: "Контактор", width: 2,
    group: "relay", rating: true
  },
  meter: {
    label: "Счётчик", short: "Счётчик", width: 4,
    group: "meter"
  },
  spd: {
    label: "УЗИП", short: "УЗИП", width: 2,
    group: "other"
  },
  terminal: {
    label: "Клеммник", short: "Клемма", width: 1,
    group: "terminal"
  },
  blank: {
    label: "Заглушка", short: "Заглушка", width: 1,
    group: "blank"
  },
  other: {
    label: "Модуль", short: "Модуль", width: 1,
    group: "other"
  }
};

export const PANEL_GROUP_LABELS = {
  breaker: "Автоматы",
  rcd: "УЗО",
  diff: "Дифавтоматы",
  relay: "Реле и контакторы",
  meter: "Учёт",
  terminal: "Клеммы",
  blank: "Заглушки",
  other: "Прочее"
};

export const DEVICE_TYPES = {
  socket: {
    label: "Розетка", short: "Розетка", mountHeight: 0.3,
    defaultName: "Розетка", gangs: true, defaultGangs: 1
  },
  switch: {
    label: "Выключатель", short: "Выключатель", mountHeight: 0.9,
    defaultName: "Выключатель", gangs: true, defaultGangs: 1
  },
  switchPass: {
    label: "Проходной выключатель", short: "Проходной", mountHeight: 0.9,
    defaultName: "Проходной выключатель", gangs: true, defaultGangs: 1
  },
  switchCross: {
    label: "Перекрёстный выключатель", short: "Перекрёстный", mountHeight: 0.9,
    defaultName: "Перекрёстный выключатель", gangs: true, defaultGangs: 1
  },
  network: {
    label: "Интернет-розетка", short: "Интернет", mountHeight: 0.3,
    defaultName: "Интернет-розетка"
  },
  light: { label: "Светильник", short: "Светильник", mountHeight: 2.5, defaultName: "Светильник" },
  lightWall: { label: "Бра", short: "Бра", mountHeight: 1.8, defaultName: "Бра" },
  panel: { label: "Электрощит", short: "Щит", mountHeight: 1.5, defaultName: "Электрощит" },
  junction: { label: "Распаячная коробка", short: "Коробка", mountHeight: 2.3, defaultName: "Распаячная коробка" }
};

export const OPENING_TYPES = {
  door: {
    label: "Дверь",
    short: "Дверь",
    defaultWidth: 0.9,
    defaultHeight: 2.1,
    defaultSill: 0,
    color: "#b45309"
  },
  window: {
    label: "Окно",
    short: "Окно",
    defaultWidth: 1.2,
    defaultHeight: 1.4,
    defaultSill: 0.9,
    color: "#0284c7"
  }
};

export const DEFAULT_SETTINGS = {
  grid: 0.1,
  snap: true,
  showGrid: true,
  showLabels: true,
  showDimensions: false,
  reservePercent: 10,
  deviceSlack: 0.2,
  defaultSection: 2.5,
  defaultCores: 3,
  defaultUtpCategory: "Cat6",
  defaultRouteHeight: 2.5,
  defaultWallThickness: 0.1,
  defaultWallHeight: 2.7
};

export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// --- Щит ----------------------------------------------------------------

function panelRating(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return Math.min(125, Math.max(1, Math.round(number)));
}

function panelLeakage(value) {
  const number = Number(value);
  return [10, 30, 100, 300].includes(number) ? number : "";
}

export function getPanelModuleType(type) {
  return PANEL_MODULE_TYPES[type] || PANEL_MODULE_TYPES.other;
}

export function panelModuleWidth(module) {
  return getPanelModuleType(module?.type).width;
}

export function panelModuleSpec(module) {
  const info = getPanelModuleType(module?.type);
  const parts = [];
  if (info.rating && module?.rating) {
    parts.push(info.curve ? `${module.curve || "C"}${module.rating}` : `${module.rating} А`);
  }
  if (info.leakage && module?.leakage) parts.push(`${module.leakage} мА`);
  return parts.length ? `${info.label} · ${parts.join(" · ")}` : info.label;
}

export function createPanelModule(type, extra = {}) {
  const key = PANEL_MODULE_TYPES[type] ? type : "other";
  const info = PANEL_MODULE_TYPES[key];
  const curve = String(extra.curve || "C").toUpperCase();
  return {
    id: extra.id || createId("mod"),
    type: key,
    rating: info.rating ? panelRating(extra.rating) : "",
    curve: info.curve ? (["B", "C", "D"].includes(curve) ? curve : "C") : "",
    leakage: info.leakage ? panelLeakage(extra.leakage) : "",
    circuit: String(extra.circuit || ""),
    note: String(extra.note || "")
  };
}

export function normalizePanelModule(input) {
  return createPanelModule(input.type, input);
}

export function createPanel(name = "Щит") {
  return {
    id: createId("panel"),
    name,
    columns: 12,
    rows: 2,
    modules: []
  };
}

export function panelLayoutKey(panel) {
  const columns = Number(panel?.columns) || 12;
  const rows = Number(panel?.rows) || 2;
  const found = PANEL_LAYOUTS.find((item) => item.columns === columns && item.rows === rows);
  return found ? found.value : "12x2";
}

export function normalizePanel(input) {
  const source = input && typeof input === "object" ? input : {};
  const columns = [12, 18].includes(Number(source.columns)) ? Number(source.columns) : 12;
  const rowsNumber = Math.round(Number(source.rows));
  const rows = Number.isFinite(rowsNumber) ? Math.min(6, Math.max(1, rowsNumber)) : 2;
  return {
    id: String(source.id || createId("panel")),
    name: String(source.name || "Щит").slice(0, 60),
    columns,
    rows,
    modules: Array.isArray(source.modules)
      ? source.modules
        .filter((item) => item && typeof item === "object")
        .map(normalizePanelModule)
      : []
  };
}

export function createFloor(name = "1 этаж") {
  return {
    id: createId("floor"),
    name,
    walls: [],
    rooms: [],
    openings: [],
    devices: [],
    cables: [],
    underlay: null
  };
}

export function createProject(name = "Мой дом") {
  const floor = createFloor("1 этаж");
  return {
    app: APP_ID,
    version: APP_VERSION,
    id: createId("project"),
    name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    settings: { ...DEFAULT_SETTINGS },
    floors: [floor],
    activeFloorId: floor.id,
    panel: createPanel()
  };
}

export function createDemoProject() {
  const project = createProject("Дом 8×5 — пример");
  const floor = project.floors[0];

  const wall = (ax, ay, bx, by, thickness = 0.1) => ({
    id: createId("wall"),
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness,
    height: 2.7
  });

  const topWall = wall(0, 0, 8, 0, 0.2);
  const rightWall = wall(8, 0, 8, 5, 0.2);
  const bottomWall = wall(8, 5, 0, 5, 0.2);
  const leftWall = wall(0, 5, 0, 0, 0.2);
  const middleWall = wall(4.5, 0, 4.5, 5, 0.1);
  floor.walls = [topWall, rightWall, bottomWall, leftWall, middleWall];

  const opening = (wallId, type, offset, extra = {}) => ({
    id: createId("opening"),
    wallId,
    type,
    offset,
    width: OPENING_TYPES[type].defaultWidth,
    height: OPENING_TYPES[type].defaultHeight,
    sill: OPENING_TYPES[type].defaultSill,
    hinge: "start",
    swing: 1,
    note: "",
    ...extra
  });

  floor.openings = [
    opening(topWall.id, "window", 2.2),
    opening(topWall.id, "window", 6.2),
    opening(middleWall.id, "door", 1.2)
  ];

  floor.rooms = [
    {
      id: createId("room"),
      name: "Гостиная",
      points: [
        { x: 0.12, y: 0.12 }, { x: 4.38, y: 0.12 },
        { x: 4.38, y: 4.88 }, { x: 0.12, y: 4.88 }
      ],
      color: "#dbeafe"
    },
    {
      id: createId("room"),
      name: "Спальня",
      points: [
        { x: 4.62, y: 0.12 }, { x: 7.88, y: 0.12 },
        { x: 7.88, y: 4.88 }, { x: 4.62, y: 4.88 }
      ],
      color: "#dcfce7"
    }
  ];

  const dev = (type, x, y, extra = {}) => ({
    id: createId("dev"),
    type,
    name: DEVICE_TYPES[type].defaultName,
    x,
    y,
    rotation: 0,
    mountHeight: DEVICE_TYPES[type].mountHeight,
    gangs: 1,
    circuit: "",
    note: "",
    ...extra
  });

  const panel = dev("panel", 0.55, 4.4, { name: "Щит", circuit: "Ввод" });
  const s1 = dev("socket", 1.8, 0.3, { circuit: "Розетки" });
  const s2 = dev("socket", 3.2, 0.3, { name: "Розетка ×2", gangs: 2, circuit: "Розетки" });
  const s3 = dev("socket", 6.0, 0.3, { circuit: "Розетки" });
  const s4 = dev("socket", 7.3, 4.7, { circuit: "Розетки" });
  const net = dev("network", 6.6, 4.7, { circuit: "Слаботочка" });
  const sw1 = dev("switch", 4.32, 4.5, { circuit: "Свет" });
  const sw2 = dev("switch", 4.68, 4.5, { circuit: "Свет" });
  const l1 = dev("light", 2.2, 2.5, { circuit: "Свет" });
  const l2 = dev("light", 6.2, 2.5, { circuit: "Свет" });
  floor.devices = [panel, s1, s2, s3, s4, net, sw1, sw2, l1, l2];

  const cable = (name, section, cores, points, startDeviceId, endDeviceId, circuit, extra = {}) => ({
    id: createId("cab"),
    name,
    section,
    cores,
    points,
    routeHeight: 2.5,
    circuit,
    note: "",
    reservePercent: null,
    startDeviceId,
    endDeviceId,
    ...extra
  });

  const utpCategory = DEFAULT_SETTINGS.defaultUtpCategory;
  floor.cables = [
    cable("Щит → розетки гостиной", 2.5, 3, [
      { x: 0.55, y: 4.4 }, { x: 0.55, y: 0.3 }, { x: 1.8, y: 0.3 }
    ], panel.id, s1.id, "Розетки"),
    cable("Щит → розетка у окна", 2.5, 3, [
      { x: 0.55, y: 4.4 }, { x: 3.2, y: 4.4 }, { x: 3.2, y: 0.3 }
    ], panel.id, s2.id, "Розетки"),
    cable("Щит → розетки спальни", 2.5, 3, [
      { x: 0.55, y: 4.4 }, { x: 6.0, y: 4.4 }, { x: 6.0, y: 0.3 }
    ], panel.id, s3.id, "Розетки"),
    cable("Щит → розетка спальни", 2.5, 3, [
      { x: 0.55, y: 4.4 }, { x: 7.3, y: 4.4 }, { x: 7.3, y: 4.7 }
    ], panel.id, s4.id, "Розетки"),
    cable("Щит → интернет-розетка", 0, 0, [
      { x: 0.55, y: 4.4 }, { x: 6.6, y: 4.4 }, { x: 6.6, y: 4.7 }
    ], panel.id, net.id, "Слаботочка", {
      kind: "utp",
      category: utpCategory
    }),
    cable("Щит → свет гостиной", 1.5, 3, [
      { x: 0.55, y: 4.4 }, { x: 2.2, y: 4.4 }, { x: 2.2, y: 2.5 }
    ], panel.id, l1.id, "Свет"),
    cable("Щит → свет спальни", 1.5, 3, [
      { x: 0.55, y: 4.4 }, { x: 6.2, y: 4.4 }, { x: 6.2, y: 2.5 }
    ], panel.id, l2.id, "Свет"),
    cable("Выключатель → свет гостиной", 1.5, 3, [
      { x: 4.32, y: 4.5 }, { x: 4.32, y: 2.5 }, { x: 2.2, y: 2.5 }
    ], sw1.id, l1.id, "Свет"),
    cable("Выключатель → свет спальни", 1.5, 3, [
      { x: 4.68, y: 4.5 }, { x: 4.68, y: 2.5 }, { x: 6.2, y: 2.5 }
    ], sw2.id, l2.id, "Свет")
  ];

  project.panel = {
    ...createPanel("Щит"),
    modules: [
      createPanelModule("main2", { rating: 40, curve: "C", circuit: "Ввод" }),
      createPanelModule("rcd2", { rating: 40, leakage: 30, circuit: "Розетки" }),
      createPanelModule("breaker1", { rating: 16, curve: "C", circuit: "Розетки" }),
      createPanelModule("breaker1", { rating: 10, curve: "C", circuit: "Свет" }),
      createPanelModule("terminal", { circuit: "Слаботочка" })
    ]
  };

  return project;
}

// Клонирование без дублирования строки с картинкой подложки.
export function cloneProject(project) {
  return {
    ...project,
    settings: { ...project.settings },
    floors: project.floors.map((floor) => ({
      ...floor,
      walls: floor.walls.map((wall) => ({ ...wall, a: { ...wall.a }, b: { ...wall.b } })),
      rooms: floor.rooms.map((room) => ({
        ...room,
        points: room.points.map((point) => ({ ...point }))
      })),
      openings: (floor.openings || []).map((item) => ({ ...item })),
      devices: floor.devices.map((device) => ({ ...device })),
      cables: floor.cables.map((cable) => ({
        ...cable,
        points: cable.points.map((point) => ({ ...point }))
      })),
      underlay: floor.underlay ? { ...floor.underlay, image: floor.underlay.image } : null
    })),
    panel: project.panel
      ? { ...project.panel, modules: (project.panel.modules || []).map((module) => ({ ...module })) }
      : createPanel()
  };
}

export function getFloor(project, floorId = project.activeFloorId) {
  return project.floors.find((floor) => floor.id === floorId) || project.floors[0];
}

export function getDeviceType(type) {
  return DEVICE_TYPES[type] || DEVICE_TYPES.socket;
}

export function getDeviceGangs(device) {
  const info = getDeviceType(device?.type);
  if (!info.gangs) return 1;
  const number = Math.round(Number(device?.gangs));
  const fallback = Number(info.defaultGangs) || 1;
  return Math.min(4, Math.max(1, Number.isFinite(number) && number > 0 ? number : fallback));
}

export function deviceTypeLabel(device) {
  const info = getDeviceType(device?.type);
  const gangs = getDeviceGangs(device);
  return gangs > 1 ? `${info.label} ×${gangs}` : info.label;
}

export function getCableKind(cable) {
  return cable?.kind === "utp" ? "utp" : "power";
}

export function getUtpCategory(cable) {
  const value = String(cable?.category || "");
  return UTP_CATEGORIES.find((item) => item.value === value) || UTP_CATEGORIES[1];
}

export function getOpeningType(type) {
  return OPENING_TYPES[type] || OPENING_TYPES.door;
}

export function wallLength(wall) {
  if (!wall?.a || !wall?.b) return 0;
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
}

// Положение проёма на стене: смещение хранится до центра, а границы
// всегда подрезаются по длине стены — даже если стену укоротили позже.
export function openingSpan(opening, wall) {
  const type = getOpeningType(opening?.type);
  const length = wallLength(wall);
  if (!Number.isFinite(length) || length <= 0.001) {
    return { length: 0, width: 0, center: 0, start: 0, end: 0 };
  }
  const maxWidth = Math.max(0.05, length - 0.02);
  const rawWidth = Number(opening?.width);
  const width = Math.min(
    maxWidth,
    Math.max(0.2, Number.isFinite(rawWidth) ? rawWidth : type.defaultWidth)
  );
  const rawOffset = Number(opening?.offset);
  const requested = Number.isFinite(rawOffset) ? rawOffset : length / 2;
  const half = width / 2;
  const center = Math.min(Math.max(requested, half), Math.max(half, length - half));
  return { length, width, center, start: center - half, end: center + half };
}

export function normalizeOpening(input, wall = null) {
  if (!input || typeof input !== "object" || !input.wallId) return null;
  const type = OPENING_TYPES[input.type] ? input.type : "door";
  const info = OPENING_TYPES[type];
  const rawWidth = Number(input.width);
  const rawHeight = Number(input.height);
  const rawSill = Number(input.sill);
  const width = Number.isFinite(rawWidth) ? Math.min(4, Math.max(0.2, rawWidth)) : info.defaultWidth;
  const height = Number.isFinite(rawHeight) ? Math.min(5, Math.max(0.3, rawHeight)) : info.defaultHeight;
  const sill = type === "door"
    ? 0
    : Number.isFinite(rawSill) ? Math.min(3, Math.max(0, rawSill)) : info.defaultSill;
  const rawOffset = Number(input.offset);
  const fallbackOffset = wall ? wallLength(wall) / 2 : 0;
  let offset = Number.isFinite(rawOffset) ? rawOffset : fallbackOffset;
  let effectiveWidth = width;
  if (wall) {
    const span = openingSpan({ ...input, type, width, offset }, wall);
    offset = span.center;
    effectiveWidth = span.width;
  }
  return {
    id: input.id || createId("opening"),
    wallId: String(input.wallId),
    type,
    offset,
    width: effectiveWidth,
    height,
    sill,
    hinge: input.hinge === "end" ? "end" : "start",
    swing: Number(input.swing) === -1 ? -1 : 1,
    note: String(input.note || "")
  };
}

export function sectionLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${String(number).replace(".", ",")} мм²`;
}

export function getSectionInfo(value) {
  const number = Number(value);
  const found = CABLE_SECTIONS.find((section) => Math.abs(section.value - number) < 1e-9);
  return found || { value: number, label: sectionLabel(number), color: "#64748b" };
}

export function cableSpecLabel(cable) {
  if (getCableKind(cable) === "utp") return getUtpCategory(cable).label;
  const section = Number(cable?.section ?? 2.5);
  const cores = Number(cable?.cores ?? 3);
  return `${cores}×${String(section).replace(".", ",")}`;
}

export function cableColor(cable) {
  if (getCableKind(cable) === "utp") return getUtpCategory(cable).color;
  return getSectionInfo(cable?.section ?? 2.5).color;
}

function clampGangs(value, fallback = 1) {
  const number = Math.round(Number(value));
  return Math.min(4, Math.max(1, Number.isFinite(number) && number > 0 ? number : fallback));
}

function normalizeDevice(input) {
  const legacy = {
    socketDouble: { type: "socket", gangs: 2, name: "Розетка двойная" },
    switchDouble: { type: "switch", gangs: 2, name: "Выключатель двойной" }
  }[input.type];
  const type = DEVICE_TYPES[input.type] ? input.type : legacy?.type || "socket";
  const info = DEVICE_TYPES[type];
  const gangs = info.gangs ? clampGangs(input.gangs ?? legacy?.gangs, info.defaultGangs) : 1;
  let name = String(input.name || info.defaultName);
  if (legacy && name === legacy.name) {
    name = gangs > 1 ? `${info.defaultName} ×${gangs}` : info.defaultName;
  }
  const mountHeight = Number(input.mountHeight);
  return {
    ...input,
    type,
    name,
    x: Number.isFinite(Number(input.x)) ? Number(input.x) : 0,
    y: Number.isFinite(Number(input.y)) ? Number(input.y) : 0,
    rotation: Number(input.rotation) || 0,
    mountHeight: Number.isFinite(mountHeight) ? Math.min(10, Math.max(0, mountHeight)) : info.mountHeight,
    gangs,
    circuit: String(input.circuit || ""),
    note: String(input.note || "")
  };
}

function normalizeCable(input) {
  const kind = getCableKind(input);
  const category = getUtpCategory(input).value;
  const section = Number(input.section);
  const cores = Number(input.cores);
  const routeHeight = Number(input.routeHeight);
  return {
    ...input,
    name: String(input.name || "Трасса"),
    kind,
    category: kind === "utp" ? category : getUtpCategory(input).value,
    section: kind === "utp"
      ? 0
      : Number.isFinite(section) && section > 0 ? section : DEFAULT_SETTINGS.defaultSection,
    cores: kind === "utp"
      ? 0
      : CORES.includes(cores) ? cores : DEFAULT_SETTINGS.defaultCores,
    routeHeight: Number.isFinite(routeHeight)
      ? Math.min(10, Math.max(0, routeHeight))
      : DEFAULT_SETTINGS.defaultRouteHeight,
    circuit: String(input.circuit || ""),
    note: String(input.note || ""),
    points: Array.isArray(input.points)
      ? input.points
        .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
        .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
      : []
  };
}

export function normalizeProject(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Файл не похож на проект");
  }
  const base = createProject(input.name || "Проект");
  const project = {
    ...base,
    ...input,
    app: APP_ID,
    version: APP_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(input.settings || {}) }
  };
  project.panel = normalizePanel(project.panel);

  if (!Array.isArray(project.floors) || project.floors.length === 0) {
    project.floors = [createFloor()];
  }

  project.floors = project.floors.map((floor) => ({
    ...createFloor(floor.name || "Этаж"),
    ...floor,
    walls: Array.isArray(floor.walls) ? floor.walls : [],
    rooms: Array.isArray(floor.rooms) ? floor.rooms : [],
    openings: Array.isArray(floor.openings) ? floor.openings : [],
    devices: Array.isArray(floor.devices) ? floor.devices : [],
    cables: Array.isArray(floor.cables) ? floor.cables : [],
    underlay: floor.underlay || null
  }));

  for (const floor of project.floors) {
    floor.id ||= createId("floor");
    const wallsById = new Map(floor.walls.map((wall) => [wall.id, wall]));
    floor.openings = floor.openings
      .filter((item) => item && wallsById.has(item.wallId))
      .map((item) => normalizeOpening(item, wallsById.get(item.wallId)))
      .filter(Boolean);
    floor.devices = floor.devices.filter((item) => item && typeof item === "object").map(normalizeDevice);
    floor.cables = floor.cables.filter((item) => item && typeof item === "object").map(normalizeCable);
    for (const collection of [floor.walls, floor.rooms, floor.openings, floor.devices, floor.cables]) {
      for (const item of collection) item.id ||= createId("item");
    }
  }

  if (!project.floors.some((floor) => floor.id === project.activeFloorId)) {
    project.activeFloorId = project.floors[0].id;
  }
  project.createdAt ||= nowIso();
  project.updatedAt = nowIso();
  return project;
}
