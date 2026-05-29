export const DEFAULT_COLUMNS = [
  { id: "frozen", title: "Congelados", order: 0 },
  { id: "todo", title: "Por Hacer", order: 1 },
  { id: "in_progress", title: "En Progreso", order: 2 },
  { id: "developed", title: "Desarrollado", order: 3 },
  { id: "verification", title: "En Verificación", order: 4 },
  { id: "completed", title: "Completado", order: 5 },
  { id: "metrics", title: "Metrics", order: 6, allowTaskCreation: false }
];

export const ALLOWED_TYPES = ["Bug", "Tarea", "Evento"];
export const DEFAULT_PROJECT_NAME = "Proyecto";
export const UNASSIGNED_PROJECT_NAME = "Sin proyecto";
export const DEFAULT_RESPONSIBLE_NAME = "Sin asignar";
export const CHAT_COLUMN_ID = "chat";
export const METRICS_COLUMN_ID = "metrics";
export const TASK_CARD_TYPE = "task";
export const CHART_CARD_TYPE = "chart";
export const TASK_PROGRESS_CHART_TYPE = "taskProgressByColumn";
export const TASK_STAGE_BY_MEMBER_CHART_TYPE = "taskStageByMember";
export const TASK_LEADERBOARD_CHART_TYPE = "taskLeaderboard";
export const DEFAULT_CHART_PERIOD = "1D";
export const DEFAULT_CHART_TEAM = "all";
export const DEFAULT_LEADERBOARD_METRIC = "tasks";
export const LEADERBOARD_METRICS = ["tasks", "points"];
export const CRM_STATUSES = [
  "Nuevo",
  "Contactado",
  "Calificado",
  "Propuesta",
  "Seguimiento",
  "Cerrado",
  "Descartado"
];
export const DEFAULT_CRM_STATUS = CRM_STATUSES[0];
export const CHART_PERIODS = [
  { label: "1D", value: "1D", days: 1 },
  { label: "1W", value: "1W", days: 7 },
  { label: "2W", value: "2W", days: 14 },
  { label: "1M", value: "1M", days: 30 },
  { label: "3M", value: "3M", days: 90 },
  { label: "6M", value: "6M", days: 180 },
  { label: "1Y", value: "1Y", days: 365 },
  { label: "All", value: "ALL", days: null }
];

