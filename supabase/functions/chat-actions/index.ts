import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/supabase.ts";

type AdminClient = Awaited<ReturnType<typeof getUserFromRequest>>["admin"];

type DirectoryMember = {
  displayName: string;
  nickname: string;
  role: "owner" | "member";
  teamMemberId: string;
  userId: string;
};

type ChatConversationRow = {
  id: string;
} & Record<string, unknown>;

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizeTitle(value: unknown) {
  return String(value || "").trim().slice(0, 80);
}

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
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "bootstrap");
    const boardId = String(payload.boardId || "");
    const clientId = String(payload.clientId || "");

    const board = await getBoardForUser(admin, user.id, boardId);

    if (action === "bootstrap") {
      await ensureGeneralConversation({ admin, board, clientId, userId: user.id });
      return jsonResponse({
        snapshot: await buildSnapshot({ admin, board, userId: user.id })
      });
    }

    if (action === "ensureDirect") {
      const targetUserId = String(payload.targetUserId || "");
      const conversation = await ensureDirectConversation({
        admin,
        board,
        clientId,
        targetUserId,
        userId: user.id
      });

      return jsonResponse({
        conversationId: conversation.id,
        snapshot: await buildSnapshot({ admin, board, userId: user.id })
      });
    }

    if (action === "createGroup") {
      const membership = await getWorkspaceMembership(admin, board.workspace_id, user.id);
      if (membership?.role !== "owner") {
        throw new Error("Solo la cuenta maestra puede crear grupos.");
      }

      const title = normalizeTitle(payload.title);
      if (!title) {
        throw new Error("Escribe el nombre del grupo.");
      }

      const participantUserIds = Array.isArray(payload.participantUserIds)
        ? payload.participantUserIds.map((item: unknown) => String(item)).filter(Boolean)
        : [];
      const conversation = await createGroupConversation({
        admin,
        board,
        clientId,
        participantUserIds,
        title,
        userId: user.id
      });

      return jsonResponse({
        conversationId: conversation.id,
        snapshot: await buildSnapshot({ admin, board, userId: user.id })
      });
    }

    if (action === "markRead") {
      const conversationId = String(payload.conversationId || "");
      await markConversationRead({ admin, conversationId, userId: user.id });

      return jsonResponse({
        snapshot: await buildSnapshot({ admin, board, userId: user.id })
      });
    }

    return errorResponse("Acción no soportada.", 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo completar el chat.", 400);
  }
});

async function getBoardForUser(admin: AdminClient, userId: string, boardId: string) {
  let query = admin
    .from("boards")
    .select("id, workspace_id, title")
    .is("deleted_at", null)
    .limit(1);

  if (boardId) {
    query = query.eq("id", boardId);
  }

  const { data: boards, error: boardError } = await query;
  if (boardError || !boards?.length) {
    throw new Error("No encontramos el tablero.");
  }

  const board = boards[0];
  const membership = await getWorkspaceMembership(admin, board.workspace_id, userId);
  if (!membership) {
    throw new Error("No tienes acceso a este tablero.");
  }

  return board;
}

async function getWorkspaceMembership(admin: AdminClient, workspaceId: string, userId: string) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("role, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo validar la sesión.");
  }

  return data || null;
}

async function getDirectory(admin: AdminClient, board: { id: string; workspace_id: string }) {
  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("owner_id")
    .eq("id", board.workspace_id)
    .is("deleted_at", null)
    .single();

  if (workspaceError || !workspace) {
    throw new Error("No encontramos la cuenta maestra del workspace.");
  }

  const { data: ownerProfile, error: ownerError } = await admin
    .from("profiles")
    .select("user_id, display_name, nickname")
    .eq("user_id", workspace.owner_id)
    .maybeSingle();

  if (ownerError) {
    throw new Error(ownerError.message || "No se pudo leer la cuenta maestra.");
  }

  const { data: teamRows, error: teamError } = await admin
    .from("team_members")
    .select("id, user_id, name, nickname, status")
    .eq("board_id", board.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("order_index", { ascending: true });

  if (teamError) {
    throw new Error(teamError.message || "No se pudo leer el equipo.");
  }

  const ownerNickname = String(ownerProfile?.nickname || "").trim();
  const directory: DirectoryMember[] = [
    {
      displayName: String(ownerProfile?.display_name || "Cuenta maestra"),
      nickname: ownerNickname,
      role: "owner",
      teamMemberId: "",
      userId: workspace.owner_id
    },
    ...(teamRows || [])
      .filter((row) => row.user_id)
      .map((row) => ({
        displayName: String(row.name || row.nickname || "Miembro"),
        nickname: String(row.nickname || "").trim(),
        role: "member" as const,
        teamMemberId: String(row.id || ""),
        userId: String(row.user_id || "")
      }))
  ];

  return directory.filter((member) => member.userId);
}

async function ensureGeneralConversation({
  admin,
  board,
  clientId,
  userId
}: {
  admin: AdminClient;
  board: { id: string; workspace_id: string; title?: string };
  clientId: string;
  userId: string;
}) {
  let { data: conversation, error } = await admin
    .from("chat_conversations")
    .select("*")
    .eq("board_id", board.id)
    .eq("type", "general")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo preparar el chat general.");
  }

  if (!conversation) {
    const insert = {
      id: createId("chat"),
      board_id: board.id,
      client_id: clientId || null,
      created_by: userId,
      title: "General",
      type: "general",
      workspace_id: board.workspace_id
    };
    const inserted = await admin.from("chat_conversations").insert(insert).select("*").single();
    if (inserted.error) {
      const retry = await admin
        .from("chat_conversations")
        .select("*")
        .eq("board_id", board.id)
        .eq("type", "general")
        .is("deleted_at", null)
        .single();
      if (retry.error || !retry.data) {
        throw new Error(inserted.error.message || "No se pudo crear el chat general.");
      }
      conversation = retry.data;
    } else {
      conversation = inserted.data;
    }
  }

  const directory = await getDirectory(admin, board);
  await syncConversationParticipants({
    admin,
    board,
    clientId,
    conversation,
    members: directory,
    userId
  });

  return conversation;
}

