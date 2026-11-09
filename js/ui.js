// HTML-представления правой панели, списка этажей и менеджера проектов.

import {
  CABLE_KINDS,
  CABLE_SECTIONS,
  CORES,
  DEVICE_TYPES,
  OPENING_TYPES,
  UTP_CATEGORIES,
  cableSpecLabel,
  cableColor,
  deviceTypeLabel,
  getCableKind,
  getDeviceGangs,
  getDeviceType,
  getOpeningType,
  getUtpCategory,
  openingSpan
} from "./model.js";
import { cableMetrics, summarizeProject } from "./calc.js";
import { formatNumber, polygonArea, polylineLength, pluralRu } from "./geometry.js";
import { dateLabel, deviceIcon, escapeHtml, icon } from "./icons.js";

const inputNumber = (value, digits = 2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return String(Number(parsed.toFixed(digits)));
};

function inputField({ label, name, value, type = "text", step, min, max, wide = false, hint, disabled = false, placeholder = "" }) {
  return `
    <label class="field ${wide ? "field-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <input
        data-item-field="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value ?? "")}"
        ${step !== undefined ? `step="${escapeHtml(step)}"` : ""}
        ${min !== undefined ? `min="${escapeHtml(min)}"` : ""}
        ${max !== undefined ? `max="${escapeHtml(max)}"` : ""}
        ${disabled ? "disabled" : ""}
        placeholder="${escapeHtml(placeholder)}"
      >
      ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
    </label>
  `;
}

function selectField({ label, name, value, options, wide = false, hint }) {
  return `
    <label class="field ${wide ? "field-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <select data-item-field="${escapeHtml(name)}">
        ${options.map((option) => `
          <option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>
            ${escapeHtml(option.label)}
          </option>
        `).join("")}
      </select>
      ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
    </label>
  `;
}

function toggleField({ label, name, checked, description = "" }) {
  return `
    <label class="switch-row">
      <input type="checkbox" data-project-setting="${escapeHtml(name)}" ${checked ? "checked" : ""}>
      <span class="switch-track" aria-hidden="true"></span>
      <span class="switch-copy">
        <strong>${escapeHtml(label)}</strong>
        ${description ? `<small>${escapeHtml(description)}</small>` : ""}
      </span>
    </label>
  `;
}

function floorToggleField({ label, name, checked, description = "" }) {
  return `
    <label class="switch-row">
      <input type="checkbox" data-project-setting="${escapeHtml(name)}" ${checked ? "checked" : ""}>
      <span class="switch-track" aria-hidden="true"></span>
      <span class="switch-copy">
        <strong>${escapeHtml(label)}</strong>
        ${description ? `<small>${escapeHtml(description)}</small>` : ""}
      </span>
    </label>
  `;
}

