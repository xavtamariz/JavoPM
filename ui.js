import { formatDateRange, sortByOrder } from "./models.js?v=20260521-dnd";

let lastDragEndedAt = 0;
let pointerDrag = null;

export function renderBoard({ boardElement, columns, tasks, onAddTask, onOpenTask, onMoveTask }) {
  boardElement.innerHTML = "";

  columns.forEach((column) => {
    const columnTasks = sortByOrder(tasks.filter((task) => task.columnId === column.id));
    boardElement.append(createColumn(column, columnTasks, onAddTask, onOpenTask, onMoveTask));
  });
}

function createColumn(column, tasks, onAddTask, onOpenTask, onMoveTask) {
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
  taskList.dataset.columnId = column.id;

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
  card.dataset.taskId = task.id;
  card.title = "Mantén click y arrastra para mover la tarea";
  card.setAttribute("aria-label", `${task.shortDescription}. Arrastrable entre columnas.`);
  card.addEventListener("click", (event) => {
    if (Date.now() - lastDragEndedAt < 240) {
      event.preventDefault();
      return;
    }

    onOpenTask(task.id);
  });
  card.addEventListener("pointerdown", (event) => startPointerCandidate(event, card, task.id));
  card.addEventListener("pointermove", (event) => movePointerCandidate(event, onMoveTask));
  card.addEventListener("pointerup", (event) => finishPointerCandidate(event, onMoveTask));
  card.addEventListener("pointercancel", cancelPointerCandidate);
  card.addEventListener("mousedown", (event) => startMouseCandidate(event, card, task.id, onMoveTask));

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

function clearDragTargets() {
  document.querySelectorAll(".column.is-drag-over").forEach((column) => {
    column.classList.remove("is-drag-over");
  });
}

function startPointerCandidate(event, card, taskId) {
  if (pointerDrag || event.button !== 0) {
    return;
  }

  pointerDrag = {
    card,
    ghost: null,
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    pointerId: event.pointerId,
    source: "pointer",
    startX: event.clientX,
    startY: event.clientY,
    taskId
  };

  card.setPointerCapture(event.pointerId);
}

function movePointerCandidate(event) {
  if (!pointerDrag || !isActiveDragEvent(event)) {
    return;
  }

  const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);

  if (!pointerDrag.isDragging && distance > 8) {
    beginPointerDrag(event);
  }

  if (!pointerDrag.isDragging) {
    return;
  }

  event.preventDefault();
  moveDragGhost(event);
  highlightDropColumn(event.clientX, event.clientY);
  autoScrollBoard(event.clientX);
}

function finishPointerCandidate(event, onMoveTask) {
  if (!pointerDrag || !isActiveDragEvent(event)) {
    return;
  }

  if (!pointerDrag.isDragging) {
    window.removeEventListener("mousemove", handleMouseMove);
    pointerDrag = null;
    return;
  }

  event.preventDefault();
  const taskId = pointerDrag.taskId;
  const dropColumn = getDropColumn(event.clientX, event.clientY);
  cleanupPointerDrag();

  if (dropColumn?.dataset.columnId) {
    onMoveTask(taskId, dropColumn.dataset.columnId);
  }
}

function cancelPointerCandidate() {
  if (pointerDrag?.isDragging) {
    cleanupPointerDrag();
    return;
  }

  window.removeEventListener("mousemove", handleMouseMove);
  pointerDrag = null;
}

function startMouseCandidate(event, card, taskId, onMoveTask) {
  if (pointerDrag || event.button !== 0) {
    return;
  }

  pointerDrag = {
    card,
    ghost: null,
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
    source: "mouse",
    startX: event.clientX,
    startY: event.clientY,
    taskId
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", (mouseEvent) => handleMouseUp(mouseEvent, onMoveTask), {
    once: true
  });
}

function handleMouseMove(event) {
  movePointerCandidate(event);
}

function handleMouseUp(event, onMoveTask) {
  finishPointerCandidate(event, onMoveTask);
}

function beginPointerDrag(event) {
  const rect = pointerDrag.card.getBoundingClientRect();
  const ghost = pointerDrag.card.cloneNode(true);

  pointerDrag.isDragging = true;
  pointerDrag.offsetX = event.clientX - rect.left;
  pointerDrag.offsetY = event.clientY - rect.top;
  pointerDrag.ghost = ghost;

  ghost.classList.add("drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.append(ghost);

  pointerDrag.card.classList.add("is-dragging");
  document.body.classList.add("is-task-dragging");
  moveDragGhost(event);
}

function moveDragGhost(event) {
  if (!pointerDrag?.ghost) {
    return;
  }

  pointerDrag.ghost.style.transform = `translate3d(${
    event.clientX - pointerDrag.offsetX
  }px, ${event.clientY - pointerDrag.offsetY}px, 0) rotate(-1deg)`;
}

function highlightDropColumn(x, y) {
  clearDragTargets();
  const dropColumn = getDropColumn(x, y);
  dropColumn?.closest(".column")?.classList.add("is-drag-over");
}

function getDropColumn(x, y) {
  const element = document.elementFromPoint(x, y);
  const taskList = element?.closest(".task-list");

  if (taskList) {
    return taskList;
  }

  return element?.closest(".column")?.querySelector(".task-list") || null;
}

function cleanupPointerDrag() {
  lastDragEndedAt = Date.now();
  pointerDrag.card.classList.remove("is-dragging");
  pointerDrag.ghost?.remove();
  document.body.classList.remove("is-task-dragging");
  clearDragTargets();

  try {
    if (pointerDrag.source === "pointer") {
      pointerDrag.card.releasePointerCapture(pointerDrag.pointerId);
    }
  } catch {
    // Pointer capture may already be released by the browser.
  }

  window.removeEventListener("mousemove", handleMouseMove);
  pointerDrag = null;
}

function isActiveDragEvent(event) {
  return pointerDrag.pointerId === null || pointerDrag.pointerId === event.pointerId;
}

function autoScrollBoard(pointerX) {
  const boardWrap = document.querySelector(".board-wrap");
  if (!boardWrap) {
    return;
  }

  const rect = boardWrap.getBoundingClientRect();
  const edgeSize = 72;

  if (pointerX < rect.left + edgeSize) {
    boardWrap.scrollLeft -= 18;
  } else if (pointerX > rect.right - edgeSize) {
    boardWrap.scrollLeft += 18;
  }
}
