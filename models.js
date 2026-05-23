export const DEFAULT_COLUMNS = [
  { id: "frozen", title: "Congelados", order: 0 },
  { id: "todo", title: "Por Hacer", order: 1 },
  { id: "in_progress", title: "En Progreso", order: 2 },
  { id: "developed", title: "Desarrollado", order: 3 },
  { id: "verification", title: "En Verificación", order: 4 },
  { id: "completed", title: "Completado", order: 5 }
];

export const ALLOWED_TYPES = ["Bug", "Tarea", "Evento"];
export const DEFAULT_PROJECT_NAME = "Proyecto";

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
    responsible: "Sin asignar",
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
    responsible: sanitizeText(task.responsible) || "Sin asignar",
    longDescription: typeof task.longDescription === "string" ? task.longDescription : "",
    checklists: normalizeChecklists(task.checklists),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
