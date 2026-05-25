import { createOwnerWorkspaceFromSnapshot, pullOwnerBoardSnapshot } from "./cloudRepository.js?v=20260525-auth-redirect";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js?v=20260525-auth-redirect";

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
    cloud,
    email,
    session: data.session,
    status: "authenticated",
    user: data.user
  };
}

export async function loginOwnerAccount({ clientId, email, password, pendingImport = null }) {
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
    cloud,
    completedPendingImport,
    email,
    session: data.session,
    status: "authenticated",
    user: data.user
  };
}

export async function restoreOwnerSession({ clientId, pendingImport = null } = {}) {
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
    cloud,
    completedPendingImport,
    email: data.session.user.email,
    session: data.session,
    status: "authenticated",
    user: data.session.user
  };
}

export async function signOutOwnerAccount() {
  if (!canUseAccounts()) {
    return;
  }

  const supabase = await getSupabaseClient();
  await supabase.auth.signOut();
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

function getAuthRedirectUrl() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "https://javo-pm.onrender.com/";
  }

  return `${window.location.origin}/`;
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