async function ensureDirectConversation({
  admin,
  board,
  clientId,
  targetUserId,
  userId
}: {
  admin: AdminClient;
  board: { id: string; workspace_id: string };
  clientId: string;
  targetUserId: string;
  userId: string;
}) {
  if (!targetUserId || targetUserId === userId) {
    throw new Error("Elige otro integrante.");
  }

  const directory = await getDirectory(admin, board);
  const members = directory.filter((member) => [userId, targetUserId].includes(member.userId));
  if (members.length !== 2) {
    throw new Error("Ese integrante no está activo en el equipo.");
  }

  const directKey = [userId, targetUserId].sort().join(":");
  let { data: conversation, error } = await admin
    .from("chat_conversations")
    .select("*")
    .eq("board_id", board.id)
    .eq("direct_key", directKey)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo abrir el chat directo.");
  }

  if (!conversation) {
    const inserted = await admin
      .from("chat_conversations")
      .insert({
        id: createId("chat"),
        board_id: board.id,
        client_id: clientId || null,
        created_by: userId,
        direct_key: directKey,
        title: "",
        type: "direct",
        workspace_id: board.workspace_id
      })
      .select("*")
      .single();

    if (inserted.error) {
      const retry = await admin
        .from("chat_conversations")
        .select("*")
        .eq("board_id", board.id)
        .eq("direct_key", directKey)
        .is("deleted_at", null)
        .single();
      if (retry.error || !retry.data) {
        throw new Error(inserted.error.message || "No se pudo crear el chat directo.");
      }
      conversation = retry.data;
    } else {
      conversation = inserted.data;
    }
  }

  await syncConversationParticipants({
    admin,
    board,
    clientId,
    conversation,
    members,
    userId
  });

  return conversation;
}

async function createGroupConversation({
  admin,
  board,
  clientId,
  participantUserIds,
  title,
  userId
}: {
  admin: AdminClient;
  board: { id: string; workspace_id: string };
  clientId: string;
  participantUserIds: string[];
  title: string;
  userId: string;
}) {
  const directory = await getDirectory(admin, board);
  const selectedIds = new Set(participantUserIds);
  const members = directory.filter((member) => selectedIds.has(member.userId));

  if (members.length === 0) {
    throw new Error("Elige al menos un integrante para el grupo.");
  }

  const inserted = await admin
    .from("chat_conversations")
    .insert({
      id: createId("chat"),
      board_id: board.id,
      client_id: clientId || null,
      created_by: userId,
      title,
      type: "group",
      workspace_id: board.workspace_id
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message || "No se pudo crear el grupo.");
  }

  await syncConversationParticipants({
    admin,
    board,
    clientId,
    conversation: inserted.data,
    members,
    userId
  });

  return inserted.data;
}

async function syncConversationParticipants({
  admin,
  board,
  clientId,
  conversation,
  members,
  userId
}: {
  admin: AdminClient;
  board: { id: string; workspace_id: string };
  clientId: string;
  conversation: ChatConversationRow;
  members: DirectoryMember[];
  userId: string;
}) {
  const activeUserIds = new Set(members.map((member) => member.userId));

  for (const member of members) {
    const { data: existing, error: existingError } = await admin
      .from("chat_participants")
      .select("id, last_read_at")
      .eq("conversation_id", conversation.id)
      .eq("user_id", member.userId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message || "No se pudo actualizar participantes.");
    }

    const row = {
      id: existing?.id || createId("chat_participant"),
      board_id: board.id,
      client_id: clientId || null,
      conversation_id: conversation.id,
      is_active: true,
      last_read_at: existing?.last_read_at || (member.userId === userId ? new Date().toISOString() : null),
      nickname_snapshot: member.nickname || member.displayName,
      team_member_id: member.teamMemberId || null,
      user_id: member.userId,
      workspace_id: board.workspace_id
    };

    const { error } = await admin.from("chat_participants").upsert(row, {
      onConflict: "conversation_id,user_id"
    });
    if (error) {
      throw new Error(error.message || "No se pudo guardar participante.");
    }
  }

  const { data: existingRows, error } = await admin
    .from("chat_participants")
    .select("id, user_id")
    .eq("conversation_id", conversation.id)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message || "No se pudo limpiar participantes.");
  }

  const staleRows = (existingRows || []).filter((row) => !activeUserIds.has(row.user_id));
  if (staleRows.length > 0) {
    const { error: inactiveError } = await admin
      .from("chat_participants")
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .in("id", staleRows.map((row) => row.id));

    if (inactiveError) {
      throw new Error(inactiveError.message || "No se pudo actualizar participantes.");
    }
  }
}

