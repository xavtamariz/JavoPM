import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { assertNickname } from "../_shared/members.ts";
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
    const displayName = String(payload.displayName || "").trim();
    const nickname = assertNickname(payload.nickname);

    const { data, error } = await admin.rpc("owner_update_profile", {
      p_display_name: displayName,
      p_nickname: nickname,
      p_user_id: user.id
    });

    if (error) {
      throw new Error(error.message || "No se pudo actualizar la cuenta maestra.");
    }

    return jsonResponse({
      account: {
        accountType: data.account_type || "owner",
        displayName: data.display_name || displayName,
        email: data.email || user.email || "",
        nickname: data.nickname || nickname,
        role: "owner",
        userId: data.user_id || user.id
      }
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo actualizar la cuenta maestra.", 400);
  }
});
