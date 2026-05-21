export const DEFAULT_COLUMNS = [
  { id: "frozen", title: "Congelados", order: 0 },
  { id: "todo", title: "Por Hacer", order: 1 },
  { id: "in_progress", title: "En Progreso", order: 2 },
  { id: "developed", title: "Desarrollado", order: 3 },
  { id: "verification", title: "En Verificación", order: 4 },
  { id: "completed", title: "Completado", order: 5 }
];

export const ALLOWED_TYPES = ["Bug", "Tarea", "Evento"];

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

export function createTaskModel({ columnId, order, folio, startDate = todayISO() }) {
  const now = new Date().toISOString();

  return {
    id: createId("task"),
    columnId,
    shortDescription: "Nueva tarea",
    project: "Proyecto",
    type: "Tarea",
    folio,
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
  return {
    id: task.id || createId("task"),
    columnId: task.columnId || DEFAULT_COLUMNS[0].id,
    shortDescription: sanitizeText(task.shortDescription) || "Nueva tarea",
    project: sanitizeText(task.project) || "Proyecto",
    type: ALLOWED_TYPES.includes(task.type) ? task.type : "Tarea",
    folio: sanitizeText(task.folio) || "TASK-001",
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

export function generateFolio(tasks) {
  const used = new Set(tasks.map((task) => task.folio));
  let number = tasks.length + 1;
  let folio = formatFolio(number);

  while (used.has(folio)) {
    number += 1;
    folio = formatFolio(number);
  }

  return folio;
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

function formatFolio(number) {
  return `TASK-${String(number).padStart(3, "0")}`;
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
