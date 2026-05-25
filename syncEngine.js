import {
  addPendingMutation,
  deletePendingMutation,
  getPendingMutations,
  saveCloudMeta,
  updatePendingMutation
} from "./db.js?v=20260525-login-cloud-only";
import {
  BOARD_SCOPED_TABLES,
  allocateCloudFolioNumber,
  fetchBoardSnapshot,
  pushMutationToCloud
} from "./cloudRepository.js?v=20260525-login-cloud-only";
import { getSupabaseClient } from "./supabaseClient.js?v=20260525-login-cloud-only";

const REMOTE_TABLES = BOARD_SCOPED_TABLES.filter((tableName) => tableName !== "client_mutations");

let context = null;
let flushTimer;
let onRemoteSnapshotCallback = async () => {};
let onStatusChangeCallback = () => {};
let realtimeChannel = null;
let remoteRefreshTimer;

export function initSyncEngine({ onRemoteSnapshot, onStatusChange }) {
  onRemoteSnapshotCallback = onRemoteSnapshot || onRemoteSnapshotCallback;
  onStatusChangeCallback = onStatusChange || onStatusChangeCallback;

  window.addEventListener("online", () => {
    if (context?.enabled) {
      flushPendingMutations();
    }
  });

  window.addEventListener("offline", () => {
    if (context?.enabled) {
      setSyncStatus("offline");
    }
  });
}

export async function startCloudSyncSession(cloudContext) {
  const supabase = await getSupabaseClient();
  context = {
    ...cloudContext,
    enabled: true,
    supabase
  };

  await saveCloudMeta({
    boardId: context.boardId,
    clientId: context.clientId,
    cloudEnabled: true,
    lastSyncedAt: new Date().toISOString(),
    userId: context.userId,
    workspaceId: context.workspaceId
  });

  startRealtime();
  await flushPendingMutations();
}

export async function stopCloudSyncSession() {
  clearTimeout(flushTimer);
  clearTimeout(remoteRefreshTimer);

  if (realtimeChannel && context?.supabase) {
    await context.supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = null;
  context = null;
  setSyncStatus("local");
}

export function isCloudSyncEnabled() {
  return Boolean(context?.enabled);
}

export function getCloudSyncContext() {
  return context;
}

export async function recordCloudMutation({
  baseVersion = null,
  critical = false,
  entity,
  entityId,
  entityType,
  operation = "update",
  patch = {}
}) {
  if (!context?.enabled) {
    return null;
  }

  const mutation = await addPendingMutation({
    baseVersion,
    boardId: context.boardId,
    clientId: context.clientId,
    entity,
    entityId,
    entityType,
    mutationId: createMutationId(context.clientId),
    operation,
    patch,
    status: "pending"
  });

  scheduleFlush(critical ? 0 : 750);
  return mutation;
}

export async function allocateNextCloudFolioNumber() {
  if (!context?.enabled || !navigator.onLine) {
    return null;
  }

  try {
    return await allocateCloudFolioNumber({
      boardId: context.boardId,
      supabase: context.supabase
    });
  } catch (error) {
    setSyncStatus("error", error.message);
    return null;
  }
}

export async function flushPendingMutations() {
  if (!context?.enabled) {
    return;
  }

  if (!navigator.onLine) {
    setSyncStatus("offline");
    return;
  }

  clearTimeout(flushTimer);
  setSyncStatus("syncing");

  const pendingMutations = await getPendingMutations();

  if (pendingMutations.length === 0) {
    setSyncStatus("synced");
    return;
  }

  for (const mutation of pendingMutations) {
    try {
      await pushMutationToCloud({
        context,
        mutation,
        supabase: context.supabase
      });
      await deletePendingMutation(mutation.mutationId);
    } catch (error) {
      await updatePendingMutation({
        ...mutation,
        error: error.message,
        status: "error"
      });
      setSyncStatus("error", error.message);
      return;
    }
  }

  await saveCloudMeta({
    lastSyncedAt: new Date().toISOString(),
    syncStatus: "synced"
  });
  setSyncStatus("synced");
}

function scheduleFlush(delay) {
  clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flushPendingMutations, delay);
}

function startRealtime() {
  if (!context?.enabled || realtimeChannel) {
    return;
  }

  realtimeChannel = context.supabase.channel(`javopm-board-${context.boardId}`);

  REMOTE_TABLES.forEach((tableName) => {
    realtimeChannel.on(
      "postgres_changes",
      {
        event: "*",
        filter: `board_id=eq.${context.boardId}`,
        schema: "public",
        table: tableName
      },
      handleRemotePayload
    );
  });

  realtimeChannel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      setSyncStatus("synced");
    }
  });
}

function handleRemotePayload(payload) {
  const row = payload.new || payload.old || {};

  if (row.client_id && row.client_id === context?.clientId) {
    return;
  }

  clearTimeout(remoteRefreshTimer);
  remoteRefreshTimer = window.setTimeout(async () => {
    if (!context?.enabled) {
      return;
    }

    try {
      const snapshot = await fetchBoardSnapshot({
        boardId: context.boardId,
        supabase: context.supabase
      });
      await onRemoteSnapshotCallback(snapshot);
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error", error.message);
    }
  }, 240);
}

function setSyncStatus(status, detail = "") {
  onStatusChangeCallback(status, detail);
}

function createMutationId(clientId) {
  const randomPart = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `mutation_${clientId}_${randomPart}`;
}
