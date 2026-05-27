import {
  DEFAULT_COLUMNS,
  METRICS_COLUMN_ID,
  TASK_LEADERBOARD_CHART_TYPE,
  TASK_PROGRESS_CHART_TYPE,
  TASK_STAGE_BY_MEMBER_CHART_TYPE,
  createChartCardModel,
  createTaskEventModel,
  normalizeChartCard,
  normalizeColumn,
  normalizeProject,
  normalizeTeamMember,
  normalizeTaskEvent,
  normalizeTask,
  sortByOrder
} from "./models.js?v=20260527-project-edit-delete";

const DB_NAME = "JavoPM";
const DB_VERSION = 8;
const STORES = {
  chartCards: "chartCards",
  chatAttachments: "chatAttachments",
  chatConversations: "chatConversations",
  chatMessages: "chatMessages",
  chatParticipants: "chatParticipants",
  columns: "columns",
  projects: "projects",
  teamMembers: "teamMembers",
  taskEvents: "taskEvents",
  tasks: "tasks",
  pendingMutations: "pendingMutations",
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

        if (!db.objectStoreNames.contains(STORES.projects)) {
          db.createObjectStore(STORES.projects, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(STORES.teamMembers)) {
          db.createObjectStore(STORES.teamMembers, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(STORES.chartCards)) {
          const chartCardStore = db.createObjectStore(STORES.chartCards, { keyPath: "id" });
          chartCardStore.createIndex("columnId", "columnId", { unique: false });
          chartCardStore.createIndex("order", "order", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.taskEvents)) {
          const taskEventStore = db.createObjectStore(STORES.taskEvents, { keyPath: "id" });
          taskEventStore.createIndex("taskId", "taskId", { unique: false });
          taskEventStore.createIndex("columnId", "columnId", { unique: false });
          taskEventStore.createIndex("createdAt", "createdAt", { unique: false });
          taskEventStore.createIndex("occurredAt", "occurredAt", { unique: false });
        } else {
          const taskEventStore = request.transaction.objectStore(STORES.taskEvents);
          if (!taskEventStore.indexNames.contains("occurredAt")) {
            taskEventStore.createIndex("occurredAt", "occurredAt", { unique: false });
          }
        }

        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains(STORES.pendingMutations)) {
          const pendingMutationStore = db.createObjectStore(STORES.pendingMutations, {
            keyPath: "mutationId"
          });
          pendingMutationStore.createIndex("status", "status", { unique: false });
          pendingMutationStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.chatConversations)) {
          const chatConversationStore = db.createObjectStore(STORES.chatConversations, { keyPath: "id" });
          chatConversationStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.chatParticipants)) {
          const chatParticipantStore = db.createObjectStore(STORES.chatParticipants, { keyPath: "id" });
          chatParticipantStore.createIndex("conversationId", "conversationId", { unique: false });
          chatParticipantStore.createIndex("userId", "userId", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.chatMessages)) {
          const chatMessageStore = db.createObjectStore(STORES.chatMessages, { keyPath: "id" });
          chatMessageStore.createIndex("conversationId", "conversationId", { unique: false });
          chatMessageStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.chatAttachments)) {
          const chatAttachmentStore = db.createObjectStore(STORES.chatAttachments, { keyPath: "id" });
          chatAttachmentStore.createIndex("messageId", "messageId", { unique: false });
          chatAttachmentStore.createIndex("conversationId", "conversationId", { unique: false });
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
  } else {
    await ensureDefaultColumns(existingColumns);
  }

  await ensureDefaultChartCards();
}

export async function getColumns() {
  const db = await initDB();
  const columns = await getAllFromStore(db, STORES.columns);
  return sortByOrder(columns.map(normalizeColumn));
}

export async function saveColumns(columns) {
  const db = await initDB();
  await writeMany(db, STORES.columns, columns.map(normalizeColumn));
}

