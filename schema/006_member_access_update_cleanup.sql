-- Keep active reactivation semantics explicit for member updates.

create or replace function public.owner_update_team_member_access(
  p_actor_user_id uuid,
  p_team_member_id text,
  p_name text,
  p_nickname text,
  p_status text,
  p_client_id text default null
)
returns public.team_members
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_row public.team_members;
  previous_status text;
  normalized_nickname text;
  next_status text;
  target_workspace_id text;
  event_name text;
begin
  select * into current_row
  from public.team_members
  where id = p_team_member_id
    and deleted_at is null;

  if current_row.id is null then
    raise exception 'No encontramos ese integrante.';
  end if;

  previous_status := current_row.status;

  if not private.is_board_owner(current_row.board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede editar miembros con acceso.';
  end if;

  normalized_nickname := private.assert_member_nickname(p_nickname);
  next_status := coalesce(nullif(trim(p_status), ''), current_row.status);

  if next_status not in ('active', 'inactive') then
    raise exception 'Estado inválido.';
  end if;

  if exists (
    select 1
    from public.team_members tm
    where tm.deleted_at is null
      and tm.id <> p_team_member_id
      and lower(tm.nickname) = normalized_nickname
  ) then
    raise exception 'Ese nickname ya existe.';
  end if;

  target_workspace_id := private.get_board_workspace_id(current_row.board_id);

  update public.team_members
  set
    name = trim(p_name),
    nickname = normalized_nickname,
    status = next_status,
    client_id = p_client_id,
    updated_at = now()
  where id = p_team_member_id
  returning * into current_row;

  update public.profiles
  set
    nickname = normalized_nickname,
    display_name = current_row.name,
    updated_at = now()
  where user_id = current_row.user_id;

  update public.workspace_members
  set
    status = next_status,
    deleted_at = case when next_status = 'active' then null else deleted_at end,
    updated_at = now()
  where workspace_id = target_workspace_id
    and user_id = current_row.user_id;

  event_name := case
    when next_status = 'inactive' then 'member_deactivated'
    when previous_status = 'inactive' and next_status = 'active' then 'member_reactivated'
    else 'member_updated'
  end;

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
    event_name,
    jsonb_build_object('nickname', normalized_nickname, 'status', next_status),
    p_client_id
  );

  return current_row;
end;
$$;

revoke all on function public.owner_update_team_member_access(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.owner_update_team_member_access(uuid, text, text, text, text, text) to service_role;
