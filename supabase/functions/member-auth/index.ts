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
    const password = assertPassword(payload.password);
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("authenticate_team_member_access", {
      p_nickname: nickname,
      p_password: password,
      p_user_agent: req.headers.get("user-agent") || null
    });

    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(error?.message || "Nickname o contraseña inválidos.");
    }

    const member = data[0];
    const session = await createSessionForEmail(member.auth_email);

    return jsonResponse({
      account: {
        accountType: "member",
        credentialType: member.credential_type,
        displayName: member.display_name,
        email: "",
        nickname: member.nickname,
        role: "member",
        teamMemberId: member.team_member_id,
        userId: member.user_id
      },
      cloud: {
        boardId: member.board_id,
        workspaceId: member.workspace_id
      },
      passwordSetupRequired: Boolean(member.password_setup_required),
      session
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo iniciar como miembro.", 400);
  }
});
