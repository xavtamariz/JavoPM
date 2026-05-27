create or replace function public.owner_create_team_member_access(
  p_actor_user_id uuid,
  p_board_id text,
  p_member_user_id uuid,
  p_member_email text,
  p_name text,
  p_nickname text,
  p_owner_key text,
  p_client_id text default null
)
returns public.team_members
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  normalized_nickname text;
  target_workspace_id text;
  team_member_row public.team_members;
  now_value timestamptz := now();
begin
  if not private.is_board_owner(p_board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede crear miembros con acceso.';
  end if;

  if length(trim(coalesce(p_name, ''))) < 1 then
    raise exception 'Escribe el nombre del integrante.';
  end if;

  if length(coalesce(p_owner_key, '')) < 6 then
    raise exception 'La clave debe tener al menos 6 caracteres.';
  end if;

  normalized_nickname := private.assert_member_nickname(p_nickname);
  target_workspace_id := private.get_board_workspace_id(p_board_id);

  if target_workspace_id is null then
    raise exception 'No encontramos el tablero.';
  end if;

  if exists (
    select 1
    from public.team_members tm
    where tm.deleted_at is null
      and lower(tm.nickname) = normalized_nickname
  ) then
    raise exception 'Ese nickname ya existe.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.nickname = normalized_nickname
      and p.user_id <> p_member_user_id
  ) then
    raise exception 'Ese nickname ya existe.';
  end if;

  insert into public.profiles (
    user_id,
    account_type,
    email,
    nickname,
    display_name,
    team_member_id,
    workspace_id,
    password_setup_required,
    created_at,
    updated_at
  )
  values (
    p_member_user_id,
    'member',
    p_member_email,
    normalized_nickname,
    trim(p_name),
    null,
    target_workspace_id,
    true,
    now_value,
    now_value
  )
  on conflict (user_id) do update set
    account_type = 'member',
    email = excluded.email,
    nickname = excluded.nickname,
    display_name = excluded.display_name,
    workspace_id = excluded.workspace_id,
    password_setup_required = true,
    updated_at = now_value;

  insert into public.workspace_members (
    id,
    workspace_id,
    user_id,
    role,
    status,
    created_by,
    client_id,
    version,
    created_at,
    updated_at,
    deleted_at
  )
  values (
    'member_' || replace(gen_random_uuid()::text, '-', ''),
    target_workspace_id,
    p_member_user_id,
    'member',
    'active',
    p_actor_user_id,
    p_client_id,
    1,
    now_value,
    now_value,
    null
  )
  on conflict (workspace_id, user_id) do update set
    role = 'member',
    status = 'active',
    created_by = coalesce(public.workspace_members.created_by, p_actor_user_id),
    client_id = excluded.client_id,
    updated_at = now_value,
    deleted_at = null;

  select * into team_member_row
  from public.team_members tm
  where tm.board_id = p_board_id
    and tm.deleted_at is null
    and tm.status = 'local'
    and lower(tm.name) = lower(trim(p_name))
  order by tm.created_at
  limit 1;

  if team_member_row.id is not null then
    update public.team_members
    set
      name = trim(p_name),
      nickname = normalized_nickname,
      user_id = p_member_user_id,
      status = 'active',
      client_id = p_client_id,
      updated_at = now_value
    where id = team_member_row.id
    returning * into team_member_row;
  else
    insert into public.team_members (
      id,
      board_id,
      name,
      nickname,
      user_id,
      status,
      sort_key,
      order_index,
      client_id,
      version,
      created_at,
      updated_at,
      deleted_at
    )
    values (
      'team_' || replace(gen_random_uuid()::text, '-', ''),
      p_board_id,
      trim(p_name),
      normalized_nickname,
      p_member_user_id,
      'active',
      '999999',
      (
        select coalesce(max(tm.order_index), -1) + 1
        from public.team_members tm
        where tm.board_id = p_board_id
          and tm.deleted_at is null
      ),
      p_client_id,
      1,
      now_value,
      now_value,
      null
    )
    returning * into team_member_row;
  end if;

  update public.profiles
  set
    team_member_id = team_member_row.id,
    updated_at = now_value
  where user_id = p_member_user_id;

  insert into private.member_credentials (
    team_member_id,
    user_id,
    workspace_id,
    board_id,
    member_password_hash,
    owner_key_hash,
    password_setup_required,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  values (
    team_member_row.id,
    p_member_user_id,
    target_workspace_id,
    p_board_id,
    null,
    crypt(p_owner_key, gen_salt('bf')),
    true,
    p_actor_user_id,
    p_actor_user_id,
    now_value,
    now_value
  );

  insert into public.member_access_events (
    id,
    workspace_id,
    board_id,
    team_member_id,
    user_id,
    actor_user_id,
    event_type,
    metadata,
    client_id,
    created_at,
    updated_at
  )
  values (
    private.make_access_event_id(),
    target_workspace_id,
    p_board_id,
    team_member_row.id,
    p_member_user_id,
    p_actor_user_id,
    'member_created',
    jsonb_build_object('nickname', normalized_nickname),
    p_client_id,
    now_value,
    now_value
  );

  return team_member_row;
end;
$$;

revoke all on function public.owner_create_team_member_access(
  uuid, text, uuid, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.owner_create_team_member_access(
  uuid, text, uuid, text, text, text, text, text
) to service_role;
