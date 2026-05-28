import {
  DEFAULT_CHART_TEAM,
  DEFAULT_COLUMNS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_RESPONSIBLE_NAME,
  createId,
  getFolioNumber,
  normalizeChartCard,
  normalizeColumn,
  normalizeProject,
  normalizeTask,
  normalizeTaskEvent,
  normalizeTeamMember,
  sortByOrder
} from "./models.js?v=20260527-project-cloud-rename";

export const BOARD_SCOPED_TABLES = [
  "columns",
  "projects",
  "team_members",
  "tasks",
  "checklists",
  "checklist_items",
  "chart_cards",
  "task_events",
  "client_mutations"
];

const DEFAULT_BOARD_TITLE = "JavoPM";
const DEFAULT_WORKSPACE_NAME = "JavoPM";
const UPSERT_CONFLICTS = {
  projects: "board_id,name",
  tasks: "board_id,folio",
  team_members: "id"
};

export async function createOwnerWorkspaceFromSnapshot({ clientId, snapshot, supabase, user }) {
  const now = new Date().toISOString();
  const workspace = {
    id: createId("workspace"),
    name: DEFAULT_WORKSPACE_NAME,
    owner_id: user.id,
    client_id: clientId,
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };
  const board = {
    id: createId("board"),
    workspace_id: workspace.id,
    title: DEFAULT_BOARD_TITLE,
    client_id: clientId,
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };
  const membership = {
    id: createId("member"),
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
    status: "active",
    created_by: user.id,
    client_id: clientId,
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };
  const profile = {
    user_id: user.id,
    account_type: "owner",
    email: user.email || null,
    nickname: null,
    display_name: getDisplayName(user.email),
    created_at: now,
    updated_at: now
  };

  await upsertOne(supabase, "profiles", profile, "user_id");
  await upsertOne(supabase, "workspaces", workspace);
  await upsertOne(supabase, "workspace_members", membership);
  await upsertOne(supabase, "boards", board);
  await importSnapshotRows({ boardId: board.id, clientId, snapshot, supabase });

  return {
    boardId: board.id,
    workspaceId: workspace.id,
    ownerId: user.id
  };
}

