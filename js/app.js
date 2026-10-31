// Точка входа приложения: связывает модель, холст, панели, хранение и отчёты.

import {
  DEVICE_TYPES,
  OPENING_TYPES,
  createDemoProject,
  createId,
  createProject,
  getDeviceType,
  getOpeningType,
  normalizeProject,
  nowIso,
  openingSpan
} from "./model.js";
import { formatNumber, pluralRu } from "./geometry.js";
import { summarizeProject } from "./calc.js";
import {
  state,
  setProject,
  activeFloor,
  select,
  selectedItem,
  setTool,
  setDeviceType,
  commit,
  undo,
  redo,
  on,
  switchFloor,
  addFloor,
  removeActiveFloor,
  renameFloor,
  markSaved
} from "./store.js";
import * as storage from "./storage.js";
import { PlanEditor } from "./editor.js";
import { renderProperties, renderFloors, renderProjectList } from "./ui.js";
import { renderSummary } from "./summary.js";
import {
  downloadCsv,
  downloadText,
  renderReport,
  sanitizeFilename
} from "./report.js";
import { deviceIcon, escapeHtml, icon } from "./icons.js";

const TOOLS = [
  { id: "select", label: "Выбор", icon: "select" },
  { id: "wall", label: "Стена", icon: "wall" },
  { id: "room", label: "Комната", icon: "room" },
  { id: "door", label: "Дверь", icon: "door" },
  { id: "window", label: "Окно", icon: "window" },
  { id: "cable", label: "Кабель", icon: "cable" }
];

const DEVICE_UI_COLORS = {
  socket: "#38bdf8",
  socketDouble: "#38bdf8",
  switch: "#fbbf24",
  switchDouble: "#fbbf24",
  light: "#facc15",
  lightWall: "#facc15",
  panel: "#e2e8f0",
  junction: "#c4b5fd"
};

const NUMERIC_SETTINGS = new Set([
  "grid",
  "reservePercent",
  "deviceSlack",
  "defaultSection",
  "defaultCores",
  "defaultRouteHeight",
  "defaultWallThickness",
  "defaultWallHeight"
]);

const $ = (id) => document.getElementById(id);
const els = {};
let editor = null;
let activeTab = "properties";
let autosaveTimer = null;
let uiTimer = null;
let cursorFrame = null;
let pendingCursor = null;
let savePhase = "saved";
let lastSavedAt = null;
let deferredInstallPrompt = null;
let hintKey = "";

function cacheElements() {
  const ids = [
    "leftPanelBtn", "leftPanel", "leftCloseBtn", "panelBackdrop",
    "toolPalette", "devicePalette", "floorList", "storageBadge", "storageBadgeDialog",
    "topProjectName", "projectOpenBtn", "saveState", "saveStateText", "saveDot",
    "undoBtn", "redoBtn", "settingsBtn", "reportBtn", "helpBtn", "helpBtnSide",
    "floorChip", "activeFloorName", "zoomOutBtn", "zoomResetBtn", "zoomInBtn",
    "fitBtn", "gridBtn", "planCanvas", "canvasWrap", "emptyHint",
    "drawHint", "drawHintTitle", "drawHintText", "finishDraftBtn", "cancelDraftBtn",
    "cursorReadout", "toolHint", "routeStatus", "zoomStatus",
    "mobileDevicesBtn", "mobileInspectorBtn", "mobileSummaryBtn",
    "rightPanel", "rightCloseBtn", "rightPanelTitle", "propertiesTab", "summaryTab",
    "summaryBadge", "propertiesPanel", "summaryPanel",
    "projectsDialog", "newProjectForm", "newProjectName", "projectsList",
    "importProjectBtn", "openDemoBtn", "exportCurrentBtn",
    "helpDialog", "installAppBtn", "confirmDialog", "confirmTitle", "confirmText",
    "confirmCancelBtn", "confirmOkBtn",
    "reportOverlay", "reportCloseBtn", "reportCsvBtn", "reportPrintBtn", "reportPreview",
    "projectImportInput", "underlayImportInput", "toastRegion"
  ];
  for (const id of ids) els[id] = $(id);
  els.rightScroll = els.rightPanel?.querySelector(".right-scroll");
}

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((node) => {
    if (node.querySelector("svg")) return;
    node.innerHTML = icon(node.dataset.icon);
  });
}

