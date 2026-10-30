// Локальное хранение проектов: IndexedDB с запасным вариантом в localStorage.
// Сервер не нужен, все данные остаются на устройстве пользователя.

const DB_NAME = "electroplan-db";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const META_STORE = "meta";
const FALLBACK_PREFIX = "electroplan:";
const FALLBACK_PROJECTS_KEY = `${FALLBACK_PREFIX}projects`;
const FALLBACK_META_KEY = `${FALLBACK_PREFIX}meta`;

let databasePromise = null;
let indexedDbUnavailable = false;

function hasIndexedDb() {
  return !indexedDbUnavailable && typeof indexedDB !== "undefined";
}

function openDatabase() {
  if (!hasIndexedDb()) return Promise.reject(new Error("IndexedDB недоступна"));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      indexedDbUnavailable = true;
      reject(request.error || new Error("Не удалось открыть базу данных"));
    };
    request.onblocked = () => reject(new Error("База данных занята другой вкладкой"));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Ошибка транзакции"));
    transaction.onabort = () => reject(transaction.error || new Error("Транзакция отменена"));
  });
}

function readFallbackProjects() {
  try {
    const raw = localStorage.getItem(FALLBACK_PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFallbackProjects(projects) {
  localStorage.setItem(FALLBACK_PROJECTS_KEY, JSON.stringify(projects));
}

function readFallbackMeta() {
  try {
    const raw = localStorage.getItem(FALLBACK_META_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFallbackMeta(meta) {
  localStorage.setItem(FALLBACK_META_KEY, JSON.stringify(meta));
}

export async function saveProject(project) {
  const record = project;
  if (hasIndexedDb()) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).put(record);
      await transactionDone(transaction);
      return record;
    } catch (error) {
      console.warn("IndexedDB недоступна, сохраняю в localStorage", error);
      indexedDbUnavailable = true;
    }
  }

  const projects = readFallbackProjects();
  projects[record.id] = record;
  writeFallbackProjects(projects);
  return record;
}

export async function listProjects() {
  if (hasIndexedDb()) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(PROJECT_STORE, "readonly");
      const request = transaction.objectStore(PROJECT_STORE).getAll();
      const projects = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      return projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    } catch (error) {
      console.warn("Не удалось прочитать IndexedDB", error);
      indexedDbUnavailable = true;
    }
  }

  return Object.values(readFallbackProjects())
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function loadProject(projectId) {
  if (!projectId) return null;
  if (hasIndexedDb()) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(PROJECT_STORE, "readonly");
      const request = transaction.objectStore(PROJECT_STORE).get(projectId);
      const project = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      if (project) return project;
    } catch (error) {
      console.warn("Не удалось загрузить проект из IndexedDB", error);
      indexedDbUnavailable = true;
    }
  }

  return readFallbackProjects()[projectId] || null;
}

export async function deleteProject(projectId) {
  if (hasIndexedDb()) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).delete(projectId);
      await transactionDone(transaction);
      return;
    } catch (error) {
      console.warn("Не удалось удалить проект из IndexedDB", error);
      indexedDbUnavailable = true;
    }
  }

  const projects = readFallbackProjects();
  delete projects[projectId];
  writeFallbackProjects(projects);
}

export async function setMeta(key, value) {
  if (hasIndexedDb()) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(META_STORE, "readwrite");
      transaction.objectStore(META_STORE).put({ key, value });
      await transactionDone(transaction);
      return;
    } catch (error) {
      console.warn("Не удалось сохранить настройку", error);
      indexedDbUnavailable = true;
    }
  }

  const meta = readFallbackMeta();
  meta[key] = value;
  writeFallbackMeta(meta);
}

export async function getMeta(key, fallback = null) {
  if (hasIndexedDb()) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(META_STORE, "readonly");
      const request = transaction.objectStore(META_STORE).get(key);
      const record = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      if (record) return record.value;
    } catch (error) {
      console.warn("Не удалось прочитать настройку", error);
      indexedDbUnavailable = true;
    }
  }

  const meta = readFallbackMeta();
  return Object.prototype.hasOwnProperty.call(meta, key) ? meta[key] : fallback;
}

export async function getLastProjectId() {
  return getMeta("lastProjectId", null);
}

export async function setLastProjectId(projectId) {
  return setMeta("lastProjectId", projectId);
}

export function storageModeLabel() {
  return hasIndexedDb() ? "IndexedDB" : "localStorage";
}
