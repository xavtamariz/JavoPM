import {
  CHART_CARD_TYPE,
  CHART_PERIODS,
  DEFAULT_CHART_PERIOD,
  DEFAULT_RESPONSIBLE_NAME,
  DEFAULT_CHART_TEAM,
  DEFAULT_LEADERBOARD_METRIC,
  LEADERBOARD_METRICS,
  CHAT_COLUMN_ID,
  METRICS_COLUMN_ID,
  TASK_CARD_TYPE,
  TASK_LEADERBOARD_CHART_TYPE,
  TASK_STAGE_BY_MEMBER_CHART_TYPE,
  formatDateRange,
  normalizeTeamMemberName,
  sortByOrder
} from "./models.js?v=20260529-crm-header-stats";

const AXIS_LABELS = {
  frozen: "C",
  todo: "H",
  in_progress: "P",
  developed: "D",
  verification: "V",
  completed: "C"
};
const COMPLETED_COLUMN_ID = "completed";
const COLUMN_ACTIVITY_EVENT_TYPES = new Set(["created", "moved"]);
const METRIC_EVENT_TYPES = new Set([
  "created",
  "moved",
  "points_changed",
  "project_changed",
  "responsible_changed"
]);
const LEADERBOARD_MODE_LABELS = {
  points: "Puntos",
  tasks: "Completadas"
};

let lastDragEndedAt = 0;
let activeDrag = null;
let moveMode = null;

