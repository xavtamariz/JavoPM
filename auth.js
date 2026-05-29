import {
  createOwnerWorkspaceFromSnapshot,
  importSnapshotRows,
  pullOwnerBoardSnapshot
} from "./cloudRepository.js?v=20260529-crm-position-fields";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js?v=20260529-crm-position-fields";

export function canUseAccounts() {
  return isSupabaseConfigured();
}

export async function createOwnerAccount({ clientId, confirmPassword, email, password, snapshot }) {
  validateEmailAndPassword({ confirmPassword, email, isCreate: true, password });

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl()
    }
  });

  if (isExistingAccountError(error) || looksLikeExistingSignup(data)) {
    return {
      email,
      status: "existing_email"
    };
  }

  if (error) {
    throw new Error(error.message || "No se pudo crear la cuenta.");
  }

  if (!data?.session || !data?.user) {
    return {
      email,
      status: "verification_required"
    };
  }

  const cloud = await createOwnerWorkspaceFromSnapshot({
    clientId,
    snapshot,
    supabase,
    user: data.user
  });

  return {
    accountType: "owner",
    cloud,
    displayName: getDisplayName(data.user.email),
    email,
    nickname: "",
    role: "owner",
    session: data.session,
    status: "authenticated",
    teamMemberId: "",
    user: data.user
  };
}

export async function loginOwnerAccount({
  clientId,
  email,
  password,
  pendingImport = null
}) {
  validateEmailAndPassword({ email, isCreate: false, password });

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error(error.message || "No se pudo iniciar sesión.");
  }

  let cloud;
  let completedPendingImport = false;

  try {
    cloud = await pullOwnerBoardSnapshot({
      supabase,
      userId: data.user.id
    });
    const pendingImportSnapshot = getPendingImportSnapshot({
      email,
      pendingImport,
      userEmail: data.user.email
    });
    if (shouldCompletePendingImport(cloud.snapshot, pendingImportSnapshot)) {
      await importSnapshotRows({
        boardId: cloud.boardId,
        clientId,
        snapshot: pendingImportSnapshot,
        supabase
      });
      cloud = await pullOwnerBoardSnapshot({
        supabase,
        userId: data.user.id
      });
      completedPendingImport = true;
    }
  } catch (error) {
    if (!pendingImport?.snapshot || pendingImport.email !== email) {
      throw error;
    }

    const createdCloud = await createOwnerWorkspaceFromSnapshot({
      clientId,
      snapshot: pendingImport.snapshot,
      supabase,
      user: data.user
    });
    cloud = {
      ...createdCloud,
      snapshot: pendingImport.snapshot
    };
    completedPendingImport = true;
  }

  return {
    accountType: cloud.profile?.account_type || "owner",
    cloud,
    completedPendingImport,
    displayName: cloud.profile?.display_name || getDisplayName(data.user.email),
    email,
    nickname: cloud.profile?.nickname || "",
    role: cloud.membershipRole || "owner",
    session: data.session,
    status: "authenticated",
    teamMemberId: cloud.profile?.team_member_id || "",
    user: data.user
  };
}

export async function loginMemberAccount({
  clientId,
  nickname,
  password
}) {
  const normalizedNickname = validateNicknameAndPassword({ nickname, password });
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("member-auth", {
    body: {
      nickname: normalizedNickname,
      password
    }
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "No se pudo iniciar como miembro.");
  }

  const sessionPayload = data?.session;
  if (!sessionPayload?.access_token || !sessionPayload?.refresh_token) {
    throw new Error("No recibimos una sesión válida para el miembro.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: sessionPayload.access_token,
    refresh_token: sessionPayload.refresh_token
  });

  if (sessionError || !sessionData?.session?.user) {
    throw new Error(sessionError?.message || "No se pudo guardar la sesión del miembro.");
  }

  const cloud = await pullOwnerBoardSnapshot({
    supabase,
    userId: sessionData.session.user.id
  });

  return {
    accountType: "member",
    cloud,
    completedPendingImport: false,
    credentialType: data.account?.credentialType || "",
    displayName: data.account?.displayName || cloud.profile?.display_name || normalizedNickname,
    email: "",
    nickname: data.account?.nickname || cloud.profile?.nickname || normalizedNickname,
    passwordSetupRequired: Boolean(data.passwordSetupRequired),
    role: "member",
    session: sessionData.session,
    status: "authenticated",
    teamMemberId: data.account?.teamMemberId || cloud.profile?.team_member_id || "",
    user: sessionData.session.user
  };
}