export async function getProjects() {
  const db = await initDB();
  const projects = await getAllFromStore(db, STORES.projects);
  return sortByOrder(projects.map(normalizeProject));
}

export async function createProject(project) {
  const db = await initDB();
  const existingProjects = await getProjects();
  const normalizedProject = normalizeProject(project, existingProjects.length);
  await putValue(db, STORES.projects, normalizedProject);
  return normalizedProject;
}

export async function saveProjects(projects) {
  const db = await initDB();
  const normalizedProjects = projects.map(normalizeProject);
  await replaceStore(db, STORES.projects, normalizedProjects);
  return sortByOrder(normalizedProjects);
}

export async function getTeamMembers() {
  const db = await initDB();
  const teamMembers = await getAllFromStore(db, STORES.teamMembers);
  return sortByOrder(teamMembers.map(normalizeTeamMember).filter((teamMember) => teamMember.name));
}

export async function createTeamMember(teamMember) {
  const db = await initDB();
  const existingTeamMembers = await getTeamMembers();
  const normalizedTeamMember = normalizeTeamMember(teamMember, existingTeamMembers.length);
  await putValue(db, STORES.teamMembers, normalizedTeamMember);
  return normalizedTeamMember;
}

export async function deleteTeamMember(id) {
  const db = await initDB();
  await deleteValue(db, STORES.teamMembers, id);
}

export async function saveTeamMembers(teamMembers) {
  const db = await initDB();
  const normalizedTeamMembers = teamMembers
    .map(normalizeTeamMember)
    .filter((teamMember) => teamMember.name);
  await writeMany(db, STORES.teamMembers, normalizedTeamMembers);
  return sortByOrder(normalizedTeamMembers);
}

export async function getChartCards() {
  const db = await initDB();
  const chartCards = await getAllFromStore(db, STORES.chartCards);
  return sortByOrder(chartCards.map(normalizeChartCard));
}

export async function createChartCard(chartCard) {
  const db = await initDB();
  const existingChartCards = await getChartCards();
  const normalizedChartCard = normalizeChartCard(chartCard, existingChartCards.length);
  await putValue(db, STORES.chartCards, normalizedChartCard);
  return normalizedChartCard;
}

export async function updateChartCard(chartCard) {
  const normalizedChartCard = normalizeChartCard(chartCard);
  const db = await initDB();
  await putValue(db, STORES.chartCards, normalizedChartCard);
  return normalizedChartCard;
}

export async function saveChartCards(chartCards) {
  const normalizedChartCards = chartCards.map(normalizeChartCard);
  const db = await initDB();
  await writeMany(db, STORES.chartCards, normalizedChartCards);
  return sortByOrder(normalizedChartCards);
}

export async function getTaskEvents() {
  const db = await initDB();
  const taskEvents = await getAllFromStore(db, STORES.taskEvents);
  return taskEvents.map(normalizeTaskEvent).filter((event) => event.taskId && event.columnId);
}