export function renderBoard({
  boardElement,
  columns,
  tasks,
  visibleTasks = tasks,
  chartCards = [],
  chat = {},
  teamMembers = [],
  taskEvents = [],
  onAddTask,
  onBackChatList,
  onCreateChatGroup,
  onOpenChatConversation,
  onOpenTask,
  onMoveCard,
  onSendChatMessage,
  onShowChatGroupForm,
  onUpdateChatDraft,
  onUpdateChartCard
}) {
  boardElement.innerHTML = "";
  const visibleColumnCount = columns.length + (chat.isOpen ? 1 : 0);
  boardElement.style.gridTemplateColumns = `repeat(${visibleColumnCount}, var(--column-width))`;

  const workflowTaskTotal = visibleTasks.filter((task) => task.columnId !== METRICS_COLUMN_ID).length;

  if (chat.isOpen) {
    boardElement.append(
      createChatColumn({
        chat,
        onBackChatList,
        onCreateChatGroup,
        onOpenChatConversation,
        onSendChatMessage,
        onShowChatGroupForm,
        onUpdateChatDraft
      })
    );
  }

  columns.forEach((column) => {
    const tasksForColumn = column.id === METRICS_COLUMN_ID ? tasks : visibleTasks;
    const cards = getColumnCards(column.id, tasksForColumn, chartCards);
    const taskCount = tasksForColumn.filter((task) => task.columnId === column.id).length;
    boardElement.append(
      createColumn({
        cards,
        column,
        columns,
        onAddTask,
        onMoveCard,
        onOpenTask,
        onUpdateChartCard,
        taskCount,
        taskEvents,
        tasks,
        teamMembers,
        workflowTaskTotal
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
  onUpdateChartCard,
  taskCount,
  workflowTaskTotal
}) {
  const section = document.createElement("section");
  section.className = `column${column.id === METRICS_COLUMN_ID ? " metrics-column" : ""}`;
  section.dataset.columnId = column.id;

  const header = document.createElement("header");
  header.className = "column-header";

  const title = document.createElement("h2");
  title.className = "column-title";
  title.textContent = column.title;

  const indicators = document.createElement("div");
  indicators.className = "column-indicators";

  if (column.id !== METRICS_COLUMN_ID) {
    const percent = document.createElement("span");
    percent.className = "column-percent";
    const percentValue = workflowTaskTotal > 0 ? Math.round((taskCount / workflowTaskTotal) * 100) : 0;
    percent.textContent = `${percentValue}%`;
    percent.setAttribute("aria-label", `${percentValue}% de las tareas del tablero`);
    indicators.append(percent);
  }

  const count = document.createElement("span");
  count.className = "column-count";
  count.textContent = String(taskCount);
  count.setAttribute("aria-label", `${taskCount} tareas`);

  indicators.append(count);
  header.append(title, indicators);

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

    taskList.append(createTaskCard(card.data, onOpenTask, onMoveCard, teamMembers));
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

export function createChatColumn({
  chat,
  onBackChatList,
  onCreateChatGroup,
  onOpenChatConversation,
  onSendChatMessage,
  onShowChatGroupForm,
  onUpdateChatDraft
}) {
  const section = document.createElement("section");
  section.className = "column chat-column";
  section.dataset.columnId = CHAT_COLUMN_ID;

  const header = document.createElement("header");
  header.className = "column-header";

  const title = document.createElement("h2");
  title.className = "column-title";
  title.textContent = "Chat";

  const indicators = document.createElement("div");
  indicators.className = "column-indicators";

  const count = document.createElement("span");
  count.className = "column-count";
  count.textContent = String(chat.totalUnread || 0);
  count.setAttribute("aria-label", `${chat.totalUnread || 0} mensajes pendientes`);

  indicators.append(count);
  header.append(title, indicators);

  const body = document.createElement("div");
  body.className = "chat-column-body";

  if (chat.view === "conversation") {
    body.append(createChatConversationView({ chat, onBackChatList, onSendChatMessage, onUpdateChatDraft }));
  } else {
    body.append(createChatListView({ chat, onCreateChatGroup, onOpenChatConversation, onShowChatGroupForm }));
  }

  section.append(header, body);
  return section;
}

function createChatListView({ chat, onCreateChatGroup, onOpenChatConversation, onShowChatGroupForm }) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-list-view";

  if (chat.error) {
    wrapper.append(createChatNotice(chat.error, "error"));
  }

  if (chat.isLoading) {
    wrapper.append(createChatNotice("Actualizando chat...", "muted"));
  }

  const list = document.createElement("div");
  list.className = "chat-list";

  if (!chat.items.length) {
    list.append(createChatNotice("Sin conversaciones todavía.", "muted"));
  } else {
    chat.items.forEach((item) => {
      list.append(createChatListItem(item, onOpenChatConversation));
    });
  }

  wrapper.append(list);

  if (chat.canCreateGroups) {
    if (chat.groupDraftOpen) {
      wrapper.append(createChatGroupForm({ chat, onCreateChatGroup, onShowChatGroupForm }));
    } else {
      const createButton = document.createElement("button");
      createButton.className = "add-task-button chat-create-group-button";
      createButton.type = "button";
      createButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Crear grupo';
      createButton.addEventListener("click", () => onShowChatGroupForm(true));
      wrapper.append(createButton);
    }
  }

  return wrapper;
}

function createChatListItem(item, onOpenChatConversation) {
  const button = document.createElement("button");
  button.className = `chat-list-item${item.locked ? " is-locked" : ""}`;
  button.type = "button";
  button.addEventListener("click", () => onOpenChatConversation(item));

  const copy = document.createElement("span");
  copy.className = "chat-list-copy";

  const title = document.createElement("strong");
  title.textContent = item.title;

  const meta = document.createElement("span");
  meta.textContent = item.locked ? `${item.meta} · Bloqueado` : item.meta;

  copy.append(title, meta);
  button.append(copy);

  if (item.unreadCount > 0) {
    const unread = document.createElement("span");
    unread.className = "chat-unread-pill";
    unread.textContent = String(item.unreadCount);
    button.append(unread);
  }

  return button;
}

function createChatGroupForm({ chat, onCreateChatGroup, onShowChatGroupForm }) {
  const form = document.createElement("form");
  form.className = "chat-group-form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    onCreateChatGroup({
      includeCurrentUser: formData.get("includeCurrentUser") === "on",
      participantUserIds: formData.getAll("participants"),
      title: formData.get("title")
    });
  });

  const title = document.createElement("input");
  title.name = "title";
  title.type = "text";
  title.placeholder = "Nombre del grupo";

  const members = document.createElement("div");
  members.className = "chat-group-members";

  const currentUserOption = document.createElement("label");
  currentUserOption.className = "chat-group-member-option";
  const currentCheckbox = document.createElement("input");
  currentCheckbox.name = "includeCurrentUser";
  currentCheckbox.type = "checkbox";
  currentCheckbox.checked = true;
  currentUserOption.append(currentCheckbox, document.createTextNode("Incluirme"));
  members.append(currentUserOption);

  chat.directory
    .filter((member) => member.userId !== chat.currentUserId)
    .forEach((member) => {
      const label = document.createElement("label");
      label.className = "chat-group-member-option";

      const checkbox = document.createElement("input");
      checkbox.name = "participants";
      checkbox.type = "checkbox";
      checkbox.value = member.userId;

      label.append(checkbox, document.createTextNode(member.nickname ? `@${member.nickname}` : member.displayName));
      members.append(label);
    });

  const actions = document.createElement("div");
  actions.className = "chat-group-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "small-button";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancelar";
  cancelButton.addEventListener("click", () => onShowChatGroupForm(false));

  const createButton = document.createElement("button");
  createButton.className = "save-task-button";
  createButton.type = "submit";
  createButton.textContent = "Crear";

  actions.append(cancelButton, createButton);
  form.append(title, members, actions);
  return form;
}

