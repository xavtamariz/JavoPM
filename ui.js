import { formatDateRange, sortByOrder } from "./models.js?v=20260521-grip-dnd";

let lastDragEndedAt = 0;
let activeDrag = null;
let moveMode = null;

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
  taskList.addEventListener("click", (event) => {
    if (!moveMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const taskId = moveMode.taskId;
    const sourceColumnId = moveMode.sourceColumnId;
    clearMoveMode();

    if (sourceColumnId !== column.id) {
      onMoveTask(taskId, column.id);
    }
  }, true);

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-column-note";
    empty.textContent = "Sin tareas";
    taskList.append(empty);
  }

  tasks.forEach((task) => {
    taskList.append(createTaskCard(task, onOpenTask, onMoveTask));
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

function createTaskCard(task, onOpenTask, onMoveTask) {
  const card = document.createElement("article");
  card.className = "task-card";
  card.role = "button";
  card.tabIndex = 0;
  card.dataset.taskId = task.id;
  card.title = "Abrir detalle de tarea";
  card.setAttribute("aria-label", `${task.shortDescription}. Click para abrir detalle.`);
  card.addEventListener("click", (event) => {
    if (event.target.closest(".move-handle")) {
      return;
    }

    if (Date.now() - lastDragEndedAt < 240) {
      event.preventDefault();
      return;
    }

    onOpenTask(task.id);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenTask(task.id);
    }
  });

  const moveHandle = document.createElement("button");
  moveHandle.className = "move-handle";
  moveHandle.type = "button";
  moveHandle.title = "Arrastrar tarea";
  moveHandle.setAttribute("aria-label", "Arrastrar tarea a otra columna");
  moveHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startDragCandidate(event, card, task.id, onMoveTask);
  });
  moveHandle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (Date.now() - lastDragEndedAt < 240) {
      return;
    }

    toggleMoveMode(task, card);
  });

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

  meta.append(type, folio);
  card.append(title, project, meta, dateRange, points, moveHandle, responsible);
  return card;
}

function clearDragTargets() {
  document.querySelectorAll(".column.is-drag-over").forEach((column) => {
    column.classList.remove("is-drag-over");
  });
}

function toggleMoveMode(task, card) {
  if (moveMode?.taskId === task.id) {
    clearMoveMode();
    return;
  }

  clearMoveMode();
  moveMode = {
    sourceColumnId: task.columnId,
    taskId: task.id
  };

  document.body.classList.add("is-move-mode");
  card.classList.add("is-selected-for-move");
  document.querySelectorAll(".column").forEach((column) => {
    column.classList.add("is-move-target");
  });
  document.addEventListener("keydown", handleMoveModeKeydown);
}

function clearMoveMode() {
  moveMode = null;
  document.body.classList.remove("is-move-mode");
  document.querySelectorAll(".is-selected-for-move").forEach((card) => {
    card.classList.remove("is-selected-for-move");
  });
  document.querySelectorAll(".column.is-move-target").forEach((column) => {
    column.classList.remove("is-move-target");
  });
  document.removeEventListener("keydown", handleMoveModeKeydown);
}

function handleMoveModeKeydown(event) {
  if (event.key === "Escape") {
    clearMoveMode();
  }
}

function startDragCandidate(event, card, taskId, onMoveTask) {
  if (activeDrag || !event.isPrimary || event.button !== 0) {
    return;
  }

  activeDrag = {
    card,
    ghost: null,
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    onMoveTask,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    taskId
  };

  card.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", handleDragMove, { passive: false });
  window.addEventListener("pointerup", handleDragEnd, { once: true });
  window.addEventListener("pointercancel", handleDragCancel, { once: true });
}

function handleDragMove(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
    return;
  }

  const distance = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);

  if (!activeDrag.isDragging && distance > 5) {
    beginDrag(event);
  }

  if (!activeDrag.isDragging) {
    return;
  }

  event.preventDefault();
  moveDragGhost(event.clientX, event.clientY);
  highlightDropColumn(event.clientX, event.clientY);
  autoScrollBoard(event.clientX);
}

function handleDragEnd(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
    return;
  }

  if (!activeDrag.isDragging) {
    cleanupDrag();
    return;
  }

  event.preventDefault();
  const taskId = activeDrag.taskId;
  const onMoveTask = activeDrag.onMoveTask;
  const dropColumn = getDropColumn(event.clientX, event.clientY);

  cleanupDrag();

  if (dropColumn?.dataset.columnId) {
    onMoveTask(taskId, dropColumn.dataset.columnId);
  }
}

function handleDragCancel(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
    return;
  }

  cleanupDrag();
}

function beginDrag(event) {
  const rect = activeDrag.card.getBoundingClientRect();
  const ghost = activeDrag.card.cloneNode(true);

  activeDrag.isDragging = true;
  activeDrag.offsetX = event.clientX - rect.left;
  activeDrag.offsetY = event.clientY - rect.top;
  activeDrag.ghost = ghost;

  ghost.classList.add("drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.append(ghost);

  activeDrag.card.classList.add("is-dragging");
  document.body.classList.add("is-task-dragging");
  moveDragGhost(event.clientX, event.clientY);
}

function moveDragGhost(x, y) {
  if (!activeDrag?.ghost) {
    return;
  }

  activeDrag.ghost.style.transform = `translate3d(${
    x - activeDrag.offsetX
  }px, ${y - activeDrag.offsetY}px, 0) rotate(-1deg)`;
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

function cleanupDrag() {
  if (activeDrag.isDragging) {
    lastDragEndedAt = Date.now();
  }

  if (activeDrag.card.hasPointerCapture?.(activeDrag.pointerId)) {
    activeDrag.card.releasePointerCapture(activeDrag.pointerId);
  }
  activeDrag.card.classList.remove("is-dragging");
  activeDrag.ghost?.remove();
  document.body.classList.remove("is-task-dragging");
  clearDragTargets();
  window.removeEventListener("pointermove", handleDragMove);
  window.removeEventListener("pointerup", handleDragEnd);
  window.removeEventListener("pointercancel", handleDragCancel);
  activeDrag = null;
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