export async function pullOwnerBoardSnapshot({ supabase, userId }) {
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  throwIfError(membershipError);

  const workspaceIds = (memberships || []).map((membership) => membership.workspace_id);

  if (workspaceIds.length === 0) {
    throw new Error("No encontramos un workspace activo para esta cuenta.");
  }

  const { data: boards, error: boardError } = await supabase
    .from("boards")
    .select("id, workspace_id, title")
    .in("workspace_id", workspaceIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  throwIfError(boardError);

  const board = boards?.[0];

  if (!board) {
    throw new Error("No encontramos un tablero activo para esta cuenta.");
  }

  return {
    boardId: board.id,
    membershipRole: memberships.find((membership) => membership.workspace_id === board.workspace_id)?.role || "member",
    ownerProfile: await fetchBoardOwnerProfile({ boardId: board.id, supabase }),
    profile: await fetchProfile({ supabase, userId }),
    snapshot: await fetchBoardSnapshot({ boardId: board.id, supabase }),
    workspaceId: board.workspace_id
  };
}

async function fetchProfile({ supabase, userId }) {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_type, display_name, email, nickname, password_setup_required, team_member_id, workspace_id")
    .eq("user_id", userId)
    .maybeSingle();

  throwIfError(error);
  return data || null;
}

async function fetchBoardOwnerProfile({ boardId, supabase }) {
  const { data, error } = await supabase.rpc("get_board_owner_profile", {
    p_board_id: boardId
  });

  throwIfError(error);

  const ownerProfile = Array.isArray(data) ? data[0] : data;
  if (!ownerProfile) {
    return null;
  }

  return {
    displayName: ownerProfile.display_name || "",
    nickname: ownerProfile.nickname || "",
    userId: ownerProfile.user_id || ""
  };
}

export async function fetchBoardSnapshot({ boardId, supabase }) {
  const [
    columns,
    projects,
    teamMembers,
    tasks,
    checklists,
    checklistItems,
    chartCards,
    taskEvents
  ] = await Promise.all([
    fetchBoardRows(supabase, "columns", boardId),
    fetchBoardRows(supabase, "projects", boardId),
    fetchBoardRows(supabase, "team_members", boardId),
    fetchBoardRows(supabase, "tasks", boardId),
    fetchBoardRows(supabase, "checklists", boardId),
    fetchBoardRows(supabase, "checklist_items", boardId),
    fetchBoardRows(supabase, "chart_cards", boardId),
    fetchBoardRows(supabase, "task_events", boardId)
  ]);

  return rowsToLocalSnapshot({
    chartCards,
    checklistItems,
    checklists,
    columns,
    projects,
    taskEvents,
    tasks,
    teamMembers
  });
}

export async function importSnapshotRows({ boardId, clientId, snapshot, supabase }) {
  const rows = localSnapshotToRows({ boardId, clientId, snapshot });
  await upsertRows(supabase, "columns", rows.columns);
  await upsertRows(supabase, "projects", rows.projects);
  await upsertRows(supabase, "team_members", rows.teamMembers);
  await remapTaskRowsToExistingFolios({ boardId, rows, supabase });
  await upsertRows(supabase, "tasks", rows.tasks);
  await upsertRows(supabase, "checklists", rows.checklists);
  await upsertRows(supabase, "checklist_items", rows.checklistItems);
  await remapChartRowsToExistingTypes({ boardId, rows, supabase });
  await upsertRows(supabase, "chart_cards", rows.chartCards);
  await upsertRows(supabase, "task_events", rows.taskEvents);
  await upsertOne(supabase, "board_counters", {
    board_id: boardId,
    next_folio_number: getNextFolioNumber(snapshot.tasks),
    updated_at: new Date().toISOString()
  }, "board_id");
}

export async function pushMutationToCloud({ context, mutation, supabase }) {
  const now = new Date().toISOString();
  await upsertOne(supabase, "client_mutations", {
    id: mutation.mutationId,
    mutation_id: mutation.mutationId,
    board_id: context.boardId,
    entity_type: mutation.entityType,
    entity_id: mutation.entityId,
    operation: mutation.operation,
    patch: mutation.patch || {},
    base_version: mutation.baseVersion || null,
    status: "applied",
    client_id: context.clientId,
    version: 1,
    created_at: mutation.createdAt || now,
    updated_at: now,
    deleted_at: null
  });

  if (mutation.operation === "delete") {
    await softDeleteEntity({ context, mutation, supabase });
    return;
  }

  await upsertEntity({ context, mutation, supabase });
}

export async function allocateCloudFolioNumber({ boardId, supabase }) {
  const { data, error } = await supabase.rpc("allocate_task_folio", {
    p_board_id: boardId
  });

  throwIfError(error);
  return Number(data);
}

function localSnapshotToRows({ boardId, clientId, snapshot = {} }) {
  const columns = Array.isArray(snapshot.columns) && snapshot.columns.length > 0
    ? snapshot.columns
    : DEFAULT_COLUMNS;
  const now = new Date().toISOString();

  return {
    chartCards: (snapshot.chartCards || []).map((chartCard, index) =>
      chartCardToRow(normalizeChartCard(chartCard, index), { boardId, clientId })
    ),
    checklistItems: (snapshot.tasks || []).flatMap((task) =>
      normalizeTask(task).checklists.flatMap((checklist) =>
        checklist.items.map((item, index) =>
          checklistItemToRow(item, {
            boardId,
            checklistId: checklist.id,
            clientId,
            order: index
          })
        )
      )
    ),
    checklists: (snapshot.tasks || []).flatMap((task) =>
      normalizeTask(task).checklists.map((checklist, index) =>
        checklistToRow(checklist, {
          boardId,
          clientId,
          order: index,
          taskId: task.id
        })
      )
    ),
    columns: columns.map((column, index) =>
      columnToRow(normalizeColumn(column, index), { boardId, clientId })
    ),
    projects: (snapshot.projects || []).map((project, index) =>
      projectToRow(normalizeProject(project, index), { boardId, clientId })
    ),
    taskEvents: (snapshot.taskEvents || []).map((taskEvent) =>
      taskEventToRow(normalizeTaskEvent(taskEvent), { boardId, clientId })
    ),
    tasks: (snapshot.tasks || []).map((task, index) =>
      taskToRow(normalizeTask(task), { boardId, clientId, order: index })
    ),
    teamMembers: (snapshot.teamMembers || []).map((teamMember, index) =>
      teamMemberToRow(normalizeTeamMember(teamMember, index), { boardId, clientId })
    ),
    touchedAt: now
  };
}

function rowsToLocalSnapshot(rows) {
  const itemsByChecklist = groupBy(rows.checklistItems, "checklist_id");
  const checklistsByTask = groupBy(rows.checklists, "task_id");
  const tasks = rows.tasks.map((row) => {
    const taskChecklists = sortByOrder((checklistsByTask.get(row.id) || []).map((checklistRow) => ({
      id: checklistRow.id,
      items: sortByOrder((itemsByChecklist.get(checklistRow.id) || []).map((itemRow) => ({
        completed: Boolean(itemRow.completed),
        id: itemRow.id,
        order: itemRow.order_index || 0,
        text: itemRow.text || "Nuevo elemento"
      }))),
      order: checklistRow.order_index || 0,
      title: checklistRow.title || "Checklist"
    })));

    return {
      checklists: taskChecklists,
      columnId: row.column_id,
      createdAt: row.created_at,
      endDate: row.end_date || "",
      folio: row.folio,
      id: row.id,
      longDescription: row.long_description || "",
      order: row.order_index || 0,
      points: Number(row.points || 0),
      project: row.project_name || DEFAULT_PROJECT_NAME,
      responsible: row.responsible_name || DEFAULT_RESPONSIBLE_NAME,
      shortDescription: row.short_description || "Nueva tarea",
      startDate: row.start_date || "",
      type: row.type || "Tarea",
      updatedAt: row.updated_at
    };
  });

  return {
    chartCards: dedupeChartRowsByType(rows.chartCards).map((row) => ({
      chartType: row.chart_type,
      columnId: row.column_id,
      createdAt: row.created_at,
      id: row.id,
      order: row.order_index || 0,
      settings: row.settings || { period: "1D", teamMember: DEFAULT_CHART_TEAM },
      title: row.title || "Tareas por columna",
      updatedAt: row.updated_at
    })),
    columns: rows.columns.map((row) => ({
      allowTaskCreation: row.allow_task_creation,
      id: row.id,
      order: row.order_index || 0,
      title: row.title
    })),
    exportedAt: new Date().toISOString(),
    projects: rows.projects.map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      name: row.name,
      order: row.order_index || 0,
      updatedAt: row.updated_at
    })),
    taskEvents: rows.taskEvents.map((row) => ({
      columnId: row.column_id,
      createdAt: row.created_at,
      eventType: row.event_type,
      folio: row.folio || "",
      fromColumnId: row.from_column_id || "",
      id: row.id,
      metadata: row.metadata || {},
      occurredAt: row.occurred_at || row.created_at,
      pointsSnapshot: row.points_snapshot === null || row.points_snapshot === undefined
        ? null
        : Number(row.points_snapshot),
      projectName: row.project_name || "",
      responsibleName: row.responsible_name || "",
      taskId: row.task_id,
      toColumnId: row.to_column_id || row.column_id
    })),
    tasks,
    teamMembers: rows.teamMembers.map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      lastLoginAt: row.last_login_at || "",
      name: row.name,
      nickname: row.nickname || "",
      order: row.order_index || 0,
      status: row.status || "local",
      userId: row.user_id || "",
      updatedAt: row.updated_at
    }))
  };
}

