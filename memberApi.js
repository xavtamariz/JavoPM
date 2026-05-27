import { getSupabaseClient } from "./supabaseClient.js?v=20260527-member-nickname-display";

export async function createCloudTeamMember({ boardId, clientId, name, nickname }) {
  return invokeOwnerMembers({
    action: "create",
    boardId,
    clientId,
    name,
    nickname
  });
}

export async function updateCloudTeamMember({ clientId, name, nickname, status, teamMemberId }) {
  return invokeOwnerMembers({
    action: "update",
    clientId,
    name,
    nickname,
    status,
    teamMemberId
  });
}

export async function resetCloudTeamMemberKey({ clientId, teamMemberId }) {
  return invokeOwnerMembers({
    action: "resetKey",
    clientId,
    teamMemberId
  });
}

export async function updateCloudOwnerProfile({ displayName, nickname }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("owner-profile", {
    body: {
      displayName,
      nickname
    }
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "No se pudo actualizar la cuenta maestra.");
  }

  return data;
}

export async function completeMemberPassword({ confirmPassword, password }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("member-complete-password", {
    body: {
      confirmPassword,
      password
    }
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "No se pudo guardar la contraseña.");
  }

  return data;
}

async function invokeOwnerMembers(body) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("owner-members", { body });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "No se pudo administrar el integrante.");
  }

  return data;
}
