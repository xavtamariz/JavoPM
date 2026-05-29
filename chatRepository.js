import { createId } from "./models.js?v=20260529-crm-header";
import { getSupabaseClient } from "./supabaseClient.js?v=20260529-crm-header";

const CHAT_IMAGE_BUCKET = "chat-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

let realtimeChannel = null;

export async function bootstrapChat({ boardId, clientId }) {
  return invokeChatAction({
    action: "bootstrap",
    boardId,
    clientId
  });
}

export async function ensureDirectConversation({ boardId, clientId, targetUserId }) {
  return invokeChatAction({
    action: "ensureDirect",
    boardId,
    clientId,
    targetUserId
  });
}

export async function createChatGroup({ boardId, clientId, participantUserIds, title }) {
  return invokeChatAction({
    action: "createGroup",
    boardId,
    clientId,
    participantUserIds,
    title
  });
}

export async function markChatRead({ boardId, clientId, conversationId }) {
  return invokeChatAction({
    action: "markRead",
    boardId,
    clientId,
    conversationId
  });
}

export async function sendChatMessage({
  account,
  boardId,
  body,
  clientId,
  conversation,
  createdAt,
  files = [],
  messageId,
  workspaceId
}) {
  const trimmedBody = String(body || "").trim();
  const imageFiles = validateImageFiles(files);

  if (!trimmedBody && imageFiles.length === 0) {
    throw new Error("Escribe un mensaje o agrega una imagen.");
  }

  if (!navigator.onLine) {
    throw new Error("Sin conexión. El chat se enviará cuando vuelvas a estar en línea en una versión futura.");
  }

  if (!conversation?.id || !conversation.isParticipant) {
    throw new Error("No tienes acceso a esta conversación.");
  }

  const supabase = await getSupabaseClient();
  const now = createdAt || new Date().toISOString();
  const resolvedMessageId = messageId || createId("chat_message");
  const uploadedAttachments = [];

  for (const file of imageFiles) {
    const extension = getFileExtension(file);
    const attachmentId = createId("chat_attachment");
    const storagePath = [
      workspaceId,
      boardId,
      conversation.id,
      resolvedMessageId,
      `${attachmentId}.${extension}`
    ].join("/");
    const { error: uploadError } = await supabase.storage
      .from(CHAT_IMAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      throw new Error(uploadError.message || "No se pudo subir la imagen.");
    }

    uploadedAttachments.push({
      file,
      id: attachmentId,
      storagePath
    });
  }

  const messageType = uploadedAttachments.length === 0
    ? "text"
    : trimmedBody ? "mixed" : "image";
  const messageRow = {
    id: resolvedMessageId,
    board_id: boardId,
    body: trimmedBody,
    client_id: clientId,
    conversation_id: conversation.id,
    created_at: now,
    message_type: messageType,
    metadata: {},
    sender_nickname_snapshot: account.nickname || account.displayName || "Cuenta",
    sender_team_member_id: account.teamMemberId || null,
    sender_user_id: account.userId,
    updated_at: now,
    workspace_id: workspaceId
  };

  const insertedMessage = await supabase
    .from("chat_messages")
    .insert(messageRow)
    .select("*")
    .single();

  if (insertedMessage.error) {
    throw new Error(insertedMessage.error.message || "No se pudo enviar el mensaje.");
  }

  const attachmentRows = uploadedAttachments.map(({ file, id, storagePath }) => ({
    id,
    board_id: boardId,
    client_id: clientId,
    conversation_id: conversation.id,
    created_at: now,
    file_name: file.name || "imagen",
    message_id: resolvedMessageId,
    mime_type: file.type,
    size_bytes: file.size,
    storage_path: storagePath,
    updated_at: now,
    workspace_id: workspaceId
  }));

  if (attachmentRows.length > 0) {
    const insertedAttachments = await supabase.from("chat_attachments").insert(attachmentRows);
    if (insertedAttachments.error) {
      throw new Error(insertedAttachments.error.message || "No se pudo guardar la imagen en el chat.");
    }
  }

  await supabase
    .from("chat_conversations")
    .update({ updated_at: now })
    .eq("id", conversation.id);

  return {
    attachments: await hydrateAttachmentUrls(attachmentRows.map(mapAttachmentRow)),
    message: mapMessageRow(insertedMessage.data)
  };
}

export async function hydrateChatSnapshot(snapshot = {}) {
  return {
    ...snapshot,
    attachments: await hydrateAttachmentUrls(snapshot.attachments || [])
  };
}

export async function startChatRealtime({ boardId, onChange }) {
  const supabase = await getSupabaseClient();
  await stopChatRealtime();

  realtimeChannel = supabase.channel(`javopm-chat-${boardId}`);
  ["chat_conversations", "chat_participants", "chat_messages", "chat_attachments"].forEach((table) => {
    realtimeChannel.on(
      "postgres_changes",
      {
        event: "*",
        filter: `board_id=eq.${boardId}`,
        schema: "public",
        table
      },
      onChange
    );
  });
  realtimeChannel.subscribe();
}

export async function stopChatRealtime() {
  if (!realtimeChannel) {
    return;
  }

  const supabase = await getSupabaseClient();
  await supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

async function invokeChatAction(body) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("chat-actions", { body });

  if (error || data?.error) {
    throw new Error(data?.error || await getFunctionErrorMessage(error, "No se pudo completar el chat."));
  }

  if (data?.snapshot) {
    data.snapshot = await hydrateChatSnapshot(data.snapshot);
  }

  return data;
}

function validateImageFiles(files) {
  const imageFiles = [...(files || [])];

  imageFiles.forEach((file) => {
    if (!IMAGE_MIME_TYPES.has(file.type)) {
      throw new Error("Solo puedes subir imágenes jpg, png, webp o gif.");
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Cada imagen debe pesar máximo 8 MB.");
    }
  });

  return imageFiles;
}

function getFileExtension(file) {
  const byMime = {
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  return byMime[file.type] || extension || "jpg";
}

async function hydrateAttachmentUrls(attachments) {
  if (!attachments.length) {
    return [];
  }

  const supabase = await getSupabaseClient();
  const storage = supabase.storage.from(CHAT_IMAGE_BUCKET);
  const hydrated = [];

  for (const attachment of attachments) {
    if (!attachment.storagePath) {
      hydrated.push(attachment);
      continue;
    }

    const { data, error } = await storage.createSignedUrl(attachment.storagePath, 60 * 60);
    hydrated.push({
      ...attachment,
      signedUrl: error ? "" : data?.signedUrl || ""
    });
  }

  return hydrated;
}

function mapMessageRow(row = {}) {
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

function mapAttachmentRow(row = {}) {
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

async function getFunctionErrorMessage(error, fallback) {
  const response = error?.context;

  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (payload?.error) {
        return payload.error;
      }
    } catch {
      // Some function errors are plain text responses.
    }

    try {
      const text = await response.clone().text();
      if (text) {
        return text;
      }
    } catch {
      // Fall through to the SDK message below.
    }
  }

  return error?.message || fallback;
}
