import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== "POST") {
    return errorResponse("Método no permitido.", 405);
  }

  try {
    const { admin, user } = await getUserFromRequest(req);

    const { data: guest, error: guestError } = await admin
      .from("guest_accounts")
      .select("id, workspace_id, board_id, user_id, name, nickname, status, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (guestError || !guest) {
      throw new Error("No encontramos acceso de invitado activo.");
    }

    const snapshot = await buildGuestSnapshot(admin, guest);

    return jsonResponse({
      account: {
        accountType: "guest",
        displayName: guest.name,
        email: "",
        guestId: guest.id,
        nickname: guest.nickname,
        role: "guest",
        userId: guest.user_id
      },
      cloud: {
        boardId: guest.board_id,
        snapshot,
        workspaceId: guest.workspace_id
      },
      guest
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo cargar el tablero de invitado.", 400);
  }
});

async function buildGuestSnapshot(admin: any, guest: Record<string, any>) {
  const [columns, allowedProjects] = await Promise.all([
    fetchColumns(admin, guest.board_id),
    fetchAllowedProjects(admin, guest.id, guest.board_id)
  ]);
  const projectNames = allowedProjects.map((project: any) => String(project.name || "")).filter(Boolean);
  const tasks = projectNames.length > 0
    ? await fetchTasks(admin, guest.board_id, projectNames)
    : [];
  const taskIds = tasks.map((task: any) => String(task.id || ""));
  const checklists = taskIds.length > 0 ? await fetchChecklists(admin, guest.board_id, taskIds) : [];
  const checklistIds = checklists.map((checklist: any) => String(checklist.id || ""));
  const checklistItems = checklistIds.length > 0 ? await fetchChecklistItems(admin, guest.board_id, checklistIds) : [];

  const itemsByChecklist = groupBy(checklistItems, "checklist_id");
  const checklistsByTask = groupBy(checklists, "task_id");

  return {
    chartCards: [],
    columns: columns.map((row: any) => ({
      allowTaskCreation: false,
      id: row.id,
      order: row.order_index || 0,
      title: row.title
    })),
    crmProspects: [],
    projects: allowedProjects.map((row: any) => ({
      createdAt: row.created_at,
      id: row.id,
      name: row.name,
      order: row.order_index || 0,
      updatedAt: row.updated_at
    })),
    taskEvents: [],
    tasks: tasks.map((row: any) => ({
      checklists: (checklistsByTask.get(row.id) || []).map((checklistRow: any) => ({
        id: checklistRow.id,
        items: (itemsByChecklist.get(checklistRow.id) || []).map((itemRow: any) => ({
          completed: Boolean(itemRow.completed),
          id: itemRow.id,
          order: itemRow.order_index || 0,
          text: itemRow.text || "Nuevo elemento"
        })).sort(byOrder),
        order: checklistRow.order_index || 0,
        title: checklistRow.title || "Checklist"
      })).sort(byOrder),
      columnId: row.column_id,
      createdAt: row.created_at,
      endDate: "",
      folio: row.folio,
      id: row.id,
      longDescription: row.long_description || "",
      order: row.order_index || 0,
      points: 0,
      project: row.project_name || "",
      responsible: "",
      shortDescription: row.short_description || "Nueva tarea",
      startDate: "",
      type: row.type || "Tarea",
      updatedAt: row.updated_at
    })),
    teamMembers: []
  };
}

async function fetchColumns(admin: any, boardId: string) {
  const { data, error } = await admin
    .from("columns")
    .select("id, title, allow_task_creation, order_index")
    .eq("board_id", boardId)
    .neq("id", "metrics")
    .is("deleted_at", null)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar las columnas.");
  }
  return data || [];
}

async function fetchAllowedProjects(admin: any, guestId: string, boardId: string) {
  const { data: accessRows, error: accessError } = await admin
    .from("guest_project_access")
    .select("project_id")
    .eq("guest_id", guestId)
    .eq("board_id", boardId)
    .is("deleted_at", null);

  if (accessError) {
    throw new Error(accessError.message || "No se pudieron cargar los proyectos autorizados.");
  }

  const projectIds = [...new Set((accessRows || []).map((row: any) => String(row.project_id || "")).filter(Boolean))];
  if (projectIds.length === 0) {
    return [];
  }

  const { data, error } = await admin
    .from("projects")
    .select("id, name, order_index, created_at, updated_at")
    .eq("board_id", boardId)
    .in("id", projectIds)
    .is("deleted_at", null)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar los proyectos.");
  }
  return data || [];
}

async function fetchTasks(admin: any, boardId: string, projectNames: string[]) {
  const { data, error } = await admin
    .from("tasks")
    .select("id, column_id, project_name, type, folio, short_description, long_description, order_index, created_at, updated_at")
    .eq("board_id", boardId)
    .in("project_name", projectNames)
    .is("deleted_at", null)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar las tareas.");
  }
  return data || [];
}

async function fetchChecklists(admin: any, boardId: string, taskIds: string[]) {
  const { data, error } = await admin
    .from("checklists")
    .select("id, task_id, title, order_index")
    .eq("board_id", boardId)
    .in("task_id", taskIds)
    .is("deleted_at", null)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar los checklists.");
  }
  return data || [];
}

async function fetchChecklistItems(admin: any, boardId: string, checklistIds: string[]) {
  const { data, error } = await admin
    .from("checklist_items")
    .select("id, checklist_id, text, completed, order_index")
    .eq("board_id", boardId)
    .in("checklist_id", checklistIds)
    .is("deleted_at", null)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar los elementos del checklist.");
  }
  return data || [];
}

function groupBy(rows: Record<string, unknown>[], key: string) {
  return rows.reduce((map, row) => {
    const value = String(row[key] || "");
    if (!map.has(value)) {
      map.set(value, []);
    }
    map.get(value)?.push(row);
    return map;
  }, new Map<string, Record<string, unknown>[]>());
}

function byOrder(left: { order?: number }, right: { order?: number }) {
  return Number(left.order || 0) - Number(right.order || 0);
}
