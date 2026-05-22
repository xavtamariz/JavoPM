import { DEFAULT_COLUMNS, normalizeTask, sortByOrder } from "./models.js?v=20260522-modal-close-space";

const DB_NAME = "JavoPM";
const DB_VERSION = 1;
const STORES = {
  columns: "columns",
  tasks: "tasks",
  meta: "meta"
};

let dbPromise;

export function initDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORES.columns)) {
          db.createObjectStore(STORES.columns, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(STORES.tasks)) {
          const taskStore = db.createObjectStore(STORES.tasks, { keyPath: "id" });
          taskStore.createIndex("columnId", "columnId", { unique: false });
          taskStore.createIndex("order", "order", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

export async function resetSeedDataIfNeeded() {
  const db = await initDB();
  const seeded = await getValue(db, STORES.meta, "seeded");
  const existingColumns = await getAllFromStore(db, STORES.columns);

  if (!seeded || existingColumns.length === 0) {
    await saveColumns(DEFAULT_COLUMNS);
    await setValue(db, STORES.meta, { key: "seeded", value: true });
  }
}

export async function getColumns() {
  const db = await initDB();
  const columns = await getAllFromStore(db, STORES.columns);
  return sortByOrder(columns);
}

export async function saveColumns(columns) {
  const db = await initDB();
  await writeMany(db, STORES.columns, columns);
}

export async function getTasks() {
  const db = await initDB();
  const tasks = await getAllFromStore(db, STORES.tasks);
  return sortByOrder(tasks.map(normalizeTask));
}

export async function getTask(id) {
  const db = await initDB();
  const task = await getValue(db, STORES.tasks, id);
  return task ? normalizeTask(task) : null;
}

export async function createTask(task) {
  const normalizedTask = normalizeTask(task);
  const db = await initDB();
  await putValue(db, STORES.tasks, normalizedTask);
  return normalizedTask;
}

export async function updateTask(task) {
  const normalizedTask = normalizeTask(task);
  const db = await initDB();
  await putValue(db, STORES.tasks, normalizedTask);
  return normalizedTask;
}

export async function deleteTask(id) {
  const db = await initDB();
  await deleteValue(db, STORES.tasks, id);
}

export async function saveTaskOrder(tasks) {
  const orderedTasks = tasks.map(normalizeTask);
  const db = await initDB();
  await writeMany(db, STORES.tasks, orderedTasks);
  return orderedTasks;
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getValue(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function setValue(db, storeName, value) {
  return putValue(db, storeName, value);
}

function putValue(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function deleteValue(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function writeMany(db, storeName, values) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    values.forEach((value) => store.put(value));
    transaction.oncomplete = () => resolve(values);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
