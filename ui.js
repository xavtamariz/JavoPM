import {
  CHART_CARD_TYPE,
  CHART_PERIODS,
  DEFAULT_CHART_PERIOD,
  DEFAULT_CHART_TEAM,
  METRICS_COLUMN_ID,
  TASK_CARD_TYPE,
  formatDateRange,
  sortByOrder
} from "./models.js?v=20260523-metrics";

const AXIS_LABELS = {
  frozen: "C",
  todo: "H",
  in_progress: "P",
  developed: "D",
  verification: "V",
  completed: "C"
};

let lastDragEndedAt = 0;
let activeDrag = null;
let moveMode = null;

export function renderBoard({
  boardElement,
  columns,
  tasks,
  chartCards = [],
  teamMembers = [],
  taskEvents = [],
  onAddTask,
  onOpenTask,
  onMoveCard,
  onUpdateChartCard
}) {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateColumns = `repeat(${columns.length}, var(--column-width))`;

  columns.forEach((column) => {
    const cards = getColumnCards(column.id, tasks, chartCards);
    boardElement.append(
      createColumn({
        cards,
        column,
        columns,
        onAddTask,
        onMoveCard,
        onOpenTask,
        onUpdateChartCard,
        taskEvents,
        tasks,
        teamMembers
      })
    );
  });
}

function getColumnCards(columnId, tasks, chartCards) {
  return sortByOrder([
    ...tasks
      .filter((task) => task.columnId === columnId)
      .map((task) => ({ cardType: TASK_CARD_TYPE, data: task, id: task.id, order: task.order })),
    ...chartCards
      .filter((chartCard) => chartCard.columnId === columnId)
      .map((chartCard) => ({
        cardType: CHART_CARD_TYPE,
        data: chartCard,
        id: chartCard.id,
        order: chartCard.order
      }))
  ]);
}

