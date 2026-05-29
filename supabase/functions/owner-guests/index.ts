import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  assertNickname,
  assertOwnerForBoard,
  assertPassword,
  generateAuthPassword,
  generateOwnerKey,
  makeInternalGuestEmail,
  mapGuestRow
} from "../_shared/members.ts";
import { getUserFromRequest } from "../_shared/supabase.ts";

type GuestRow = Record<string, unknown>;

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
    const action = String(payload.action || "list");

    if (action === "list") {
      const boardId = String(payload.boardId || "");
      await assertOwnerForBoard(admin, user.id, boardId);
      const guests = await listGuests(admin, boardId);
      return jsonResponse({ guests });
    }

    if (action === "create") {
      const boardId = String(payload.boardId || "");
      const name = String(payload.name || "").trim();
      const nickname = assertNickname(payload.nickname);
      const projectIds = sanitizeProjectIds(payload.projectIds);
      const ownerKey = String(payload.ownerKey || "") || generateOwnerKey();

      assertPassword(ownerKey, "La clave");
      await assertOwnerForBoard(admin, user.id, boardId);

      const authEmail = makeInternalGuestEmail(nickname);
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: authEmail,
        password: generateAuthPassword(),
        email_confirm: true,
        user_metadata: {
          account_type: "guest",
          display_name: name,
          nickname
        }
      });

      if (authError || !authData?.user) {
        throw new Error(authError?.message || "No se pudo crear el usuario invitado.");
      }

      try {
        const { data, error } = await admin.rpc("owner_create_guest_access", {
          p_actor_user_id: user.id,
          p_board_id: boardId,
          p_client_id: payload.clientId || null,
          p_guest_email: authEmail,
          p_guest_key: ownerKey,
          p_guest_user_id: authData.user.id,
          p_name: name,
          p_nickname: nickname,
          p_project_ids: projectIds
        });

        if (error) {
          throw new Error(error.message || "No se pudo crear el invitado.");
        }

        return jsonResponse({
          guest: mapGuestRow(data as GuestRow, ownerKey, projectIds)
        });
      } catch (error) {
        await admin.auth.admin.deleteUser(authData.user.id).catch(() => {});
        throw error;
      }
    }

    if (action === "update") {
      const guestId = String(payload.guestId || "");
      const name = String(payload.name || "").trim();
      const nickname = assertNickname(payload.nickname);
      const status = String(payload.status || "active");
      const projectIds = sanitizeProjectIds(payload.projectIds);
      const current = await getCurrentGuest(admin, guestId);

      await assertOwnerForBoard(admin, user.id, String(current.board_id || ""));

      const { data, error } = await admin.rpc("owner_update_guest_access", {
        p_actor_user_id: user.id,
        p_client_id: payload.clientId || null,
        p_guest_id: guestId,
        p_name: name,
        p_nickname: nickname,
        p_project_ids: projectIds,
        p_status: status
      });

      if (error) {
        throw new Error(error.message || "No se pudo actualizar el invitado.");
      }

      const activeProjectIds = await getGuestProjectIds(admin, guestId);
      return jsonResponse({
        guest: mapGuestRow(data as GuestRow, "", activeProjectIds)
      });
    }

    if (action === "resetKey") {
      const guestId = String(payload.guestId || "");
      const ownerKey = String(payload.ownerKey || "") || generateOwnerKey();
      assertPassword(ownerKey, "La clave");

      const current = await getCurrentGuest(admin, guestId);
      await assertOwnerForBoard(admin, user.id, String(current.board_id || ""));

      const { data, error } = await admin.rpc("owner_reset_guest_key", {
        p_actor_user_id: user.id,
        p_client_id: payload.clientId || null,
        p_guest_id: guestId,
        p_guest_key: ownerKey
      });

      if (error) {
        throw new Error(error.message || "No se pudo regenerar la clave.");
      }

      const projectIds = await getGuestProjectIds(admin, guestId);
      return jsonResponse({
        guest: mapGuestRow(data as GuestRow, ownerKey, projectIds)
      });
    }

    if (action === "delete") {
      const guestId = String(payload.guestId || "");
      const current = await getCurrentGuest(admin, guestId);
      await assertOwnerForBoard(admin, user.id, String(current.board_id || ""));

      const { data, error } = await admin.rpc("owner_delete_guest_access", {
        p_actor_user_id: user.id,
        p_client_id: payload.clientId || null,
        p_guest_id: guestId
      });

      if (error) {
        throw new Error(error.message || "No se pudo eliminar el invitado.");
      }

      const deletedGuest = Array.isArray(data) ? data[0] : data;
      const guestUserId = deletedGuest?.guest_user_id || current.user_id;
      if (guestUserId) {
        const { error: deleteUserError } = await admin.auth.admin.deleteUser(String(guestUserId));
        if (deleteUserError) {
          throw new Error(deleteUserError.message || "Se quitó el acceso, pero no se pudo eliminar el usuario Auth.");
        }
      }

      return jsonResponse({
        deleted: true,
        guestId
      });
    }

    return errorResponse("Acción no soportada.", 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo completar la acción.", 400);
  }
});

function sanitizeProjectIds(value: unknown): string[] {
  return [...new Set(Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [])];
}

async function getCurrentGuest(admin: any, guestId: string) {
  const { data, error } = await admin
    .from("guest_accounts")
    .select("id, board_id, user_id, status")
    .eq("id", guestId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error("No encontramos ese invitado.");
  }

  return data;
}

async function listGuests(admin: any, boardId: string) {
  const { data: rows, error } = await admin
    .from("guest_accounts")
    .select("id, name, nickname, status, user_id, last_login_at, created_at, updated_at")
    .eq("board_id", boardId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar los invitados.");
  }

  const accessByGuest = await getAccessByGuest(admin, (rows || []).map((row: GuestRow) => String(row.id || "")));
  return (rows || []).map((row: GuestRow) => mapGuestRow(row, "", accessByGuest.get(String(row.id || "")) || []));
}

async function getGuestProjectIds(admin: any, guestId: string) {
  const map = await getAccessByGuest(admin, [guestId]);
  return map.get(guestId) || [];
}

async function getAccessByGuest(admin: any, guestIds: string[]) {
  const map = new Map<string, string[]>();
  if (guestIds.length === 0) {
    return map;
  }

  const { data, error } = await admin
    .from("guest_project_access")
    .select("guest_id, project_id")
    .in("guest_id", guestIds)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message || "No se pudieron cargar los permisos de proyectos.");
  }

  (data || []).forEach((row: Record<string, unknown>) => {
    const guestId = String(row.guest_id || "");
    if (!map.has(guestId)) {
      map.set(guestId, []);
    }
    map.get(guestId)?.push(String(row.project_id || ""));
  });
  return map;
}
