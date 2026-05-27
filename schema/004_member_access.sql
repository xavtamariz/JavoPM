-- JavoPM v1.8.0 master account team-member access.
-- Adds controlled member access for cloud workspaces. Anonymous mode stays local-only.

create extension if not exists pgcrypto;

create schema if not exists private;

alter table public.profiles
  add column if not exists team_member_id text,
  add column if not exists workspace_id text,
  add column if not exists password_setup_required boolean not null default false;

alter table public.team_members
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'local',
  add column if not exists last_login_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_status_check'
      and conrelid = 'public.team_members'::regclass
  ) then
    alter table public.team_members
      add constraint team_members_status_check
      check (status in ('local', 'active', 'inactive'));
  end if;
end;
$$;

create unique index if not exists team_members_nickname_global_unique
  on public.team_members (lower(nickname))
  where nickname is not null and deleted_at is null;

create index if not exists team_members_user_idx
  on public.team_members (user_id);

create table if not exists private.member_credentials (
  team_member_id text primary key references public.team_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  member_password_hash text,
  owner_key_hash text not null,
  password_setup_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_access_events (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  team_member_id text not null references public.team_members(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'member_created',
      'member_updated',
      'member_login',
      'owner_key_login',
      'password_setup',
      'owner_key_reset',
      'member_deactivated',
      'member_reactivated'
    )
  ),
  credential_type text check (credential_type in ('member_password', 'owner_key')),
  metadata jsonb not null default '{}'::jsonb,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists member_credentials_user_idx
  on private.member_credentials (user_id);

create index if not exists member_credentials_workspace_idx
  on private.member_credentials (workspace_id);

create index if not exists member_access_events_workspace_created_idx
  on public.member_access_events (workspace_id, created_at);

alter table public.member_access_events enable row level security;

drop trigger if exists set_updated_at on public.member_access_events;
create trigger set_updated_at
before update on public.member_access_events
for each row execute function public.set_updated_at();

create or replace function private.normalize_member_nickname(p_nickname text)
returns text
language sql
immutable
set search_path = pg_temp
as $$
  select lower(trim(coalesce(p_nickname, '')));
$$;

create or replace function private.assert_member_nickname(p_nickname text)
returns text
language plpgsql
set search_path = private, pg_temp
as $$
declare
  normalized text;
begin
  normalized := private.normalize_member_nickname(p_nickname);

  if normalized !~ '^[a-z0-9][a-z0-9_-]{2,31}$' then
    raise exception 'Nickname inválido. Usa minúsculas, números, guion o guion bajo; mínimo 3 caracteres.';
  end if;

  return normalized;
end;
$$;

create or replace function private.is_board_owner(p_board_id text, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = p_board_id
      and b.deleted_at is null
      and wm.user_id = p_user_id
      and wm.role = 'owner'
      and wm.status = 'active'
      and wm.deleted_at is null
  );
$$;

create or replace function private.get_board_workspace_id(p_board_id text)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.workspace_id
  from public.boards b
  where b.id = p_board_id
    and b.deleted_at is null;
$$;

create or replace function private.make_access_event_id()
returns text
language sql
set search_path = pg_temp
as $$
  select 'member_event_' || replace(gen_random_uuid()::text, '-', '');
$$;

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
  workspace_id text;
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
  workspace_id := private.get_board_workspace_id(p_board_id);

  if workspace_id is null then
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
    workspace_id,
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
    workspace_id,
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
        select coalesce(max(order_index), -1) + 1
        from public.team_members
        where board_id = p_board_id
          and deleted_at is null
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
    workspace_id,
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
    workspace_id,
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

create or replace function public.owner_reset_team_member_key(
  p_actor_user_id uuid,
  p_team_member_id text,
  p_owner_key text,
  p_client_id text default null
)
returns public.team_members
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_row public.team_members;
  workspace_id text;
begin
  if length(coalesce(p_owner_key, '')) < 6 then
    raise exception 'La clave debe tener al menos 6 caracteres.';
  end if;

  select * into current_row
  from public.team_members
  where id = p_team_member_id
    and deleted_at is null;

  if current_row.id is null then
    raise exception 'No encontramos ese integrante.';
  end if;

  if not private.is_board_owner(current_row.board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede regenerar claves.';
  end if;

  workspace_id := private.get_board_workspace_id(current_row.board_id);

  update private.member_credentials
  set
    owner_key_hash = crypt(p_owner_key, gen_salt('bf')),
    updated_by = p_actor_user_id,
    updated_at = now()
  where team_member_id = current_row.id;

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
    workspace_id,
    current_row.board_id,
    current_row.id,
    current_row.user_id,
    p_actor_user_id,
    'owner_key_reset',
    '{}'::jsonb,
    p_client_id
  );

  return current_row;
end;
$$;

create or replace function public.authenticate_team_member_access(
  p_nickname text,
  p_password text,
  p_user_agent text default null
)
returns table (
  user_id uuid,
  auth_email text,
  workspace_id text,
  board_id text,
  team_member_id text,
  display_name text,
  nickname text,
  role text,
  account_type text,
  credential_type text,
  password_setup_required boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  normalized_nickname text;
  member_row public.team_members;
  profile_row public.profiles;
  credential_row private.member_credentials;
  member_match boolean := false;
  owner_key_match boolean := false;
  event_name text;
begin
  normalized_nickname := private.assert_member_nickname(p_nickname);

  select * into member_row
  from public.team_members tm
  where tm.deleted_at is null
    and tm.status = 'active'
    and lower(tm.nickname) = normalized_nickname
  limit 1;

  if member_row.id is null then
    raise exception 'Nickname o contraseña inválidos.';
  end if;

  select * into credential_row
  from private.member_credentials mc
  where mc.team_member_id = member_row.id
    and mc.user_id = member_row.user_id;

  if credential_row.team_member_id is null then
    raise exception 'Nickname o contraseña inválidos.';
  end if;

  member_match := credential_row.member_password_hash is not null
    and credential_row.member_password_hash = crypt(p_password, credential_row.member_password_hash);
  owner_key_match := credential_row.owner_key_hash = crypt(p_password, credential_row.owner_key_hash);

  if not member_match and not owner_key_match then
    raise exception 'Nickname o contraseña inválidos.';
  end if;

  select * into profile_row
  from public.profiles p
  where p.user_id = member_row.user_id;

  update public.team_members
  set
    last_login_at = now(),
    updated_at = now()
  where id = member_row.id;

  insert into public.member_access_events (
    id,
    workspace_id,
    board_id,
    team_member_id,
    user_id,
    actor_user_id,
    event_type,
    credential_type,
    metadata
  )
  values (
    private.make_access_event_id(),
    credential_row.workspace_id,
    credential_row.board_id,
    member_row.id,
    member_row.user_id,
    member_row.user_id,
    case when owner_key_match then 'owner_key_login' else 'member_login' end,
    case when owner_key_match then 'owner_key' else 'member_password' end,
    jsonb_build_object('userAgent', p_user_agent)
  );

  return query
  select
    member_row.user_id,
    profile_row.email,
    credential_row.workspace_id,
    credential_row.board_id,
    member_row.id,
    member_row.name,
    normalized_nickname,
    'member'::text,
    'member'::text,
    case when owner_key_match then 'owner_key' else 'member_password' end,
    credential_row.password_setup_required;
end;
$$;

create or replace function public.complete_team_member_password_setup(
  p_user_id uuid,
  p_password text
)
returns table (
  user_id uuid,
  team_member_id text,
  password_setup_required boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  credential_row private.member_credentials;
begin
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres.';
  end if;

  select * into credential_row
  from private.member_credentials mc
  where mc.user_id = p_user_id;

  if credential_row.team_member_id is null then
    raise exception 'No encontramos credenciales de miembro.';
  end if;

  update private.member_credentials
  set
    member_password_hash = crypt(p_password, gen_salt('bf')),
    password_setup_required = false,
    updated_by = p_user_id,
    updated_at = now()
  where user_id = p_user_id
  returning * into credential_row;

  update public.profiles
  set
    password_setup_required = false,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.member_access_events (
    id,
    workspace_id,
    board_id,
    team_member_id,
    user_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    private.make_access_event_id(),
    credential_row.workspace_id,
    credential_row.board_id,
    credential_row.team_member_id,
    credential_row.user_id,
    credential_row.user_id,
    'password_setup',
    '{}'::jsonb
  );

  return query
  select credential_row.user_id, credential_row.team_member_id, credential_row.password_setup_required;
end;
$$;

drop policy if exists "team members manage by board members" on public.team_members;
drop policy if exists "team members select by board members" on public.team_members;
drop policy if exists "team members insert by workspace owner" on public.team_members;
drop policy if exists "team members update by workspace owner" on public.team_members;
drop policy if exists "member access events select by workspace members" on public.member_access_events;
drop policy if exists "member access events insert by service" on public.member_access_events;

create policy "team members select by board members" on public.team_members
for select
to authenticated
using (private.is_board_member(board_id));

create policy "team members insert by workspace owner" on public.team_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.boards b
    where b.id = team_members.board_id
      and private.is_workspace_owner(b.workspace_id)
  )
);

create policy "team members update by workspace owner" on public.team_members
for update
to authenticated
using (
  exists (
    select 1
    from public.boards b
    where b.id = team_members.board_id
      and private.is_workspace_owner(b.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.boards b
    where b.id = team_members.board_id
      and private.is_workspace_owner(b.workspace_id)
  )
);

create policy "member access events select by workspace members" on public.member_access_events
for select
to authenticated
using (private.is_workspace_member(workspace_id));

revoke all on function public.owner_create_team_member_access(uuid, text, uuid, text, text, text, text, text) from public;
revoke all on function public.owner_update_team_member_access(uuid, text, text, text, text, text) from public;
revoke all on function public.owner_reset_team_member_key(uuid, text, text, text) from public;
revoke all on function public.authenticate_team_member_access(text, text, text) from public;
revoke all on function public.complete_team_member_password_setup(uuid, text) from public;

revoke all on function public.owner_create_team_member_access(uuid, text, uuid, text, text, text, text, text) from anon, authenticated;
revoke all on function public.owner_update_team_member_access(uuid, text, text, text, text, text) from anon, authenticated;
revoke all on function public.owner_reset_team_member_key(uuid, text, text, text) from anon, authenticated;
revoke all on function public.authenticate_team_member_access(text, text, text) from anon, authenticated;
revoke all on function public.complete_team_member_password_setup(uuid, text) from anon, authenticated;

grant usage on schema private to service_role;
grant select, insert, update, delete on private.member_credentials to service_role;
grant select on public.member_access_events to authenticated;
grant execute on function private.assert_member_nickname(text) to service_role;
grant execute on function public.owner_create_team_member_access(uuid, text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.owner_update_team_member_access(uuid, text, text, text, text, text) to service_role;
grant execute on function public.owner_reset_team_member_key(uuid, text, text, text) to service_role;
grant execute on function public.authenticate_team_member_access(text, text, text) to service_role;
grant execute on function public.complete_team_member_password_setup(uuid, text) to service_role;