function createColumn({
  column,
  cards,
  columns,
  tasks,
  teamMembers,
  taskEvents,
  onAddTask,
  onOpenTask,
  onMoveCard,
  onUpdateChartCard
}) {
  const section = document.createElement("section");
  section.className = `column${column.id === METRICS_COLUMN_ID ? " metrics-column" : ""}`;
  section.dataset.columnId = column.id;

  const header = document.createElement("header");
  header.className = "column-header";

  const title = document.createElement("h2");
  title.className = "column-title";
  title.textContent = column.title;

  const count = document.createElement("span");
  count.className = "column-count";
  count.textContent = String(cards.length);
  count.setAttribute("aria-label", `${cards.length} tarjetas`);

  header.append(title, count);

  const taskList = document.createElement("div");
  taskList.className = "task-list";
  taskList.dataset.columnId = column.id;
  taskList.addEventListener(
    "click",
    (event) => {
      if (!moveMode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const cardId = moveMode.cardId;
      const cardType = moveMode.cardType;
      const sourceColumnId = moveMode.sourceColumnId;
      clearMoveMode();

      if (sourceColumnId !== column.id) {
        onMoveCard(cardType, cardId, column.id);
      }
    },
    true
  );

  if (cards.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-column-note";
    empty.textContent = column.id === METRICS_COLUMN_ID ? "Sin métricas" : "Sin tarjetas";
    taskList.append(empty);
  }

  cards.forEach((card) => {
    if (card.cardType === CHART_CARD_TYPE) {
      taskList.append(
        createChartCard({
          chartCard: card.data,
          columns,
          onMoveCard,
          onUpdateChartCard,
          taskEvents,
          tasks,
          teamMembers
        })
      );
      return;
    }

    taskList.append(createTaskCard(card.data, onOpenTask, onMoveCard));
  });

  if (column.allowTaskCreation !== false) {
    const addButton = document.createElement("button");
    addButton.className = "add-task-button";
    addButton.type = "button";
    addButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar tarea';
    addButton.addEventListener("click", () => onAddTask(column.id));
    taskList.append(addButton);
  }

  section.append(header, taskList);
  return section;
}

function createTaskCard(task, onOpenTask, onMoveCard) {
  const card = document.createElement("article");
  card.className = "task-card";
  card.role = "button";
  card.tabIndex = 0;
  card.dataset.cardId = task.id;
  card.dataset.cardType = TASK_CARD_TYPE;
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

  const moveHandle = createMoveHandle({
    card,
    cardId: task.id,
    cardType: TASK_CARD_TYPE,
    item: task,
    label: "Arrastrar tarea a otra columna",
    onMoveCard
  });

  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.shortDescription;

  const project = document.createElement("p");
  project.className = "task-project";
  project.textContent = task.project;

  const footer = document.createElement("div");
  footer.className = "task-card-footer";

  const meta = document.createElement("div");
  meta.className = "task-meta-row";

  const metaLeft = document.createElement("div");
  metaLeft.className = "task-meta-left";

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

  const dateRow = document.createElement("div");
  dateRow.className = "task-date-row";

  metaLeft.append(type, folio);
  meta.append(metaLeft, points);
  dateRow.append(dateRange, responsible);
  footer.append(meta, dateRow);
  card.append(title, project, footer, moveHandle);
  return card;
}

function createChartCard({
  chartCard,
  columns,
  tasks,
  taskEvents,
  teamMembers,
  onMoveCard,
  onUpdateChartCard
}) {
  const card = document.createElement("article");
  card.className = "task-card chart-card";
  card.dataset.cardId = chartCard.id;
  card.dataset.cardType = CHART_CARD_TYPE;
  card.setAttribute("aria-label", chartCard.title);

  const moveHandle = createMoveHandle({
    card,
    cardId: chartCard.id,
    cardType: CHART_CARD_TYPE,
    item: chartCard,
    label: "Arrastrar gráfica a otra columna",
    onMoveCard
  });

  const header = document.createElement("div");
  header.className = "chart-card-header";

  const title = document.createElement("p");
  title.className = "chart-card-title";
  title.textContent = chartCard.title;

  const badge = document.createElement("span");
  badge.className = "chart-card-badge";
  badge.textContent = "Line chart";

  header.append(title, badge);

  const chartData = getChartData({ chartCard, columns, taskEvents, tasks });
  const chart = createLineChart(chartData);
  const periodControls = createPeriodControls(chartCard, onUpdateChartCard);
  const teamControl = createTeamControl(chartCard, teamMembers, onUpdateChartCard);

  card.append(header, chart, periodControls, teamControl, moveHandle);
  return card;
}

function createMoveHandle({ card, cardId, cardType, item, label, onMoveCard }) {
  const moveHandle = document.createElement("button");
  moveHandle.className = "move-handle";
  moveHandle.type = "button";
  moveHandle.title = "Arrastrar tarjeta";
  moveHandle.setAttribute("aria-label", label);
  moveHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startDragCandidate(event, card, cardId, cardType, onMoveCard);
  });
  moveHandle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (Date.now() - lastDragEndedAt < 240) {
      return;
    }

    toggleMoveMode(item, card, cardType);
  });

  return moveHandle;
}

function getChartData({ chartCard, columns, tasks, taskEvents }) {
  const workflowColumns = columns.filter((column) => column.id !== METRICS_COLUMN_ID);
  const period = chartCard.settings?.period || DEFAULT_CHART_PERIOD;
  const teamMember = chartCard.settings?.teamMember || DEFAULT_CHART_TEAM;
  const cutoff = getPeriodCutoff(period);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const columnIds = new Set(workflowColumns.map((column) => column.id));
  const selectedEvents = taskEvents.filter((event) => {
    const task = tasksById.get(event.taskId);
    if (!task || !columnIds.has(event.columnId)) {
      return false;
    }

    if (cutoff && new Date(event.createdAt).getTime() < cutoff) {
      return false;
    }

    return teamMember === DEFAULT_CHART_TEAM || task.responsible === teamMember;
  });

  const source = selectedEvents.length > 0 ? "events" : "current";
  const values = workflowColumns.map((column) => {
    if (source === "events") {
      return selectedEvents.filter((event) => event.columnId === column.id).length;
    }

    return tasks.filter(
      (task) =>
        task.columnId === column.id &&
        (teamMember === DEFAULT_CHART_TEAM || task.responsible === teamMember)
    ).length;
  });

  return {
    labels: workflowColumns.map((column) => AXIS_LABELS[column.id] || column.title.slice(0, 1)),
    source,
    values
  };
}