function createChatConversationView({ chat, onBackChatList, onSendChatMessage, onUpdateChatDraft }) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-conversation-view";

  const topbar = document.createElement("div");
  topbar.className = "chat-conversation-topbar";

  const backButton = document.createElement("button");
  backButton.className = "small-button";
  backButton.type = "button";
  backButton.textContent = "Volver";
  backButton.addEventListener("click", onBackChatList);

  const title = document.createElement("div");
  title.className = "chat-conversation-title";
  const titleStrong = document.createElement("strong");
  titleStrong.textContent = getChatConversationTitle(chat);
  const meta = document.createElement("span");
  meta.textContent = getChatConversationMeta(chat);
  title.append(titleStrong, meta);
  topbar.append(backButton, title);
  wrapper.append(topbar);

  if (chat.error) {
    wrapper.append(createChatNotice(chat.error, "error"));
  }

  const activeConversation = chat.activeConversation;
  if (!activeConversation) {
    wrapper.append(createChatNotice("No encontramos esta conversación.", "muted"));
    return wrapper;
  }

  if (!activeConversation.isParticipant) {
    wrapper.append(createChatNotice("Este grupo fue creado por ti, pero no estás dentro. Puedes verlo en la lista, sin leer ni enviar mensajes.", "muted"));
    return wrapper;
  }

  const messageList = document.createElement("div");
  messageList.className = "chat-message-list";

  if (chat.activeMessages.length === 0) {
    messageList.append(createChatNotice("Sin mensajes todavía.", "muted"));
  } else {
    chat.activeMessages.forEach((message) => {
      messageList.append(createChatMessageBubble({ chat, message }));
    });
  }

  wrapper.append(messageList, createChatComposer({ chat, onSendChatMessage, onUpdateChatDraft }));
  return wrapper;
}