async function upsertEntity({ context, mutation, supabase }) {
  if (!mutation.entity) {
    return;
  }

  if (mutation.entityType === "task") {
    const task = normalizeTask(mutation.entity);
    await upsertOne(supabase, "tasks", taskToRow(task, context));
    await upsertRows(
      supabase,
      "checklists",
      task.checklists.map((checklist, index) =>
        checklistToRow(checklist, {
          ...context,
          order: index,
          taskId: task.id
        })
      )
    );
    await upsertRows(
      supabase,
      "checklist_items",
      task.checklists.flatMap((checklist) =>
        checklist.items.map((item, index) =>
          checklistItemToRow(item, {
            ...context,
            checklistId: checklist.id,
            order: index
          })
        )
      )
    );
    return;
  }

  if (mutation.entityType === "project") {
    await upsertOne(
      supabase,
      "projects",
      projectToRow(normalizeProject(mutation.entity), context),
      mutation.operation === "update" ? "id" : UPSERT_CONFLICTS.projects
    );
    return;
  }

  if (mutation.entityType === "teamMember") {
    await upsertOne(
      supabase,
      "team_members",
      teamMemberToRow(normalizeTeamMember(mutation.entity), context),
      UPSERT_CONFLICTS.team_members
    );
    return;
  }

  if (mutation.entityType === "chartCard") {
    await upsertOne(
      supabase,
      "chart_cards",
      chartCardToRow(normalizeChartCard(mutation.entity), context)
    );
    return;
  }

  if (mutation.entityType === "taskEvent") {
    await upsertOne(
      supabase,
      "task_events",
      taskEventToRow(normalizeTaskEvent(mutation.entity), context)
    );
  }
}