async function markConversationRead({
  admin,
  conversationId,
  userId
}: {
  admin: AdminClient;
  conversationId: string;
  userId: string;
}) {
  if (!conversationId) {
    return;
  }

  const { error } = await admin
    .from("chat_participants")
    .update({
      last_read_at: new Date().toISOString()
    })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message || "No se pudo marcar el chat como leído.");
  }
}

async function buildSnapshot({
  admin,
  board,
  userId
}: {
  admin: AdminClient;
  board: { id: string; workspace_id: string };
  userId: string;
}) {
  const [directory, membership] = await Promise.all([
    getDirectory(admin, board),
    getWorkspaceMembership(admin, board.workspace_id, userId)
  ]);

  const { data: myParticipants, error: participantError } = await admin
    .from("chat_participants")
    .select("conversation_id")
    .eq("board_id", board.id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (participantError) {
    throw new Error(participantError.message || "No se pudo leer el chat.");
  }

  const participantConversationIds = new Set((myParticipants || []).map((row) => row.conversation_id));

  const { data: conversationRows, error: conversationError } = await admin
    .from("chat_conversations")
    .select("*")
    .eq("board_id", board.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (conversationError) {
    throw new Error(conversationError.message || "No se pudo leer conversaciones.");
  }

  const conversations = (conversationRows || []).filter((conversation) => (
    participantConversationIds.has(conversation.id) ||
    (conversation.type === "group" && conversation.created_by === userId)
  ));
  const conversationIds = conversations.map((conversation) => conversation.id);
  const readableConversationIds = conversationIds.filter((id) => participantConversationIds.has(id));

  const [participants, messages, attachments] = await Promise.all([
    fetchRowsByConversationIds(admin, "chat_participants", conversationIds),
    fetchRowsByConversationIds(admin, "chat_messages", readableConversationIds),
    fetchRowsByConversationIds(admin, "chat_attachments", readableConversationIds)
  ]);

  return {
    attachments: (attachments || []).map(mapAttachmentRow),
    canCreateGroups: membership?.role === "owner",
    conversations: conversations.map((conversation) => mapConversationRow(conversation, participantConversationIds)),
    currentUserId: userId,
    directory,
    messages: (messages || []).map(mapMessageRow),
    participants: (participants || []).map(mapParticipantRow)
  };
}

async function fetchRowsByConversationIds(admin: AdminClient, table: string, conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return [];
  }

  const { data, error } = await admin
    .from(table)
    .select("*")
    .in("conversation_id", conversationIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || `No se pudo leer ${table}.`);
  }

  return data || [];
}

function mapConversationRow(row: Record<string, unknown>, participantConversationIds: Set<unknown>) {
  return {
    boardId: row.board_id,
    clientId: row.client_id || "",
    createdAt: row.created_at,
    createdBy: row.created_by || "",
    deletedAt: row.deleted_at || "",
    directKey: row.direct_key || "",
    id: row.id,
    isParticipant: participantConversationIds.has(row.id),
    title: row.title || "",
    type: row.type,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
  };
}

function mapParticipantRow(row: Record<string, unknown>) {
  return {
    boardId: row.board_id,
    clientId: row.client_id || "",
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at || "",
    id: row.id,
    isActive: Boolean(row.is_active),
    lastReadAt: row.last_read_at || "",
    nicknameSnapshot: row.nickname_snapshot || "",
    teamMemberId: row.team_member_id || "",
    updatedAt: row.updated_at,
    userId: row.user_id,
    workspaceId: row.workspace_id
  };
}

function mapMessageRow(row: Record<string, unknown>) {
  return {
    boardId: row.board_id,
    body: row.body || "",
    clientId: row.client_id || "",
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at || "",
    id: row.id,
    messageType: row.message_type || "text",
    metadata: row.metadata || {},
    senderNicknameSnapshot: row.sender_nickname_snapshot || "",
    senderTeamMemberId: row.sender_team_member_id || "",
    senderUserId: row.sender_user_id,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
  };
}

function mapAttachmentRow(row: Record<string, unknown>) {
  return {
    boardId: row.board_id,
    clientId: row.client_id || "",
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at || "",
    fileName: row.file_name || "",
    height: row.height || null,
    id: row.id,
    messageId: row.message_id,
    mimeType: row.mime_type,
    signedUrl: "",
    sizeBytes: row.size_bytes || 0,
    storagePath: row.storage_path,
    updatedAt: row.updated_at,
    width: row.width || null,
    workspaceId: row.workspace_id
  };
}