export async function restoreOwnerSession({
  clientId,
  pendingImport = null
} = {}) {
  if (!canUseAccounts()) {
    return null;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.user) {
    return null;
  }

  let cloud;
  let completedPendingImport = false;

  try {
    cloud = await pullOwnerBoardSnapshot({
      supabase,
      userId: data.session.user.id
    });
    const pendingImportSnapshot = getPendingImportSnapshot({
      email: data.session.user.email,
      pendingImport,
      userEmail: data.session.user.email
    });
    if (shouldCompletePendingImport(cloud.snapshot, pendingImportSnapshot)) {
      await importSnapshotRows({
        boardId: cloud.boardId,
        clientId,
        snapshot: pendingImportSnapshot,
        supabase
      });
      cloud = await pullOwnerBoardSnapshot({
        supabase,
        userId: data.session.user.id
      });
      completedPendingImport = true;
    }
  } catch (error) {
    if (!pendingImport?.snapshot || pendingImport.email !== data.session.user.email) {
      throw error;
    }

    const createdCloud = await createOwnerWorkspaceFromSnapshot({
      clientId,
      snapshot: pendingImport.snapshot,
      supabase,
      user: data.session.user
    });
    cloud = {
      ...createdCloud,
      snapshot: pendingImport.snapshot
    };
    completedPendingImport = true;
  }

  return {
    accountType: cloud.profile?.account_type || "owner",
    cloud,
    completedPendingImport,
    displayName: cloud.profile?.display_name || getDisplayName(data.session.user.email),
    email: cloud.profile?.account_type === "member" ? "" : data.session.user.email,
    nickname: cloud.profile?.nickname || "",
    passwordSetupRequired: Boolean(cloud.profile?.password_setup_required),
    role: cloud.membershipRole || "member",
    session: data.session,
    status: "authenticated",
    teamMemberId: cloud.profile?.team_member_id || "",
    user: data.session.user
  };
}

export async function signOutOwnerAccount() {
  if (!canUseAccounts()) {
    return;
  }

  const supabase = await getSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
}

function validateEmailAndPassword({ confirmPassword, email, isCreate, password }) {
  const normalizedEmail = String(email || "").trim();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Escribe un correo válido.");
  }

  if (!password || String(password).length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }

  if (isCreate && password !== confirmPassword) {
    throw new Error("Las contraseñas no coinciden.");
  }
}

function validateNicknameAndPassword({ nickname, password }) {
  const normalizedNickname = String(nickname || "").trim().toLocaleLowerCase("es-MX");

  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalizedNickname)) {
    throw new Error("Escribe un nickname válido.");
  }

  if (!password || String(password).length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }

  return normalizedNickname;
}

function getAuthRedirectUrl() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "https://javo-pm.onrender.com/";
  }

  return `${window.location.origin}/`;
}

function getPendingImportSnapshot({ email, pendingImport, userEmail }) {
  if (pendingImport?.snapshot && pendingImport.email === email && pendingImport.email === userEmail) {
    return pendingImport.snapshot;
  }

  return null;
}

function shouldCompletePendingImport(cloudSnapshot, localSnapshot) {
  const cloudTaskCount = Array.isArray(cloudSnapshot?.tasks) ? cloudSnapshot.tasks.length : 0;
  const localTaskCount = Array.isArray(localSnapshot?.tasks) ? localSnapshot.tasks.length : 0;
  return cloudTaskCount === 0 && localTaskCount > 0;
}

function isExistingAccountError(error) {
  if (!error?.message) {
    return false;
  }

  const message = error.message.toLocaleLowerCase("en-US");
  return (
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("user already")
  );
}

function looksLikeExistingSignup(data) {
  return Boolean(
    data?.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
  );
}
