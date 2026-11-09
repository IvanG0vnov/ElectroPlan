// Сборка электрощита: компоновка модулей на DIN-рейках, редактор и
// спецификация. Программа не подбирает номиналы — их задаёт пользователь.

import {
  PANEL_GROUP_LABELS,
  PANEL_LAYOUTS,
  PANEL_MODULE_TYPES,
  getPanelModuleType,
  panelLayoutKey,
  panelModuleSpec,
  panelModuleWidth
} from "./model.js";
import { cableMetrics } from "./calc.js";
import { formatNumber, pluralRu } from "./geometry.js";
import { escapeHtml, icon } from "./icons.js";

function layoutPanel(panel) {
  const columns = Math.max(1, Number(panel.columns) || 12);
  const rows = [];
  let rowIndex = 0;
  let column = 0;
  for (const module of panel.modules || []) {
    const width = Math.min(columns, Math.max(1, panelModuleWidth(module)));
    if (column + width > columns) {
      rowIndex += 1;
      column = 0;
    }
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex].push({ module, width, start: column });
    column += width;
  }
  return { columns, rows };
}

export function buildPanelBom(panel) {
  const map = new Map();
  for (const module of panel.modules || []) {
    const key = [
      module.type,
      module.rating || "",
      module.curve || "",
      module.leakage || ""
    ].join("|");
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: panelModuleSpec(module),
        count: 0,
        width: 0,
        circuits: new Set()
      });
    }
    const item = map.get(key);
    item.count += 1;
    item.width += panelModuleWidth(module);
    if (module.circuit) item.circuits.add(module.circuit);
  }
  return [...map.values()]
    .map((item) => ({ ...item, circuits: [...item.circuits] }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

export function panelStats(project) {
  const panel = project?.panel || { columns: 12, rows: 2, modules: [] };
  const columns = Math.max(1, Number(panel.columns) || 12);
  const enclosureRows = Math.max(1, Number(panel.rows) || 1);
  const capacity = columns * enclosureRows;
  const modules = panel.modules || [];
  const { rows } = layoutPanel(panel);
  const used = modules.reduce(
    (sum, module) => sum + Math.min(columns, Math.max(1, panelModuleWidth(module))),
    0
  );
  const free = Math.max(0, capacity - used);
  const overflow = Math.max(0, used - capacity);
  const railCount = Math.max(enclosureRows, rows.length);
  const displayRows = Array.from({ length: railCount }, (_, index) => rows[index] || []);
  const missingRatings = modules.filter((module) => {
    const info = getPanelModuleType(module.type);
    return info.rating && !module.rating;
  }).length;
  const missingLeakage = modules.filter((module) => {
    const info = getPanelModuleType(module.type);
    return info.leakage && !module.leakage;
  }).length;

  return {
    panel,
    columns,
    enclosureRows,
    capacity,
    used,
    free,
    overflow,
    railCount,
    displayRows,
    moduleCount: modules.length,
    missingRatings,
    missingLeakage,
    bom: buildPanelBom(panel)
  };
}

function collectCircuits(project, panel) {
  const map = new Map();
  const ensure = (name) => {
    if (!map.has(name)) {
      map.set(name, { name, routes: 0, total: 0, devices: 0, inPanel: 0 });
    }
    return map.get(name);
  };

  for (const floor of project?.floors || []) {
    for (const device of floor.devices || []) {
      const name = String(device.circuit || "").trim();
      if (name) ensure(name).devices += 1;
    }
    for (const cable of floor.cables || []) {
      const name = String(cable.circuit || "").trim() || "Без цепи";
      const entry = ensure(name);
      entry.routes += 1;
      entry.total += cableMetrics(cable, floor, project.settings || {}).total;
    }
  }

  for (const module of panel.modules || []) {
    const name = String(module.circuit || "").trim();
    if (name) ensure(name).inPanel += 1;
  }

  return [...map.values()].sort((a, b) => {
    if (a.name === "Без цепи") return 1;
    if (b.name === "Без цепи") return -1;
    return a.name.localeCompare(b.name, "ru");
  });
}

function moduleTypeOptions(selected) {
  const groups = new Map();
  for (const [value, info] of Object.entries(PANEL_MODULE_TYPES)) {
    const group = info.group || "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ value, info });
  }
  return [...groups.entries()].map(([group, items]) => `
    <optgroup label="${escapeHtml(PANEL_GROUP_LABELS[group] || group)}">
      ${items.map(({ value, info }) => `
        <option value="${value}" ${value === selected ? "selected" : ""}>
          ${escapeHtml(info.label)} · ${info.width} мод.
        </option>
      `).join("")}
    </optgroup>
  `).join("");
}

function circuitOptions(circuits, selected, emptyLabel = "Без цепи") {
  const names = circuits.map((item) => item.name);
  const list = selected && !names.includes(selected) ? [...names, selected] : names;
  return `
    <option value="">${escapeHtml(emptyLabel)}</option>
    ${list.map((name) => `
      <option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>
    `).join("")}
  `;
}

function panelDetail(module) {
  const info = getPanelModuleType(module.type);
  const parts = [];
  if (info.rating && module.rating) {
    parts.push(info.curve ? `${module.curve || "C"}${module.rating}` : `${module.rating} А`);
  }
  if (info.leakage && module.leakage) parts.push(`${module.leakage} мА`);
  if (parts.length) return parts.join(" · ");
  if (info.rating) return "номинал —";
  return `${info.width} мод.`;
}

function moduleBlockMarkup(placement) {
  const { module, width, start } = placement;
  const info = getPanelModuleType(module.type);
  const unrated = (info.rating && !module.rating) || (info.leakage && !module.leakage);
  const title = `${panelModuleSpec(module)}${module.circuit ? ` · ${module.circuit}` : ""}`;
  return `
    <div
      class="panel-module group-${escapeHtml(info.group)}${unrated ? " is-unrated" : ""}"
      style="grid-column:${start + 1} / span ${width}"
      title="${escapeHtml(title)}"
    >
      <strong>${escapeHtml(module.circuit || info.short)}</strong>
      <span>${escapeHtml(panelDetail(module))}</span>
    </div>
  `;
}

function boardRowMarkup(row, index, columns, enclosureRows) {
  const overflowRow = index >= enclosureRows;
  const occupied = new Set();
  for (const placement of row) {
    for (let offset = 0; offset < placement.width; offset += 1) {
      occupied.add(placement.start + offset);
    }
  }
  const empty = [];
  for (let column = 0; column < columns; column += 1) {
    if (!occupied.has(column)) {
      empty.push(`<span class="panel-slot panel-slot-empty" style="grid-column:${column + 1}"></span>`);
    }
  }
  return `
    <div class="panel-rail${overflowRow ? " is-overflow" : ""}">
      <span class="panel-rail-label">Ряд ${index + 1}${overflowRow ? " · сверх корпуса" : ""}</span>
      <div class="panel-rail-grid" style="--panel-columns:${columns}">
        ${row.map(moduleBlockMarkup).join("")}
        ${empty.join("")}
      </div>
    </div>
  `;
}

function warningsMarkup(stats) {
  const items = [];
  if (!stats.moduleCount) {
    items.push("Щит пока пуст: добавьте модуль или выберите аппарат для цепи.");
  }
  if (stats.overflow) {
    items.push(`Не хватает ${stats.overflow} ${pluralRu(stats.overflow, "модуля", "модулей", "модулей")} — выберите корпус больше или уберите лишние модули.`);
  }
  if (stats.missingRatings) {
    items.push(`У ${stats.missingRatings} ${pluralRu(stats.missingRatings, "аппарата", "аппаратов", "аппаратов")} не указан номинал.`);
  }
  if (stats.missingLeakage) {
    items.push(`У ${stats.missingLeakage} ${pluralRu(stats.missingLeakage, "аппарата", "аппаратов", "аппаратов")} не указан ток утечки.`);
  }
  if (!items.length) return "";
  return `
    <div class="panel-warnings">
      ${items.map((text) => `
        <div class="panel-warning">${icon("warning")}<span>${escapeHtml(text)}</span></div>
      `).join("")}
    </div>
  `;
}

function moduleEditMarkup(module, index, total, circuits) {
  const info = getPanelModuleType(module.type);
  const id = escapeHtml(module.id);
  return `
    <div class="panel-edit-row">
      <span class="panel-edit-index">${String(index + 1).padStart(2, "0")}</span>
      <div class="panel-edit-body">
        <div class="panel-edit-top">
          <select data-panel-module-field="type" data-panel-module-id="${id}" aria-label="Тип модуля ${index + 1}">
            ${moduleTypeOptions(module.type)}
          </select>
          <span class="panel-edit-spec">${escapeHtml(panelModuleSpec(module))}</span>
        </div>
        <div class="panel-edit-fields">
          ${info.rating ? `
            <label class="panel-mini-field">
              <span>Номинал, А</span>
              <input
                data-panel-module-field="rating"
                data-panel-module-id="${id}"
                type="number" min="1" max="125" step="1"
                value="${escapeHtml(module.rating)}" placeholder="—"
              >
            </label>
          ` : ""}
          ${info.curve ? `
            <label class="panel-mini-field">
              <span>Кривая</span>
              <select data-panel-module-field="curve" data-panel-module-id="${id}">
                ${["B", "C", "D"].map((curve) => `
                  <option value="${curve}" ${curve === (module.curve || "C") ? "selected" : ""}>${curve}</option>
                `).join("")}
              </select>
            </label>
          ` : ""}
          ${info.leakage ? `
            <label class="panel-mini-field">
              <span>Утечка</span>
              <select data-panel-module-field="leakage" data-panel-module-id="${id}">
                <option value="">—</option>
                ${[10, 30, 100, 300].map((value) => `
                  <option value="${value}" ${Number(module.leakage) === value ? "selected" : ""}>${value} мА</option>
                `).join("")}
              </select>
            </label>
          ` : ""}
          <label class="panel-mini-field panel-mini-wide">
            <span>Цепь</span>
            <select data-panel-module-field="circuit" data-panel-module-id="${id}">
              ${circuitOptions(circuits, module.circuit)}
            </select>
          </label>
        </div>
      </div>
      <div class="panel-edit-actions">
        <button class="icon-btn" type="button" data-action="panel-module-up" data-panel-module-id="${id}" ${index === 0 ? "disabled" : ""} title="Выше" aria-label="Переместить выше">↑</button>
        <button class="icon-btn" type="button" data-action="panel-module-down" data-panel-module-id="${id}" ${index === total - 1 ? "disabled" : ""} title="Ниже" aria-label="Переместить ниже">↓</button>
        <button class="icon-btn danger-text" type="button" data-action="panel-module-delete" data-panel-module-id="${id}" title="Удалить" aria-label="Удалить модуль">${icon("trash")}</button>
      </div>
    </div>
  `;
}

function addModuleMarkup(circuits) {
  return `
    <div class="panel-add">
      <select data-panel-add-type aria-label="Тип нового модуля">
        ${moduleTypeOptions("breaker1")}
      </select>
      <select data-panel-add-circuit aria-label="Цепь нового модуля">
        ${circuitOptions(circuits, "")}
      </select>
      <input data-panel-add-rating type="number" min="1" max="125" step="1" placeholder="Номинал, А" aria-label="Номинал нового модуля">
      <button class="btn btn-primary btn-sm" type="button" data-action="panel-add-module">${icon("plus")} Добавить</button>
    </div>
    <p class="helper-copy">Тип и номинал задаёте вы. Ширина и место в ряду пересчитываются автоматически.</p>
  `;
}

function circuitsMarkup(circuits) {
  if (!circuits.length) {
    return `<p class="empty-note">В проекте нет цепей. Заполните поле «Группа / цепь» у устройств или трасс — они появятся здесь.</p>`;
  }
  return `
    <div class="panel-circuit-list">
      ${circuits.map((circuit) => `
        <div class="panel-circuit-row">
          <div class="panel-circuit-copy">
            <strong>${escapeHtml(circuit.name)}</strong>
            <small>
              ${circuit.routes
                ? `${circuit.routes} ${pluralRu(circuit.routes, "трасса", "трассы", "трасс")} · ${formatNumber(circuit.total)} м`
                : "только устройства"}
              ${circuit.devices ? ` · ${circuit.devices} устр.` : ""}
              ${circuit.inPanel ? ` · в щите ${circuit.inPanel}` : ""}
            </small>
          </div>
          <select data-panel-circuit-add="${escapeHtml(circuit.name)}" aria-label="Добавить аппарат для цепи ${escapeHtml(circuit.name)}">
            <option value="">+ аппарат…</option>
            ${moduleTypeOptions("")}
          </select>
        </div>
      `).join("")}
    </div>
    <p class="helper-copy">Выберите аппарат для цепи — он добавится в конец щита. Номинал задайте в списке модулей.</p>
  `;
}

function bomMarkup(stats) {
  if (!stats.bom.length) {
    return `<p class="empty-note">Спецификация появится, когда в щите будут модули.</p>`;
  }
  return `
    <table class="panel-spec-table">
      <thead>
        <tr>
          <th>Аппарат</th>
          <th>Цепи</th>
          <th class="num">Кол-во</th>
          <th class="num">Мод.</th>
        </tr>
      </thead>
      <tbody>
        ${stats.bom.map((item) => `
          <tr>
            <td>${escapeHtml(item.label)}</td>
            <td>${item.circuits.length ? escapeHtml(item.circuits.join(", ")) : "—"}</td>
            <td class="num">${item.count} шт.</td>
            <td class="num">${item.width}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export function buildPanelMarkup(project) {
  const stats = panelStats(project);
  const panel = stats.panel;
  const circuits = collectCircuits(project, panel);
  const layoutValue = panelLayoutKey(panel);
  const free = stats.overflow ? `−${stats.overflow}` : String(stats.free);

  return `
    <article class="panel-sheet">
      <header class="panel-sheet-head">
        <div>
          <span class="panel-kicker">Документ · сборка щита</span>
          <h1>${escapeHtml(panel.name || "Щит")}</h1>
          <p>${escapeHtml(project.name)} · ${panel.columns}×${panel.rows} · ${stats.capacity} модулей</p>
        </div>
        <div class="panel-head-stats">
          <span><small>Занято</small><strong>${stats.used}</strong></span>
          <span class="${stats.overflow ? "is-bad" : ""}"><small>Свободно</small><strong>${free}</strong></span>
          <span><small>Рядов</small><strong>${stats.railCount}</strong></span>
        </div>
      </header>

      <section class="panel-config">
        <label class="field">
          <span>Название щита</span>
          <input data-panel-field="name" value="${escapeHtml(panel.name)}" maxlength="60">
        </label>
        <label class="field">
          <span>Корпус</span>
          <select data-panel-field="layout">
            ${PANEL_LAYOUTS.map((layout) => `
              <option value="${layout.value}" ${layout.value === layoutValue ? "selected" : ""}>${escapeHtml(layout.label)}</option>
            `).join("")}
          </select>
        </label>
        <div class="panel-config-note">
          <span>Заполнение</span>
          <strong>${stats.capacity ? Math.min(100, Math.round((stats.used / stats.capacity) * 100)) : 0}%</strong>
        </div>
      </section>

      <section class="panel-board-wrap">
        <div class="panel-board">
          <div class="panel-board-brand">
            <span>${escapeHtml(panel.name || "Щит")}</span>
            <span>${panel.columns} × ${panel.rows} · ${stats.capacity} мод.</span>
          </div>
          ${stats.displayRows.map((row, index) => boardRowMarkup(row, index, stats.columns, stats.enclosureRows)).join("")}
        </div>
        <div class="panel-board-foot">
          <span>Фронтальная компоновка · 1 модуль = 17,5 мм</span>
          <span>${stats.moduleCount} ${pluralRu(stats.moduleCount, "аппарат", "аппарата", "аппаратов")}</span>
        </div>
      </section>

      ${warningsMarkup(stats)}

      <div class="panel-docs">
        <section class="panel-block">
          <div class="panel-block-head">
            <h2>Модули щита</h2>
            <span>${stats.moduleCount}</span>
          </div>
          ${stats.moduleCount
            ? panel.modules.map((module, index) => moduleEditMarkup(module, index, panel.modules.length, circuits)).join("")
            : `<p class="empty-note">Добавьте первый модуль: вводной автомат, УЗО, автоматы групп или клеммник.</p>`}
          ${addModuleMarkup(circuits)}
        </section>

        <section class="panel-block">
          <div class="panel-block-head">
            <h2>Цепи проекта</h2>
            <span>${circuits.length}</span>
          </div>
          ${circuitsMarkup(circuits)}
        </section>
      </div>

      <section class="panel-block panel-spec">
        <div class="panel-block-head">
          <h2>Спецификация щита</h2>
          <span>${stats.bom.length} ${pluralRu(stats.bom.length, "позиция", "позиции", "позиций")}</span>
        </div>
        ${bomMarkup(stats)}
      </section>

      <footer class="panel-sheet-foot">
        <span>${escapeHtml(project.name)} · ${escapeHtml(panel.name || "Щит")}</span>
        <span>Корпус ${stats.capacity} мод. · занято ${stats.used} · свободно ${stats.free}${stats.overflow ? ` · не хватает ${stats.overflow}` : ""}</span>
      </footer>
    </article>
  `;
}

export function renderPanel(container, project) {
  if (!container || !project) return;
  container.innerHTML = buildPanelMarkup(project);
}