function projectSettingsMarkup(project, floor) {
  const settings = project.settings;
  return `
    <section class="inspector-section">
      <div class="section-heading">
        <h3>Отображение</h3>
        <span class="section-note">План</span>
      </div>
      <div class="switch-stack">
        ${toggleField({ label: "Сетка", name: "showGrid", checked: Boolean(settings.showGrid), description: "Линии с шагом масштаба" })}
        ${toggleField({ label: "Подписи", name: "showLabels", checked: Boolean(settings.showLabels), description: "Названия устройств и комнат" })}
        ${toggleField({ label: "Размеры стен", name: "showDimensions", checked: Boolean(settings.showDimensions), description: "Длина на каждой стене" })}
        ${toggleField({ label: "Привязка", name: "snap", checked: Boolean(settings.snap), description: "К сетке и узлам плана" })}
      </div>
      <div class="form-grid compact-grid">
        <label class="field">
          <span>Шаг сетки</span>
          <select data-project-setting="grid">
            ${[0.05, 0.1, 0.25, 0.5].map((value) => `
              <option value="${value}" ${Number(settings.grid) === value ? "selected" : ""}>${formatNumber(value, 2)} м</option>
            `).join("")}
          </select>
        </label>
        <label class="field">
          <span>Сечение по умолчанию</span>
          <select data-project-setting="defaultSection">
            ${CABLE_SECTIONS.map((section) => `
              <option value="${section.value}" ${Number(settings.defaultSection) === section.value ? "selected" : ""}>${section.label}</option>
            `).join("")}
          </select>
        </label>
      </div>
    </section>

    <section class="inspector-section">
      <div class="section-heading">
        <h3>Расчёт кабеля</h3>
        <span class="section-note">Метраж</span>
      </div>
      <div class="form-grid compact-grid">
        <label class="field">
          <span>Запас, %</span>
          <input type="number" min="0" max="100" step="1" data-project-setting="reservePercent" value="${escapeHtml(settings.reservePercent)}">
        </label>
        <label class="field">
          <span>На подключение, м</span>
          <input type="number" min="0" max="5" step="0.05" data-project-setting="deviceSlack" value="${escapeHtml(settings.deviceSlack)}">
        </label>
        <label class="field">
          <span>Высота трассы, м</span>
          <input type="number" min="0" max="10" step="0.05" data-project-setting="defaultRouteHeight" value="${escapeHtml(settings.defaultRouteHeight)}">
        </label>
        <label class="field">
          <span>Жил по умолчанию</span>
          <select data-project-setting="defaultCores">
            ${CORES.map((cores) => `<option value="${cores}" ${Number(settings.defaultCores) === cores ? "selected" : ""}>${cores}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>UTP по умолчанию</span>
          <select data-project-setting="defaultUtpCategory">
            ${UTP_CATEGORIES.map((category) => `
              <option value="${category.value}" ${settings.defaultUtpCategory === category.value ? "selected" : ""}>${category.label}</option>
            `).join("")}
          </select>
        </label>
      </div>
      <p class="helper-copy">Формула: длина по плану + спуски к устройствам + ${formatNumber(settings.deviceSlack, 2)} м на подключение + запас. Сечение выбираете вы.</p>
    </section>

    <section class="inspector-section">
      <div class="section-heading">
        <h3>Стены по умолчанию</h3>
      </div>
      <div class="form-grid compact-grid">
        <label class="field">
          <span>Толщина, м</span>
          <input type="number" min="0.02" max="1" step="0.01" data-project-setting="defaultWallThickness" value="${escapeHtml(settings.defaultWallThickness)}">
        </label>
        <label class="field">
          <span>Высота, м</span>
          <input type="number" min="1" max="10" step="0.05" data-project-setting="defaultWallHeight" value="${escapeHtml(settings.defaultWallHeight)}">
        </label>
      </div>
    </section>

    <section class="inspector-section">
      <div class="section-heading">
        <h3>Этаж</h3>
        <span class="section-note">${floor.walls.length} стен · ${floor.rooms.length} комнат</span>
      </div>
      <label class="field field-wide">
        <span>Название этажа</span>
        <input data-floor-field="name" value="${escapeHtml(floor.name)}">
      </label>
      <div class="inline-actions">
        <button class="btn btn-soft btn-sm" type="button" data-action="add-floor">${icon("plus")} Добавить этаж</button>
        <button class="btn btn-ghost btn-sm danger-text" type="button" data-action="delete-floor" ${project.floors.length <= 1 ? "disabled" : ""}>${icon("trash")} Удалить</button>
      </div>
    </section>
  `;
}

function projectMarkup(project, floor) {
  const data = summarizeProject(project);
  return `
    <div class="inspector">
      <div class="inspector-hero">
        <div class="object-icon object-icon-project">${icon("bolt")}</div>
        <div class="hero-copy">
          <span class="eyebrow">Проект</span>
          <h2>${escapeHtml(project.name)}</h2>
          <p>${project.floors.length} эт. · ${data.totals.routes} ${pluralRu(data.totals.routes, "трасса", "трассы", "трасс")} · ${formatNumber(data.totals.total)} м кабеля</p>
        </div>
      </div>

      <section class="inspector-section">
        <div class="section-heading">
          <h3>Название проекта</h3>
        </div>
        <input class="wide-input" data-project-field="name" value="${escapeHtml(project.name)}" maxlength="80" aria-label="Название проекта">
        <div class="project-meta">
          <span>Создан: ${dateLabel(project.createdAt)}</span>
          <span>Изменён: ${dateLabel(project.updatedAt)}</span>
        </div>
      </section>

      ${projectSettingsMarkup(project, floor)}

      <div class="inspector-actions">
        <button class="btn btn-soft" type="button" data-action="open-report">${icon("report")} Отчёт</button>
        <button class="btn btn-primary" type="button" data-action="export-json">${icon("download")} Файл проекта</button>
      </div>
    </div>
  `;
}

function deviceMarkup(project, floor, device) {
  const info = getDeviceType(device.type);
  const gangs = getDeviceGangs(device);
  const related = floor.cables.filter(
    (cable) => cable.startDeviceId === device.id || cable.endDeviceId === device.id
  );
  const circuits = [...new Set(floor.devices.map((item) => item.circuit).filter(Boolean))];
  return `
    <div class="inspector">
      <div class="inspector-hero">
        <div class="object-icon object-icon-device" style="--object-color: ${device.color || "#0369a1"}">
          ${deviceIcon(device.type)}
        </div>
        <div class="hero-copy">
          <span class="eyebrow">Устройство · ${escapeHtml(deviceTypeLabel(device))}</span>
          <h2>${escapeHtml(device.name || info.label)}</h2>
          <p>${gangs > 1 ? `${gangs} ${pluralRu(gangs, "пост", "поста", "постов")} · ` : ""}${related.length} ${pluralRu(related.length, "трасса", "трассы", "трасс")}</p>
        </div>
      </div>

      <section class="inspector-section">
        <div class="section-heading"><h3>Параметры</h3></div>
        <div class="form-grid">
          ${selectField({
            label: "Тип", name: "type", wide: true,
            value: device.type,
            options: Object.entries(DEVICE_TYPES).map(([value, type]) => ({ value, label: type.label }))
          })}
          ${inputField({ label: "Название", name: "name", value: device.name, wide: true })}
          ${info.gangs ? selectField({
            label: "Количество постов", name: "gangs", value: gangs,
            options: [1, 2, 3, 4].map((value) => ({ value, label: `${value}` })),
            hint: "Сколько розеток или клавиш в одном корпусе."
          }) : ""}
          ${inputField({ label: "X, м", name: "x", value: inputNumber(device.x, 2), type: "number", step: "0.01", min: "-100" })}
          ${inputField({ label: "Y, м", name: "y", value: inputNumber(device.y, 2), type: "number", step: "0.01", min: "-100" })}
          ${inputField({ label: "Высота установки, м", name: "mountHeight", value: inputNumber(device.mountHeight, 2), type: "number", step: "0.05", min: "0", max: "10" })}
          ${inputField({ label: "Группа / цепь", name: "circuit", value: device.circuit, placeholder: "Например, Розетки", hint: circuits.length ? `Есть: ${circuits.slice(0, 4).join(", ")}` : "" })}
          <label class="field field-wide">
            <span>Примечание</span>
            <textarea data-item-field="note" rows="2" placeholder="Модель, высота, особенности">${escapeHtml(device.note)}</textarea>
          </label>
        </div>
      </section>

      <section class="inspector-section">
        <div class="section-heading">
          <h3>Подключённые трассы</h3>
          <span class="section-note">${related.length}</span>
        </div>
        ${related.length ? `
          <div class="linked-list">
            ${related.map((cable) => {
              const metrics = cableMetrics(cable, floor, project.settings);
              const color = cableColor(cable);
              return `
                <button type="button" class="linked-row" data-action="select-cable" data-cable-id="${escapeHtml(cable.id)}">
                  <span class="color-dot" style="--dot:${color}"></span>
                  <span class="linked-copy">
                    <strong>${escapeHtml(cable.name)}</strong>
                    <small>${escapeHtml(cableSpecLabel(cable))} · ${formatNumber(metrics.total)} м</small>
                  </span>
                  ${icon("chevron")}
                </button>
              `;
            }).join("")}
          </div>
        ` : `<p class="empty-note">Устройство пока не привязано к кабелю. Выберите трассу на плане и укажите это устройство в её свойствах.</p>`}
      </section>

      <div class="inspector-actions">
        <button class="btn btn-soft" type="button" data-action="center-selection">${icon("location")} Найти</button>
        <button class="btn btn-soft" type="button" data-action="duplicate-device">${icon("copy")} Копия</button>
        <button class="btn btn-ghost danger-text" type="button" data-action="delete-selection">${icon("trash")} Удалить</button>
      </div>
    </div>
  `;
}

function wallMarkup(project, floor, wall) {
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  return `
    <div class="inspector">
      <div class="inspector-hero">
        <div class="object-icon object-icon-wall">${icon("wall")}</div>
        <div class="hero-copy">
          <span class="eyebrow">Стена</span>
          <h2>${formatNumber(length)} м</h2>
          <p>Толщина ${formatNumber(wall.thickness)} м · высота ${formatNumber(wall.height)} м</p>
        </div>
      </div>

      <section class="inspector-section">
        <div class="section-heading"><h3>Геометрия</h3></div>
        <div class="form-grid">
          ${inputField({ label: "Толщина, м", name: "thickness", value: inputNumber(wall.thickness, 2), type: "number", step: "0.01", min: "0.02", max: "1" })}
          ${inputField({ label: "Высота, м", name: "height", value: inputNumber(wall.height, 2), type: "number", step: "0.05", min: "1", max: "10" })}
          ${inputField({ label: "Начало X, м", name: "ax", value: inputNumber(wall.a.x, 2), type: "number", step: "0.01" })}
          ${inputField({ label: "Начало Y, м", name: "ay", value: inputNumber(wall.a.y, 2), type: "number", step: "0.01" })}
          ${inputField({ label: "Конец X, м", name: "bx", value: inputNumber(wall.b.x, 2), type: "number", step: "0.01" })}
          ${inputField({ label: "Конец Y, м", name: "by", value: inputNumber(wall.b.y, 2), type: "number", step: "0.01" })}
        </div>
        <p class="helper-copy">Концы стены можно перетаскивать прямо на плане после выделения.</p>
      </section>

      <div class="inspector-actions">
        <button class="btn btn-soft" type="button" data-action="center-selection">${icon("location")} Найти</button>
        <button class="btn btn-ghost danger-text" type="button" data-action="delete-selection">${icon("trash")} Удалить стену</button>
      </div>
    </div>
  `;
}

function openingMarkup(project, floor, opening) {
  const wall = floor.walls.find((item) => item.id === opening.wallId);
  const span = wall ? openingSpan(opening, wall) : { length: 0, width: opening.width || 0, center: opening.offset || 0 };
  const info = getOpeningType(opening.type);
  const wallIndex = wall ? floor.walls.indexOf(wall) + 1 : 0;
  const isDoor = opening.type === "door";
  return `
    <div class="inspector">
      <div class="inspector-hero">
        <div class="object-icon object-icon-opening" style="--object-color:${escapeHtml(info.color)}">
          ${icon(isDoor ? "door" : "window")}
        </div>
        <div class="hero-copy">
          <span class="eyebrow">Проём · ${escapeHtml(info.label)}</span>
          <h2>${formatNumber(span.width)} м</h2>
          <p>${wall ? `Стена ${wallIndex} · длина ${formatNumber(span.length)} м` : "Стена не найдена"}</p>
        </div>
      </div>

      <section class="inspector-section">
        <div class="section-heading"><h3>Параметры проёма</h3></div>
        <div class="form-grid">
          ${selectField({
            label: "Тип проёма", name: "type", wide: true, value: opening.type,
            options: Object.entries(OPENING_TYPES).map(([value, type]) => ({ value, label: type.label }))
          })}
          ${inputField({
            label: "Смещение от начала стены, м", name: "offset", wide: true,
            value: inputNumber(opening.offset, 2), type: "number", step: "0.05",
            min: "0", max: inputNumber(span.length, 2),
            hint: "Расстояние до центра проёма. Перетаскивайте проём прямо на плане."
          })}
          ${inputField({ label: "Ширина, м", name: "width", value: inputNumber(opening.width, 2), type: "number", step: "0.05", min: "0.2", max: "4" })}
          ${inputField({ label: "Высота, м", name: "height", value: inputNumber(opening.height, 2), type: "number", step: "0.05", min: "0.3", max: "5" })}
          ${isDoor ? "" : inputField({ label: "Подоконник, м", name: "sill", value: inputNumber(opening.sill, 2), type: "number", step: "0.05", min: "0", max: "3" })}
          ${isDoor ? selectField({
            label: "Петли", name: "hinge", value: opening.hinge,
            options: [
              { value: "start", label: "У начала стены" },
              { value: "end", label: "У конца стены" }
            ]
          }) : ""}
          ${isDoor ? selectField({
            label: "Сторона открывания", name: "swing", value: String(opening.swing),
            options: [
              { value: "1", label: "Сторона 1" },
              { value: "-1", label: "Сторона 2" }
            ],
            hint: "Меняет, в какую сторону от стены открывается дверное полотно."
          }) : ""}
        </div>
      </section>

      <section class="inspector-section">
        <div class="section-heading"><h3>Примечание</h3></div>
        <label class="field field-wide">
          <textarea data-item-field="note" rows="2" placeholder="Например, двустворчатая, стеклопакет">${escapeHtml(opening.note || "")}</textarea>
        </label>
      </section>

      <div class="inspector-actions">
        <button class="btn btn-soft" type="button" data-action="center-selection">${icon("location")} Найти</button>
        <button class="btn btn-ghost danger-text" type="button" data-action="delete-selection">${icon("trash")} Удалить проём</button>
      </div>
    </div>
  `;
}

function roomMarkup(project, floor, room) {
  const area = polygonArea(room.points);
  const perimeter = polylineLength([...room.points, room.points[0]]);
  return `
    <div class="inspector">
      <div class="inspector-hero">
        <div class="object-icon object-icon-room" style="--object-color:${escapeHtml(room.color || "#2563eb")}">${icon("room")}</div>
        <div class="hero-copy">
          <span class="eyebrow">Комната</span>
          <h2>${escapeHtml(room.name || "Без названия")}</h2>
          <p>${formatNumber(area)} м² · периметр ${formatNumber(perimeter)} м</p>
        </div>
      </div>

      <section class="inspector-section">
        <div class="section-heading"><h3>Параметры</h3></div>
        <div class="form-grid">
          ${inputField({ label: "Название", name: "name", value: room.name, wide: true })}
          <label class="field">
            <span>Цвет заливки</span>
            <input type="color" data-item-field="color" value="${escapeHtml(room.color || "#dbeafe")}">
          </label>
          <label class="field">
            <span>Вершин</span>
            <input type="text" value="${room.points.length}" disabled>
          </label>
        </div>
        <p class="helper-copy">Вершины комнаты перетаскиваются на плане после выделения. Площадь считается автоматически.</p>
      </section>

      <div class="inspector-actions">
        <button class="btn btn-soft" type="button" data-action="center-selection">${icon("location")} Найти</button>
        <button class="btn btn-ghost danger-text" type="button" data-action="delete-selection">${icon("trash")} Удалить комнату</button>
      </div>
    </div>
  `;
}

function cableMarkup(project, floor, cable) {
  const metrics = cableMetrics(cable, floor, project.settings);
  const utp = getCableKind(cable) === "utp";
  const color = cableColor(cable);
  const category = getUtpCategory(cable).value;
  const reserveCustom = cable.reservePercent !== null && cable.reservePercent !== undefined;
  const devices = floor.devices.map((device) => ({
    value: device.id,
    label: `${device.name} (${deviceTypeLabel(device)})`
  }));
  return `
    <div class="inspector">
      <div class="inspector-hero">
        <div class="object-icon object-icon-cable" style="--object-color:${color}">${icon(utp ? "network" : "cable")}</div>
        <div class="hero-copy">
          <span class="eyebrow">${utp ? "UTP-трасса" : "Кабельная трасса"} · ${escapeHtml(cableSpecLabel(cable))}</span>
          <h2>${escapeHtml(cable.name || "Трасса")}</h2>
          <p><strong class="accent-number">${formatNumber(metrics.total)} м</strong> с запасом ${formatNumber(metrics.reservePercent, 0)}%</p>
        </div>
      </div>

      <section class="inspector-section">
        <div class="section-heading"><h3>Кабель</h3></div>
        <div class="form-grid">
          ${inputField({ label: "Название", name: "name", value: cable.name, wide: true })}
          ${selectField({
            label: "Вид кабеля", name: "kind", wide: true, value: getCableKind(cable),
            options: Object.entries(CABLE_KINDS).map(([value, info]) => ({ value, label: info.label }))
          })}
          ${utp ? selectField({
            label: "Категория UTP", name: "category", value: category,
            options: UTP_CATEGORIES.map((item) => ({ value: item.value, label: item.label }))
          }) : selectField({
            label: "Сечение", name: "section", value: cable.section,
            options: CABLE_SECTIONS.map((item) => ({ value: item.value, label: item.label }))
          })}
          ${utp ? "" : selectField({
            label: "Жил", name: "cores", value: cable.cores,
            options: CORES.map((value) => ({ value, label: `${value}` }))
          })}
          ${inputField({ label: "Высота трассы, м", name: "routeHeight", value: inputNumber(cable.routeHeight, 2), type: "number", step: "0.05", min: "0", max: "10" })}
          ${inputField({ label: "Группа / цепь", name: "circuit", value: cable.circuit, placeholder: utp ? "Например, Слаботочка" : "Например, Свет" })}
        </div>
        ${utp ? `<p class="helper-copy">Для витой пары сечение и число жил не задаются: учитывается только марка Cat5e/Cat6/Cat6a и метраж.</p>` : ""}
      </section>

      <section class="inspector-section">
        <div class="section-heading"><h3>Подключение</h3></div>
        <div class="form-grid">
          ${selectField({
            label: "Начало", name: "startDeviceId", wide: true, value: cable.startDeviceId || "",
            options: [{ value: "", label: "Не подключено" }, ...devices],
            hint: metrics.startDevice ? `Спуск ${formatNumber(metrics.verticalStart)} м` : "Спуск не учитывается"
          })}
          ${selectField({
            label: "Конец", name: "endDeviceId", wide: true, value: cable.endDeviceId || "",
            options: [{ value: "", label: "Не подключено" }, ...devices],
            hint: metrics.endDevice ? `Спуск ${formatNumber(metrics.verticalEnd)} м` : "Спуск не учитывается"
          })}
        </div>
      </section>

      <section class="inspector-section">
        <div class="section-heading"><h3>Расчёт</h3><span class="section-note">Автоматически</span></div>
        <div class="metric-list">
          <div class="metric-row"><span>По плану</span><strong>${formatNumber(metrics.plan)} м</strong></div>
          <div class="metric-row"><span>Вертикальные спуски</span><strong>${formatNumber(metrics.vertical)} м</strong></div>
          <div class="metric-row"><span>На подключения (${metrics.connections} × ${formatNumber(project.settings.deviceSlack, 2)} м)</span><strong>${formatNumber(metrics.slack)} м</strong></div>
          <div class="metric-row"><span>Промежуточный итог</span><strong>${formatNumber(metrics.subtotal)} м</strong></div>
          <div class="metric-row"><span>Запас ${formatNumber(metrics.reservePercent, 0)}%</span><strong>${formatNumber(metrics.reserve)} м</strong></div>
          <div class="metric-row metric-total"><span>Итого</span><strong>${formatNumber(metrics.total)} м</strong></div>
        </div>
        <label class="switch-row switch-row-compact">
          <input type="checkbox" data-item-field="reserveCustom" ${reserveCustom ? "checked" : ""}>
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-copy">
            <strong>Свой запас для трассы</strong>
            <small>Иначе используется запас проекта: ${formatNumber(project.settings.reservePercent, 0)}%</small>
          </span>
        </label>
        <label class="field field-wide">
          <span>Запас, %</span>
          <input type="number" min="0" max="100" step="1" data-item-field="reservePercent" value="${inputNumber(metrics.reservePercent, 0)}" ${reserveCustom ? "" : "disabled"}>
        </label>
      </section>

      <section class="inspector-section">
        <div class="section-heading"><h3>Примечание</h3></div>
        <label class="field field-wide">
          <textarea data-item-field="note" rows="2" placeholder="Марка кабеля, способ прокладки">${escapeHtml(cable.note)}</textarea>
        </label>
        <p class="helper-copy">Двойной клик по трассе на плане добавляет точку изгиба. Точки перетаскиваются после выделения.</p>
      </section>

      <div class="inspector-actions">
        <button class="btn btn-soft" type="button" data-action="center-selection">${icon("location")} Найти</button>
        <button class="btn btn-ghost danger-text" type="button" data-action="delete-selection">${icon("trash")} Удалить трассу</button>
      </div>
    </div>
  `;
}

export function renderProperties(container, { project, floor, selection }) {
  if (!project || !floor) {
    container.innerHTML = `<p class="empty-note">Проект не загружен.</p>`;
    return;
  }
  let item = null;
  if (selection) {
    const collections = {
      device: floor.devices,
      wall: floor.walls,
      room: floor.rooms,
      opening: floor.openings || [],
      cable: floor.cables
    };
    item = collections[selection.type]?.find((entry) => entry.id === selection.id) || null;
  }

  if (!selection || !item) {
    container.innerHTML = projectMarkup(project, floor);
    return;
  }
  if (selection.type === "device") container.innerHTML = deviceMarkup(project, floor, item);
  else if (selection.type === "wall") container.innerHTML = wallMarkup(project, floor, item);
  else if (selection.type === "room") container.innerHTML = roomMarkup(project, floor, item);
  else if (selection.type === "opening") container.innerHTML = openingMarkup(project, floor, item);
  else if (selection.type === "cable") container.innerHTML = cableMarkup(project, floor, item);
  else container.innerHTML = projectMarkup(project, floor);
}

export function renderFloors(container, { project, activeFloorId }) {
  container.innerHTML = project.floors.map((floor) => {
    const cableCount = floor.cables.length;
    const deviceCount = floor.devices.length;
    return `
      <button class="floor-row ${floor.id === activeFloorId ? "active" : ""}" type="button" data-floor-id="${escapeHtml(floor.id)}">
        <span class="floor-index">${String(project.floors.indexOf(floor) + 1).padStart(2, "0")}</span>
        <span class="floor-copy">
          <strong>${escapeHtml(floor.name)}</strong>
          <small>${deviceCount} устр. · ${cableCount} ${pluralRu(cableCount, "трасса", "трассы", "трасс")}</small>
        </span>
        ${floor.id === activeFloorId ? `<span class="floor-dot"></span>` : ""}
      </button>
    `;
  }).join("") + `
    <button class="floor-add" type="button" data-action="add-floor">${icon("plus")} Ещё этаж</button>
  `;
}

export function renderProjectList(container, { projects, currentId }) {
  if (!projects.length) {
    container.innerHTML = `
      <div class="dialog-empty">
        ${icon("folder")}
        <h3>Пока нет сохранённых проектов</h3>
        <p>Создайте новый проект или откройте демонстрационный план.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = projects.map((project) => {
    const floors = Array.isArray(project.floors) ? project.floors : [];
    const devices = floors.reduce((sum, floor) => sum + (floor.devices?.length || 0), 0);
    const cables = floors.reduce((sum, floor) => sum + (floor.cables?.length || 0), 0);
    return `
      <article class="project-card ${project.id === currentId ? "current" : ""}">
        <div class="project-card-icon">${icon("bolt")}</div>
        <div class="project-card-body">
          <div class="project-card-head">
            <h3>${escapeHtml(project.name || "Без названия")}</h3>
            ${project.id === currentId ? `<span class="badge">Открыт</span>` : ""}
          </div>
          <p>${floors.length} эт. · ${devices} устр. · ${cables} ${pluralRu(cables, "трасса", "трассы", "трасс")}</p>
          <small>Изменён ${dateLabel(project.updatedAt)}</small>
        </div>
        <div class="project-card-actions">
          <button class="btn btn-primary btn-sm" type="button" data-action="open-project" data-project-id="${escapeHtml(project.id)}">Открыть</button>
          <button class="icon-btn danger-text" type="button" data-action="delete-project" data-project-id="${escapeHtml(project.id)}" aria-label="Удалить проект">${icon("trash")}</button>
        </div>
      </article>
    `;
  }).join("");
}

export function renderSummaryPlaceholder(container) {
  container.innerHTML = `
    <div class="summary-empty">
      ${icon("cable")}
      <h3>Смета появится здесь</h3>
      <p>Добавьте кабельные трассы — программа посчитает метраж и разделит его по сечениям.</p>
    </div>
  `;
}
