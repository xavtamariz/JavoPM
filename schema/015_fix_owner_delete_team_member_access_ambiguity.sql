-- Qualify the private.member_credentials reference in the member delete RPC.

create or replace function public.owner_delete_team_member_access(
  p_actor_user_id uuid,
  p_team_member_id text,
  p_client_id text default null
)
returns table (
  team_member_id text,
  member_user_id uuid
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_row public.team_members;
  target_workspace_id text;
begin
  select * into current_row
  from public.team_members
  where id = p_team_member_id
    and deleted_at is null;

  if current_row.id is null then
    raise exception 'No encontramos ese integrante.';
  end if;

  if current_row.status <> 'inactive' then
    raise exception 'Primero cambia el miembro a inactivo.';
  end if;

  if not private.is_board_owner(current_row.board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede eliminar miembros con acceso.';
  end if;

  target_workspace_id := private.get_board_workspace_id(current_row.board_id);
  member_user_id := current_row.user_id;
  team_member_id := current_row.id;

  delete from private.member_credentials credentials
  where credentials.team_member_id = current_row.id;

  update public.workspace_members
  set
    status = 'inactive',
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
  where workspace_id = target_workspace_id
    and user_id = current_row.user_id;

  delete from public.profiles
  where user_id = current_row.user_id
    and account_type = 'member';

  update public.team_members
  set
    status = 'inactive',
    client_id = p_client_id,
    deleted_at = now(),
    updated_at = now()
  where id = current_row.id;

  insert into public.member_access_events (
    id,
    workspace_id,
    board_id,
    team_member_id,
    user_id,
    actor_user_id,
    event_type,
    metadata,
    client_id
  )
  values (
    private.make_access_event_id(),
    target_workspace_id,
    current_row.board_id,
    current_row.id,
    current_row.user_id,
    p_actor_user_id,
    'member_deactivated',
    jsonb_build_object('deleted', true, 'nickname', current_row.nickname),
    p_client_id
  );

  return next;
end;
$$;

revoke all on function public.owner_delete_team_member_access(uuid, text, text) from public, anon, authenticated;
grant execute on function public.owner_delete_team_member_access(uuid, text, text) to service_role;
