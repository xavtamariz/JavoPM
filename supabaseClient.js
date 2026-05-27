const SUPABASE_JS_URL = "./vendor/supabase-js.js?v=20260527-delete-button";

let clientPromise;

export function getSupabaseConfig() {
  const config = window.JAVOPM_CONFIG || {};
  return {
    anonKey: config.supabaseAnonKey || "",
    url: config.supabaseUrl || ""
  };
}

export function isSupabaseConfigured() {
  const { anonKey, url } = getSupabaseConfig();
  return Boolean(url && anonKey && url.includes(".supabase.co"));
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase no está configurado. Define window.JAVOPM_CONFIG.supabaseUrl y supabaseAnonKey."
    );
  }

  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_URL).then(({ createClient }) => {
      const { anonKey, url } = getSupabaseConfig();
      return createClient(url, anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true
        }
      });
    });
  }

  return clientPromise;
}
