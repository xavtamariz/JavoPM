import { formatDateRange, sortByOrder } from "./models.js";

export function renderBoard({ boardElement, columns, tasks, onAddTask, onOpenTask }) {
  boardElement.innerHTML = "";

  columns.forEach((column) => {
    const columnTasks = sortByOrder(tasks.filter((task) => task.columnId === column.id));
    boardElement.append(createColumn(column, columnTasks, onAddTask, onOpenTask));
  });
}

function createColumn(column, tasks, onAddTask, onOpenTask) {
  const section = document.createElement("section");
  section.className = "column";
  section.dataset.columnId = column.id;

  const header = document.createElement("header");
  header.className = "column-header";

  const title = document.createElement("h2");
  title.className = "column-title";
  title.textContent = column.title;

  const count = document.createElement("span");
  count.className = "column-count";
  count.textContent = String(tasks.length);
  count.setAttribute("aria-label", `${tasks.length} tareas`);

  header.append(title, count);

  const taskList = document.createElement("div");
  taskList.className = "task-list";

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-column-note";
    empty.textContent = "Sin tareas";
    taskList.append(empty);
  }

  tasks.forEach((task) => {
    taskList.append(createTaskCard(task, onOpenTask));
  });

  const addButton = document.createElement("button");
  addButton.className = "add-task-button";
  addButton.type = "button";
  addButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar tarea';
  addButton.addEventListener("click", () => onAddTask(column.id));
  taskList.append(addButton);

  section.append(header, taskList);
  return section;
}

function createTaskCard(task, onOpenTask) {
  const card = document.createElement("button");
  card.className = "task-card";
  card.type = "button";
  card.addEventListener("click", () => onOpenTask(task.id));

  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.shortDescription;

  const project = document.createElement("p");
  project.className = "task-project";
  project.textContent = task.project;

  const meta = document.createElement("div");
  meta.className = "task-meta-row";

  const type = document.createElement("span");
  type.className = "type-badge";
  type.dataset.type = task.type;
  type.textContent = task.type;

  const folio = document.createElement("span");
  folio.className = "folio-badge";
  folio.textContent = task.folio;

  const dateRange = document.createElement("span");
  dateRange.className = "date-badge";
  dateRange.textContent = formatDateRange(task.startDate, task.endDate);

  const points = document.createElement("span");
  points.className = "points-badge";
  points.textContent = `${task.points} pts`;

  const responsible = document.createElement("span");
  responsible.className = "responsible";
  responsible.textContent = task.responsible;

  meta.append(type, folio, dateRange);
  card.append(title, project, meta, points, responsible);
  return card;
}