function createChatMessageBubble({ chat, message }) {
  const isOwn = message.senderUserId === chat.currentUserId;
  const row = document.createElement("div");
  row.className = `chat-message-row${isOwn ? " is-own" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  if (!isOwn && chat.activeConversation?.type === "group") {
    const sender = document.createElement("span");
    sender.className = "chat-message-sender";
    sender.textContent = message.senderNicknameSnapshot
      ? `@${message.senderNicknameSnapshot}`
      : "Miembro";
    bubble.append(sender);
  }

  if (message.body) {
    const body = document.createElement("p");
    body.className = "chat-message-text";
    appendLinkedText(body, message.body);
    bubble.append(body);
  }

  const attachments = chat.attachmentsByMessage.get(message.id) || [];
  attachments.forEach((attachment) => {
    if (attachment.signedUrl) {
      const link = document.createElement("a");
      link.className = "chat-image-link";
      link.href = attachment.signedUrl;
      link.target = "_blank";
      link.rel = "noreferrer noopener";

      const image = document.createElement("img");
      image.src = attachment.signedUrl;
      image.alt = attachment.fileName || "Imagen enviada";
      link.append(image);
      bubble.append(link);
    }
  });

  if (message.body) {
    appendImageUrlPreviews(bubble, message.body);
  }

  const time = document.createElement("time");
  time.className = "chat-message-time";
  time.dateTime = message.createdAt || "";
  time.textContent = formatMessageTime(message.createdAt);
  bubble.append(time);

  row.append(bubble);
  return row;
}

function createChatComposer({ chat, onSendChatMessage, onUpdateChatDraft }) {
  const form = document.createElement("form");
  form.className = "chat-composer";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const textarea = form.querySelector("textarea");
    const fileInput = form.querySelector('input[type="file"]');
    const body = textarea.value;
    const files = [...fileInput.files];

    textarea.value = "";
    fileInput.value = "";
    onUpdateChatDraft?.("");

    const wasSent = await onSendChatMessage({
      body,
      files
    });
    if (wasSent === false) {
      textarea.value = body;
      onUpdateChatDraft?.(body);
    }
  });

  const textarea = document.createElement("textarea");
  textarea.placeholder = navigator.onLine ? "Escribe un mensaje" : "Sin conexión";
  textarea.rows = 2;
  textarea.value = chat.draftBody || "";
  textarea.disabled = !navigator.onLine || chat.isLoading;
  textarea.addEventListener("input", () => {
    onUpdateChatDraft?.(textarea.value);
  });
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  const controls = document.createElement("div");
  controls.className = "chat-composer-controls";

  const imageLabel = document.createElement("label");
  imageLabel.className = "small-button chat-image-picker";
  imageLabel.textContent = "Imagen";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp,image/gif";
  fileInput.multiple = true;
  fileInput.disabled = !navigator.onLine || chat.isLoading;
  imageLabel.append(fileInput);

  const sendButton = document.createElement("button");
  sendButton.className = "save-task-button";
  sendButton.type = "submit";
  sendButton.disabled = !navigator.onLine || chat.isLoading;
  sendButton.textContent = "Enviar";

  controls.append(imageLabel, sendButton);
  form.append(textarea, controls);
  return form;
}

function createChatNotice(text, tone) {
  const notice = document.createElement("p");
  notice.className = `chat-notice${tone === "error" ? " is-error" : ""}`;
  notice.textContent = text;
  return notice;
}

function getChatConversationTitle(chat) {
  const conversation = chat.activeConversation;
  if (!conversation) {
    return "Chat";
  }

  if (conversation.type === "general") {
    return "General";
  }

  if (conversation.type === "group") {
    return conversation.title || "Grupo";
  }

  const participants = chat.participants || [];
  const targetParticipant = participants.find(
    (participant) => participant.conversationId === conversation.id && participant.userId !== chat.currentUserId
  );
  const member = chat.directory.find((item) => item.userId === targetParticipant?.userId);
  return member?.nickname ? `@${member.nickname}` : member?.displayName || "Directo";
}

function getChatConversationMeta(chat) {
  const conversation = chat.activeConversation;
  if (!conversation) {
    return "";
  }

  if (conversation.type === "direct") {
    return "Mensaje directo";
  }

  if (conversation.type === "group") {
    return conversation.isParticipant ? "Grupo" : "Sin acceso a mensajes";
  }

  return "Equipo completo";
}

function appendLinkedText(node, text) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      node.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const href = match[0];
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = href;
    node.append(link);
    lastIndex = match.index + href.length;
  }

  if (lastIndex < text.length) {
    node.append(document.createTextNode(text.slice(lastIndex)));
  }
}

function appendImageUrlPreviews(node, text) {
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  urls
    .filter((url) => /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url))
    .slice(0, 3)
    .forEach((url) => {
      const link = document.createElement("a");
      link.className = "chat-image-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";

      const image = document.createElement("img");
      image.src = url;
      image.alt = "Vista previa";
      image.loading = "lazy";
      link.append(image);
      node.append(link);
    });
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createTaskCard(task, onOpenTask, onMoveCard, teamMembers = []) {
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
  responsible.textContent = getResponsibleDisplayName(task.responsible, teamMembers);

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
  const isStageChart = chartCard.chartType === TASK_STAGE_BY_MEMBER_CHART_TYPE;
  const isLeaderboardChart = chartCard.chartType === TASK_LEADERBOARD_CHART_TYPE;
  card.className = [
    "task-card",
    "chart-card",
    isStageChart ? "stage-chart-card" : "",
    isLeaderboardChart ? "leaderboard-chart-card" : ""
  ].filter(Boolean).join(" ");
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
  badge.textContent = isStageChart ? "Pie chart" : "Line chart";
  const headerControl = isLeaderboardChart
    ? createLeaderboardModeControl(chartCard, onUpdateChartCard)
    : badge;

  header.append(title, headerControl);

  if (isLeaderboardChart) {
    const leaderboardData = getLeaderboardData({ chartCard, taskEvents, tasks, teamMembers });
    const leaderboard = createLeaderboardList(leaderboardData, teamMembers);
    const periodControls = createPeriodControls(chartCard, onUpdateChartCard);

    card.append(header, leaderboard, periodControls, moveHandle);
    return card;
  }

  if (isStageChart) {
    const chartData = getStageChartData({ chartCard, columns, taskEvents, tasks, teamMembers });
    const teamControl = createStageTeamControl(
      chartCard,
      teamMembers,
      chartData.selectedTeamMember,
      onUpdateChartCard
    );
    const pie = createPieChart(chartData);
    const breakdown = createStageBreakdown(chartData);
    const periodControls = createPeriodControls(chartCard, onUpdateChartCard);

    card.append(header, teamControl, pie, breakdown, periodControls, moveHandle);
    return card;
  }

  const chartData = getChartData({ chartCard, columns, taskEvents, tasks, teamMembers });
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

function getChartData({ chartCard, columns, tasks, taskEvents, teamMembers = [] }) {
  const workflowColumns = columns.filter((column) => column.id !== METRICS_COLUMN_ID);
  const period = chartCard.settings?.period || DEFAULT_CHART_PERIOD;
  const teamMember = chartCard.settings?.teamMember || DEFAULT_CHART_TEAM;
  const cutoff = getPeriodCutoff(period);
  const metricState = getMetricTaskStates({
    cutoff,
    taskEvents,
    tasks,
    workflowColumns
  });
  const selectedStates = metricState.states.filter(
    (state) => matchesResponsibleSelection(state.responsibleName, teamMember, teamMembers)
  );
  const values = getCumulativeStageValues(workflowColumns, selectedStates);

  return {
    labels: workflowColumns.map((column) => AXIS_LABELS[column.id] || column.title.slice(0, 1)),
    source: metricState.source,
    values
  };
}

function getStageChartData({ chartCard, columns, tasks, taskEvents, teamMembers }) {
  const workflowColumns = columns.filter((column) => column.id !== METRICS_COLUMN_ID);
  const selectedTeamMember = getStageTeamMember(chartCard, teamMembers);
  const period = chartCard.settings?.period || DEFAULT_CHART_PERIOD;
  const cutoff = getPeriodCutoff(period);
  const metricState = getMetricTaskStates({
    cutoff,
    taskEvents,
    tasks,
    workflowColumns
  });
  const selectedStates = metricState.states.filter(
    (state) => matchesResponsibleSelection(state.responsibleName, selectedTeamMember, teamMembers)
  );
  const values = getCurrentStageValues(workflowColumns, selectedStates);
  const total = values.reduce((sum, value) => sum + value, 0);
  const stages = workflowColumns.map((column, index) => {
    const count = values[index];

    return {
      count,
      id: column.id,
      label: AXIS_LABELS[column.id] || column.title.slice(0, 1),
      percent: total > 0 ? Math.round((count / total) * 100) : 0
    };
  });

  return {
    selectedTeamMember,
    stages,
    total
  };
}

function getStageTeamMember(chartCard, teamMembers) {
  const selectedTeamMember = chartCard.settings?.teamMember || DEFAULT_CHART_TEAM;

  if (
    selectedTeamMember &&
    selectedTeamMember !== DEFAULT_CHART_TEAM &&
    findTeamMemberByResponsibleName(selectedTeamMember, teamMembers)
  ) {
    return getTeamMemberChartValue(findTeamMemberByResponsibleName(selectedTeamMember, teamMembers));
  }

  return DEFAULT_CHART_TEAM;
}

function getLeaderboardData({ chartCard, tasks, taskEvents, teamMembers }) {
  const workflowColumns = DEFAULT_WORKFLOW_COLUMNS;
  const metric = LEADERBOARD_METRICS.includes(chartCard.settings?.leaderboardMetric)
    ? chartCard.settings.leaderboardMetric
    : DEFAULT_LEADERBOARD_METRIC;
  const cutoff = getPeriodCutoff(chartCard.settings?.period || DEFAULT_CHART_PERIOD);
  const teamKeys = getKnownResponsibleKeys(teamMembers);
  const completedIndex = workflowColumns.findIndex((column) => column.id === COMPLETED_COLUMN_ID);
  const metricState = getMetricTaskStates({
    cutoff,
    taskEvents,
    tasks,
    workflowColumns
  });
  const tasksInScope = metricState.states.filter((state) => {
    const responsible = state.responsibleName || "";

    return (
      state.retainedIndex >= completedIndex &&
      responsible &&
      responsible !== DEFAULT_RESPONSIBLE_NAME &&
      (teamKeys.size === 0 || teamKeys.has(getResponsibleKey(responsible)))
    );
  });
  const memberTotals = new Map();

  tasksInScope.forEach((state) => {
    const name = getCanonicalResponsibleValue(state.responsibleName, teamMembers);
    const current = memberTotals.get(name) || {
      count: 0,
      name,
      points: 0
    };
    current.count += 1;
    current.points += Number.isFinite(Number(state.points)) ? Number(state.points) : 0;
    memberTotals.set(name, current);
  });

  const rows = [...memberTotals.values()].map((member) => ({
    ...member,
    value: metric === "points" ? member.points : member.count
  }));
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const sortedRows = rows
    .sort((a, b) => b.value - a.value || b.count - a.count || a.name.localeCompare(b.name, "es-MX"))
    .map((row, index) => ({
      ...row,
      percent: totalValue > 0 ? Math.round((row.value / totalValue) * 100) : 0,
      rank: index + 1
    }));

  return {
    metric,
    rows: sortedRows,
    totalValue
  };
}

function getPeriodCutoff(periodValue) {
  const period = CHART_PERIODS.find((item) => item.value === periodValue);
  if (!period || period.days === null) {
    return null;
  }

  return Date.now() - period.days * 24 * 60 * 60 * 1000;
}

const DEFAULT_WORKFLOW_COLUMNS = [
  { id: "frozen" },
  { id: "todo" },
  { id: "in_progress" },
  { id: "developed" },
  { id: "verification" },
  { id: "completed" }
];

function getMetricTaskStates({ cutoff, workflowColumns, tasks, taskEvents }) {
  const columnIndexById = new Map(workflowColumns.map((column, index) => [column.id, index]));
  const tasksById = new Map(
    tasks.filter((task) => columnIndexById.has(task.columnId)).map((task) => [task.id, task])
  );
  const scopedEvents = taskEvents
    .filter((event) => tasksById.has(event.taskId))
    .filter((event) => METRIC_EVENT_TYPES.has(event.eventType))
    .filter((event) => !cutoff || getTaskEventTime(event) >= cutoff)
    .sort(compareTaskEvents);
  const eventsByTask = groupEventsByTask(scopedEvents);
  const source = scopedEvents.length > 0 ? "events" : "current";
  const sourceTasks = source === "events"
    ? [...eventsByTask.keys()].map((taskId) => tasksById.get(taskId)).filter(Boolean)
    : [...tasksById.values()];

  return {
    source,
    states: sourceTasks
      .map((task) => buildTaskMetricState({
        columnIndexById,
        events: eventsByTask.get(task.id) || [],
        task
      }))
      .filter((state) => state.retainedIndex >= 0)
  };
}

function buildTaskMetricState({ columnIndexById, events, task }) {
  const taskColumnIndex = getColumnIndex(task.columnId, columnIndexById);
  const state = {
    points: Number.isFinite(Number(task.points)) ? Number(task.points) : 0,
    projectName: task.project || "",
    responsibleName: task.responsible || "",
    retainedIndex: taskColumnIndex,
    taskId: task.id
  };

  events.forEach((event) => {
    if (COLUMN_ACTIVITY_EVENT_TYPES.has(event.eventType)) {
      const eventColumnIndex = getColumnIndex(getTaskEventColumnId(event), columnIndexById);
      if (eventColumnIndex >= 0) {
        state.retainedIndex = eventColumnIndex;
      }
    }

    state.responsibleName = event.responsibleName || state.responsibleName;
    state.projectName = event.projectName || state.projectName;
    state.points = Number.isFinite(Number(event.pointsSnapshot)) ? Number(event.pointsSnapshot) : state.points;
  });

  return state;
}

function getCumulativeStageValues(workflowColumns, states) {
  return workflowColumns.map((column, index) =>
    states.filter((state) => state.retainedIndex >= index).length
  );
}

function getCurrentStageValues(workflowColumns, states) {
  return workflowColumns.map((column, index) =>
    states.filter((state) => state.retainedIndex === index).length
  );
}

function groupEventsByTask(events) {
  return events.reduce((map, event) => {
    if (!map.has(event.taskId)) {
      map.set(event.taskId, []);
    }
    map.get(event.taskId).push(event);
    return map;
  }, new Map());
}

function compareTaskEvents(a, b) {
  const timeDiff = getTaskEventTime(a) - getTaskEventTime(b);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return String(a.id || "").localeCompare(String(b.id || ""));
}

function getColumnIndex(columnId, columnIndexById) {
  return columnIndexById.has(columnId) ? columnIndexById.get(columnId) : -1;
}

function getTaskEventColumnId(event) {
  return event.toColumnId || event.columnId;
}

function getTaskEventTime(event) {
  const time = new Date(event.occurredAt || event.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
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

function createPieChart({ stages, total }) {
  const width = 320;
  const height = 172;
  const centerX = width / 2;
  const centerY = 86;
  const radius = 60;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("pie-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Gráfica de tareas por etapa");

  if (total <= 0) {
    const emptyCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    emptyCircle.setAttribute("cx", String(centerX));
    emptyCircle.setAttribute("cy", String(centerY));
    emptyCircle.setAttribute("r", String(radius));
    emptyCircle.classList.add("pie-empty");
    svg.append(emptyCircle);
  } else {
    let currentAngle = -90;

    stages.forEach((stage) => {
      if (stage.count <= 0) {
        return;
      }

      const angle = (stage.count / total) * 360;
      const segment = document.createElementNS("http://www.w3.org/2000/svg", "path");
      segment.setAttribute(
        "d",
        createPieSegmentPath(centerX, centerY, radius, currentAngle, currentAngle + angle)
      );
      segment.classList.add("pie-segment", `pie-segment-${stage.id}`);

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${stage.count}${stage.label} · ${stage.percent}%`;
      segment.append(title);
      svg.append(segment);
      currentAngle += angle;
    });
  }

  const shell = document.createElement("div");
  shell.className = "chart-frame pie-chart-frame";
  shell.append(svg);
  return shell;
}

