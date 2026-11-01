// Редактор плана: выбор, перетаскивание, рисование стен, комнат,
// размещение устройств и прокладка кабельных трасс.

import {
  state,
  activeFloor,
  select,
  setTool,
  setDrawing,
  checkpoint,
  commit,
  mutate,
  undo,
  redo,
  on,
  updateView
} from "./store.js";
import {
  dist,
  clamp,
  pointToPolyline,
  pointToSegment,
  pointInPolygon,
  snapPoint,
  constrainToAxis,
  boundsOfPoints,
  polygonArea,
  formatNumber
} from "./geometry.js";
import {
  createId,
  getDeviceType,
  getOpeningType,
  getSectionInfo,
  openingSpan,
  DEFAULT_SETTINGS
} from "./model.js";
import { renderPlan, screenToWorld, worldToScreen } from "./render.js";

const ROOM_COLORS = ["#dbeafe", "#dcfce7", "#fef3c7", "#fae8ff", "#e0f2fe", "#fee2e2"];
const MIN_ZOOM = 15;
const MAX_ZOOM = 500;

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function cleanPoints(points) {
  const result = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && dist(previous, point) < 1e-4) continue;
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

export class PlanEditor {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.pointers = new Map();
    this.active = null;
    this.pinch = null;
    this.draft = null;
    this.snap = null;
    this.openingPreview = null;
    this.spaceDown = false;
    this.lastPointerWorld = null;
    this.suppressClick = false;
    this.renderQueued = false;
    this.disposers = [];
    this.userViewAdjusted = false;
    this.resizeFitTimer = 0;
    this.lastCanvasWidth = canvas.clientWidth;
    this.lastCanvasHeight = canvas.clientHeight;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);

    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("dblclick", this.handleDoubleClick);
    canvas.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const changed =
          Math.abs(width - this.lastCanvasWidth) > 2 ||
          Math.abs(height - this.lastCanvasHeight) > 2;
        this.lastCanvasWidth = width;
        this.lastCanvasHeight = height;
        // Пока пользователь не двигал план, подстраиваем масштаб под окно:
        // так первый запуск и восстановление окна PWA не оставляют пустые поля.
        if (changed && !this.userViewAdjusted) {
          clearTimeout(this.resizeFitTimer);
          this.resizeFitTimer = setTimeout(() => {
            if (!this.userViewAdjusted) this.fitView();
          }, 120);
        }
        this.requestRender();
      });
      this.resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", () => this.requestRender());
    }

    this.disposers.push(on("project", () => this.requestRender()));
    this.disposers.push(on("selection", () => this.requestRender()));
    this.disposers.push(on("view", () => this.requestRender()));
    this.disposers.push(on("tool", () => {
      if (this.draft) this.cancelDraft();
      this.snap = null;
      this.openingPreview = null;
      this.updateCursor();
      this.notifyDraft();
      this.requestRender();
    }));

    this.updateCursor();
  }

  destroy() {
    clearTimeout(this.resizeFitTimer);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("dblclick", this.handleDoubleClick);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.resizeObserver?.disconnect();
    this.disposers.forEach((dispose) => dispose());
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  render() {
    const project = state.project;
    const floor = activeFloor();
    if (!project || !floor) return;
    renderPlan(this.canvas, {
      project,
      floor,
      view: state.view,
      selection: state.selection,
      draft: this.draft,
      snap: this.snap?.kind && this.snap.kind !== "grid" ? this.snap : null,
      deviceType: state.deviceType,
      openingPreview: this.openingPreview,
      onImageLoad: () => this.requestRender()
    });
  }

  getRect() {
    return this.canvas.getBoundingClientRect();
  }

  getView() {
    return state.view;
  }

  eventScreenPoint(event) {
    const rect = this.getRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  eventWorldPoint(event) {
    return screenToWorld(this.eventScreenPoint(event), state.view);
  }

  zoomAt(factor, screenPoint = null) {
    this.userViewAdjusted = true;
    const rect = this.getRect();
    const focal = screenPoint || { x: rect.width / 2, y: rect.height / 2 };
    const world = screenToWorld(focal, state.view);
    const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.view.scale * factor));
    const nextView = {
      scale: nextScale,
      offsetX: focal.x - world.x * nextScale,
      offsetY: focal.y - world.y * nextScale
    };
    updateView(nextView);
    this.requestRender();
  }

  zoomIn() {
    this.zoomAt(1.25);
  }

  zoomOut() {
    this.zoomAt(0.8);
  }

  fitViewIfUnadjusted(padding = 64) {
    if (!this.userViewAdjusted) this.fitView(padding);
  }

  fitView(padding = 64) {
    const floor = activeFloor();
    if (!floor) return;
    const rect = this.getRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const points = [];
    for (const wall of floor.walls) points.push(wall.a, wall.b);
    for (const room of floor.rooms) points.push(...room.points);
    for (const device of floor.devices) points.push(device);
    for (const cable of floor.cables) points.push(...cable.points);
    if (floor.underlay?.image && floor.underlay.width) {
      points.push(
        { x: floor.underlay.x || 0, y: floor.underlay.y || 0 },
        { x: (floor.underlay.x || 0) + floor.underlay.width, y: (floor.underlay.y || 0) + floor.underlay.height }
      );
    }

    const bounds = boundsOfPoints(points);
    if (!bounds) {
      const nextView = { scale: 80, offsetX: width * 0.14, offsetY: height * 0.18 };
      state.view = nextView;
      updateView(nextView);
      return;
    }

    const contentWidth = Math.max(0.5, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(0.5, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(40, width - padding * 2);
    const availableHeight = Math.max(40, height - padding * 2);
    const scale = Math.max(
      MIN_ZOOM,
      Math.min(180, availableWidth / contentWidth, availableHeight / contentHeight)
    );
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const nextView = {
      scale,
      offsetX: width / 2 - centerX * scale,
      offsetY: height / 2 - centerY * scale
    };
    state.view = nextView;
    updateView(nextView);
  }

  ensureItemVisible(item) {
    const floor = activeFloor();
    if (!item || !floor) return;
    let points = [];
    if (item.points) points = item.points;
    else if (item.wallId) {
      const wall = floor.walls.find((entry) => entry.id === item.wallId);
      if (wall) points = [wall.a, wall.b];
    } else if (item.a && item.b) points = [item.a, item.b];
    else if (item.x !== undefined) points = [item];
    const bounds = boundsOfPoints(points);
    if (!bounds) return;
    const rect = this.getRect();
    const screenA = worldToScreen({ x: bounds.minX, y: bounds.minY }, state.view);
    const screenB = worldToScreen({ x: bounds.maxX, y: bounds.maxY }, state.view);
    const margin = 55;
    const visible =
      screenB.x >= margin && screenA.x <= rect.width - margin &&
      screenB.y >= margin && screenA.y <= rect.height - margin;
    if (visible) return;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const nextView = {
      ...state.view,
      offsetX: rect.width / 2 - centerX * state.view.scale,
      offsetY: rect.height / 2 - centerY * state.view.scale
    };
    state.view = nextView;
    updateView(nextView);
    this.requestRender();
  }

  // --- События указателя -------------------------------------------------

  handlePointerDown(event) {
    if (event.pointerType === "mouse" && event.button === 2) return;
    if (event.button !== undefined && event.button !== 0 && event.button !== 1) return;
    const screen = this.eventScreenPoint(event);
    const world = screenToWorld(screen, state.view);

    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Некоторые браузеры не поддерживают захват для синтетических событий.
    }

    this.pointers.set(event.pointerId, { screen, world });

    if (this.pointers.size === 2) {
      this.startPinch();
      this.active = null;
      this.suppressClick = true;
      return;
    }
    if (this.pointers.size > 2) return;

    const isPanButton = event.button === 1 || this.spaceDown;
    if (isPanButton) {
      this.active = {
        kind: "pan",
        pointerId: event.pointerId,
        startScreen: screen,
        startOffsetX: state.view.offsetX,
        startOffsetY: state.view.offsetY,
        moved: false,
        clearOnClick: false
      };
      this.updateCursor();
      return;
    }

    if (state.tool === "select") {
      const hit = this.hitTest(world);
      if (hit) {
        if (hit.kind === "handle") {
          this.active = this.makeDrag(hit, screen, world, event.pointerId);
        } else if (hit.type === "device") {
          select("device", hit.item.id);
          this.active = this.makeDrag(hit, screen, world, event.pointerId);
        } else if (hit.type === "opening") {
          select("opening", hit.item.id);
          this.active = this.makeOpeningDrag(hit, screen, world, event.pointerId);
        } else {
          select(hit.type, hit.item.id);
          this.active = {
            kind: "selectOnly",
            pointerId: event.pointerId,
            startScreen: screen,
            startOffsetX: state.view.offsetX,
            startOffsetY: state.view.offsetY,
            moved: false
          };
        }
        this.notifyDraft();
      } else {
        this.active = {
          kind: "pan",
          pointerId: event.pointerId,
          startScreen: screen,
          startOffsetX: state.view.offsetX,
          startOffsetY: state.view.offsetY,
          moved: false,
          clearOnClick: true
        };
      }
      this.updateCursor();
      this.requestRender();
      return;
    }

    this.active = {
      kind: "click",
      pointerId: event.pointerId,
      startScreen: screen,
      startOffsetX: state.view.offsetX,
      startOffsetY: state.view.offsetY,
      startWorld: world,
      moved: false
    };
    this.updateCursor();
  }

  handlePointerMove(event) {
    const screen = this.eventScreenPoint(event);
    const world = screenToWorld(screen, state.view);
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { screen, world });
    }

    if (this.pinch && this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }

    if (this.active && this.active.pointerId === event.pointerId) {
      const active = this.active;
      const dx = screen.x - active.startScreen.x;
      const dy = screen.y - active.startScreen.y;
      const distance = Math.hypot(dx, dy);

      if ((active.kind === "click" || active.kind === "selectOnly") && distance > 5 && !this.spaceDown) {
        active.kind = "pan";
        active.startOffsetX = state.view.offsetX;
        active.startOffsetY = state.view.offsetY;
        active.startScreen = screen;
        active.moved = true;
        this.snap = null;
        this.updateCursor();
        this.requestRender();
        return;
      }

      if (active.kind === "pan") {
        if (distance > 2) {
          active.moved = true;
          this.userViewAdjusted = true;
        }
        const nextView = {
          ...state.view,
          offsetX: active.startOffsetX + dx,
          offsetY: active.startOffsetY + dy
        };
        state.view = nextView;
        updateView(nextView);
        this.requestRender();
        return;
      }

      if (active.kind === "selectOnly") return;

      if (active.kind === "dragPoint") {
        if (!active.started && distance > 3) {
          active.started = true;
          checkpoint();
        }
        if (active.started) {
          this.applyDrag(active, world, event);
          this.requestRender();
        }
        return;
      }

      if (active.kind === "click") {
        if (distance > 5) {
          active.moved = true;
          this.snap = null;
          this.requestRender();
        }
        return;
      }
    }

    if (event.pointerType === "touch") return;
    this.updateHover(world, screen);
  }

  handlePointerUp(event) {
    const screen = this.eventScreenPoint(event);
    const world = screenToWorld(screen, state.view);
    this.pointers.delete(event.pointerId);

    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
        this.suppressClick = true;
      }
      if (this.pointers.size === 0) {
        this.suppressClick = false;
      }
      this.updateCursor();
      this.requestRender();
      return;
    }

    const active = this.active;
    if (!active || active.pointerId !== event.pointerId) {
      if (this.pointers.size === 0) this.suppressClick = false;
      return;
    }
    this.active = null;

    if (active.kind === "pan") {
      if (!active.moved && active.clearOnClick) {
        select(null);
      }
      this.updateHover(world, screen);
    } else if (active.kind === "click" && !active.moved) {
      if (!this.suppressClick) this.handleToolClick(active.startWorld, event);
    } else if (active.kind === "dragPoint" && active.started) {
      this.finishDrag(active);
      this.updateHover(world, screen);
    }

    if (this.pointers.size === 0) this.suppressClick = false;
    this.updateCursor();
    this.requestRender();
  }

  handlePointerCancel(event) {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.active?.pointerId === event.pointerId) {
      this.active = null;
    }
    if (this.pointers.size === 0) this.suppressClick = false;
    this.updateCursor();
    this.requestRender();
  }

  handlePointerLeave = () => {
    if (!this.active && !this.pinch) {
      this.snap = null;
      this.openingPreview = null;
      this.lastPointerWorld = null;
      this.canvas.style.cursor = state.tool === "select" ? "default" : "crosshair";
      this.callbacks.onCursor?.(null);
      this.requestRender();
    }
  };

  handleWheel(event) {
    event.preventDefault();
    const screen = this.eventScreenPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.zoomAt(factor, screen);
  }

  handleDoubleClick(event) {
    if (isEditableTarget(event.target)) return;
    if (this.draft?.kind === "room" || this.draft?.kind === "cable") {
      event.preventDefault();
      this.finishDraft();
      return;
    }
    if (state.tool === "select" && state.selection?.type === "cable") {
      const world = this.eventWorldPoint(event);
      const cable = activeFloor()?.cables.find((item) => item.id === state.selection.id);
      if (!cable) return;
      const result = pointToPolyline(world, cable.points);
      if (result.distance * state.view.scale > 12) return;
      const existing = cable.points.find((point) => dist(point, result.point) * state.view.scale < 8);
      if (existing) return;
      event.preventDefault();
      commit((project) => {
        const floor = project.floors.find((item) => item.id === project.activeFloorId);
        const target = floor.cables.find((item) => item.id === state.selection.id);
        target.points.splice(result.index + 1, 0, { ...result.point });
      });
      this.callbacks.onToast?.("Точка трассы добавлена");
    }
  }

  handleContextMenu(event) {
    event.preventDefault();
    if (this.draft) {
      this.cancelDraft();
      return;
    }
    if (state.selection) select(null);
  }

  handleKeyDown(event) {
    if (event.defaultPrevented) return;
    if (document.querySelector("dialog[open]")) return;
    if (isEditableTarget(event.target)) return;

    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        if (redo()) this.callbacks.onToast?.("Действие восстановлено");
      } else if (undo()) {
        this.callbacks.onToast?.("Действие отменено");
      }
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      if (redo()) this.callbacks.onToast?.("Действие восстановлено");
      return;
    }

    if (event.key === "Escape") {
      if (this.draft) {
        this.cancelDraft();
      } else if (state.selection) {
        select(null);
      }
      return;
    }

    if (event.key === "Enter") {
      if (this.draft) {
        event.preventDefault();
        this.finishDraft();
      }
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && state.selection) {
      event.preventDefault();
      this.deleteSelection();
      return;
    }

    if (event.key === " " && !this.spaceDown) {
      this.spaceDown = true;
      event.preventDefault();
      this.updateCursor();
      return;
    }

    if (state.selection && event.key.startsWith("Arrow") && !mod) {
      const step = event.shiftKey ? 0.5 : event.altKey ? 0.01 : 0.1;
      const delta = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step }
      }[event.key];
      if (delta) {
        event.preventDefault();
        const selection = state.selection;
        commit((project) => {
          const floor = project.floors.find((item) => item.id === project.activeFloorId);
          const collection = {
            device: floor.devices,
            wall: floor.walls,
            room: floor.rooms,
            opening: floor.openings || [],
            cable: floor.cables
          }[selection.type];
          const item = collection?.find((entry) => entry.id === selection.id);
          if (!item) return false;
          if (selection.type === "device") {
            item.x += delta.x;
            item.y += delta.y;
          } else if (selection.type === "wall") {
            item.a.x += delta.x;
            item.a.y += delta.y;
            item.b.x += delta.x;
            item.b.y += delta.y;
          } else if (selection.type === "opening") {
            const wall = floor.walls.find((entry) => entry.id === item.wallId);
            if (!wall) return false;
            const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
            if (length < 0.001) return false;
            const ux = (wall.b.x - wall.a.x) / length;
            const uy = (wall.b.y - wall.a.y) / length;
            const shift = delta.x * ux + delta.y * uy;
            item.offset = openingSpan(
              { ...item, offset: (Number(item.offset) || 0) + shift },
              wall
            ).center;
          } else if (item.points) {
            item.points = item.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }));
          }
          return true;
        });
      }
    }
  }

  handleKeyUp(event) {
    if (event.key === " ") {
      this.spaceDown = false;
      this.updateCursor();
    }
  }

  handleBlur = () => {
    this.spaceDown = false;
    this.pointers.clear();
    this.pinch = null;
    this.active = null;
    this.updateCursor();
  };

  // --- Масштаб и жесты ---------------------------------------------------

  startPinch() {
    this.userViewAdjusted = true;
    const entries = [...this.pointers.values()];
    if (entries.length < 2) return;
    const [first, second] = entries;
    const center = {
      x: (first.screen.x + second.screen.x) / 2,
      y: (first.screen.y + second.screen.y) / 2
    };
    const distance = Math.hypot(second.screen.x - first.screen.x, second.screen.y - first.screen.y);
    this.pinch = {
      startDistance: Math.max(1, distance),
      startScale: state.view.scale,
      worldCenter: screenToWorld(center, state.view)
    };
    if (this.draft) this.cancelDraft();
  }

  updatePinch() {
    if (!this.pinch) return;
    const entries = [...this.pointers.values()];
    if (entries.length < 2) return;
    const [first, second] = entries;
    const center = {
      x: (first.screen.x + second.screen.x) / 2,
      y: (first.screen.y + second.screen.y) / 2
    };
    const distance = Math.hypot(second.screen.x - first.screen.x, second.screen.y - first.screen.y);
    const scale = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, this.pinch.startScale * (distance / this.pinch.startDistance))
    );
    const nextView = {
      scale,
      offsetX: center.x - this.pinch.worldCenter.x * scale,
      offsetY: center.y - this.pinch.worldCenter.y * scale
    };
    state.view = nextView;
    updateView(nextView);
    this.requestRender();
  }

  // --- Наведение и привязки ---------------------------------------------

  updateHover(world, screen) {
    this.lastPointerWorld = world;
    const tool = state.tool;
    const isDeviceTool = tool === "device";
    const isOpeningTool = tool === "door" || tool === "window";
    const isDrawTool = tool === "wall" || tool === "room" || tool === "cable";

    let snap = null;
    if (isOpeningTool) {
      const wallHit = this.findWallAt(world);
      this.draft = null;
      this.snap = null;
      this.openingPreview = wallHit ? this.buildOpeningPreview(wallHit, tool) : null;
      this.canvas.style.cursor = wallHit ? "copy" : "not-allowed";
    } else if (isDeviceTool) {
      this.openingPreview = null;
      snap = this.computeSnap(world, { includeVertices: false, includeWalls: false });
      this.draft = { kind: "device", current: snap.point };
      this.snap = snap;
    } else if (isDrawTool) {
      this.openingPreview = null;
      const options = {
        includeDevices: tool === "cable",
        includeWalls: tool === "room" || tool === "cable",
        includeVertices: true
      };
      snap = this.computeSnap(world, options);
      let point = snap.point;
      if (this.draft && (this.draft.kind === "wall" || this.draft.kind === "room" || this.draft.kind === "cable")) {
        const origin = this.draft.kind === "wall"
          ? this.draft.start
          : this.draft.points[this.draft.points.length - 1];
        if (origin && eventShiftHeld()) {
          point = this.snapOrthogonal(origin, point);
        }
        this.draft.current = point;
      } else if (this.draft) {
        this.draft.current = snap.point;
      }
      this.snap = snap;
    } else {
      this.openingPreview = null;
      const hit = this.hitTest(world);
      this.snap = hit?.kind === "handle" ? null : null;
      this.draft = null;
      this.canvas.style.cursor = hit ? "pointer" : "default";
    }

    if (isDeviceTool || isDrawTool) this.notifyDraft();
    this.callbacks.onCursor?.({ world, screen });
    this.requestRender();
  }

  computeSnap(world, options = {}) {
    const {
      includeDevices = false,
      includeVertices = true,
      includeWalls = false,
      exclude = null,
      radiusPx = 14
    } = options;
    const floor = activeFloor();
    if (!floor) return { point: { ...world }, kind: "grid" };
    let best = null;
    const consider = (point, kind, label, deviceId = null, penalty = 0) => {
      const distance = dist(world, point);
      if (distance * state.view.scale > radiusPx) return;
      const score = distance * state.view.scale + penalty;
      if (!best || score < best.score) {
        best = {
          point: { x: point.x, y: point.y },
          kind,
          label,
          deviceId,
          score,
          screen: worldToScreen(point, state.view)
        };
      }
    };

    if (includeDevices) {
      for (const device of floor.devices) {
        consider(device, "device", device.name || getDeviceType(device.type).short, device.id, -3);
      }
    }

    if (includeVertices) {
      for (const wall of floor.walls) {
        if (!(exclude?.type === "wall" && exclude.id === wall.id && exclude.index === 0)) {
          consider(wall.a, "vertex", "Угол стены", null, 0);
        }
        if (!(exclude?.type === "wall" && exclude.id === wall.id && exclude.index === 1)) {
          consider(wall.b, "vertex", "Угол стены", null, 0);
        }
      }
      for (const room of floor.rooms) {
        room.points.forEach((point, index) => {
          if (exclude?.type === "room" && exclude.id === room.id && exclude.index === index) return;
          consider(point, "vertex", "Точка комнаты", null, 0);
        });
      }
      for (const cable of floor.cables) {
        cable.points.forEach((point, index) => {
          if (exclude?.type === "cable" && exclude.id === cable.id && exclude.index === index) return;
          consider(point, "vertex", "Точка трассы", null, 2);
        });
      }
    }

    if (includeWalls) {
      for (const wall of floor.walls) {
        const result = pointToSegment(world, wall.a, wall.b);
        if (result.distance * state.view.scale <= radiusPx) {
          consider(result.point, "wall", "Привязка к стене", null, 5);
        }
      }
    }

    if (best) return best;
    const point = state.project.settings.snap
      ? snapPoint(world, state.project.settings.grid || DEFAULT_SETTINGS.grid)
      : { ...world };
    return { point, kind: "grid", screen: worldToScreen(point, state.view) };
  }

  snapOrthogonal(origin, point) {
    const constrained = constrainToAxis(origin, point, true);
    if (state.project.settings.snap) {
      return snapPoint(constrained, state.project.settings.grid || DEFAULT_SETTINGS.grid);
    }
    return constrained;
  }

  findNearbyDevice(point, radiusPx = 24) {
    const floor = activeFloor();
    if (!floor) return null;
    let nearest = null;
    for (const device of floor.devices) {
      const distancePx = dist(point, device) * state.view.scale;
      if (distancePx <= radiusPx && (!nearest || distancePx < nearest.distancePx)) {
        nearest = { device, distancePx };
      }
    }
    return nearest?.device || null;
  }

  findWallAt(point, radiusPx = 22) {
    const floor = activeFloor();
    if (!floor) return null;
    let nearest = null;
    for (const wall of floor.walls) {
      const result = pointToSegment(point, wall.a, wall.b);
      const threshold = Math.max(Number(wall.thickness || 0.1) / 2, 4 / state.view.scale) +
        radiusPx / state.view.scale;
      if (result.distance <= threshold && (!nearest || result.distance < nearest.distance)) {
        const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
        nearest = {
          wall,
          result,
          length,
          offset: result.t * length,
          distance: result.distance
        };
      }
    }
    return nearest;
  }

  buildOpeningPreview(wallHit, type) {
    const info = getOpeningType(type);
    const span = openingSpan(
      { type, offset: wallHit.offset, width: info.defaultWidth },
      wallHit.wall
    );
    return {
      wall: wallHit.wall,
      wallId: wallHit.wall.id,
      type,
      offset: span.center,
      width: span.width,
      height: info.defaultHeight,
      sill: info.defaultSill,
      hinge: "start",
      swing: 1
    };
  }

  // --- Инструменты -------------------------------------------------------

  handleToolClick(world, event) {
    if (state.tool === "wall") this.addWallPoint(world, event);
    else if (state.tool === "room") this.addRoomPoint(world, event);
    else if (state.tool === "cable") this.addCablePoint(world, event);
    else if (state.tool === "door" || state.tool === "window") this.addOpening(world);
    else if (state.tool === "device") this.addDevice(world, event);
  }

  currentClickPoint(world, event, options = {}) {
    const snap = this.computeSnap(world, options);
    let point = snap.point;
    if (event.shiftKey) {
      let origin = null;
      if (this.draft?.kind === "wall") origin = this.draft.start;
      else if (this.draft?.kind === "room" || this.draft?.kind === "cable") {
        origin = this.draft.points[this.draft.points.length - 1];
      }
      if (origin) point = this.snapOrthogonal(origin, point);
    }
    return { point, snap };
  }

  addWallPoint(world, event) {
    const { point } = this.currentClickPoint(world, event, {
      includeDevices: false, includeVertices: true, includeWalls: false
    });
    if (!this.draft) {
      this.draft = { kind: "wall", start: point, current: point };
      setDrawing(true);
      this.notifyDraft();
      this.requestRender();
      return;
    }
    if (dist(this.draft.start, point) < 0.03) return;
    const start = this.draft.start;
    const settings = state.project.settings;
    const wall = {
      id: createId("wall"),
      a: { ...start },
      b: { ...point },
      thickness: settings.defaultWallThickness,
      height: settings.defaultWallHeight
    };
    commit((project) => {
      const floor = project.floors.find((item) => item.id === project.activeFloorId);
      floor.walls.push(wall);
    }, { selectAfter: { type: "wall", id: wall.id } });
    this.draft = null;
    setDrawing(false);
    this.notifyDraft();
    this.snap = null;
    this.requestRender();
  }

  addRoomPoint(world, event) {
    const { point } = this.currentClickPoint(world, event, {
      includeDevices: false, includeVertices: true, includeWalls: true
    });
    if (!this.draft) {
      this.draft = { kind: "room", points: [point], current: point };
      setDrawing(true);
    } else {
      const lastPoint = this.draft.points[this.draft.points.length - 1];
      if (lastPoint && dist(lastPoint, point) < 0.04) return;
      this.draft.points.push(point);
      this.draft.current = point;
    }
    this.notifyDraft();
    this.requestRender();
  }

  addCablePoint(world, event) {
    const { point } = this.currentClickPoint(world, event, {
      includeDevices: true, includeVertices: true, includeWalls: true
    });
    if (!this.draft) {
      let startPoint = { ...point };
      let startDeviceId = null;
      const device = this.findNearbyDevice(point, 24);
      if (device) {
        startPoint = { x: device.x, y: device.y };
        startDeviceId = device.id;
      }
      this.draft = {
        kind: "cable",
        points: [startPoint],
        current: startPoint,
        startDeviceId
      };
      setDrawing(true);
    } else {
      const lastPoint = this.draft.points[this.draft.points.length - 1];
      if (lastPoint && dist(lastPoint, point) < 0.04) return;
      const device = this.findNearbyDevice(point, 20);
      this.draft.points.push(device ? { x: device.x, y: device.y } : point);
      this.draft.current = device ? { x: device.x, y: device.y } : point;
    }
    this.notifyDraft();
    this.requestRender();
  }

  addOpening(world) {
    const floor = activeFloor();
    if (!floor) return false;
    const wallHit = this.findWallAt(world);
    if (!wallHit) {
      this.callbacks.onToast?.("Нажмите на стену, чтобы поставить проём", "warning");
      return false;
    }
    const type = state.tool === "window" ? "window" : "door";
    const info = getOpeningType(type);
    const span = openingSpan(
      { type, offset: wallHit.offset, width: info.defaultWidth },
      wallHit.wall
    );
    const overlaps = (floor.openings || []).some((opening) => {
      if (opening.wallId !== wallHit.wall.id) return false;
      const other = openingSpan(opening, wallHit.wall);
      return span.start < other.end + 0.05 && span.end > other.start - 0.05;
    });
    if (overlaps) {
      this.callbacks.onToast?.("Здесь уже есть проём — выберите другое место", "warning");
      return false;
    }
    const opening = {
      id: createId("opening"),
      wallId: wallHit.wall.id,
      type,
      offset: span.center,
      width: span.width,
      height: info.defaultHeight,
      sill: info.defaultSill,
      hinge: "start",
      swing: 1,
      note: ""
    };
    commit((project) => {
      const targetFloor = project.floors.find((item) => item.id === project.activeFloorId);
      targetFloor.openings ||= [];
      targetFloor.openings.push(opening);
    }, { selectAfter: { type: "opening", id: opening.id } });
    this.openingPreview = null;
    this.callbacks.onToast?.(`${info.label} добавлена`);
    this.requestRender();
    return true;
  }

  addDevice(world, event) {
    const { point } = this.currentClickPoint(world, event, {
      includeDevices: false, includeVertices: false, includeWalls: false
    });
    const type = state.deviceType;
    const floor = activeFloor();
    if (!floor) return;
    const info = getDeviceType(type);
    const sameTypeCount = floor.devices.filter((device) => device.type === type).length;
    const device = {
      id: createId("dev"),
      type,
      name: sameTypeCount > 0 ? `${info.defaultName} ${sameTypeCount + 1}` : info.defaultName,
      x: point.x,
      y: point.y,
      rotation: 0,
      mountHeight: info.mountHeight,
      circuit: "",
      note: ""
    };
    commit((project) => {
      const targetFloor = project.floors.find((item) => item.id === project.activeFloorId);
      targetFloor.devices.push(device);
    }, { selectAfter: { type: "device", id: device.id } });
    this.draft = { kind: "device", current: point };
    this.notifyDraft();
    this.callbacks.onToast?.(`${info.label}: добавлено`);
    this.requestRender();
  }

  finishDraft() {
    if (!this.draft) return false;
    if (this.draft.kind === "room") return this.finishRoom();
    if (this.draft.kind === "cable") return this.finishCable();
    if (this.draft.kind === "wall") {
      this.callbacks.onToast?.("Укажите конечную точку стены", "info");
      return false;
    }
    this.draft = null;
    this.notifyDraft();
    return false;
  }

  finishRoom() {
    let points = cleanPoints(this.draft.points);
    if (points.length > 2 && dist(points[0], points[points.length - 1]) < 0.1) {
      points = points.slice(0, -1);
    }
    if (points.length < 3) {
      this.callbacks.onToast?.("Для комнаты нужно минимум три точки", "warning");
      return false;
    }
    const floor = activeFloor();
    const number = floor.rooms.length + 1;
    const room = {
      id: createId("room"),
      name: `Комната ${number}`,
      points,
      color: ROOM_COLORS[(number - 1) % ROOM_COLORS.length]
    };
    commit((project) => {
      const targetFloor = project.floors.find((item) => item.id === project.activeFloorId);
      targetFloor.rooms.push(room);
    }, { selectAfter: { type: "room", id: room.id } });
    const area = polygonArea(points);
    this.draft = null;
    setDrawing(false);
    this.notifyDraft();
    this.snap = null;
    this.callbacks.onToast?.(`Комната создана: ${formatNumber(area)} м²`);
    this.requestRender();
    return true;
  }

  finishCable() {
    const points = cleanPoints(this.draft.points);
    if (points.length < 2) {
      this.callbacks.onToast?.("Для трассы нужно минимум две точки", "warning");
      return false;
    }
    const floor = activeFloor();
    const project = state.project;
    const lastPoint = points[points.length - 1];
    const endDevice = this.findNearbyDevice(lastPoint, 26);
    if (endDevice) {
      points[points.length - 1] = { x: endDevice.x, y: endDevice.y };
    }
    let startDevice = this.draft.startDeviceId
      ? floor.devices.find((device) => device.id === this.draft.startDeviceId)
      : null;
    if (!startDevice) {
      startDevice = this.findNearbyDevice(points[0], 26);
      if (startDevice) points[0] = { x: startDevice.x, y: startDevice.y };
    }
    const number = floor.cables.length + 1;
    let name;
    if (startDevice && endDevice) name = `${startDevice.name} → ${endDevice.name}`;
    else if (startDevice) name = `${startDevice.name} → трасса ${number}`;
    else if (endDevice) name = `Трасса ${number} → ${endDevice.name}`;
    else name = `Трасса ${number}`;
    const settings = project.settings;
    const cable = {
      id: createId("cab"),
      name,
      section: Number(settings.defaultSection),
      cores: Number(settings.defaultCores),
      points,
      routeHeight: Number(settings.defaultRouteHeight),
      circuit: endDevice?.circuit || startDevice?.circuit || "",
      note: "",
      reservePercent: null,
      startDeviceId: startDevice?.id || null,
      endDeviceId: endDevice?.id || null
    };
    commit((targetProject) => {
      const targetFloor = targetProject.floors.find((item) => item.id === targetProject.activeFloorId);
      targetFloor.cables.push(cable);
    }, { selectAfter: { type: "cable", id: cable.id } });
    this.draft = null;
    setDrawing(false);
    this.notifyDraft();
    this.snap = null;
    this.callbacks.onToast?.(`Трасса «${name}» добавлена`);
    this.requestRender();
    return true;
  }

  cancelDraft() {
    if (!this.draft || this.draft.kind === "device") {
      this.draft = null;
      this.snap = null;
      this.notifyDraft();
      return;
    }
    this.draft = null;
    this.snap = null;
    setDrawing(false);
    this.notifyDraft();
    this.requestRender();
  }

  deleteSelection() {
    const selection = state.selection;
    if (!selection) return false;
    const floor = activeFloor();
    if (!floor) return false;
    let label = "Объект";
    commit((project) => {
      const targetFloor = project.floors.find((item) => item.id === project.activeFloorId);
      if (selection.type === "device") {
        const device = targetFloor.devices.find((item) => item.id === selection.id);
        if (device) label = device.name || getDeviceType(device.type).label;
        targetFloor.devices = targetFloor.devices.filter((item) => item.id !== selection.id);
        for (const cable of targetFloor.cables) {
          if (cable.startDeviceId === selection.id) cable.startDeviceId = null;
          if (cable.endDeviceId === selection.id) cable.endDeviceId = null;
        }
      } else if (selection.type === "wall") {
        label = "Стена";
        targetFloor.walls = targetFloor.walls.filter((item) => item.id !== selection.id);
        targetFloor.openings = (targetFloor.openings || []).filter(
          (item) => item.wallId !== selection.id
        );
      } else if (selection.type === "room") {
        label = targetFloor.rooms.find((item) => item.id === selection.id)?.name || "Комната";
        targetFloor.rooms = targetFloor.rooms.filter((item) => item.id !== selection.id);
      } else if (selection.type === "opening") {
        const opening = (targetFloor.openings || []).find((item) => item.id === selection.id);
        label = opening ? getOpeningType(opening.type).label : "Проём";
        targetFloor.openings = (targetFloor.openings || []).filter(
          (item) => item.id !== selection.id
        );
      } else if (selection.type === "cable") {
        label = targetFloor.cables.find((item) => item.id === selection.id)?.name || "Трасса";
        targetFloor.cables = targetFloor.cables.filter((item) => item.id !== selection.id);
      }
    }, { selectAfter: null });
    this.callbacks.onToast?.(`Удалено: ${label}`);
    this.requestRender();
    return true;
  }

  makeDrag(hit, startScreen, startWorld, pointerId) {
    let startPoint;
    let pointIndex = null;
    let objectType = "device";
    if (hit.kind === "handle") {
      objectType = hit.objectType;
      pointIndex = hit.pointIndex;
      if (objectType === "wall") {
        startPoint = { ...hit.item[hit.handleKey] };
      } else {
        const index = pointIndex === "last" ? hit.item.points.length - 1 : pointIndex;
        startPoint = { ...hit.item.points[index] };
      }
    } else {
      startPoint = { x: hit.item.x, y: hit.item.y };
    }
    return {
      kind: "dragPoint",
      pointerId,
      startScreen,
      startWorld,
      started: false,
      drag: {
        objectType,
        objectId: hit.item.id,
        pointIndex,
        startPoint
      }
    };
  }

  makeOpeningDrag(hit, startScreen, startWorld, pointerId) {
    return {
      kind: "dragPoint",
      pointerId,
      startScreen,
      startWorld,
      started: false,
      drag: {
        objectType: "opening",
        objectId: hit.item.id,
        wallId: hit.item.wallId,
        startOffset: Number(hit.item.offset) || 0
      }
    };
  }

  applyDrag(active, world, event) {
    const drag = active.drag;
    if (drag.objectType === "opening") {
      const floor = activeFloor();
      const opening = (floor?.openings || []).find((item) => item.id === drag.objectId);
      const wall = floor?.walls.find((item) => item.id === opening?.wallId);
      if (!opening || !wall) return;
      const result = pointToSegment(world, wall.a, wall.b);
      const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
      if (length < 0.001) return;
      opening.offset = openingSpan(
        { ...opening, offset: result.t * length },
        wall
      ).center;
      this.snap = null;
      mutate(() => {});
      return;
    }
    let deltaX = world.x - active.startWorld.x;
    let deltaY = world.y - active.startWorld.y;
    if (event.shiftKey) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) deltaY = 0;
      else deltaX = 0;
    }
    const proposed = {
      x: drag.startPoint.x + deltaX,
      y: drag.startPoint.y + deltaY
    };
    let point = proposed;
    if (drag.objectType === "device") {
      if (state.project.settings.snap) {
        point = snapPoint(proposed, state.project.settings.grid || DEFAULT_SETTINGS.grid);
      }
    } else {
      const snap = this.computeSnap(proposed, {
        includeDevices: drag.objectType === "cable" && (drag.pointIndex === 0 || drag.pointIndex === "last"),
        includeVertices: true,
        includeWalls: drag.objectType !== "wall",
        exclude: {
          type: drag.objectType,
          id: drag.objectId,
          index: drag.pointIndex
        }
      });
      point = snap.point;
      this.snap = snap;
    }

    const floor = activeFloor();
    if (!floor) return;
    if (drag.objectType === "device") {
      const device = floor.devices.find((item) => item.id === drag.objectId);
      if (!device) return;
      device.x = point.x;
      device.y = point.y;
    } else {
      const item = {
        wall: floor.walls,
        room: floor.rooms,
        cable: floor.cables
      }[drag.objectType]?.find((entry) => entry.id === drag.objectId);
      if (!item) return;
      if (drag.objectType === "wall") {
        const key = drag.pointIndex === 0 ? "a" : "b";
        item[key] = { x: point.x, y: point.y };
        for (const opening of floor.openings || []) {
          if (opening.wallId !== item.id) continue;
          opening.offset = openingSpan(opening, item).center;
        }
      } else if (item.points) {
        const index = drag.pointIndex === "last" ? item.points.length - 1 : drag.pointIndex;
        item.points[index] = { x: point.x, y: point.y };
      }
    }
    mutate(() => {});
  }

  finishDrag(active) {
    const floor = activeFloor();
    const drag = active.drag;
    if (!floor) return;
    if (drag.objectType === "cable" && (drag.pointIndex === 0 || drag.pointIndex === "last")) {
      const cable = floor.cables.find((item) => item.id === drag.objectId);
      if (!cable || cable.points.length < 2) return;
      const index = drag.pointIndex === "last" ? cable.points.length - 1 : 0;
      const point = cable.points[index];
      const device = this.findNearbyDevice(point, 26);
      if (device) {
        cable.points[index] = { x: device.x, y: device.y };
        if (index === 0) cable.startDeviceId = device.id;
        else cable.endDeviceId = device.id;
      } else {
        if (index === 0) cable.startDeviceId = null;
        else cable.endDeviceId = null;
      }
      mutate(() => {});
    } else if (drag.objectType === "device") {
      // Обновляет метрики трасс, привязанных к устройству.
      mutate(() => {});
    }
    this.snap = null;
    this.requestRender();
  }

  // --- Попадание мышью ---------------------------------------------------

  hitTest(world) {
    const floor = activeFloor();
    if (!floor) return null;
    const tolerance = 10 / state.view.scale;

    if (state.selection) {
      const selected = {
        wall: floor.walls,
        room: floor.rooms,
        opening: floor.openings || [],
        cable: floor.cables
      }[state.selection.type]?.find((entry) => entry.id === state.selection.id);
      if (selected) {
        if (state.selection.type === "wall") {
          if (dist(world, selected.a) <= tolerance) {
            return { kind: "handle", objectType: "wall", item: selected, handleKey: "a", pointIndex: 0 };
          }
          if (dist(world, selected.b) <= tolerance) {
            return { kind: "handle", objectType: "wall", item: selected, handleKey: "b", pointIndex: 1 };
          }
        } else if (selected.points) {
          for (let index = 0; index < selected.points.length; index += 1) {
            if (dist(world, selected.points[index]) <= tolerance) {
              return {
                kind: "handle",
                objectType: state.selection.type,
                item: selected,
                handleKey: index === 0 ? "a" : "b",
                pointIndex: state.selection.type === "cable" && index === selected.points.length - 1
                  ? "last"
                  : index
              };
            }
          }
        }
      }
    }

    let nearestDevice = null;
    for (const device of floor.devices) {
      const screenDistance = dist(world, device) * state.view.scale;
      if (screenDistance <= 19 && (!nearestDevice || screenDistance < nearestDevice.distance)) {
        nearestDevice = { item: device, distance: screenDistance };
      }
    }
    if (nearestDevice) return { type: "device", item: nearestDevice.item };

    let nearestCable = null;
    for (const cable of floor.cables) {
      const result = pointToPolyline(world, cable.points);
      if (result.distance * state.view.scale <= 9 && (!nearestCable || result.distance < nearestCable.distance)) {
        nearestCable = { item: cable, distance: result.distance };
      }
    }
    if (nearestCable) return { type: "cable", item: nearestCable.item };

    let nearestOpening = null;
    for (const opening of floor.openings || []) {
      const wall = floor.walls.find((item) => item.id === opening.wallId);
      if (!wall) continue;
      const span = openingSpan(opening, wall);
      if (span.length < 0.001) continue;
      const ux = (wall.b.x - wall.a.x) / span.length;
      const uy = (wall.b.y - wall.a.y) / span.length;
      const start = { x: wall.a.x + ux * span.start, y: wall.a.y + uy * span.start };
      const end = { x: wall.a.x + ux * span.end, y: wall.a.y + uy * span.end };
      const result = pointToSegment(world, start, end);
      const threshold = Math.max(
        tolerance,
        Number(wall.thickness || 0.1) / 2 + 3 / state.view.scale
      );
      if (result.distance <= threshold && (!nearestOpening || result.distance < nearestOpening.distance)) {
        nearestOpening = { item: opening, distance: result.distance };
      }
    }
    if (nearestOpening) return { type: "opening", item: nearestOpening.item };

    let nearestWall = null;
    for (const wall of floor.walls) {
      const result = pointToSegment(world, wall.a, wall.b);
      const threshold = Math.max(Number(wall.thickness || 0.1) / 2, 5 / state.view.scale) +
        3 / state.view.scale;
      if (result.distance <= threshold && (!nearestWall || result.distance < nearestWall.distance)) {
        nearestWall = { item: wall, distance: result.distance };
      }
    }
    if (nearestWall) return { type: "wall", item: nearestWall.item };

    for (let index = floor.rooms.length - 1; index >= 0; index -= 1) {
      if (pointInPolygon(world, floor.rooms[index].points)) {
        return { type: "room", item: floor.rooms[index] };
      }
    }
    return null;
  }

  // --- Интерфейсные подсказки --------------------------------------------

  notifyDraft() {
    const tool = state.tool;
    let hint = "";
    let canFinish = false;
    let title = "";
    if (this.draft?.kind === "wall") {
      title = "Стена";
      hint = "Укажите конечную точку. Shift — строго по горизонтали или вертикали.";
    } else if (this.draft?.kind === "room") {
      title = "Комната";
      canFinish = this.draft.points.length >= 3;
      hint = `Точек: ${this.draft.points.length}. Клик — следующая точка, двойной клик или Enter — завершить.`;
    } else if (this.draft?.kind === "cable") {
      title = "Кабельная трасса";
      canFinish = this.draft.points.length >= 2;
      hint = `Точек: ${this.draft.points.length}. Клик — изгиб, двойной клик или Enter — завершить.`;
    } else if (tool === "wall") {
      title = "Стена";
      hint = "Кликните начало и конец стены. Привязка к сетке включена.";
    } else if (tool === "room") {
      title = "Комната";
      hint = "Кликайте по углам комнаты, затем завершите построение.";
    } else if (tool === "cable") {
      title = "Кабельная трасса";
      hint = "Начните у устройства, добавьте изгибы и завершите у устройства.";
    } else if (tool === "device") {
      title = getDeviceType(state.deviceType).label;
      hint = "Нажмите на плане, чтобы разместить устройство.";
    } else if (tool === "door") {
      title = "Дверь";
      hint = "Кликните по стене — дверь встанет в этом месте. Положение и размеры меняются в свойствах.";
    } else if (tool === "window") {
      title = "Окно";
      hint = "Кликните по стене — окно встанет в этом месте. Ширина, высота и подоконник задаются в свойствах.";
    }
    this.callbacks.onDraftState?.({
      active: Boolean(this.draft && this.draft.kind !== "device"),
      kind: this.draft?.kind || tool,
      title,
      hint,
      canFinish,
      pointCount: this.draft?.points?.length || 0
    });
  }

  updateCursor() {
    if (this.spaceDown) {
      this.canvas.style.cursor = this.active?.kind === "pan" ? "grabbing" : "grab";
      return;
    }
    if (this.active?.kind === "pan") {
      this.canvas.style.cursor = "grabbing";
      return;
    }
    if (state.tool === "select") {
      this.canvas.style.cursor = "default";
    } else {
      this.canvas.style.cursor = "crosshair";
    }
  }
}

function eventShiftHeld() {
  return Boolean(globalThis.__electroplanShift);
}

// Shift нужен для ортогонального рисования в момент наведения мыши.
window.addEventListener("keydown", (event) => {
  if (event.key === "Shift") globalThis.__electroplanShift = true;
});
window.addEventListener("keyup", (event) => {
  if (event.key === "Shift") globalThis.__electroplanShift = false;
});
window.addEventListener("blur", () => {
  globalThis.__electroplanShift = false;
});
