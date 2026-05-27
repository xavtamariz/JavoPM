import { createClient } from "npm:@supabase/supabase-js@2.49.8";

function getSecretMap(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getSupabaseUrl() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) {
    throw new Error("Falta SUPABASE_URL.");
  }
  return url;
}

export function getPublishableKey() {
  const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (key) {
    return key;
  }

  const keys = getSecretMap("SUPABASE_PUBLISHABLE_KEYS");
  if (typeof keys.default === "string") {
    return keys.default;
  }

  throw new Error("Falta la publishable/anon key de Supabase.");
}

export function getSecretKey() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (key) {
    return key;
  }

  const keys = getSecretMap("SUPABASE_SECRET_KEYS");
  if (typeof keys.default === "string") {
    return keys.default;
  }

  throw new Error("Falta la secret/service role key de Supabase.");
}

export function createAdminClient() {
  return createClient(getSupabaseUrl(), getSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createPublicClient() {
  return createClient(getSupabaseUrl(), getPublishableKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function getBearerToken(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

export async function getUserFromRequest(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("Falta sesión.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("Sesión inválida.");
  }

  return { admin, token, user: data.user };
}