function createPieSegmentPath(centerX, centerY, radius, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) {
    const top = pointOnCircle(centerX, centerY, radius, -90);
    const bottom = pointOnCircle(centerX, centerY, radius, 90);
    return [
      `M ${top.x} ${top.y}`,
      `A ${radius} ${radius} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${radius} ${radius} 0 1 1 ${top.x} ${top.y}`,
      "Z"
    ].join(" ");
  }

  const start = pointOnCircle(centerX, centerY, radius, startAngle);
  const end = pointOnCircle(centerX, centerY, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z"
  ].join(" ");
}

function pointOnCircle(centerX, centerY, radius, angle) {
  const radians = (angle * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians)
  };
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

function createLeaderboardModeControl(chartCard, onUpdateChartCard) {
  const select = document.createElement("select");
  select.className = "leaderboard-mode-select";
  select.setAttribute("aria-label", "Ordenar leaderboard por");

  LEADERBOARD_METRICS.forEach((metric) => {
    const option = document.createElement("option");
    option.value = metric;
    option.textContent = LEADERBOARD_MODE_LABELS[metric];
    select.append(option);
  });

  select.value = chartCard.settings?.leaderboardMetric || DEFAULT_LEADERBOARD_METRIC;
  select.addEventListener("change", () => {
    onUpdateChartCard({
      ...chartCard,
      settings: {
        ...chartCard.settings,
        leaderboardMetric: select.value
      },
      updatedAt: new Date().toISOString()
    });
  });

  return select;
}