function getPeriodCutoff(periodValue) {
  const period = CHART_PERIODS.find((item) => item.value === periodValue);
  if (!period || period.days === null) {
    return null;
  }

  return Date.now() - period.days * 24 * 60 * 60 * 1000;
}

function createLineChart({ labels, values }) {
  const maxValue = Math.max(1, ...values);
  const topValue = Math.max(1, Math.ceil(maxValue));
  const width = 320;
  const height = 190;
  const padding = {
    bottom: 28,
    left: 34,
    right: 12,
    top: 14
  };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xStep = labels.length > 1 ? innerWidth / (labels.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = padding.left + xStep * index;
    const y = padding.top + innerHeight - (value / topValue) * innerHeight;
    return { x, y, value };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const ticks = Array.from({ length: Math.min(topValue, 4) + 1 }, (_, index) =>
    Math.round((topValue / Math.min(topValue, 4)) * index)
  );

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Gráfica de tareas por columna");

  ticks.forEach((tick) => {
    const y = padding.top + innerHeight - (tick / topValue) * innerHeight;
    svg.append(createSvgLine(padding.left, y, width - padding.right, y, "chart-grid-line"));
    svg.append(createSvgText(padding.left - 10, y + 4, String(tick), "chart-y-label", "end"));
  });

  svg.append(createSvgLine(padding.left, padding.top, padding.left, height - padding.bottom, "chart-axis"));
  svg.append(
    createSvgLine(padding.left, height - padding.bottom, width - padding.right, height - padding.bottom, "chart-axis")
  );

  labels.forEach((label, index) => {
    const x = padding.left + xStep * index;
    svg.append(createSvgText(x, height - 8, label, "chart-x-label", "middle"));
  });

  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", path);
  line.classList.add("chart-line");
  svg.append(line);

  points.forEach((point) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(point.x));
    dot.setAttribute("cy", String(point.y));
    dot.setAttribute("r", "3.2");
    dot.classList.add("chart-dot");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${point.value} tareas`;
    dot.append(title);
    svg.append(dot);
  });

  const shell = document.createElement("div");
  shell.className = "chart-frame";
  shell.append(svg);
  return shell;
}

function createSvgLine(x1, y1, x2, y2, className) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.classList.add(className);
  return line;
}

function createSvgText(x, y, value, className, anchor = "start") {
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", anchor);
  text.classList.add(className);
  text.textContent = value;
  return text;
}

function createPeriodControls(chartCard, onUpdateChartCard) {
  const group = document.createElement("div");
  group.className = "chart-periods";
  group.setAttribute("aria-label", "Periodo de métricas");

  const activePeriod = chartCard.settings?.period || DEFAULT_CHART_PERIOD;

  CHART_PERIODS.forEach((period) => {
    const button = document.createElement("button");
    button.className = "chart-period-button";
    button.type = "button";
    button.textContent = period.label;
    button.setAttribute("aria-pressed", String(activePeriod === period.value));
    button.addEventListener("click", () => {
      onUpdateChartCard({
        ...chartCard,
        settings: {
          ...chartCard.settings,
          period: period.value
        },
        updatedAt: new Date().toISOString()
      });
    });
    group.append(button);
  });

  return group;
}

function createTeamControl(chartCard, teamMembers, onUpdateChartCard) {
  const wrapper = document.createElement("label");
  wrapper.className = "chart-team-control";
  wrapper.textContent = "Team";

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Integrante del equipo");

  const allOption = document.createElement("option");
  allOption.value = DEFAULT_CHART_TEAM;
  allOption.textContent = "All Team members";
  select.append(allOption);

  teamMembers.forEach((teamMember) => {
    const option = document.createElement("option");
    option.value = teamMember.name;
    option.textContent = teamMember.name;
    select.append(option);
  });

  select.value = chartCard.settings?.teamMember || DEFAULT_CHART_TEAM;
  select.addEventListener("change", () => {
    onUpdateChartCard({
      ...chartCard,
      settings: {
        ...chartCard.settings,
        teamMember: select.value
      },
      updatedAt: new Date().toISOString()
    });
  });

  wrapper.append(select);
  return wrapper;
}

function clearDragTargets() {
  document.querySelectorAll(".column.is-drag-over").forEach((column) => {
    column.classList.remove("is-drag-over");
  });
}

function toggleMoveMode(item, card, cardType) {
  if (moveMode?.cardId === item.id && moveMode.cardType === cardType) {
    clearMoveMode();
    return;
  }

  clearMoveMode();
  moveMode = {
    cardId: item.id,
    cardType,
    sourceColumnId: item.columnId
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

function startDragCandidate(event, card, cardId, cardType, onMoveCard) {
  if (activeDrag || !event.isPrimary || event.button !== 0) {
    return;
  }

  activeDrag = {
    card,
    cardId,
    cardType,
    captureElement: event.currentTarget,
    dropColumn: null,
    frameId: 0,
    ghost: null,
    isDragging: false,
    latestX: event.clientX,
    latestY: event.clientY,
    offsetX: 0,
    offsetY: 0,
    onMoveCard,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY
  };

  activeDrag.captureElement?.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", handleDragMove, { passive: false });
  window.addEventListener("pointerup", handleDragEnd, { once: true });
  window.addEventListener("pointercancel", handleDragCancel, { once: true });
}

function handleDragMove(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
    return;
  }

  activeDrag.latestX = event.clientX;
  activeDrag.latestY = event.clientY;
  const distance = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);

  if (!activeDrag.isDragging && distance > 5) {
    beginDrag(event);
  }

  if (!activeDrag.isDragging) {
    return;
  }

  event.preventDefault();
  scheduleDragFrame();
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
  const cardId = activeDrag.cardId;
  const cardType = activeDrag.cardType;
  const onMoveCard = activeDrag.onMoveCard;
  const dropColumn = getDropColumn(event.clientX, event.clientY);

  cleanupDrag();

  if (dropColumn?.dataset.columnId) {
    onMoveCard(cardType, cardId, dropColumn.dataset.columnId);
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
  document.body.classList.add("is-card-dragging");
  moveDragGhost(event.clientX, event.clientY);
}

function scheduleDragFrame() {
  if (!activeDrag || activeDrag.frameId) {
    return;
  }

  activeDrag.frameId = requestAnimationFrame(updateDragFrame);
}

function updateDragFrame() {
  if (!activeDrag) {
    return;
  }

  activeDrag.frameId = 0;
  const x = activeDrag.latestX;
  const y = activeDrag.latestY;

  moveDragGhost(x, y);
  highlightDropColumn(x, y);
  autoScrollBoard(x);
}

function moveDragGhost(x, y) {
  if (!activeDrag?.ghost) {
    return;
  }

  activeDrag.ghost.style.transform = `translate3d(${Math.round(
    x - activeDrag.offsetX
  )}px, ${Math.round(y - activeDrag.offsetY)}px, 0) rotate(-1deg)`;
}

function highlightDropColumn(x, y) {
  const dropColumn = getDropColumn(x, y);
  const nextColumn = dropColumn?.closest(".column") || null;

  if (activeDrag.dropColumn === nextColumn) {
    return;
  }

  activeDrag.dropColumn?.classList.remove("is-drag-over");
  activeDrag.dropColumn = nextColumn;
  nextColumn?.classList.add("is-drag-over");
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
  if (!activeDrag) {
    return;
  }

  if (activeDrag.isDragging) {
    lastDragEndedAt = Date.now();
  }

  if (activeDrag.frameId) {
    cancelAnimationFrame(activeDrag.frameId);
  }
  if (activeDrag.captureElement?.hasPointerCapture?.(activeDrag.pointerId)) {
    activeDrag.captureElement.releasePointerCapture(activeDrag.pointerId);
  }
  activeDrag.card.classList.remove("is-dragging");
  activeDrag.ghost?.remove();
  document.body.classList.remove("is-card-dragging");
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
