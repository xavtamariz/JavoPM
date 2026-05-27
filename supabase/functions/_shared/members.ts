import { createAdminClient, createPublicClient } from "./supabase.ts";

export function normalizeNickname(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function assertNickname(value: unknown) {
  const nickname = normalizeNickname(value);
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(nickname)) {
    throw new Error("Nickname inválido. Usa minúsculas, números, guion o guion bajo.");
  }

  return nickname;
}

export function assertPassword(value: unknown, label = "La contraseña") {
  const password = String(value || "");
  if (password.length < 6) {
    throw new Error(`${label} debe tener al menos 6 caracteres.`);
  }

  return password;
}

export function generateOwnerKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function generateAuthPassword() {
  return `${crypto.randomUUID()}-JavoPM`;
}

export function makeInternalMemberEmail(nickname: string) {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 14);
  return `${nickname}.${suffix}@members.javo-pm.internal`;
}

export function mapTeamMemberRow(row: Record<string, unknown>, ownerKey = "") {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname || "",
    status: row.status || "local",
    userId: row.user_id || "",
    lastLoginAt: row.last_login_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: Number(row.order_index || 0),
    ownerKey
  };
}

export async function assertOwnerForBoard(admin: ReturnType<typeof createAdminClient>, userId: string, boardId: string) {
  const { data: board, error: boardError } = await admin
    .from("boards")
    .select("id, workspace_id")
    .eq("id", boardId)
    .is("deleted_at", null)
    .single();

  if (boardError || !board) {
    throw new Error("No encontramos el tablero.");
  }

  const { data: membership, error: membershipError } = await admin
    .from("workspace_members")
    .select("role, status")
    .eq("workspace_id", board.workspace_id)
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("Solo la cuenta maestra puede administrar miembros.");
  }

  return board;
}

export async function createSessionForEmail(email: string) {
  const admin = createAdminClient();
  const publicClient = createPublicClient();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    email,
    type: "magiclink"
  });

  if (linkError) {
    throw new Error(linkError.message || "No se pudo crear la sesión del miembro.");
  }

  const tokenHash = getTokenHash(linkData?.properties);
  if (!tokenHash) {
    throw new Error("Supabase no regresó token de sesión para el miembro.");
  }

  let verified = await publicClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email"
  });

  if (verified.error) {
    verified = await publicClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink"
    });
  }

  if (verified.error || !verified.data?.session) {
    throw new Error(verified.error?.message || "No se pudo iniciar sesión como miembro.");
  }

  return verified.data.session;
}

function getTokenHash(properties: Record<string, unknown> | null | undefined) {
  const direct = String(properties?.hashed_token || "");
  if (direct) {
    return direct;
  }

  const actionLink = String(properties?.action_link || "");
  if (!actionLink) {
    return "";
  }

  try {
    const url = new URL(actionLink);
    return url.searchParams.get("token_hash") || url.searchParams.get("token") || "";
  } catch {
    return "";
  }
}
