// Расчёт длин кабеля. Подбор сечения и автоматов не выполняется:
// сечение задаёт пользователь, программа только считает метраж.

import { polylineLength } from "./geometry.js";

export function cableMetrics(cable, floor, settings = {}) {
  const plan = polylineLength(cable.points);
  const startDevice = cable.startDeviceId
    ? floor.devices.find((device) => device.id === cable.startDeviceId) || null
    : null;
  const endDevice = cable.endDeviceId
    ? floor.devices.find((device) => device.id === cable.endDeviceId) || null
    : null;

  const routeHeight = Number(cable.routeHeight ?? settings.defaultRouteHeight ?? 2.5);
  const verticalStart = startDevice
    ? Math.abs(routeHeight - Number(startDevice.mountHeight ?? 0.3))
    : 0;
  const verticalEnd = endDevice
    ? Math.abs(routeHeight - Number(endDevice.mountHeight ?? 0.3))
    : 0;
  const vertical = verticalStart + verticalEnd;

  const connections = (startDevice ? 1 : 0) + (endDevice ? 1 : 0);
  const slackPerConnection = Number(settings.deviceSlack ?? 0.2);
  const slack = connections * slackPerConnection;

  const rawReserve = cable.reservePercent;
  const hasCustomReserve =
    rawReserve !== null && rawReserve !== undefined && String(rawReserve).trim() !== "";
  const customReserve = Number(rawReserve);
  const reservePercent =
    hasCustomReserve && Number.isFinite(customReserve)
      ? customReserve
      : Number(settings.reservePercent ?? 10);

  const subtotal = plan + vertical + slack;
  const reserve = subtotal * (reservePercent / 100);
  const total = subtotal + reserve;

  const section = Number(cable.section ?? settings.defaultSection ?? 2.5);
  const cores = Number(cable.cores ?? settings.defaultCores ?? 3);

  return {
    plan,
    vertical,
    verticalStart,
    verticalEnd,
    connections,
    slack,
    subtotal,
    reservePercent,
    reserve,
    total,
    section,
    cores,
    startDevice,
    endDevice
  };
}

export function summarizeProject(project) {
  const floors = (project.floors || []).map((floor) => ({
    floor,
    summary: summarize(project, floor)
  }));

  const bySection = new Map();
  const bySpec = new Map();
  const byCircuit = new Map();
  const totals = {
    routes: 0, plan: 0, vertical: 0, slack: 0, subtotal: 0, reserve: 0, total: 0
  };

  const add = (map, key, metrics) => {
    if (!map.has(key)) {
      map.set(key, {
        key,
        routes: 0, plan: 0, vertical: 0, slack: 0, subtotal: 0, reserve: 0, total: 0
      });
    }
    const item = map.get(key);
    item.routes += 1;
    item.plan += metrics.plan;
    item.vertical += metrics.vertical;
    item.slack += metrics.slack;
    item.subtotal += metrics.subtotal;
    item.reserve += metrics.reserve;
    item.total += metrics.total;
  };

  for (const entry of floors) {
    for (const route of entry.summary.routes) {
      const { metrics, cable } = route;
      add(bySection, metrics.section, metrics);
      add(bySpec, `${metrics.section}|${metrics.cores}`, metrics);
      add(byCircuit, String(cable.circuit || "").trim() || "Без цепи", metrics);
      totals.routes += 1;
      totals.plan += metrics.plan;
      totals.vertical += metrics.vertical;
      totals.slack += metrics.slack;
      totals.subtotal += metrics.subtotal;
      totals.reserve += metrics.reserve;
      totals.total += metrics.total;
    }
  }

  for (const item of bySection.values()) item.section = Number(item.key);
  for (const item of bySpec.values()) {
    const [section, cores] = item.key.split("|").map(Number);
    item.section = section;
    item.cores = cores;
  }
  for (const item of byCircuit.values()) item.circuit = item.key;

  return {
    floors,
    totals,
    bySection: [...bySection.values()].sort((a, b) => a.section - b.section),
    bySpec: [...bySpec.values()].sort((a, b) => a.section - b.section || a.cores - b.cores),
    byCircuit: [...byCircuit.values()].sort((a, b) => a.circuit.localeCompare(b.circuit, "ru"))
  };
}

export function summarize(project, floor) {
  const settings = project.settings || {};
  const routes = (floor.cables || []).map((cable) => ({
    cable,
    metrics: cableMetrics(cable, floor, settings)
  }));

  const bySection = new Map();
  const bySpec = new Map();
  const byCircuit = new Map();
  const totals = {
    routes: 0, plan: 0, vertical: 0, slack: 0, subtotal: 0, reserve: 0, total: 0
  };

  const add = (map, key, route) => {
    if (!map.has(key)) {
      map.set(key, {
        key,
        routes: 0,
        plan: 0,
        vertical: 0,
        slack: 0,
        subtotal: 0,
        reserve: 0,
        total: 0
      });
    }
    const item = map.get(key);
    item.routes += 1;
    item.plan += route.metrics.plan;
    item.vertical += route.metrics.vertical;
    item.slack += route.metrics.slack;
    item.subtotal += route.metrics.subtotal;
    item.reserve += route.metrics.reserve;
    item.total += route.metrics.total;
  };

  for (const route of routes) {
    const { metrics, cable } = route;
    add(bySection, metrics.section, route);
    add(bySpec, `${metrics.section}|${metrics.cores}`, route);
    const circuit = String(cable.circuit || "").trim() || "Без цепи";
    add(byCircuit, circuit, route);

    totals.routes += 1;
    totals.plan += metrics.plan;
    totals.vertical += metrics.vertical;
    totals.slack += metrics.slack;
    totals.subtotal += metrics.subtotal;
    totals.reserve += metrics.reserve;
    totals.total += metrics.total;
  }

  for (const item of bySection.values()) {
    item.section = Number(item.key);
  }
  for (const item of bySpec.values()) {
    const [section, cores] = item.key.split("|").map(Number);
    item.section = section;
    item.cores = cores;
  }
  for (const item of byCircuit.values()) {
    item.circuit = item.key;
  }

  return {
    routes,
    totals,
    bySection: [...bySection.values()].sort((a, b) => a.section - b.section),
    bySpec: [...bySpec.values()].sort((a, b) => a.section - b.section || a.cores - b.cores),
    byCircuit: [...byCircuit.values()].sort((a, b) => a.circuit.localeCompare(b.circuit, "ru"))
  };
}
