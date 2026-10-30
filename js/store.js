// Единое состояние приложения и история изменений.
// Проект изменяется только через commit(), поэтому отмена работает предсказуемо.

import {
  cloneProject,
  createProject,
  createFloor,
  createId,
  getFloor,
  getDeviceType,
  normalizeProject,
  nowIso
} from "./model.js";

const HISTORY_LIMIT = 60;

const listeners = new Map();

export const state = {
  project: null,
  tool: "select",
  deviceType: "socket",
  selection: null,
  view: { scale: 80, offsetX: 0, offsetY: 0 },
  past: [],
  future: [],
  dirty: false,
  savedAt: null,
  saveState: "saved",
  drawing: false,
  revision: 0,
  storageMode: ""
};

function emit(event, detail) {
  const handlers = listeners.get(event);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(detail, state);
    } catch (error) {
      console.error(`Ошибка обработчика ${event}`, error);
    }
  }
}

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function setProject(project, { savedAt = null, resetHistory = true } = {}) {
  state.project = project;
  if (resetHistory) {
    state.past = [];
    state.future = [];
  }
  state.selection = null;
  state.dirty = false;
  state.savedAt = savedAt;
  state.saveState = savedAt ? "saved" : "unsaved";
  state.revision += 1;
  emit("project", { reason: "load" });
  emit("selection");
  emit("history");
  emit("saved", { savedAt, saveState: state.saveState });
}

export function activeFloor() {
  if (!state.project) return null;
  return getFloor(state.project, state.project.activeFloorId);
}

export function findSelection(project = state.project, selection = state.selection) {
  if (!project || !selection) return null;
  const floor = getFloor(project, project.activeFloorId);
  if (!floor) return null;
  const collections = {
    wall: floor.walls,
    room: floor.rooms,
    device: floor.devices,
    cable: floor.cables
  };
  const collection = collections[selection.type];
  if (!collection) return null;
  return collection.find((item) => item.id === selection.id) || null;
}

export function selectedItem() {
  return findSelection();
}

export function select(type, id, options = {}) {
  if (!type || !id) {
    if (state.selection === null) return;
    state.selection = null;
    state.revision += 1;
    emit("selection");
    return;
  }
  state.selection = { type, id, ...options };
  emit("selection");
}

export function selectItem(item) {
  if (!item) {
    select(null);
    return;
  }
  let type = null;
  if (Array.isArray(item.points)) type = item.cores !== undefined ? "cable" : "room";
  else if (item.a && item.b) type = "wall";
  else if (item.type && item.x !== undefined) type = "device";
  if (type) select(type, item.id);
}

export function setTool(tool, options = {}) {
  if (tool === "device" && options.deviceType) state.deviceType = options.deviceType;
  if (state.tool === tool) {
    emit("tool");
    return;
  }
  state.tool = tool;
  emit("tool");
}

export function setDeviceType(deviceType) {
  state.deviceType = deviceType;
  state.tool = "device";
  emit("tool");
}

export function setDrawing(isDrawing) {
  if (state.drawing === isDrawing) return;
  state.drawing = isDrawing;
  emit("drawing");
}

export function checkpoint() {
  if (!state.project) return;
  state.past.push(cloneProject(state.project));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.future = [];
  emit("history");
}

export function commit(mutator, { history = true, selectAfter = undefined } = {}) {
  if (!state.project) return null;
  if (history) {
    state.past.push(cloneProject(state.project));
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
    state.future = [];
  }

  const result = mutator(state.project);
  if (result === false) {
    if (history) state.past.pop();
    return null;
  }

  state.project.updatedAt = nowIso();
  state.dirty = true;
  state.saveState = "dirty";
  state.revision += 1;
  if (selectAfter !== undefined) {
    state.selection = selectAfter;
    emit("selection");
  }
  emit("project", { reason: "commit" });
  if (history) emit("history");
  emit("saved", { saveState: state.saveState, savedAt: state.savedAt });
  return result;
}

// Изменение во время перетаскивания: история уже зафиксирована через checkpoint().
export function mutate(mutator) {
  return commit(mutator, { history: false });
}

export function undo() {
  if (!state.project || state.past.length === 0) return false;
  state.future.push(cloneProject(state.project));
  if (state.future.length > HISTORY_LIMIT) state.future.shift();
  state.project = state.past.pop();
  state.project.updatedAt = nowIso();
  state.dirty = true;
  state.saveState = "dirty";
  state.revision += 1;
  if (state.selection && !findSelection()) state.selection = null;
  emit("project", { reason: "undo" });
  emit("selection");
  emit("history");
  emit("saved", { saveState: state.saveState });
  return true;
}

export function redo() {
  if (!state.project || state.future.length === 0) return false;
  state.past.push(cloneProject(state.project));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.project = state.future.pop();
  state.project.updatedAt = nowIso();
  state.dirty = true;
  state.saveState = "dirty";
  state.revision += 1;
  if (state.selection && !findSelection()) state.selection = null;
  emit("project", { reason: "redo" });
  emit("selection");
  emit("history");
  emit("saved", { saveState: state.saveState });
  return true;
}

export function markSaved(savedAt = new Date().toISOString()) {
  state.dirty = false;
  state.savedAt = savedAt;
  state.saveState = "saved";
  emit("saved", { savedAt, saveState: state.saveState });
}

export function markSaving() {
  state.saveState = "saving";
  emit("saved", { saveState: state.saveState, savedAt: state.savedAt });
}

export function updateView(patch) {
  state.view = { ...state.view, ...patch };
  emit("view");
}

export function setStorageMode(label) {
  state.storageMode = label;
}

export function createNewProject(name = "Мой дом") {
  return createProject(name);
}

export function createNewFloor(name) {
  const floor = createFloor(name || `Этаж ${state.project.floors.length + 1}`);
  return floor;
}

export function createDevice(type, x, y, extra = {}) {
  const info = getDeviceType(type);
  return {
    id: createId("dev"),
    type,
    name: info.defaultName,
    x,
    y,
    rotation: 0,
    mountHeight: info.mountHeight,
    circuit: "",
    note: "",
    ...extra
  };
}

export function switchFloor(floorId) {
  if (!state.project) return;
  const floor = state.project.floors.find((item) => item.id === floorId);
  if (!floor) return;
  state.project.activeFloorId = floor.id;
  state.selection = null;
  state.revision += 1;
  emit("project", { reason: "floor" });
  emit("selection");
  emit("floor");
}

export function addFloor(name) {
  const floor = createNewFloor(name);
  commit((project) => {
    project.floors.push(floor);
    project.activeFloorId = floor.id;
  }, { selectAfter: null });
  emit("floor");
  return floor;
}

export function removeActiveFloor() {
  if (!state.project || state.project.floors.length <= 1) return false;
  const removedId = state.project.activeFloorId;
  commit((project) => {
    project.floors = project.floors.filter((floor) => floor.id !== removedId);
    project.activeFloorId = project.floors[0].id;
  }, { selectAfter: null });
  emit("floor");
  return true;
}

export function renameFloor(floorId, name) {
  commit((project) => {
    const floor = project.floors.find((item) => item.id === floorId);
    if (floor) floor.name = name;
  });
  emit("floor");
}

export function normalizeLoadedProject(input) {
  return normalizeProject(input);
}

export function canUndo() {
  return state.past.length > 0;
}

export function canRedo() {
  return state.future.length > 0;
}

export function refreshSelection() {
  if (state.selection && !findSelection()) {
    state.selection = null;
    emit("selection");
  }
}