function showToast(message, type = "success", duration = 3000) {
  if (!els.toastRegion) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "warning" ? "toast-warning" : type === "error" ? "toast-error" : ""}`;
  toast.textContent = message;
  els.toastRegion.appendChild(toast);
  const remove = () => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 190);
  };
  setTimeout(remove, duration);
}

function isMobile() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function parseNumber(value, fallback) {
  const normalized = String(value).replace(",", ".").trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// --- Палитры и инструменты ------------------------------------------------

function renderPalettes() {
  if (els.toolPalette) {
    els.toolPalette.innerHTML = TOOLS.map((tool) => `
      <button class="tool-btn" type="button" data-tool="${tool.id}" title="${escapeHtml(tool.label)}">
        <span class="tool-icon">${icon(tool.icon)}</span>
        <span>${escapeHtml(tool.label)}</span>
      </button>
    `).join("");
  }
  if (els.devicePalette) {
    els.devicePalette.innerHTML = Object.entries(DEVICE_TYPES).map(([type, info]) => `
      <button class="device-btn" type="button" data-device="${type}" style="--device-color:${DEVICE_UI_COLORS[type] || "#94a3b8"}" title="${escapeHtml(info.label)}">
        ${deviceIcon(type)}
        <span>${escapeHtml(info.short)}</span>
      </button>
    `).join("");
  }
}

function syncToolUi() {
  const tool = state.tool;
  document.querySelectorAll(".tool-btn").forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll(".device-btn").forEach((button) => {
    const active = tool === "device" && button.dataset.device === state.deviceType;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll(".dock-btn[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
}

function activateTool(tool) {
  if (tool === "device") {
    setDeviceType(state.deviceType || "socket");
  } else {
    setTool(tool);
  }
  syncToolUi();
  if (isMobile()) closeLeftPanel();
}

function activateDevice(type) {
  setDeviceType(type);
  syncToolUi();
  if (isMobile()) closeLeftPanel();
}

// --- Сохранение -----------------------------------------------------------

function formatClock(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function updateStorageLabels() {
  const mode = storage.storageModeLabel();
  const label = mode === "IndexedDB" ? "Локально · IndexedDB" : "Локально · браузер";
  if (els.storageBadge) els.storageBadge.textContent = label;
  if (els.storageBadgeDialog) els.storageBadgeDialog.textContent = label;
}

function updateSaveIndicator() {
  if (!els.saveState) return;
  els.saveState.classList.remove("is-saving", "is-dirty");
  if (savePhase === "saving") {
    els.saveState.classList.add("is-saving");
    els.saveStateText.textContent = "Сохранение…";
  } else if (savePhase === "dirty") {
    els.saveState.classList.add("is-dirty");
    els.saveStateText.textContent = "Есть изменения";
  } else if (savePhase === "error") {
    els.saveState.classList.add("is-dirty");
    els.saveStateText.textContent = "Не сохранено";
  } else {
    els.saveStateText.textContent = lastSavedAt ? `Сохранено ${formatClock(lastSavedAt)}` : "Сохранено";
  }
  updateDocumentTitle();
}

function updateDocumentTitle() {
  if (!state.project) {
    document.title = "ЭлектроПлан";
    return;
  }
  const dirty = savePhase === "dirty" || savePhase === "saving" || savePhase === "error";
  document.title = `${dirty ? "• " : ""}${state.project.name} — ЭлектроПлан`;
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  savePhase = "dirty";
  updateSaveIndicator();
  autosaveTimer = setTimeout(() => {
    saveNow().catch(() => {});
  }, 700);
}

async function saveNow({ quiet = true } = {}) {
  if (!state.project) return false;
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  savePhase = "saving";
  updateSaveIndicator();
  try {
    await storage.saveProject(state.project);
    await storage.setLastProjectId(state.project.id);
    lastSavedAt = nowIso();
    markSaved(lastSavedAt);
    savePhase = "saved";
    updateStorageLabels();
    updateSaveIndicator();
    return true;
  } catch (error) {
    console.error("Не удалось сохранить проект", error);
    savePhase = "error";
    updateSaveIndicator();
    if (!quiet) showToast("Не удалось сохранить проект на устройстве", "error");
    return false;
  }
}

async function flushSave() {
  if (!state.project) return;
  try {
    await storage.saveProject(state.project);
    await storage.setLastProjectId(state.project.id);
  } catch (error) {
    console.warn("Не удалось сохранить при закрытии", error);
  }
}

// --- Интерфейс ------------------------------------------------------------

function setTab(tab, { openOnMobile = false } = {}) {
  activeTab = tab;
  const isProperties = tab === "properties";
  els.propertiesPanel.hidden = !isProperties;
  els.summaryPanel.hidden = isProperties;
  els.propertiesTab.classList.toggle("active", isProperties);
  els.summaryTab.classList.toggle("active", !isProperties);
  els.propertiesTab.setAttribute("aria-selected", isProperties ? "true" : "false");
  els.summaryTab.setAttribute("aria-selected", isProperties ? "false" : "true");
  els.rightPanelTitle.textContent = isProperties ? "Свойства" : "Смета";
  renderActivePanel();
  if (openOnMobile && isMobile()) openRightPanel();
}

function renderActivePanel() {
  if (!state.project || !activeFloor()) return;
  if (activeTab === "summary") {
    renderSummary(els.summaryPanel, {
      project: state.project,
      floor: activeFloor(),
      selection: state.selection
    });
  } else {
    renderProperties(els.propertiesPanel, {
      project: state.project,
      floor: activeFloor(),
      selection: state.selection
    });
  }
}

function updateZoomLabels() {
  const scale = Math.round(state.view.scale);
  if (els.zoomStatus) els.zoomStatus.textContent = `Масштаб ${scale} px/м`;
  if (els.zoomResetBtn) els.zoomResetBtn.textContent = `${scale} px/м`;
}

function updateHistoryButtons() {
  if (els.undoBtn) els.undoBtn.disabled = state.past.length === 0;
  if (els.redoBtn) els.redoBtn.disabled = state.future.length === 0;
}

function refreshUi() {
  const project = state.project;
  const floor = activeFloor();
  if (!project || !floor) return;

  els.topProjectName.textContent = project.name;
  els.activeFloorName.textContent = floor.name;
  renderFloors(els.floorList, { project, activeFloorId: project.activeFloorId });
  renderActivePanel();

  const data = summarizeProject(project);
  const activeData = data.floors.find((entry) => entry.floor.id === floor.id);
  const activeSummary = activeData?.summary;
  els.summaryBadge.textContent = `${formatNumber(data.totals.total, data.totals.total < 10 ? 1 : 0)} м`;
  if (els.routeStatus) {
    els.routeStatus.textContent = activeSummary
      ? `${activeSummary.totals.routes} ${pluralRu(activeSummary.totals.routes, "трасса", "трассы", "трасс")} · ${formatNumber(activeSummary.totals.total)} м`
      : "";
  }

  const empty = floor.walls.length === 0 && floor.rooms.length === 0 &&
    floor.devices.length === 0 && floor.cables.length === 0;
  // Подсказка не должна перекрывать холст, когда пользователь уже рисует.
  els.emptyHint.hidden = !empty || state.tool !== "select";
  els.gridBtn.classList.toggle("active", Boolean(project.settings.showGrid));
  updateHistoryButtons();
  updateSaveIndicator();

  if (els.zoomStatus) {
    els.zoomStatus.textContent = `Масштаб ${Math.round(state.view.scale)} px/м`;
  }
  if (isMobile() && els.rightPanel.classList.contains("open")) {
    // Не перерисовываем открытую панель при перетаскивании — она обновится
    // после окончания жеста.
    if (editor?.active?.kind !== "dragPoint") renderActivePanel();
  }
}

function scheduleUi(delay = 80) {
  clearTimeout(uiTimer);
  uiTimer = setTimeout(refreshUi, delay);
}

function updateDraftHint(info) {
  const defaultHint = "Выбирайте объекты на плане. Колесо мыши — масштаб, перетаскивание фона — панорама.";
  const hint = info?.hint || defaultHint;
  if (els.toolHint.textContent !== hint) els.toolHint.textContent = hint;

  const key = `${info?.active}|${info?.title}|${info?.hint}|${info?.canFinish}|${info?.pointCount}`;
  if (key === hintKey) return;
  hintKey = key;
  if (!els.drawHint) return;
  els.drawHint.hidden = !info?.active;
  if (info?.active) {
    els.drawHintTitle.textContent = info.title || "Черчение";
    els.drawHintText.textContent = info.hint || "";
    els.finishDraftBtn.hidden = !info.canFinish;
  }
}

function updateCursor(info) {
  pendingCursor = info;
  if (cursorFrame) return;
  cursorFrame = requestAnimationFrame(() => {
    cursorFrame = null;
    if (!els.cursorReadout) return;
    if (!pendingCursor) {
      els.cursorReadout.textContent = "X: — · Y: —";
      return;
    }
    const { world } = pendingCursor;
    els.cursorReadout.textContent = `X: ${formatNumber(world.x)} · Y: ${formatNumber(world.y)}`;
  });
}

function openLeftPanel() {
  if (!isMobile()) return;
  closeRightPanel();
  els.leftPanel.classList.add("open");
  els.panelBackdrop.hidden = false;
}

function closeLeftPanel() {
  els.leftPanel.classList.remove("open");
  if (!els.rightPanel.classList.contains("open")) els.panelBackdrop.hidden = true;
}

function openRightPanel() {
  if (!isMobile()) return;
  closeLeftPanel();
  els.rightPanel.classList.add("open");
  els.panelBackdrop.hidden = false;
}

function closeRightPanel() {
  els.rightPanel.classList.remove("open");
  if (!els.leftPanel.classList.contains("open")) els.panelBackdrop.hidden = true;
}

function closeMobilePanels() {
  closeLeftPanel();
  closeRightPanel();
  els.panelBackdrop.hidden = true;
}

// --- Проекты --------------------------------------------------------------

async function openProjectData(project, { closeDialog = true, announce = null } = {}) {
  editor?.cancelDraft();
  const normalized = normalizeProject(project);
  setProject(normalized, { savedAt: normalized.updatedAt });
  try {
    await storage.saveProject(normalized);
    await storage.setLastProjectId(normalized.id);
    lastSavedAt = nowIso();
    savePhase = "saved";
    updateStorageLabels();
    updateSaveIndicator();
  } catch (error) {
    console.error(error);
    savePhase = "error";
    updateSaveIndicator();
  }
  closeMobilePanels();
  if (closeDialog) {
    closeDialogElement(els.projectsDialog);
    closeDialogElement(els.helpDialog);
  }
  if (announce) showToast(announce);
  setTimeout(() => editor?.fitView(), 20);
}

async function refreshProjectList() {
  let projects = [];
  try {
    projects = await storage.listProjects();
  } catch (error) {
    console.error(error);
    showToast("Не удалось прочитать список проектов", "error");
  }
  if (!projects.length && state.project) projects = [state.project];
  renderProjectList(els.projectsList, { projects, currentId: state.project?.id });
  updateStorageLabels();
}

async function openProjectsDialog() {
  await saveNow();
  await refreshProjectList();
  closeMobilePanels();
  openDialogElement(els.projectsDialog);
}

async function openProjectById(projectId) {
  if (!projectId) return;
  if (projectId === state.project?.id) {
    closeDialogElement(els.projectsDialog);
    showToast("Этот проект уже открыт");
    return;
  }
  const project = await storage.loadProject(projectId);
  if (!project) {
    showToast("Проект не найден", "error");
    await refreshProjectList();
    return;
  }
  await saveNow();
  await openProjectData(project, { announce: `Открыт проект «${project.name}»` });
}

async function newProject(name) {
  await saveNow();
  const project = createProject(name || "Мой дом");
  await storage.saveProject(project);
  await storage.setLastProjectId(project.id);
  await openProjectData(project, { closeDialog: true, announce: "Новый проект создан" });
  els.newProjectName.value = "";
}

async function openDemoProject() {
  await saveNow();
  closeDialogElement(els.projectsDialog);
  const project = createDemoProject();
  await storage.saveProject(project);
  await storage.setLastProjectId(project.id);
  await openProjectData(project, { closeDialog: true, announce: "Открыт демонстрационный план" });
}

async function deleteProjectById(projectId) {
  const projects = await storage.listProjects();
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) return;
  const ok = await askConfirm({
    title: `Удалить проект «${project.name}»?`,
    text: "Проект будет удалён с этого устройства. Экспортированный JSON-файл останется у вас.",
    okLabel: "Удалить проект"
  });
  if (!ok) return;

  await storage.deleteProject(projectId);
  if (state.project?.id === projectId) {
    const remaining = await storage.listProjects();
    if (remaining.length) {
      await openProjectData(remaining[0], { closeDialog: false });
    } else {
      const fresh = createProject("Мой дом");
      await storage.saveProject(fresh);
      await storage.setLastProjectId(fresh.id);
      await openProjectData(fresh, { closeDialog: false });
    }
  }
  await refreshProjectList();
  showToast("Проект удалён");
}

async function importProjectFile(file) {
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const imported = normalizeProject(raw);
    const projects = await storage.listProjects();
    if (projects.some((project) => project.id === imported.id)) {
      imported.id = createId("project");
    }
    imported.name = String(imported.name || "Импортированный проект").slice(0, 80);
    await saveNow();
    await storage.saveProject(imported);
    await storage.setLastProjectId(imported.id);
    await openProjectData(imported, { closeDialog: true, announce: "Проект загружен из файла" });
  } catch (error) {
    console.error(error);
    showToast("Не удалось открыть файл проекта. Проверьте JSON.", "error", 4500);
  }
}

function exportProjectFile() {
  if (!state.project) return;
  const json = JSON.stringify(state.project, null, 2);
  downloadText(
    `${sanitizeFilename(state.project.name)}.json`,
    json,
    "application/json;charset=utf-8"
  );
  showToast("Файл проекта сохранён");
}

// --- Действия -------------------------------------------------------------

async function handleAction(action, target) {
  switch (action) {
    case "start-wall":
      setTool("wall");
      showToast("Кликните начало стены на плане");
      break;
    case "open-demo":
      await openDemoProject();
      break;
    case "open-report":
      openReport();
      break;
    case "export-json":
      exportProjectFile();
      break;
    case "export-csv":
      downloadCsv(state.project);
      showToast("Смета выгружена в CSV");
      break;
    case "add-floor": {
      await addFloor();
      setTimeout(() => editor?.fitView(), 30);
      closeMobilePanels();
      showToast("Добавлен новый этаж");
      break;
    }
    case "delete-floor": {
      if (!state.project || state.project.floors.length <= 1) return;
      const name = activeFloor()?.name || "этаж";
      const ok = await askConfirm({
        title: `Удалить «${name}»?`,
        text: "Стены, комнаты, устройства и трассы этого этажа будут удалены. Действие можно отменить через Ctrl+Z.",
        okLabel: "Удалить этаж"
      });
      if (!ok) return;
      removeActiveFloor();
      setTimeout(() => editor?.fitView(), 30);
      showToast("Этаж удалён");
      break;
    }
    case "delete-selection":
      editor?.deleteSelection();
      break;
    case "center-selection": {
      const item = selectedItem();
      if (item) editor?.ensureItemVisible(item);
      break;
    }
    case "duplicate-device": {
      const item = selectedItem();
      if (!item || state.selection?.type !== "device") return;
      const copy = {
        ...item,
        id: createId("dev"),
        name: `${item.name} — копия`,
        x: item.x + 0.3,
        y: item.y + 0.3
      };
      commit((project) => {
        const floor = project.floors.find((entry) => entry.id === project.activeFloorId);
        floor.devices.push(copy);
      }, { selectAfter: { type: "device", id: copy.id } });
      showToast("Устройство скопировано");
      break;
    }
    case "select-cable": {
      const cableId = target?.dataset.cableId;
      if (!cableId) return;
      const cable = activeFloor()?.cables.find((entry) => entry.id === cableId);
      if (!cable) return;
      select("cable", cableId);
      setTab("properties", { openOnMobile: true });
      requestAnimationFrame(() => editor?.ensureItemVisible(cable));
      break;
    }
    case "open-project":
      await openProjectById(target?.dataset.projectId);
      break;
    case "delete-project":
      await deleteProjectById(target?.dataset.projectId);
      break;
    default:
      break;
  }
}

// --- Диалоги --------------------------------------------------------------

function openDialogElement(dialog) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
}

function closeDialogElement(dialog) {
  if (!dialog || !dialog.open) return;
  dialog.close();
}

function askConfirm({ title, text, okLabel = "Удалить" }) {
  return new Promise((resolve) => {
    if (!els.confirmDialog) {
      resolve(window.confirm(`${title}\n\n${text}`));
      return;
    }
    els.confirmTitle.textContent = title;
    els.confirmText.textContent = text;
    els.confirmOkBtn.textContent = okLabel;
    const dialog = els.confirmDialog;
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "ok");
    };
    dialog.addEventListener("close", onClose);
    openDialogElement(dialog);
  });
}

function openHelp() {
  closeMobilePanels();
  openDialogElement(els.helpDialog);
}

function openReport() {
  if (!state.project) return;
  renderReport(els.reportPreview, state.project);
  els.reportOverlay.hidden = false;
  document.body.classList.add("report-open");
  els.reportCloseBtn.focus();
}

function closeReport() {
  els.reportOverlay.hidden = true;
  document.body.classList.remove("report-open");
  els.reportBtn.focus();
}

// --- Обработчики изменения свойств ---------------------------------------

function handleInspectorChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
    return;
  }

  if (target.dataset.projectField === "name") {
    const name = target.value.trim() || "Мой дом";
    commit((project) => {
      project.name = name;
    });
    return;
  }

  if (target.dataset.projectSetting) {
    const key = target.dataset.projectSetting;
    let value = target.type === "checkbox" ? target.checked : target.value;
    if (NUMERIC_SETTINGS.has(key)) {
      value = parseNumber(value, state.project.settings[key]);
    }
    commit((project) => {
      if (key === "reservePercent") value = clamp(value, 0, 100);
      if (key === "deviceSlack") value = clamp(value, 0, 5);
      if (key === "grid") value = Math.max(0.01, value);
      if (key === "defaultWallThickness") value = Math.max(0.02, value);
      if (key === "defaultWallHeight") value = Math.max(1, value);
      if (key === "defaultRouteHeight") value = Math.max(0, value);
      project.settings[key] = value;
    });
    return;
  }

  if (target.dataset.floorField === "name") {
    const floor = activeFloor();
    if (!floor) return;
    renameFloor(floor.id, target.value.trim() || `Этаж ${state.project.floors.indexOf(floor) + 1}`);
    return;
  }

  if (!target.dataset.itemField) return;
  const selection = state.selection;
  if (!selection) return;
  const field = target.dataset.itemField;
  const rawValue = target.type === "checkbox" ? target.checked : target.value;

  commit((project) => {
    const floor = project.floors.find((entry) => entry.id === project.activeFloorId);
    if (!floor) return false;
    const collections = {
      device: floor.devices,
      wall: floor.walls,
      room: floor.rooms,
      opening: floor.openings || [],
      cable: floor.cables
    };
    const item = collections[selection.type]?.find((entry) => entry.id === selection.id);
    if (!item) return false;

    if (selection.type === "device") {
      if (field === "type") {
        if (!DEVICE_TYPES[rawValue]) return false;
        const oldType = item.type;
        const oldDefault = getDeviceType(oldType).mountHeight;
        const wasDefaultName = item.name === getDeviceType(oldType).defaultName;
        item.type = rawValue;
        if (Math.abs(Number(item.mountHeight) - oldDefault) < 1e-6) {
          item.mountHeight = getDeviceType(rawValue).mountHeight;
        }
        if (wasDefaultName) item.name = getDeviceType(rawValue).defaultName;
      } else if (field === "name") {
        item.name = String(rawValue).trim() || getDeviceType(item.type).defaultName;
      } else if (field === "x" || field === "y" || field === "mountHeight") {
        const fallback = item[field];
        const number = parseNumber(rawValue, fallback);
        if (!Number.isFinite(number)) return false;
        item[field] = field === "mountHeight" ? clamp(number, 0, 10) : number;
      } else if (field === "circuit") {
        item.circuit = String(rawValue);
      } else if (field === "note") {
        item.note = String(rawValue);
      }
      return true;
    }

    if (selection.type === "wall") {
      if (field === "thickness" || field === "height") {
        const number = parseNumber(rawValue, item[field]);
        if (!Number.isFinite(number)) return false;
        item[field] = field === "thickness" ? clamp(number, 0.02, 1) : clamp(number, 1, 10);
      } else if (field === "ax" || field === "ay" || field === "bx" || field === "by") {
        const key = field[0];
        const axis = field[1];
        const number = parseNumber(rawValue, item[key][axis]);
        if (!Number.isFinite(number)) return false;
        item[key][axis] = number;
      }
      return true;
    }

    if (selection.type === "room") {
      if (field === "name") item.name = String(rawValue).trim() || "Комната";
      else if (field === "color") item.color = String(rawValue);
      return true;
    }

    if (selection.type === "opening") {
      if (field === "type") {
        if (!OPENING_TYPES[rawValue]) return false;
        const oldInfo = getOpeningType(item.type);
        const newInfo = getOpeningType(rawValue);
        const wasDefaultWidth = Math.abs(Number(item.width) - oldInfo.defaultWidth) < 1e-6;
        const wasDefaultHeight = Math.abs(Number(item.height) - oldInfo.defaultHeight) < 1e-6;
        item.type = rawValue;
        if (wasDefaultWidth) item.width = newInfo.defaultWidth;
        if (wasDefaultHeight) item.height = newInfo.defaultHeight;
        if (rawValue === "door") item.sill = 0;
        else item.sill = newInfo.defaultSill;
      } else if (field === "width" || field === "height" || field === "sill" || field === "offset") {
        const fallback = Number(item[field]) || 0;
        const number = parseNumber(rawValue, fallback);
        if (!Number.isFinite(number)) return false;
        if (field === "width") item.width = clamp(number, 0.2, 4);
        else if (field === "height") item.height = clamp(number, 0.3, 5);
        else if (field === "sill") item.sill = item.type === "door" ? 0 : clamp(number, 0, 3);
        else item.offset = Math.max(0, number);
      } else if (field === "hinge") {
        item.hinge = rawValue === "end" ? "end" : "start";
      } else if (field === "swing") {
        item.swing = Number(rawValue) === -1 ? -1 : 1;
      } else if (field === "note") {
        item.note = String(rawValue);
      }
      const wall = floor.walls.find((entry) => entry.id === item.wallId);
      if (wall) item.offset = openingSpan(item, wall).center;
      return true;
    }

    if (selection.type === "cable") {
      if (field === "name") {
        item.name = String(rawValue).trim() || "Трасса";
      } else if (field === "section" || field === "cores") {
        const number = parseNumber(rawValue, item[field]);
        if (!Number.isFinite(number)) return false;
        item[field] = number;
      } else if (field === "routeHeight") {
        const number = parseNumber(rawValue, item.routeHeight);
        if (!Number.isFinite(number)) return false;
        item.routeHeight = clamp(number, 0, 10);
      } else if (field === "circuit") {
        item.circuit = String(rawValue);
      } else if (field === "note") {
        item.note = String(rawValue);
      } else if (field === "reserveCustom") {
        item.reservePercent = rawValue ? Number(project.settings.reservePercent) : null;
      } else if (field === "reservePercent") {
        const number = parseNumber(rawValue, item.reservePercent ?? project.settings.reservePercent);
        if (!Number.isFinite(number)) return false;
        item.reservePercent = clamp(number, 0, 100);
      } else if (field === "startDeviceId" || field === "endDeviceId") {
        const deviceId = String(rawValue || "");
        const device = floor.devices.find((entry) => entry.id === deviceId) || null;
        const isStart = field === "startDeviceId";
        if (isStart) item.startDeviceId = device?.id || null;
        else item.endDeviceId = device?.id || null;
        if (device && Array.isArray(item.points) && item.points.length) {
          const index = isStart ? 0 : item.points.length - 1;
          item.points[index] = { x: device.x, y: device.y };
        }
      }
      return true;
    }
    return false;
  });
}

// --- Инициализация --------------------------------------------------------

function bindEvents() {
  els.toolPalette.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tool]");
    if (button) activateTool(button.dataset.tool);
  });

  els.devicePalette.addEventListener("click", (event) => {
    const button = event.target.closest("[data-device]");
    if (button) activateDevice(button.dataset.device);
  });

  document.querySelectorAll(".dock-btn[data-tool]").forEach((button) => {
    button.addEventListener("click", () => activateTool(button.dataset.tool));
  });

  els.floorList.addEventListener("click", (event) => {
    const floorButton = event.target.closest("[data-floor-id]");
    if (!floorButton) return;
    const floorId = floorButton.dataset.floorId;
    editor?.cancelDraft();
    switchFloor(floorId);
    closeMobilePanels();
    setTimeout(() => editor?.fitView(), 20);
  });

  els.propertiesPanel.addEventListener("change", handleInspectorChange);
  els.summaryPanel.addEventListener("change", handleInspectorChange);

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;
    event.preventDefault();
    handleAction(target.dataset.action, target).catch((error) => {
      console.error(error);
      showToast("Не удалось выполнить действие", "error");
    });
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      if (dialog) dialog.close();
    });
  });

  [els.projectsDialog, els.helpDialog].forEach((dialog) => {
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  els.projectOpenBtn.addEventListener("click", () => {
    openProjectsDialog().catch((error) => {
      console.error(error);
      showToast("Не удалось открыть список проектов", "error");
    });
  });

  els.leftPanelBtn.addEventListener("click", openLeftPanel);
  els.leftCloseBtn.addEventListener("click", closeLeftPanel);
  els.rightCloseBtn.addEventListener("click", closeRightPanel);
  els.panelBackdrop.addEventListener("click", closeMobilePanels);
  els.mobileDevicesBtn.addEventListener("click", openLeftPanel);
  els.mobileInspectorBtn.addEventListener("click", () => {
    setTab("properties");
    openRightPanel();
  });
  els.mobileSummaryBtn.addEventListener("click", () => {
    setTab("summary");
    openRightPanel();
  });
  els.floorChip.addEventListener("click", () => {
    if (isMobile()) openLeftPanel();
  });

  els.propertiesTab.addEventListener("click", () => setTab("properties"));
  els.summaryTab.addEventListener("click", () => setTab("summary"));

  els.undoBtn.addEventListener("click", () => {
    if (undo()) showToast("Действие отменено");
  });
  els.redoBtn.addEventListener("click", () => {
    if (redo()) showToast("Действие восстановлено");
  });

  els.zoomInBtn.addEventListener("click", () => editor?.zoomIn());
  els.zoomOutBtn.addEventListener("click", () => editor?.zoomOut());
  els.zoomResetBtn.addEventListener("click", () => {
    if (editor) editor.zoomAt(80 / state.view.scale);
  });
  els.fitBtn.addEventListener("click", () => editor?.fitView());
  els.gridBtn.addEventListener("click", () => {
    if (!state.project) return;
    commit((project) => {
      project.settings.showGrid = !project.settings.showGrid;
    });
  });

  els.finishDraftBtn.addEventListener("click", () => editor?.finishDraft());
  els.cancelDraftBtn.addEventListener("click", () => editor?.cancelDraft());

  els.settingsBtn.addEventListener("click", () => {
    select(null);
    setTab("properties", { openOnMobile: true });
    if (isMobile()) openRightPanel();
  });
  els.reportBtn.addEventListener("click", openReport);
  [els.helpBtn, els.helpBtnSide].forEach((button) => button.addEventListener("click", openHelp));

  els.newProjectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = els.newProjectName.value.trim();
    if (!name) return;
    try {
      await newProject(name);
    } catch (error) {
      console.error(error);
      showToast("Не удалось создать проект", "error");
    }
  });

  els.importProjectBtn.addEventListener("click", () => {
    els.projectImportInput.value = "";
    els.projectImportInput.click();
  });

  els.projectImportInput.addEventListener("change", async () => {
    const file = els.projectImportInput.files?.[0];
    if (!file) return;
    await importProjectFile(file);
  });

  els.openDemoBtn.addEventListener("click", () => {
    openDemoProject().catch((error) => {
      console.error(error);
      showToast("Не удалось открыть демо-план", "error");
    });
  });

  els.exportCurrentBtn.addEventListener("click", exportProjectFile);

  els.reportCloseBtn.addEventListener("click", closeReport);
  els.reportPrintBtn.addEventListener("click", () => window.print());
  els.reportCsvBtn.addEventListener("click", () => {
    downloadCsv(state.project);
    showToast("Смета выгружена в CSV");
  });

  els.confirmOkBtn.addEventListener("click", () => {
    els.confirmDialog.close("ok");
  });
  els.confirmCancelBtn.addEventListener("click", () => {
    els.confirmDialog.close("cancel");
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) closeMobilePanels();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.reportOverlay.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeReport();
      return;
    }
    if (isMobile() && (els.leftPanel.classList.contains("open") || els.rightPanel.classList.contains("open"))) {
      event.preventDefault();
      event.stopPropagation();
      closeMobilePanels();
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
  window.addEventListener("pagehide", flushSave);

  window.addEventListener("online", () => showToast("Соединение восстановлено", "success", 1800));
  window.addEventListener("offline", () => showToast("Нет сети — приложение продолжает работать офлайн", "warning", 3200));
}

function bindStoreEvents() {
  on("project", ({ reason }) => {
    if (reason === "load") {
      savePhase = "saved";
      lastSavedAt = state.savedAt || nowIso();
    } else {
      scheduleAutosave();
      if (reason === "floor") {
        setTimeout(() => editor?.fitView(), 20);
      }
    }
    scheduleUi(reason === "load" ? 0 : 40);
    syncToolUi();
    updateDocumentTitle();
  });

  on("selection", () => {
    scheduleUi(0);
    if (isMobile() && state.selection && state.tool === "select") {
      setTab("properties");
      openRightPanel();
    }
    if (els.rightScroll) els.rightScroll.scrollTop = 0;
  });

  on("tool", () => {
    syncToolUi();
    hintKey = "";
    scheduleUi(0);
    if (isMobile()) closeRightPanel();
  });

  on("history", updateHistoryButtons);
  on("view", updateZoomLabels);
}

async function loadInitialProject() {
  let project = null;
  let openedDemo = false;
  try {
    const lastId = await storage.getLastProjectId();
    if (lastId) project = await storage.loadProject(lastId);
    if (!project) {
      const projects = await storage.listProjects();
      if (projects.length) project = projects[0];
    }
    if (!project) {
      project = createDemoProject();
      openedDemo = true;
    }
    project = normalizeProject(project);
    setProject(project, { savedAt: project.updatedAt });
    lastSavedAt = nowIso();
    savePhase = "saved";
    await storage.saveProject(project);
    await storage.setLastProjectId(project.id);
    updateStorageLabels();
    updateSaveIndicator();
    refreshUi();
    updateZoomLabels();
    updateHistoryButtons();
    setTimeout(() => editor?.fitView(), 40);
    // Повторный фит после стабилизации раскладки. Если пользователь успел
    // подвигать план, масштаб не трогаем.
    setTimeout(() => editor?.fitViewIfUnadjusted(), 350);
    if (openedDemo) {
      setTimeout(() => showToast("Открыт демонстрационный план — загляните во вкладку «Смета»", "success", 4200), 700);
    }
  } catch (error) {
    console.error("Не удалось загрузить проект", error);
    project = createDemoProject();
    setProject(project, { savedAt: nowIso() });
    lastSavedAt = nowIso();
    savePhase = "saved";
    refreshUi();
    setTimeout(() => editor?.fitView(), 40);
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try {
    const registration = await navigator.serviceWorker.register("./sw.js", {
      updateViaCache: "none"
    });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showToast("Доступна новая версия приложения. Перезапустите его.", "warning", 4500);
        }
      });
    });
  } catch (error) {
    console.warn("Service worker не зарегистрирован", error);
  }
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (els.installAppBtn) els.installAppBtn.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (els.installAppBtn) els.installAppBtn.hidden = true;
    showToast("ЭлектроПлан установлен на устройство");
  });
  els.installAppBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === "accepted") showToast("Установка началась");
    deferredInstallPrompt = null;
    els.installAppBtn.hidden = true;
  });
}

async function init() {
  cacheElements();
  hydrateIcons();
  renderPalettes();
  hydrateIcons();

  editor = new PlanEditor(els.planCanvas, {
    onToast: (message, type) => showToast(message, type),
    onDraftState: updateDraftHint,
    onCursor: updateCursor
  });

  bindStoreEvents();
  bindEvents();
  setupInstallPrompt();
  updateZoomLabels();
  updateHistoryButtons();
  updateDraftHint(null);
  await loadInitialProject();
  registerServiceWorker();
}

init().catch((error) => {
  console.error("Ошибка инициализации", error);
  const region = document.getElementById("toastRegion");
  if (region) {
    const toast = document.createElement("div");
    toast.className = "toast toast-error";
    toast.textContent = "Не удалось запустить приложение. Обновите страницу.";
    region.appendChild(toast);
  }
});
