import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  assertNickname,
  assertOwnerForBoard,
  assertPassword,
  generateAuthPassword,
  generateOwnerKey,
  makeInternalMemberEmail,
  mapTeamMemberRow
} from "../_shared/members.ts";
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
    const action = String(payload.action || "create");

    if (action === "create") {
      const boardId = String(payload.boardId || "");
      const name = String(payload.name || "").trim();
      const nickname = assertNickname(payload.nickname);
      const ownerKey = String(payload.ownerKey || "") || generateOwnerKey();

      assertPassword(ownerKey, "La clave");
      await assertOwnerForBoard(admin, user.id, boardId);

      const authEmail = makeInternalMemberEmail(nickname);
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: authEmail,
        password: generateAuthPassword(),
        email_confirm: true,
        user_metadata: {
          account_type: "member",
          display_name: name,
          nickname
        }
      });

      if (authError || !authData?.user) {
        throw new Error(authError?.message || "No se pudo crear el usuario del miembro.");
      }

      try {
        const { data, error } = await admin.rpc("owner_create_team_member_access", {
          p_actor_user_id: user.id,
          p_board_id: boardId,
          p_client_id: payload.clientId || null,
          p_member_email: authEmail,
          p_member_user_id: authData.user.id,
          p_name: name,
          p_nickname: nickname,
          p_owner_key: ownerKey
        });

        if (error) {
          throw new Error(error.message || "No se pudo crear el miembro.");
        }

        return jsonResponse({
          teamMember: mapTeamMemberRow(data, ownerKey)
        });
      } catch (error) {
        await admin.auth.admin.deleteUser(authData.user.id).catch(() => {});
        throw error;
      }
    }

    if (action === "update") {
      const teamMemberId = String(payload.teamMemberId || "");
      const nickname = assertNickname(payload.nickname);
      const status = String(payload.status || "active");
      const name = String(payload.name || "").trim();

      const { data: current, error: currentError } = await admin
        .from("team_members")
        .select("board_id")
        .eq("id", teamMemberId)
        .is("deleted_at", null)
        .single();

      if (currentError || !current) {
        throw new Error("No encontramos ese integrante.");
      }

      await assertOwnerForBoard(admin, user.id, current.board_id);

      const { data, error } = await admin.rpc("owner_update_team_member_access", {
        p_actor_user_id: user.id,
        p_client_id: payload.clientId || null,
        p_name: name,
        p_nickname: nickname,
        p_status: status,
        p_team_member_id: teamMemberId
      });

      if (error) {
        throw new Error(error.message || "No se pudo actualizar el miembro.");
      }

      return jsonResponse({
        teamMember: mapTeamMemberRow(data)
      });
    }

    if (action === "resetKey") {
      const teamMemberId = String(payload.teamMemberId || "");
      const ownerKey = String(payload.ownerKey || "") || generateOwnerKey();
      assertPassword(ownerKey, "La clave");

      const { data: current, error: currentError } = await admin
        .from("team_members")
        .select("board_id")
        .eq("id", teamMemberId)
        .is("deleted_at", null)
        .single();

      if (currentError || !current) {
        throw new Error("No encontramos ese integrante.");
      }

      await assertOwnerForBoard(admin, user.id, current.board_id);

      const { data, error } = await admin.rpc("owner_reset_team_member_key", {
        p_actor_user_id: user.id,
        p_client_id: payload.clientId || null,
        p_owner_key: ownerKey,
        p_team_member_id: teamMemberId
      });

      if (error) {
        throw new Error(error.message || "No se pudo regenerar la clave.");
      }

      return jsonResponse({
        teamMember: mapTeamMemberRow(data, ownerKey)
      });
    }

    return errorResponse("Acción no soportada.", 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo completar la acción.", 400);
  }
});