function createLeaderboardList({ metric, rows }, teamMembers = []) {
  const list = document.createElement("div");
  list.className = "leaderboard-list";

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "leaderboard-empty";
    empty.textContent = "Sin completadas";
    list.append(empty);
    return list;
  }

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "leaderboard-row";

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = `#${row.rank}`;

    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = getResponsibleDisplayName(row.name, teamMembers);

    const value = document.createElement("span");
    value.className = "leaderboard-value";
    value.textContent = metric === "points"
      ? `${formatLeaderboardNumber(row.value)}Pts`
      : `${row.value}C`;

    const percent = document.createElement("span");
    percent.className = "leaderboard-percent";
    percent.textContent = `${row.percent}%`;

    item.append(rank, name, value, percent);
    list.append(item);
  });

  return list;
}

function formatLeaderboardNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function createStageTeamControl(chartCard, teamMembers, selectedTeamMember, onUpdateChartCard) {
  const wrapper = document.createElement("label");
  wrapper.className = "chart-team-control stage-team-control";
  wrapper.textContent = "Team member";

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Integrante del equipo para tareas por etapa");

  const allOption = document.createElement("option");
  allOption.value = DEFAULT_CHART_TEAM;
  allOption.textContent = "Todos";
  select.append(allOption);

  teamMembers.forEach((teamMember) => {
    const teamMemberValue = getTeamMemberChartValue(teamMember);
    if (!teamMemberValue) {
      return;
    }
    const option = document.createElement("option");
    option.value = teamMemberValue;
    option.textContent = getResponsibleDisplayName(teamMemberValue, teamMembers);
    select.append(option);
  });
  select.value = selectedTeamMember || DEFAULT_CHART_TEAM;

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

function createStageBreakdown({ stages }) {
  const wrapper = document.createElement("div");
  wrapper.className = "stage-breakdown";

  stages.forEach((stage) => {
    const item = document.createElement("div");
    item.className = `stage-metric stage-metric-${stage.id}`;

    const count = document.createElement("span");
    count.className = "stage-count";

    const number = document.createElement("span");
    number.className = "stage-number";
    number.textContent = String(stage.count);

    const letter = document.createElement("span");
    letter.className = "stage-letter";
    letter.textContent = stage.label;
    count.append(number, letter);

    const percent = document.createElement("span");
    percent.className = "stage-percent";
    percent.textContent = `${stage.percent}%`;

    item.append(count, percent);
    wrapper.append(item);
  });

  return wrapper;
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
    const teamMemberValue = getTeamMemberChartValue(teamMember);
    if (!teamMemberValue) {
      return;
    }
    const option = document.createElement("option");
    option.value = teamMemberValue;
    option.textContent = getTeamMemberDisplayName(teamMember);
    select.append(option);
  });

  select.value = chartCard.settings?.teamMember === DEFAULT_CHART_TEAM
    ? DEFAULT_CHART_TEAM
    : getCanonicalResponsibleValue(chartCard.settings?.teamMember, teamMembers) || DEFAULT_CHART_TEAM;
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