async function softDeleteEntity({ context, mutation, supabase }) {
  const tableByEntity = {
    chartCard: "chart_cards",
    project: "projects",
    task: "tasks",
    teamMember: "team_members"
  };
  const table = tableByEntity[mutation.entityType];

  if (!table) {
    return;
  }

  const { error } = await supabase
    .from(table)
    .update({
      client_id: context.clientId,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("board_id", context.boardId)
    .eq("id", mutation.entityId);

  throwIfError(error);
}

function columnToRow(column, { boardId, clientId }) {
  return withBoardFields({
    allow_task_creation: column.allowTaskCreation,
    id: column.id,
    order_index: column.order,
    sort_key: getSortKey(column.order),
    title: column.title
  }, { boardId, clientId, createdAt: column.createdAt, updatedAt: column.updatedAt });
}

function projectToRow(project, { boardId, clientId }) {
  return withBoardFields({
    id: project.id,
    name: project.name,
    order_index: project.order,
    sort_key: getSortKey(project.order)
  }, { boardId, clientId, createdAt: project.createdAt, updatedAt: project.updatedAt });
}

function teamMemberToRow(teamMember, { boardId, clientId }) {
  return withBoardFields({
    id: teamMember.id,
    name: teamMember.name,
    nickname: teamMember.nickname || null,
    order_index: teamMember.order,
    status: teamMember.status || "local",
    user_id: teamMember.userId || null,
    sort_key: getSortKey(teamMember.order)
  }, { boardId, clientId, createdAt: teamMember.createdAt, updatedAt: teamMember.updatedAt });
}

function taskToRow(task, { boardId, clientId, order }) {
  const orderIndex = Number.isFinite(Number(task.order)) ? Number(task.order) : order || 0;
  return withBoardFields({
    column_id: task.columnId,
    end_date: task.endDate || null,
    folio: task.folio,
    folio_number: getFolioNumber(task.folio) || null,
    id: task.id,
    long_description: task.longDescription || "",
    order_index: orderIndex,
    points: Number(task.points || 0),
    project_id: null,
    project_name: task.project || DEFAULT_PROJECT_NAME,
    responsible_member_id: null,
    responsible_name: task.responsible || DEFAULT_RESPONSIBLE_NAME,
    short_description: task.shortDescription,
    sort_key: getSortKey(orderIndex),
    start_date: task.startDate || null,
    type: task.type
  }, { boardId, clientId, createdAt: task.createdAt, updatedAt: task.updatedAt });
}

function checklistToRow(checklist, { boardId, clientId, order, taskId }) {
  const orderIndex = Number.isFinite(Number(checklist.order)) ? Number(checklist.order) : order || 0;
  return withBoardFields({
    id: checklist.id,
    order_index: orderIndex,
    sort_key: getSortKey(orderIndex),
    task_id: taskId,
    title: checklist.title
  }, { boardId, clientId });
}

function checklistItemToRow(item, { boardId, checklistId, clientId, order }) {
  const orderIndex = Number.isFinite(Number(item.order)) ? Number(item.order) : order || 0;
  return withBoardFields({
    checklist_id: checklistId,
    completed: Boolean(item.completed),
    id: item.id,
    order_index: orderIndex,
    sort_key: getSortKey(orderIndex),
    text: item.text
  }, { boardId, clientId });
}

function chartCardToRow(chartCard, { boardId, clientId }) {
  return withBoardFields({
    chart_type: chartCard.chartType,
    column_id: chartCard.columnId,
    id: chartCard.id,
    order_index: chartCard.order,
    settings: chartCard.settings || {},
    sort_key: getSortKey(chartCard.order),
    title: chartCard.title
  }, { boardId, clientId, createdAt: chartCard.createdAt, updatedAt: chartCard.updatedAt });
}

function taskEventToRow(taskEvent, { boardId, clientId }) {
  return withBoardFields({
    column_id: taskEvent.columnId,
    event_type: taskEvent.eventType,
    folio: taskEvent.folio || null,
    from_column_id: taskEvent.fromColumnId || null,
    id: taskEvent.id,
    metadata: taskEvent.metadata || {},
    occurred_at: taskEvent.occurredAt || taskEvent.createdAt,
    points_snapshot: taskEvent.pointsSnapshot === null || taskEvent.pointsSnapshot === undefined
      ? null
      : Number(taskEvent.pointsSnapshot),
    project_name: taskEvent.projectName || null,
    responsible_name: taskEvent.responsibleName || null,
    task_id: taskEvent.taskId,
    to_column_id: taskEvent.toColumnId || taskEvent.columnId
  }, {
    boardId,
    clientId,
    createdAt: taskEvent.createdAt,
    updatedAt: taskEvent.createdAt
  });
}

function withBoardFields(row, { boardId, clientId, createdAt, updatedAt }) {
  const now = new Date().toISOString();
  return {
    ...row,
    board_id: boardId,
    client_id: clientId,
    created_at: createdAt || now,
    deleted_at: null,
    updated_at: updatedAt || now,
    version: Number(row.version || 1)
  };
}

function getNextFolioNumber(tasks = []) {
  return Math.max(1, ...tasks.map((task) => getFolioNumber(task.folio) + 1));
}

function getSortKey(order = 0) {
  return String(Number.isFinite(Number(order)) ? Number(order) : 0).padStart(6, "0");
}

function getDisplayName(email = "") {
  return email.split("@")[0] || "Cuenta";
}

function groupBy(rows, key) {
  return rows.reduce((map, row) => {
    const value = row[key];
    if (!map.has(value)) {
      map.set(value, []);
    }
    map.get(value).push(row);
    return map;
  }, new Map());
}

async function fetchBoardRows(supabase, tableName, boardId) {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("board_id", boardId)
    .is("deleted_at", null)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  throwIfError(error);
  return data || [];
}

async function remapTaskRowsToExistingFolios({ boardId, rows, supabase }) {
  if (!rows.tasks.length) {
    return;
  }

  const folios = [...new Set(rows.tasks.map((task) => task.folio).filter(Boolean))];
  if (!folios.length) {
    return;
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("id, folio")
    .eq("board_id", boardId)
    .in("folio", folios);

  throwIfError(error);

  const existingIdByFolio = new Map((data || []).map((task) => [task.folio, task.id]));
  const remappedTaskIds = new Map();

  rows.tasks.forEach((task) => {
    const existingId = existingIdByFolio.get(task.folio);
    if (existingId && existingId !== task.id) {
      remappedTaskIds.set(task.id, existingId);
      task.id = existingId;
    }
  });

  if (!remappedTaskIds.size) {
    return;
  }

  rows.checklists.forEach((checklist) => {
    if (remappedTaskIds.has(checklist.task_id)) {
      checklist.task_id = remappedTaskIds.get(checklist.task_id);
    }
  });

  rows.taskEvents.forEach((event) => {
    if (remappedTaskIds.has(event.task_id)) {
      event.task_id = remappedTaskIds.get(event.task_id);
    }
  });
}

async function remapChartRowsToExistingTypes({ boardId, rows, supabase }) {
  if (!rows.chartCards.length) {
    return;
  }

  const chartTypes = [...new Set(rows.chartCards.map((chartCard) => chartCard.chart_type).filter(Boolean))];
  if (!chartTypes.length) {
    return;
  }

  const { data, error } = await supabase
    .from("chart_cards")
    .select("id, chart_type")
    .eq("board_id", boardId)
    .in("chart_type", chartTypes)
    .order("created_at", { ascending: true });

  throwIfError(error);

  const existingIdByType = new Map();
  (data || []).forEach((chartCard) => {
    if (!existingIdByType.has(chartCard.chart_type)) {
      existingIdByType.set(chartCard.chart_type, chartCard.id);
    }
  });

  rows.chartCards.forEach((chartCard) => {
    const existingId = existingIdByType.get(chartCard.chart_type);
    if (existingId) {
      chartCard.id = existingId;
    }
  });
}

function dedupeChartRowsByType(chartRows) {
  const seenTypes = new Set();
  return chartRows.filter((chartRow) => {
    const key = chartRow.chart_type || chartRow.id;
    if (seenTypes.has(key)) {
      return false;
    }
    seenTypes.add(key);
    return true;
  });
}

async function upsertRows(supabase, tableName, rows) {
  if (!rows.length) {
    return [];
  }

  const { data, error } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: UPSERT_CONFLICTS[tableName] || "id" })
    .select();

  throwIfError(error);
  return data || [];
}

async function upsertOne(supabase, tableName, row, onConflict = "id") {
  const { data, error } = await supabase
    .from(tableName)
    .upsert(row, { onConflict })
    .select()
    .single();

  throwIfError(error);
  return data;
}

function throwIfError(error) {
  if (error) {
    throw new Error(error.message || "Error de Supabase.");
  }
}
