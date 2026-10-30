// Отчёт для печати (PDF через печать браузера) и выгрузка сметы в CSV.

import { summarizeProject } from "./calc.js";
import { cableSpecLabel, getDeviceType, getSectionInfo } from "./model.js";
import { formatNumber, pluralRu } from "./geometry.js";
import { escapeHtml, icon } from "./icons.js";

export function sanitizeFilename(name) {
  return String(name || "ЭлектроПлан")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "ЭлектроПлан";
}

function reportDate() {
  return new Date().toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function routeRows(summary) {
  return summary.routes.map((route, index) => {
    const metrics = route.metrics;
    const color = getSectionInfo(metrics.section).color;
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>
          <strong>${escapeHtml(route.cable.name || "Трасса")}</strong>
          ${route.cable.note ? `<small>${escapeHtml(route.cable.note)}</small>` : ""}
        </td>
        <td><span class="report-spec-dot" style="background:${color}"></span>${escapeHtml(cableSpecLabel(route.cable))}</td>
        <td>${escapeHtml(route.cable.circuit || "—")}</td>
        <td>${escapeHtml(metrics.startDevice?.name || "—")} → ${escapeHtml(metrics.endDevice?.name || "—")}</td>
        <td class="num">${formatNumber(metrics.plan)}</td>
        <td class="num">${formatNumber(metrics.vertical)}</td>
        <td class="num strong">${formatNumber(metrics.total)}</td>
      </tr>
    `;
  }).join("");
}

function floorSection(entry, index) {
  const { floor, summary } = entry;
  return `
    <section class="report-floor" ${index > 0 ? 'style="break-before:page;"' : ""}>
      <div class="report-section-title">
        <h2>${escapeHtml(floor.name)}</h2>
        <span>${summary.totals.routes} ${pluralRu(summary.totals.routes, "трасса", "трассы", "трасс")} · ${formatNumber(summary.totals.total)} м</span>
      </div>
      ${summary.routes.length ? `
        <table class="report-table">
          <thead>
            <tr>
              <th class="num">№</th>
              <th>Трасса</th>
              <th>Кабель</th>
              <th>Цепь</th>
              <th>Подключение</th>
              <th class="num">По плану, м</th>
              <th class="num">Спуски, м</th>
              <th class="num">Итого, м</th>
            </tr>
          </thead>
          <tbody>${routeRows(summary)}</tbody>
        </table>
      ` : `<p class="report-empty">На этаже нет кабельных трасс.</p>`}
    </section>
  `;
}

export function buildReportMarkup(project) {
  const data = summarizeProject(project);
  const sections = data.bySection.map((item) => {
    const info = getSectionInfo(item.section);
    return `
      <tr>
        <td><span class="report-spec-dot" style="background:${info.color}"></span>${escapeHtml(info.label)}</td>
        <td class="num">${item.routes}</td>
        <td class="num">${formatNumber(item.plan)}</td>
        <td class="num">${formatNumber(item.vertical + item.slack)}</td>
        <td class="num">${formatNumber(item.reserve)}</td>
        <td class="num strong">${formatNumber(item.total)}</td>
      </tr>
    `;
  }).join("");

  const specs = data.bySpec.map((item) => {
    const info = getSectionInfo(item.section);
    return `
      <tr>
        <td><span class="report-spec-dot" style="background:${info.color}"></span>${item.cores}×${String(item.section).replace(".", ",")} мм²</td>
        <td class="num">${item.routes}</td>
        <td class="num strong">${formatNumber(item.total)}</td>
      </tr>
    `;
  }).join("");

  return `
    <article class="report-sheet">
      <header class="report-header">
        <div class="report-brand">
          <span class="report-logo">${icon("bolt")}</span>
          <span>ЭлектроПлан</span>
        </div>
        <div class="report-doc-meta">
          <span>Смета кабеля</span>
          <strong>${reportDate()}</strong>
        </div>
      </header>

      <div class="report-title-block">
        <span class="report-eyebrow">Электрический план · расчёт метража</span>
        <h1>${escapeHtml(project.name)}</h1>
        <p>${project.floors.length} ${pluralRu(project.floors.length, "этаж", "этажа", "этажей")} · ${data.totals.routes} ${pluralRu(data.totals.routes, "кабельная трасса", "кабельные трассы", "кабельных трасс")} · сечения заданы вручную</p>
      </div>

      <div class="report-cards">
        <div class="report-card highlight">
          <span>Всего кабеля</span>
          <strong>${formatNumber(data.totals.total)} <small>м</small></strong>
        </div>
        <div class="report-card">
          <span>По плану</span>
          <strong>${formatNumber(data.totals.plan)} <small>м</small></strong>
        </div>
        <div class="report-card">
          <span>Спуски и подключения</span>
          <strong>${formatNumber(data.totals.vertical + data.totals.slack)} <small>м</small></strong>
        </div>
        <div class="report-card">
          <span>Запас ${formatNumber(project.settings.reservePercent, 0)}%</span>
          <strong>${formatNumber(data.totals.reserve)} <small>м</small></strong>
        </div>
      </div>

      <section class="report-section">
        <div class="report-section-title">
          <h2>Итоги по сечениям</h2>
          <span>Основной результат</span>
        </div>
        <table class="report-table report-table-compact">
          <thead>
            <tr>
              <th>Сечение</th>
              <th class="num">Трасс</th>
              <th class="num">По плану, м</th>
              <th class="num">Спуски, м</th>
              <th class="num">Запас, м</th>
              <th class="num">Итого, м</th>
            </tr>
          </thead>
          <tbody>${sections || `<tr><td colspan="6" class="report-empty">Нет данных</td></tr>`}</tbody>
          <tfoot>
            <tr>
              <td>Всего</td>
              <td class="num">${data.totals.routes}</td>
              <td class="num">${formatNumber(data.totals.plan)}</td>
              <td class="num">${formatNumber(data.totals.vertical + data.totals.slack)}</td>
              <td class="num">${formatNumber(data.totals.reserve)}</td>
              <td class="num strong">${formatNumber(data.totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section class="report-section">
        <div class="report-section-title">
          <h2>Спецификация по маркам</h2>
          <span>Жилы × сечение</span>
        </div>
        <table class="report-table report-table-compact">
          <thead>
            <tr><th>Марка</th><th class="num">Трасс</th><th class="num">Длина, м</th></tr>
          </thead>
          <tbody>${specs || `<tr><td colspan="3" class="report-empty">Нет данных</td></tr>`}</tbody>
        </table>
      </section>

      ${data.floors.map(floorSection).join("")}

      <section class="report-method">
        <h2>Методика расчёта</h2>
        <p>Длина кабеля = длина трассы по плану + вертикальные спуски от высоты трассы до высоты установки подключённых устройств + ${formatNumber(project.settings.deviceSlack, 2)} м на каждое подключение + запас ${formatNumber(project.settings.reservePercent, 0)}% (если для трассы не задан свой запас).</p>
        <p>Программа не подбирает сечение кабеля и автоматические выключатели. Все сечения указаны проектировщиком. Перед закупкой рекомендуется уточнить длины по месту с учётом способа прокладки и запасов на разделку.</p>
      </section>

      <footer class="report-footer">
        <span>Сформировано в ЭлектроПлан · ${reportDate()}</span>
        <span>${escapeHtml(project.name)}</span>
      </footer>
    </article>
  `;
}

export function renderReport(container, project) {
  container.innerHTML = buildReportMarkup(project);
}

export function buildCsv(project) {
  const data = summarizeProject(project);
  const quote = (value) => {
    const text = String(value ?? "");
    return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [];
  rows.push(["Этаж", "Трасса", "Сечение, мм²", "Жил", "Марка", "Цепь", "Начало", "Конец", "По плану, м", "Спуски, м", "Подключения, м", "Запас, %", "Итого, м", "Примечание"]);
  for (const entry of data.floors) {
    for (const route of entry.summary.routes) {
      const metrics = route.metrics;
      rows.push([
        entry.floor.name,
        route.cable.name || "Трасса",
        String(metrics.section).replace(".", ","),
        metrics.cores,
        cableSpecLabel(route.cable),
        route.cable.circuit || "",
        metrics.startDevice?.name || "",
        metrics.endDevice?.name || "",
        formatNumber(metrics.plan),
        formatNumber(metrics.vertical),
        formatNumber(metrics.slack),
        formatNumber(metrics.reservePercent, 0),
        formatNumber(metrics.total),
        route.cable.note || ""
      ]);
    }
  }

  rows.push([]);
  rows.push(["ИТОГО ПО СЕЧЕНИЯМ"]);
  rows.push(["Сечение", "Трасс", "По плану, м", "Итого, м"]);
  for (const item of data.bySection) {
    rows.push([
      getSectionInfo(item.section).label,
      item.routes,
      formatNumber(item.plan),
      formatNumber(item.total)
    ]);
  }
  rows.push([]);
  rows.push(["ИТОГО ПО МАРКАМ"]);
  rows.push(["Марка", "Трасс", "Итого, м"]);
  for (const item of data.bySpec) {
    rows.push([
      `${item.cores}×${String(item.section).replace(".", ",")}`,
      item.routes,
      formatNumber(item.total)
    ]);
  }
  rows.push([]);
  rows.push(["ВСЕГО", "", "", "", "", "", "", "", formatNumber(data.totals.plan), formatNumber(data.totals.vertical + data.totals.slack), "", "", formatNumber(data.totals.total), ""]);

  return `\uFEFF${rows.map((row) => row.map(quote).join(";")).join("\r\n")}`;
}

export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(project) {
  downloadText(`${sanitizeFilename(project.name)} — смета.csv`, buildCsv(project), "text/csv;charset=utf-8");
}

export function deviceSummary(floor) {
  const map = new Map();
  for (const device of floor.devices) {
    const type = getDeviceType(device.type).label;
    map.set(type, (map.get(type) || 0) + 1);
  }
  return map;
}