function getResponsibleDisplayName(responsibleName, teamMembers = []) {
  const normalizedResponsible = normalizeTeamMemberName(responsibleName);
  if (!normalizedResponsible || normalizedResponsible === DEFAULT_RESPONSIBLE_NAME) {
    return normalizedResponsible || DEFAULT_RESPONSIBLE_NAME;
  }

  const teamMember = findTeamMemberByResponsibleName(normalizedResponsible, teamMembers);

  return getTeamMemberDisplayName(teamMember, normalizedResponsible);
}

function getTeamMemberDisplayName(teamMember, fallbackName = "") {
  if (teamMember?.status !== "local" && teamMember?.nickname) {
    return `@${teamMember.nickname}`;
  }

  return fallbackName || normalizeTeamMemberName(teamMember?.name) || DEFAULT_RESPONSIBLE_NAME;
}

function getTeamMemberChartValue(teamMember) {
  if (teamMember?.status !== "local" && teamMember?.nickname) {
    return teamMember.nickname;
  }

  return normalizeTeamMemberName(teamMember?.name);
}

function matchesResponsibleSelection(responsibleName, selectedTeamMember, teamMembers = []) {
  if (selectedTeamMember === DEFAULT_CHART_TEAM) {
    return true;
  }

  const selectedKeys = getResponsibleMatchKeys(selectedTeamMember, teamMembers);
  return selectedKeys.has(getResponsibleKey(responsibleName));
}

