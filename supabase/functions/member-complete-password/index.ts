import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { assertPassword } from "../_shared/members.ts";
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
    const payload = await req.json().catch(() => ({}));
    const password = assertPassword(payload.password);

    if (payload.confirmPassword !== undefined && String(payload.confirmPassword || "") !== password) {
      throw new Error("Las contraseñas no coinciden.");
    }

    const { data, error } = await admin.rpc("complete_team_member_password_setup", {
      p_password: password,
      p_user_id: user.id
    });

    if (error) {
      throw new Error(error.message || "No se pudo guardar la contraseña.");
    }

    return jsonResponse({
      passwordSetupRequired: false,
      result: Array.isArray(data) ? data[0] : data
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo guardar la contraseña.", 400);
  }
});
