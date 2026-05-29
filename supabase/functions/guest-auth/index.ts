import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { assertNickname, assertPassword, createSessionForEmail } from "../_shared/members.ts";
import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== "POST") {
    return errorResponse("Método no permitido.", 405);
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const nickname = assertNickname(payload.nickname);
    const guestKey = assertPassword(payload.password, "La clave");
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("authenticate_guest_access", {
      p_guest_key: guestKey,
      p_nickname: nickname,
      p_user_agent: req.headers.get("user-agent") || null
    });

    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(error?.message || "Nickname o clave inválidos.");
    }

    const guest = data[0];
    const session = await createSessionForEmail(guest.auth_email);

    return jsonResponse({
      account: {
        accountType: "guest",
        displayName: guest.display_name,
        email: "",
        guestId: guest.guest_id,
        nickname: guest.nickname,
        role: "guest",
        userId: guest.user_id
      },
      cloud: {
        boardId: guest.board_id,
        workspaceId: guest.workspace_id
      },
      session
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo iniciar como invitado.", 400);
  }
});
