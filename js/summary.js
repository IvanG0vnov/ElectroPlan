// Правая вкладка «Смета»: итоги по проекту, сечениям и трассам этажа.

import { summarizeProject } from "./calc.js";
import { cableSpecLabel, cableColor } from "./model.js";
import { formatNumber, pluralRu } from "./geometry.js";
import { escapeHtml, icon } from "./icons.js";
import { panelStats } from "./panel.js";

function sectionRows(data) {
  const total = data.totals.total || 1;
  return data.bySection.map((item) => {
    const share = Math.max(0, Math.min(100, (item.total / total) * 100));
    return `
      <div class="section-row">
        <div class="section-row-head">
          <span class="section-name"><i class="color-dot" style="--dot:${item.color}"></i>${item.label}</span>
          <span class="section-meters">${formatNumber(item.total)} м</span>
        </div>
        <div class="bar-track"><span class="bar-fill" style="width:${share.toFixed(1)}%; --bar:${item.color}"></span></div>
        <div class="section-row-foot">
          <span>${item.routes} ${pluralRu(item.routes, "трасса", "трассы", "трасс")}</span>
          <span>${formatNumber(share, 0)}% метража</span>
        </div>
      </div>
    `;
  }).join("");
}

function specRows(data) {
  return data.bySpec.map((item) => `
    <div class="spec-row">
      <span class="spec-chip" style="--chip:${item.color}">${escapeHtml(item.label)}</span>
      <span class="spec-route-count">${item.routes} тр.</span>
      <strong>${formatNumber(item.total)} м</strong>
    </div>
  `).join("");
}

function floorRows(data) {
  return data.floors.map((entry) => `
    <div class="floor-total-row">
      <span>${escapeHtml(entry.floor.name)}</span>
      <span>${entry.summary.totals.routes} ${pluralRu(entry.summary.totals.routes, "трасса", "трассы", "трасс")}</span>
      <strong>${formatNumber(entry.summary.totals.total)} м</strong>
    </div>
  `).join("");
}

export function renderSummary(container, { project, floor, selection }) {
  const data = summarizeProject(project);
  const activeEntry = data.floors.find((entry) => entry.floor.id === floor.id) || data.floors[0];
  const activeRoutes = activeEntry?.summary.routes || [];
  const empty = data.totals.routes === 0;
  const utpTotal = data.bySpec
    .filter((item) => item.kind === "utp")
    .reduce((sum, item) => sum + item.total, 0);
  const powerTotal = Math.max(0, data.totals.total - utpTotal);
  const panel = panelStats(project);

  container.innerHTML = `
    <div class="summary-panel">
      <div class="summary-hero">
        <div class="summary-hero-glow"></div>
        <span class="summary-kicker">Кабель по проекту</span>
        <div class="summary-total">
          <strong>${formatNumber(data.totals.total)}</strong><span>м</span>
        </div>
        <p>${data.totals.routes} ${pluralRu(data.totals.routes, "трасса", "трассы", "трасс")} · ${data.floors.length} эт. · запас ${formatNumber(project.settings.reservePercent, 0)}%</p>
        <p class="summary-split">Силовой ${formatNumber(powerTotal)} м · UTP ${formatNumber(utpTotal)} м</p>
        <div class="summary-actions">
          <button class="btn btn-light btn-sm" type="button" data-action="export-csv">${icon("download")} CSV</button>
          <button class="btn btn-accent btn-sm" type="button" data-action="open-report">${icon("report")} Отчёт PDF</button>
          <button class="btn btn-light btn-sm" type="button" data-action="open-elevations">${icon("elevation")} Развёртки</button>
          <button class="btn btn-light btn-sm" type="button" data-action="open-panel">${icon("panel")} Щит</button>
        </div>
      </div>

      ${empty ? `
        <div class="summary-empty">
          ${icon("cable")}
          <h3>Пока нет трасс</h3>
          <p>Выберите инструмент «Кабель», начните у щита или устройства и добавьте изгибы. Метраж появится автоматически.</p>
        </div>
      ` : `
        <section class="summary-section">
          <div class="section-heading">
            <h3>По сечениям</h3>
            <span class="section-note">Итого</span>
          </div>
          <div class="section-bars">${sectionRows(data)}</div>
        </section>

        <section class="summary-section">
          <div class="section-heading">
            <h3>По маркам</h3>
            <span class="section-note">мм² и UTP</span>
          </div>
          <div class="spec-list">${specRows(data)}</div>
        </section>

        ${data.floors.length > 1 ? `
          <section class="summary-section">
            <div class="section-heading"><h3>По этажам</h3></div>
            <div class="floor-totals">${floorRows(data)}</div>
          </section>
        ` : ""}

        <section class="summary-section">
          <div class="section-heading">
            <h3>Щит</h3>
            <span class="section-note">${panel.used} / ${panel.capacity} мод.</span>
          </div>
          <div class="panel-summary-row">
            <div class="panel-summary-copy">
              <strong>${escapeHtml(panel.panel.name || "Щит")}</strong>
              <small>
                ${panel.moduleCount} ${pluralRu(panel.moduleCount, "аппарат", "аппарата", "аппаратов")} ·
                свободно ${panel.free} мод.
                ${panel.overflow ? ` · не хватает ${panel.overflow}` : ""}
              </small>
            </div>
            <button class="btn btn-soft btn-sm" type="button" data-action="open-panel">${icon("panel")} Открыть</button>
          </div>
        </section>

        <section class="summary-section">
          <div class="section-heading">
            <h3>Трассы · ${escapeHtml(floor.name)}</h3>
            <span class="section-note">${activeRoutes.length}</span>
          </div>
          <div class="route-list">
            ${activeRoutes.length ? activeRoutes.map((route) => {
              const color = cableColor(route.cable);
              const active = selection?.type === "cable" && selection.id === route.cable.id;
              return `
                <button type="button" class="route-row ${active ? "active" : ""}" data-action="select-cable" data-cable-id="${escapeHtml(route.cable.id)}">
                  <span class="color-dot" style="--dot:${color}"></span>
                  <span class="route-copy">
                    <strong>${escapeHtml(route.cable.name || "Трасса")}</strong>
                    <small>${escapeHtml(cableSpecLabel(route.cable))} · ${formatNumber(route.metrics.plan)} м по плану</small>
                  </span>
                  <span class="route-meters">${formatNumber(route.metrics.total)} м</span>
                </button>
              `;
            }).join("") : `<p class="empty-note">На этом этаже пока нет трасс.</p>`}
          </div>
        </section>

        <section class="summary-section method-section">
          <div class="section-heading"><h3>Как считается</h3></div>
          <p>Длина по плану + вертикальные спуски к устройствам + ${formatNumber(project.settings.deviceSlack, 2)} м на каждое подключение + запас ${formatNumber(project.settings.reservePercent, 0)}%.</p>
          <p class="muted">Сечения и автоматы программа не подбирает — их задаёте вы.</p>
        </section>
      `}

      <div class="summary-footer">
        <button class="btn btn-soft btn-block" type="button" data-action="export-json">${icon("download")} Сохранить проект в файл</button>
      </div>
    </div>
  `;
}
