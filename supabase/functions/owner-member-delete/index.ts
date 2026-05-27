import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { assertOwnerForBoard } from "../_shared/members.ts";
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
    const teamMemberId = String(payload.teamMemberId || "");

    const { data: current, error: currentError } = await admin
      .from("team_members")
      .select("board_id, status, user_id")
      .eq("id", teamMemberId)
      .is("deleted_at", null)
      .single();

    if (currentError || !current) {
      throw new Error("No encontramos ese integrante.");
    }

    await assertOwnerForBoard(admin, user.id, current.board_id);

    const { data, error } = await admin.rpc("owner_delete_team_member_access", {
      p_actor_user_id: user.id,
      p_client_id: payload.clientId || null,
      p_team_member_id: teamMemberId
    });

    if (error) {
      throw new Error(error.message || "No se pudo eliminar el miembro.");
    }

    const deletedMember = Array.isArray(data) ? data[0] : data;
    const memberUserId = deletedMember?.member_user_id || current.user_id;
    if (memberUserId) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(memberUserId);
      if (deleteUserError) {
        throw new Error(deleteUserError.message || "Se quitó el acceso, pero no se pudo eliminar el usuario Auth.");
      }
    }

    return jsonResponse({
      deleted: true,
      teamMemberId
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo eliminar el miembro.", 400);
  }
});