export async function createTaskEvent(taskEvent) {
  const normalizedTaskEvent = normalizeTaskEvent(createTaskEventModel(taskEvent));
  const db = await initDB();
  await putValue(db, STORES.taskEvents, normalizedTaskEvent);
  return normalizedTaskEvent;
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

export async function getMetaValue(key) {
  const db = await initDB();
  const record = await getValue(db, STORES.meta, key);
  return record?.value;
}

export async function setMetaValue(key, value) {
  const db = await initDB();
  await setValue(db, STORES.meta, { key, value });
  return value;
}

export async function getCloudMeta() {
  return (await getMetaValue("cloudMeta")) || null;
}

export async function saveCloudMeta(meta) {
  const nextMeta = {
    ...(await getCloudMeta()),
    ...meta,
    updatedAt: new Date().toISOString()
  };
  await setMetaValue("cloudMeta", nextMeta);
  return nextMeta;
}

export async function saveAnonymousBackup(snapshot) {
  const backup = {
    createdAt: new Date().toISOString(),
    snapshot
  };
  await setMetaValue("anonymousBackup", backup);
  return backup;
}

export async function addPendingMutation(mutation) {
  const db = await initDB();
  const normalizedMutation = {
    ...mutation,
    status: mutation.status || "pending",
    createdAt: mutation.createdAt || new Date().toISOString()
  };
  await putValue(db, STORES.pendingMutations, normalizedMutation);
  return normalizedMutation;
}

export async function getPendingMutations() {
  const db = await initDB();
  const mutations = await getAllFromStore(db, STORES.pendingMutations);
  return mutations.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function updatePendingMutation(mutation) {
  const db = await initDB();
  const updatedMutation = {
    ...mutation,
    updatedAt: new Date().toISOString()
  };
  await putValue(db, STORES.pendingMutations, updatedMutation);
  return updatedMutation;
}

export async function deletePendingMutation(mutationId) {
  const db = await initDB();
  await deleteValue(db, STORES.pendingMutations, mutationId);
}

export async function clearPendingMutations() {
  const db = await initDB();
  await replaceStore(db, STORES.pendingMutations, []);
}

export async function getCachedChatSnapshot() {
  const db = await initDB();
  const [conversations, participants, messages, attachments] = await Promise.all([
    getAllFromStore(db, STORES.chatConversations),
    getAllFromStore(db, STORES.chatParticipants),
    getAllFromStore(db, STORES.chatMessages),
    getAllFromStore(db, STORES.chatAttachments)
  ]);

  return {
    attachments,
    conversations,
    directory: [],
    messages,
    participants
  };
}

export async function importChatSnapshot(snapshot = {}) {
  const db = await initDB();
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations : [];
  const participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const attachments = Array.isArray(snapshot.attachments) ? snapshot.attachments : [];

  await Promise.all([
    replaceStore(db, STORES.chatConversations, conversations),
    replaceStore(db, STORES.chatParticipants, participants),
    replaceStore(db, STORES.chatMessages, messages),
    replaceStore(db, STORES.chatAttachments, attachments)
  ]);
}

export async function clearChatSnapshot() {
  const db = await initDB();
  await Promise.all([
    replaceStore(db, STORES.chatConversations, []),
    replaceStore(db, STORES.chatParticipants, []),
    replaceStore(db, STORES.chatMessages, []),
    replaceStore(db, STORES.chatAttachments, [])
  ]);
}

export async function exportBoardSnapshot() {
  const [columns, tasks, projects, teamMembers, chartCards, taskEvents] = await Promise.all([
    getColumns(),
    getTasks(),
    getProjects(),
    getTeamMembers(),
    getChartCards(),
    getTaskEvents()
  ]);

  return {
    exportedAt: new Date().toISOString(),
    columns,
    tasks,
    projects,
    teamMembers,
    chartCards,
    taskEvents
  };
}

export async function importBoardSnapshot(snapshot = {}) {
  const db = await initDB();
  const columns = Array.isArray(snapshot.columns) && snapshot.columns.length > 0
    ? snapshot.columns
    : DEFAULT_COLUMNS;
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  const teamMembers = Array.isArray(snapshot.teamMembers) ? snapshot.teamMembers : [];
  const chartCards = Array.isArray(snapshot.chartCards) ? snapshot.chartCards : [];
  const taskEvents = Array.isArray(snapshot.taskEvents) ? snapshot.taskEvents : [];

  await Promise.all([
    replaceStore(db, STORES.columns, columns.map(normalizeColumn)),
    replaceStore(db, STORES.tasks, tasks.map(normalizeTask)),
    replaceStore(db, STORES.projects, projects.map(normalizeProject)),
    replaceStore(db, STORES.teamMembers, teamMembers.map(normalizeTeamMember).filter((item) => item.name)),
    replaceStore(db, STORES.chartCards, chartCards.map(normalizeChartCard)),
    replaceStore(db, STORES.taskEvents, taskEvents.map(normalizeTaskEvent))
  ]);

  await setValue(db, STORES.meta, { key: "seeded", value: true });
}

export async function resetLocalBoardAfterLogout() {
  const db = await initDB();
  const clientIdRecord = await getValue(db, STORES.meta, "clientId");
  const metaRecords = [{ key: "seeded", value: true }];

  if (clientIdRecord?.value) {
    metaRecords.push({ key: "clientId", value: clientIdRecord.value });
  }

  await Promise.all([
    replaceStore(db, STORES.columns, DEFAULT_COLUMNS.map(normalizeColumn)),
    replaceStore(db, STORES.tasks, []),
    replaceStore(db, STORES.projects, []),
    replaceStore(db, STORES.teamMembers, []),
    replaceStore(db, STORES.chartCards, createDefaultChartCards().map(normalizeChartCard)),
    replaceStore(db, STORES.chatConversations, []),
    replaceStore(db, STORES.chatParticipants, []),
    replaceStore(db, STORES.chatMessages, []),
    replaceStore(db, STORES.chatAttachments, []),
    replaceStore(db, STORES.taskEvents, []),
    replaceStore(db, STORES.pendingMutations, []),
    replaceStore(db, STORES.meta, metaRecords)
  ]);
}

async function ensureDefaultColumns(existingColumns) {
  const byId = new Map(existingColumns.map((column) => [column.id, column]));
  const nextColumns = DEFAULT_COLUMNS.map((defaultColumn, index) => {
    const existingColumn = byId.get(defaultColumn.id) || {};
    return normalizeColumn(
      {
        ...existingColumn,
        ...defaultColumn,
        allowTaskCreation: defaultColumn.allowTaskCreation ?? existingColumn.allowTaskCreation
      },
      index
    );
  });
  const hasMissingColumns = DEFAULT_COLUMNS.some((column) => !byId.has(column.id));
  const hasColumnUpdates = nextColumns.some((column, index) => {
    const currentColumn = existingColumns.find((item) => item.id === column.id);
    return (
      !currentColumn ||
      currentColumn.title !== column.title ||
      Number(currentColumn.order) !== column.order ||
      currentColumn.allowTaskCreation !== column.allowTaskCreation ||
      index !== column.order
    );
  });

  if (hasMissingColumns || hasColumnUpdates) {
    await saveColumns(nextColumns);
  }
}

function createDefaultChartCards() {
  return [
    createChartCardModel({
      chartType: TASK_PROGRESS_CHART_TYPE,
      order: 0,
      title: "Tareas por columna"
    }),
    createChartCardModel({
      chartType: TASK_STAGE_BY_MEMBER_CHART_TYPE,
      order: 1,
      title: "Tareas por etapa"
    }),
    createChartCardModel({
      chartType: TASK_LEADERBOARD_CHART_TYPE,
      order: 2,
      title: "Leaderboard"
    })
  ];
}

async function ensureDefaultChartCards() {
  const chartCards = await getChartCards();
  const defaultCharts = [
    {
      chartType: TASK_PROGRESS_CHART_TYPE,
      title: "Tareas por columna"
    },
    {
      chartType: TASK_STAGE_BY_MEMBER_CHART_TYPE,
      title: "Tareas por etapa"
    },
    {
      chartType: TASK_LEADERBOARD_CHART_TYPE,
      title: "Leaderboard"
    }
  ];
  let metricsCardCount = chartCards.filter(
    (chartCard) => chartCard.columnId === METRICS_COLUMN_ID
  ).length;

  for (const chart of defaultCharts) {
    const exists = chartCards.some((chartCard) => chartCard.chartType === chart.chartType);

    if (exists) {
      continue;
    }

    await createChartCard(
      createChartCardModel({
        chartType: chart.chartType,
        order: metricsCardCount,
        title: chart.title
      })
    );
    metricsCardCount += 1;
  }
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

function replaceStore(db, storeName, values) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.clear();
    values.forEach((value) => store.put(value));
    transaction.oncomplete = () => resolve(values);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