function getCanonicalResponsibleValue(responsibleName, teamMembers = []) {
  if (!responsibleName || responsibleName === DEFAULT_CHART_TEAM) {
    return responsibleName || "";
  }

  const teamMember = findTeamMemberByResponsibleName(responsibleName, teamMembers);
  return teamMember ? getTeamMemberChartValue(teamMember) : normalizeTeamMemberName(responsibleName);
}

function getKnownResponsibleKeys(teamMembers = []) {
  const keys = new Set();
  teamMembers.forEach((teamMember) => {
    const nameKey = getResponsibleKey(teamMember.name);
    const nicknameKey = getResponsibleKey(teamMember.nickname);
    if (nameKey) {
      keys.add(nameKey);
    }
    if (nicknameKey) {
      keys.add(nicknameKey);
    }
  });
  return keys;
}

function getResponsibleMatchKeys(responsibleName, teamMembers = []) {
  const keys = new Set();
  const directKey = getResponsibleKey(responsibleName);
  if (directKey) {
    keys.add(directKey);
  }

  const teamMember = findTeamMemberByResponsibleName(responsibleName, teamMembers);
  if (teamMember) {
    const nameKey = getResponsibleKey(teamMember.name);
    const nicknameKey = getResponsibleKey(teamMember.nickname);
    if (nameKey) {
      keys.add(nameKey);
    }
    if (nicknameKey) {
      keys.add(nicknameKey);
    }
  }

  return keys;
}

function findTeamMemberByResponsibleName(responsibleName, teamMembers = []) {
  const responsibleKey = getResponsibleKey(responsibleName);
  if (!responsibleKey || responsibleKey === getResponsibleKey(DEFAULT_RESPONSIBLE_NAME)) {
    return null;
  }

  return teamMembers.find((member) => {
    const memberName = getResponsibleKey(member.name);
    const memberNickname = getResponsibleKey(member.nickname);
    return memberName === responsibleKey || memberNickname === responsibleKey;
  }) || null;
}

function getResponsibleKey(value) {
  return normalizeTeamMemberName(value).toLocaleLowerCase("es-MX");
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