export function createId(prefix) {
  const randomPart = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${randomPart}`;
}

export function createDefaultChecklist(order = 0) {
  return {
    id: createId("checklist"),
    title: order === 0 ? "Checklist 1" : `Checklist ${order + 1}`,
    order,
    items: []
  };
}

export function createChecklistItem(order = 0) {
  return {
    id: createId("item"),
    text: "Nuevo elemento",
    completed: false,
    order
  };
}

export function createProjectModel({ name = DEFAULT_PROJECT_NAME, order = 0 }) {
  const now = new Date().toISOString();

  return {
    id: createId("project"),
    name: normalizeProjectName(name) || DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    order
  };
}

export function createTeamMemberModel({
  lastLoginAt = "",
  name,
  nickname = "",
  order = 0,
  status = "local",
  userId = ""
}) {
  const now = new Date().toISOString();

  return {
    id: createId("team"),
    lastLoginAt: sanitizeText(lastLoginAt),
    name: normalizeTeamMemberName(name),
    nickname: normalizeNickname(nickname),
    createdAt: now,
    updatedAt: now,
    order,
    status: normalizeTeamMemberStatus(status),
    userId: sanitizeText(userId)
  };
}

export function createChartCardModel({
  columnId = METRICS_COLUMN_ID,
  order = 0,
  title = "Tareas por columna",
  chartType = TASK_PROGRESS_CHART_TYPE,
  settings = {}
} = {}) {
  const now = new Date().toISOString();

  return {
    id: createId("chart"),
    columnId,
    title: sanitizeText(title) || "Tareas por columna",
    chartType,
    settings: normalizeChartSettings(settings),
    createdAt: now,
    updatedAt: now,
    order
  };
}

export function createCRMInteraction({
  authorName = "",
  authorUserId = "",
  comment = "",
  occurredAt,
  order = 0
} = {}) {
  const now = occurredAt || new Date().toISOString();

  return {
    id: createId("crm_interaction"),
    authorName: normalizeTeamMemberName(authorName),
    authorUserId: sanitizeText(authorUserId),
    comment: sanitizeText(comment),
    createdAt: now,
    occurredAt: now,
    order
  };
}

export function createCRMProspectModel({
  companyName = "Nuevo prospecto",
  contactName = "",
  email = "",
  extension = "",
  mobilePhone = "",
  order = 0,
  phone = "",
  status = DEFAULT_CRM_STATUS
} = {}) {
  const now = new Date().toISOString();

  return {
    id: createId("crm_prospect"),
    companyName: normalizeTeamMemberName(companyName) || "Nuevo prospecto",
    contactName: normalizeTeamMemberName(contactName),
    mobilePhone: sanitizeText(mobilePhone),
    email: sanitizeText(email),
    phone: sanitizeText(phone),
    extension: sanitizeText(extension),
    comments: "",
    status: CRM_STATUSES.includes(status) ? status : DEFAULT_CRM_STATUS,
    interactions: [],
    checklists: [createDefaultChecklist()],
    createdAt: now,
    updatedAt: now,
    order
  };
}

export function createTaskEventModel({
  columnId,
  createdAt,
  eventType = "created",
  folio = "",
  fromColumnId = "",
  metadata = {},
  occurredAt,
  pointsSnapshot = null,
  projectName = "",
  responsibleName = "",
  taskId,
  toColumnId = ""
}) {
  const now = occurredAt || createdAt || new Date().toISOString();
  const targetColumnId = sanitizeText(toColumnId) || sanitizeText(columnId);

  return {
    id: createId("task_event"),
    taskId: sanitizeText(taskId),
    columnId: targetColumnId,
    fromColumnId: sanitizeText(fromColumnId),
    toColumnId: targetColumnId,
    eventType: sanitizeText(eventType) || "created",
    createdAt: createdAt || now,
    occurredAt: now,
    responsibleName: normalizeTeamMemberName(responsibleName),
    projectName: normalizeProjectName(projectName),
    pointsSnapshot: normalizeOptionalNumber(pointsSnapshot),
    folio: sanitizeText(folio),
    metadata: normalizeMetadata(metadata)
  };
}

export function createTaskModel({
  columnId,
  order,
  folio,
  project = DEFAULT_PROJECT_NAME,
  startDate = todayISO()
}) {
  const now = new Date().toISOString();
  const projectName = normalizeProjectName(project) || DEFAULT_PROJECT_NAME;

  return {
    id: createId("task"),
    columnId,
    shortDescription: "Nueva tarea",
    project: projectName,
    type: "Tarea",
    folio: folio || generateFolio([], projectName),
    startDate,
    endDate: "",
    points: 0,
    responsible: DEFAULT_RESPONSIBLE_NAME,
    longDescription: "",
    checklists: [createDefaultChecklist()],
    createdAt: now,
    updatedAt: now,
    order
  };
}

export function normalizeTask(task) {
  const project = normalizeProjectName(task.project) || DEFAULT_PROJECT_NAME;

  return {
    id: task.id || createId("task"),
    columnId: task.columnId || DEFAULT_COLUMNS[0].id,
    shortDescription: sanitizeText(task.shortDescription) || "Nueva tarea",
    project,
    type: ALLOWED_TYPES.includes(task.type) ? task.type : "Tarea",
    folio: sanitizeText(task.folio) || formatFolio(project, 1),
    startDate: task.startDate || "",
    endDate: task.endDate || "",
    points: Number.isFinite(Number(task.points)) ? Number(task.points) : 0,
    responsible: normalizeTeamMemberName(task.responsible) || DEFAULT_RESPONSIBLE_NAME,
    longDescription: typeof task.longDescription === "string" ? task.longDescription : "",
    checklists: normalizeChecklists(task.checklists),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || new Date().toISOString(),
    order: Number.isFinite(Number(task.order)) ? Number(task.order) : 0
  };
}

export function normalizeProject(project, projectIndex = 0) {
  const now = new Date().toISOString();

  return {
    id: project.id || createId("project"),
    name: normalizeProjectName(project.name) || DEFAULT_PROJECT_NAME,
    createdAt: project.createdAt || now,
    updatedAt: project.updatedAt || now,
    order: Number.isFinite(Number(project.order)) ? Number(project.order) : projectIndex
  };
}

export function normalizeColumn(column, columnIndex = 0) {
  const defaultColumn = DEFAULT_COLUMNS.find((item) => item.id === column.id);

  return {
    id: column.id || defaultColumn?.id || createId("column"),
    title: sanitizeText(column.title) || defaultColumn?.title || "Columna",
    order: Number.isFinite(Number(column.order)) ? Number(column.order) : columnIndex,
    allowTaskCreation: column.allowTaskCreation ?? defaultColumn?.allowTaskCreation ?? true
  };
}

export function normalizeTeamMember(teamMember, teamMemberIndex = 0) {
  const now = new Date().toISOString();

  return {
    id: teamMember.id || createId("team"),
    lastLoginAt: sanitizeText(teamMember.lastLoginAt),
    name: normalizeTeamMemberName(teamMember.name),
    nickname: normalizeNickname(teamMember.nickname),
    createdAt: teamMember.createdAt || now,
    updatedAt: teamMember.updatedAt || now,
    order: Number.isFinite(Number(teamMember.order)) ? Number(teamMember.order) : teamMemberIndex,
    status: normalizeTeamMemberStatus(teamMember.status),
    userId: sanitizeText(teamMember.userId)
  };
}

export function normalizeChartCard(chartCard, chartCardIndex = 0) {
  const now = new Date().toISOString();

  return {
    id: chartCard.id || createId("chart"),
    columnId: chartCard.columnId || METRICS_COLUMN_ID,
    title: sanitizeText(chartCard.title) || "Tareas por columna",
    chartType: chartCard.chartType || TASK_PROGRESS_CHART_TYPE,
    settings: normalizeChartSettings(chartCard.settings),
    createdAt: chartCard.createdAt || now,
    updatedAt: chartCard.updatedAt || now,
    order: Number.isFinite(Number(chartCard.order)) ? Number(chartCard.order) : chartCardIndex
  };
}

export function normalizeCRMProspect(prospect = {}, prospectIndex = 0) {
  const now = new Date().toISOString();

  return {
    id: prospect.id || createId("crm_prospect"),
    companyName: normalizeTeamMemberName(prospect.companyName) || "Nuevo prospecto",
    contactName: normalizeTeamMemberName(prospect.contactName),
    mobilePhone: sanitizeText(prospect.mobilePhone),
    email: sanitizeText(prospect.email),
    phone: sanitizeText(prospect.phone),
    extension: sanitizeText(prospect.extension),
    comments: typeof prospect.comments === "string" ? prospect.comments : "",
    status: CRM_STATUSES.includes(prospect.status) ? prospect.status : DEFAULT_CRM_STATUS,
    interactions: normalizeCRMInteractions(prospect.interactions),
    checklists: normalizeChecklists(prospect.checklists),
    createdAt: prospect.createdAt || now,
    updatedAt: prospect.updatedAt || now,
    order: Number.isFinite(Number(prospect.order)) ? Number(prospect.order) : prospectIndex
  };
}

export function normalizeCRMInteraction(interaction = {}, interactionIndex = 0) {
  const occurredAt = interaction.occurredAt || interaction.createdAt || new Date().toISOString();

  return {
    id: interaction.id || createId("crm_interaction"),
    authorName: normalizeTeamMemberName(interaction.authorName),
    authorUserId: sanitizeText(interaction.authorUserId),
    comment: sanitizeText(interaction.comment),
    createdAt: interaction.createdAt || occurredAt,
    occurredAt,
    order: Number.isFinite(Number(interaction.order)) ? Number(interaction.order) : interactionIndex
  };
}

export function normalizeTaskEvent(taskEvent) {
  const columnId = sanitizeText(taskEvent.toColumnId) || sanitizeText(taskEvent.columnId);
  const occurredAt = taskEvent.occurredAt || taskEvent.createdAt || new Date().toISOString();

  return {
    id: taskEvent.id || createId("task_event"),
    taskId: sanitizeText(taskEvent.taskId),
    columnId,
    fromColumnId: sanitizeText(taskEvent.fromColumnId),
    toColumnId: columnId,
    eventType: sanitizeText(taskEvent.eventType) || "created",
    createdAt: taskEvent.createdAt || occurredAt,
    occurredAt,
    responsibleName: normalizeTeamMemberName(taskEvent.responsibleName),
    projectName: normalizeProjectName(taskEvent.projectName),
    pointsSnapshot: normalizeOptionalNumber(taskEvent.pointsSnapshot),
    folio: sanitizeText(taskEvent.folio),
    metadata: normalizeMetadata(taskEvent.metadata)
  };
}

export function normalizeChartSettings(settings = {}) {
  const periodValues = CHART_PERIODS.map((period) => period.value);
  const period = periodValues.includes(settings.period) ? settings.period : DEFAULT_CHART_PERIOD;
  const teamMember = normalizeTeamMemberName(settings.teamMember);
  const leaderboardMetric = LEADERBOARD_METRICS.includes(settings.leaderboardMetric)
    ? settings.leaderboardMetric
    : DEFAULT_LEADERBOARD_METRIC;

  return {
    leaderboardMetric,
    period,
    teamMember: teamMember || DEFAULT_CHART_TEAM
  };
}

export function normalizeChecklists(checklists) {
  const source = Array.isArray(checklists) && checklists.length > 0
    ? checklists
    : [createDefaultChecklist()];

  return source
    .map((checklist, checklistIndex) => ({
      id: checklist.id || createId("checklist"),
      title: sanitizeText(checklist.title) || `Checklist ${checklistIndex + 1}`,
      order: Number.isFinite(Number(checklist.order)) ? Number(checklist.order) : checklistIndex,
      items: normalizeChecklistItems(checklist.items)
    }))
    .sort((a, b) => a.order - b.order);
}

export function normalizeCRMInteractions(interactions) {
  if (!Array.isArray(interactions)) {
    return [];
  }

  return interactions
    .map(normalizeCRMInteraction)
    .filter((interaction) => interaction.comment)
    .sort((a, b) => {
      const orderDiff = Number(a.order || 0) - Number(b.order || 0);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return String(a.occurredAt || "").localeCompare(String(b.occurredAt || ""));
    });
}

export function normalizeChecklistItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, itemIndex) => ({
      id: item.id || createId("item"),
      text: sanitizeText(item.text) || "Nuevo elemento",
      completed: Boolean(item.completed),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : itemIndex
    }))
    .sort((a, b) => a.order - b.order);
}

export function generateFolio(tasks, projectName = DEFAULT_PROJECT_NAME) {
  const used = new Set(tasks.map((task) => task.folio));
  let number = getNextGlobalFolioNumber(tasks);
  let folio = formatFolio(projectName, number);

  while (used.has(folio)) {
    number += 1;
    folio = formatFolio(projectName, number);
  }

  return folio;
}

export function updateFolioProjectName(folio, projectName, fallbackNumber = 1) {
  return formatFolio(projectName, getFolioNumber(folio) || fallbackNumber);
}

export function formatFolio(projectName, number) {
  return `${formatProjectPrefix(projectName)}-${String(number).padStart(3, "0")}`;
}

export function getFolioNumber(folio) {
  const match = String(folio || "").match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

export function getNextGlobalFolioNumber(tasks) {
  const maxNumber = tasks.reduce((max, task) => Math.max(max, getFolioNumber(task.folio)), 0);
  return maxNumber + 1;
}

export function formatProjectPrefix(projectName) {
  return (normalizeProjectName(projectName) || DEFAULT_PROJECT_NAME).toLocaleUpperCase("es-MX");
}

export function normalizeProjectName(value) {
  return sanitizeText(value).replace(/\s+/g, " ");
}

export function normalizeTeamMemberName(value) {
  return sanitizeText(value).replace(/\s+/g, " ");
}

export function normalizeNickname(value) {
  return sanitizeText(value).toLocaleLowerCase("es-MX").replace(/\s+/g, "");
}

export function isValidMemberNickname(value) {
  return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalizeNickname(value));
}

function normalizeTeamMemberStatus(value) {
  return ["local", "active", "inactive"].includes(value) ? value : "local";
}

export function sortByOrder(items) {
  return [...items].sort((a, b) => {
    const orderDiff = Number(a.order || 0) - Number(b.order || 0);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return "Sin fechas";
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) {
    return "Sin fecha";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
