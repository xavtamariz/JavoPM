-- JavoPM v2.1.0 guest read-only access.
-- Guests are Auth users, but they are intentionally not workspace_members.
-- They get read-only, project-scoped access through dedicated policies and
-- sanitized snapshots served by Edge Functions.

create extension if not exists pgcrypto;
create schema if not exists private;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_account_type_check;
  end if;

  alter table public.profiles
    add constraint profiles_account_type_check
    check (account_type in ('owner', 'member', 'guest'));
end;
$$;

create table if not exists public.guest_accounts (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default '',
  nickname text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_login_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists guest_accounts_nickname_global_unique
  on public.guest_accounts (lower(nickname))
  where deleted_at is null;

create index if not exists guest_accounts_user_idx
  on public.guest_accounts (user_id)
  where user_id is not null;

create index if not exists guest_accounts_board_idx
  on public.guest_accounts (board_id, status)
  where deleted_at is null;

create index if not exists guest_accounts_workspace_idx
  on public.guest_accounts (workspace_id, status)
  where deleted_at is null;

create index if not exists guest_accounts_created_by_idx
  on public.guest_accounts (created_by)
  where created_by is not null;

create table if not exists private.guest_credentials (
  guest_id text primary key references public.guest_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  key_hash text,
  key_consumed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guest_credentials_user_idx
  on private.guest_credentials (user_id);

create index if not exists guest_credentials_board_idx
  on private.guest_credentials (board_id);

create index if not exists guest_credentials_workspace_idx
  on private.guest_credentials (workspace_id);

create index if not exists guest_credentials_created_by_idx
  on private.guest_credentials (created_by)
  where created_by is not null;

create index if not exists guest_credentials_updated_by_idx
  on private.guest_credentials (updated_by)
  where updated_by is not null;

create table if not exists public.guest_project_access (
  id text primary key,
  guest_id text not null references public.guest_accounts(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists guest_project_access_unique
  on public.guest_project_access (guest_id, project_id)
  where deleted_at is null;

create index if not exists guest_project_access_guest_idx
  on public.guest_project_access (guest_id)
  where deleted_at is null;

create index if not exists guest_project_access_project_idx
  on public.guest_project_access (project_id)
  where deleted_at is null;

create index if not exists guest_project_access_workspace_idx
  on public.guest_project_access (workspace_id)
  where deleted_at is null;

create index if not exists guest_project_access_board_idx
  on public.guest_project_access (board_id)
  where deleted_at is null;

create table if not exists public.guest_access_events (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  guest_id text not null references public.guest_accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'guest_created',
      'guest_updated',
      'guest_login',
      'guest_key_reset',
      'guest_deactivated',
      'guest_reactivated',
      'guest_deleted'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists guest_access_events_board_created_idx
  on public.guest_access_events (board_id, created_at desc);

create index if not exists guest_access_events_guest_created_idx
  on public.guest_access_events (guest_id, created_at desc);

create index if not exists guest_access_events_workspace_created_idx
  on public.guest_access_events (workspace_id, created_at desc);

create index if not exists guest_access_events_user_idx
  on public.guest_access_events (user_id)
  where user_id is not null;

create index if not exists guest_access_events_actor_user_idx
  on public.guest_access_events (actor_user_id)
  where actor_user_id is not null;

drop trigger if exists set_updated_at on public.guest_accounts;
create trigger set_updated_at
before update on public.guest_accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.guest_project_access;
create trigger set_updated_at
before update on public.guest_project_access
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.guest_access_events;
create trigger set_updated_at
before update on public.guest_access_events
for each row execute function public.set_updated_at();

create or replace function private.make_guest_access_event_id()
returns text
language sql
set search_path = pg_temp
as $$
  select 'guest_event_' || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function private.is_active_board_guest(p_board_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.guest_accounts ga
    where ga.board_id = p_board_id
      and ga.user_id = (select auth.uid())
      and ga.status = 'active'
      and ga.deleted_at is null
  );
$$;

create or replace function private.is_active_workspace_guest(p_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.guest_accounts ga
    where ga.workspace_id = p_workspace_id
      and ga.user_id = (select auth.uid())
      and ga.status = 'active'
      and ga.deleted_at is null
  );
$$;

create or replace function private.guest_can_view_project(p_board_id text, p_project_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.guest_accounts ga
    join public.guest_project_access gpa on gpa.guest_id = ga.id
    where ga.board_id = p_board_id
      and ga.user_id = (select auth.uid())
      and ga.status = 'active'
      and ga.deleted_at is null
      and gpa.project_id = p_project_id
      and gpa.deleted_at is null
  );
$$;

create or replace function private.guest_can_view_task(p_task_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tasks t
    join public.projects p
      on p.board_id = t.board_id
     and p.name = t.project_name
     and p.deleted_at is null
    join public.guest_accounts ga
      on ga.board_id = t.board_id
     and ga.user_id = (select auth.uid())
     and ga.status = 'active'
     and ga.deleted_at is null
    join public.guest_project_access gpa
      on gpa.guest_id = ga.id
     and gpa.project_id = p.id
     and gpa.deleted_at is null
    where t.id = p_task_id
      and t.deleted_at is null
  );
$$;

create or replace function private.sync_guest_project_access(
  p_guest_id text,
  p_board_id text,
  p_workspace_id text,
  p_project_ids text[],
  p_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_project_id text;
  normalized_project_ids text[] := coalesce(p_project_ids, array[]::text[]);
begin
  update public.guest_project_access
  set
    deleted_at = now(),
    client_id = p_client_id,
    updated_at = now()
  where guest_id = p_guest_id
    and deleted_at is null
    and not (project_id = any(normalized_project_ids));

  foreach target_project_id in array normalized_project_ids
  loop
    if not exists (
      select 1
      from public.projects p
      where p.id = target_project_id
        and p.board_id = p_board_id
        and p.deleted_at is null
    ) then
      continue;
    end if;

    insert into public.guest_project_access (
      id,
      guest_id,
      workspace_id,
      board_id,
      project_id,
      client_id,
      version,
      created_at,
      updated_at,
      deleted_at
    )
    values (
      'guest_project_' || replace(gen_random_uuid()::text, '-', ''),
      p_guest_id,
      p_workspace_id,
      p_board_id,
      target_project_id,
      p_client_id,
      1,
      now(),
      now(),
      null
    )
    on conflict (guest_id, project_id) where deleted_at is null
    do update set
      client_id = excluded.client_id,
      updated_at = now(),
      deleted_at = null;
  end loop;
end;
$$;

create or replace function public.owner_create_guest_access(
  p_actor_user_id uuid,
  p_board_id text,
  p_guest_user_id uuid,
  p_guest_email text,
  p_name text,
  p_nickname text,
  p_guest_key text,
  p_project_ids text[] default array[]::text[],
  p_client_id text default null
)
returns public.guest_accounts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  normalized_nickname text;
  workspace_id text;
  guest_row public.guest_accounts;
  now_value timestamptz := now();
begin
  if not private.is_board_owner(p_board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede crear invitados.';
  end if;

  if length(trim(coalesce(p_name, ''))) < 1 then
    raise exception 'Escribe el nombre del invitado.';
  end if;

  if length(coalesce(p_guest_key, '')) < 6 then
    raise exception 'La clave debe tener al menos 6 caracteres.';
  end if;

  normalized_nickname := private.assert_member_nickname(p_nickname);
  workspace_id := private.get_board_workspace_id(p_board_id);

  if workspace_id is null then
    raise exception 'No encontramos el tablero.';
  end if;

  if exists (
    select 1
    from public.guest_accounts ga
    where ga.deleted_at is null
      and lower(ga.nickname) = normalized_nickname
  ) or exists (
    select 1
    from public.team_members tm
    where tm.deleted_at is null
      and lower(tm.nickname) = normalized_nickname
  ) or exists (
    select 1
    from public.profiles p
    where p.nickname = normalized_nickname
      and p.user_id <> p_guest_user_id
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
    p_guest_user_id,
    'guest',
    p_guest_email,
    normalized_nickname,
    trim(p_name),
    null,
    workspace_id,
    false,
    now_value,
    now_value
  )
  on conflict (user_id) do update set
    account_type = 'guest',
    email = excluded.email,
    nickname = excluded.nickname,
    display_name = excluded.display_name,
    workspace_id = excluded.workspace_id,
    password_setup_required = false,
    updated_at = now_value;

  insert into public.guest_accounts (
    id,
    workspace_id,
    board_id,
    user_id,
    name,
    nickname,
    status,
    created_by,
    client_id,
    version,
    created_at,
    updated_at,
    deleted_at
  )
  values (
    'guest_' || replace(gen_random_uuid()::text, '-', ''),
    workspace_id,
    p_board_id,
    p_guest_user_id,
    trim(p_name),
    normalized_nickname,
    'active',
    p_actor_user_id,
    p_client_id,
    1,
    now_value,
    now_value,
    null
  )
  returning * into guest_row;

  insert into private.guest_credentials (
    guest_id,
    user_id,
    workspace_id,
    board_id,
    key_hash,
    key_consumed_at,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  values (
    guest_row.id,
    p_guest_user_id,
    workspace_id,
    p_board_id,
    extensions.crypt(p_guest_key, extensions.gen_salt('bf')),
    null,
    p_actor_user_id,
    p_actor_user_id,
    now_value,
    now_value
  );

  perform private.sync_guest_project_access(
    guest_row.id,
    p_board_id,
    workspace_id,
    p_project_ids,
    p_client_id
  );

  insert into public.guest_access_events (
    id,
    workspace_id,
    board_id,
    guest_id,
    user_id,
    actor_user_id,
    event_type,
    metadata,
    client_id,
    created_at,
    updated_at
  )
  values (
    private.make_guest_access_event_id(),
    workspace_id,
    p_board_id,
    guest_row.id,
    p_guest_user_id,
    p_actor_user_id,
    'guest_created',
    jsonb_build_object('nickname', normalized_nickname, 'projectIds', p_project_ids),
    p_client_id,
    now_value,
    now_value
  );

  return guest_row;
end;
$$;

create or replace function public.owner_update_guest_access(
  p_actor_user_id uuid,
  p_guest_id text,
  p_name text,
  p_nickname text,
  p_status text,
  p_project_ids text[] default array[]::text[],
  p_client_id text default null
)
returns public.guest_accounts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_row public.guest_accounts;
  previous_status text;
  normalized_nickname text;
  next_status text;
  event_name text;
begin
  select * into current_row
  from public.guest_accounts
  where id = p_guest_id
    and deleted_at is null;

  if current_row.id is null then
    raise exception 'No encontramos ese invitado.';
  end if;

  if not private.is_board_owner(current_row.board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede editar invitados.';
  end if;

  if length(trim(coalesce(p_name, ''))) < 1 then
    raise exception 'Escribe el nombre del invitado.';
  end if;

  normalized_nickname := private.assert_member_nickname(p_nickname);
  next_status := coalesce(nullif(trim(p_status), ''), current_row.status);

  if next_status not in ('active', 'inactive') then
    raise exception 'Estado inválido.';
  end if;

  if exists (
    select 1
    from public.guest_accounts ga
    where ga.deleted_at is null
      and ga.id <> p_guest_id
      and lower(ga.nickname) = normalized_nickname
  ) or exists (
    select 1
    from public.team_members tm
    where tm.deleted_at is null
      and lower(tm.nickname) = normalized_nickname
  ) or exists (
    select 1
    from public.profiles p
    where p.nickname = normalized_nickname
      and p.user_id <> current_row.user_id
  ) then
    raise exception 'Ese nickname ya existe.';
  end if;

  previous_status := current_row.status;

  update public.guest_accounts
  set
    name = trim(p_name),
    nickname = normalized_nickname,
    status = next_status,
    client_id = p_client_id,
    updated_at = now()
  where id = p_guest_id
  returning * into current_row;

  update public.profiles
  set
    nickname = normalized_nickname,
    display_name = current_row.name,
    updated_at = now()
  where user_id = current_row.user_id;

  perform private.sync_guest_project_access(
    current_row.id,
    current_row.board_id,
    current_row.workspace_id,
    p_project_ids,
    p_client_id
  );

  event_name := case
    when next_status = 'inactive' then 'guest_deactivated'
    when previous_status = 'inactive' and next_status = 'active' then 'guest_reactivated'
    else 'guest_updated'
  end;

  insert into public.guest_access_events (
    id,
    workspace_id,
    board_id,
    guest_id,
    user_id,
    actor_user_id,
    event_type,
    metadata,
    client_id
  )
  values (
    private.make_guest_access_event_id(),
    current_row.workspace_id,
    current_row.board_id,
    current_row.id,
    current_row.user_id,
    p_actor_user_id,
    event_name,
    jsonb_build_object('nickname', normalized_nickname, 'status', next_status, 'projectIds', p_project_ids),
    p_client_id
  );

  return current_row;
end;
$$;

create or replace function public.owner_reset_guest_key(
  p_actor_user_id uuid,
  p_guest_id text,
  p_guest_key text,
  p_client_id text default null
)
returns public.guest_accounts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_row public.guest_accounts;
begin
  if length(coalesce(p_guest_key, '')) < 6 then
    raise exception 'La clave debe tener al menos 6 caracteres.';
  end if;

  select * into current_row
  from public.guest_accounts
  where id = p_guest_id
    and deleted_at is null;

  if current_row.id is null then
    raise exception 'No encontramos ese invitado.';
  end if;

  if not private.is_board_owner(current_row.board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede regenerar claves.';
  end if;

  update private.guest_credentials
  set
    key_hash = extensions.crypt(p_guest_key, extensions.gen_salt('bf')),
    key_consumed_at = null,
    updated_by = p_actor_user_id,
    updated_at = now()
  where guest_id = current_row.id;

  insert into public.guest_access_events (
    id,
    workspace_id,
    board_id,
    guest_id,
    user_id,
    actor_user_id,
    event_type,
    metadata,
    client_id
  )
  values (
    private.make_guest_access_event_id(),
    current_row.workspace_id,
    current_row.board_id,
    current_row.id,
    current_row.user_id,
    p_actor_user_id,
    'guest_key_reset',
    '{}'::jsonb,
    p_client_id
  );

  return current_row;
end;
$$;

create or replace function public.owner_delete_guest_access(
  p_actor_user_id uuid,
  p_guest_id text,
  p_client_id text default null
)
returns table (
  guest_id text,
  guest_user_id uuid
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_row public.guest_accounts;
begin
  select * into current_row
  from public.guest_accounts
  where id = p_guest_id
    and deleted_at is null;

  if current_row.id is null then
    raise exception 'No encontramos ese invitado.';
  end if;

  if current_row.status <> 'inactive' then
    raise exception 'Primero guarda el invitado como inactivo.';
  end if;

  if not private.is_board_owner(current_row.board_id, p_actor_user_id) then
    raise exception 'Solo la cuenta maestra puede eliminar invitados.';
  end if;

  update public.guest_accounts
  set
    deleted_at = now(),
    client_id = p_client_id,
    updated_at = now()
  where id = current_row.id;

  update public.guest_project_access gpa
  set
    deleted_at = now(),
    client_id = p_client_id,
    updated_at = now()
  where gpa.guest_id = current_row.id
    and gpa.deleted_at is null;

  update public.profiles
  set
    nickname = null,
    email = null,
    updated_at = now()
  where user_id = current_row.user_id
    and account_type = 'guest';

  insert into public.guest_access_events (
    id,
    workspace_id,
    board_id,
    guest_id,
    user_id,
    actor_user_id,
    event_type,
    metadata,
    client_id
  )
  values (
    private.make_guest_access_event_id(),
    current_row.workspace_id,
    current_row.board_id,
    current_row.id,
    current_row.user_id,
    p_actor_user_id,
    'guest_deleted',
    '{}'::jsonb,
    p_client_id
  );

  return query
  select current_row.id, current_row.user_id;
end;
$$;

create or replace function public.authenticate_guest_access(
  p_nickname text,
  p_guest_key text,
  p_user_agent text default null
)
returns table (
  user_id uuid,
  auth_email text,
  workspace_id text,
  board_id text,
  guest_id text,
  display_name text,
  nickname text,
  role text,
  account_type text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  normalized_nickname text;
  guest_row public.guest_accounts;
  credential_row private.guest_credentials;
  profile_row public.profiles;
begin
  normalized_nickname := private.assert_member_nickname(p_nickname);

  select * into guest_row
  from public.guest_accounts ga
  where ga.deleted_at is null
    and ga.status = 'active'
    and lower(ga.nickname) = normalized_nickname
  limit 1;

  if guest_row.id is null then
    raise exception 'Nickname o clave inválidos.';
  end if;

  select * into credential_row
  from private.guest_credentials gc
  where gc.guest_id = guest_row.id
    and gc.user_id = guest_row.user_id;

  if credential_row.guest_id is null
    or credential_row.key_hash is null
    or credential_row.key_consumed_at is not null
    or credential_row.key_hash <> extensions.crypt(p_guest_key, credential_row.key_hash)
  then
    raise exception 'Nickname o clave inválidos.';
  end if;

  select * into profile_row
  from public.profiles p
  where p.user_id = guest_row.user_id
    and p.account_type = 'guest';

  update private.guest_credentials gc
  set
    key_hash = null,
    key_consumed_at = now(),
    updated_by = guest_row.user_id,
    updated_at = now()
  where gc.guest_id = guest_row.id;

  update public.guest_accounts
  set
    last_login_at = now(),
    updated_at = now()
  where id = guest_row.id;

  insert into public.guest_access_events (
    id,
    workspace_id,
    board_id,
    guest_id,
    user_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    private.make_guest_access_event_id(),
    guest_row.workspace_id,
    guest_row.board_id,
    guest_row.id,
    guest_row.user_id,
    guest_row.user_id,
    'guest_login',
    jsonb_build_object('userAgent', p_user_agent)
  );

  return query
  select
    guest_row.user_id,
    profile_row.email,
    guest_row.workspace_id,
    guest_row.board_id,
    guest_row.id,
    guest_row.name,
    normalized_nickname,
    'guest'::text,
    'guest'::text;
end;
$$;

alter table public.guest_accounts enable row level security;
alter table public.guest_project_access enable row level security;
alter table public.guest_access_events enable row level security;

drop policy if exists "guest accounts select by owner or self" on public.guest_accounts;
drop policy if exists "guest accounts insert by owner" on public.guest_accounts;
drop policy if exists "guest accounts update by owner" on public.guest_accounts;
drop policy if exists "guest project access select by owner or self" on public.guest_project_access;
drop policy if exists "guest access events select by owner" on public.guest_access_events;

create policy "guest accounts select by owner or self"
on public.guest_accounts
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_workspace_owner(workspace_id)
);

create policy "guest accounts insert by owner"
on public.guest_accounts
for insert
to authenticated
with check (private.is_workspace_owner(workspace_id));

create policy "guest accounts update by owner"
on public.guest_accounts
for update
to authenticated
using (private.is_workspace_owner(workspace_id))
with check (private.is_workspace_owner(workspace_id));

create policy "guest project access select by owner or self"
on public.guest_project_access
for select
to authenticated
using (
  private.is_workspace_owner(workspace_id)
  or exists (
    select 1
    from public.guest_accounts ga
    where ga.id = guest_project_access.guest_id
      and ga.user_id = (select auth.uid())
      and ga.status = 'active'
      and ga.deleted_at is null
  )
);

create policy "guest access events select by owner"
on public.guest_access_events
for select
to authenticated
using (private.is_workspace_owner(workspace_id));

drop policy if exists "workspaces select for guests" on public.workspaces;
drop policy if exists "boards select for guests" on public.boards;
drop policy if exists "columns select for guests" on public.columns;
drop policy if exists "projects select for guests" on public.projects;
drop policy if exists "tasks select for guests" on public.tasks;
drop policy if exists "checklists select for guests" on public.checklists;
drop policy if exists "checklist items select for guests" on public.checklist_items;

-- Guests must not read raw board tables directly because RLS is row-level,
-- not column-level. The frontend uses guest-snapshot, which sanitizes fields.

revoke all on function public.owner_create_guest_access(uuid, text, uuid, text, text, text, text, text[], text) from public, anon, authenticated;
revoke all on function public.owner_update_guest_access(uuid, text, text, text, text, text[], text) from public, anon, authenticated;
revoke all on function public.owner_reset_guest_key(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.owner_delete_guest_access(uuid, text, text) from public, anon, authenticated;
revoke all on function public.authenticate_guest_access(text, text, text) from public, anon, authenticated;

grant usage on schema private to service_role, authenticated;
grant select, insert, update, delete on private.guest_credentials to service_role;
grant execute on function private.is_active_board_guest(text) to authenticated, service_role;
grant execute on function private.is_active_workspace_guest(text) to authenticated, service_role;
grant execute on function private.guest_can_view_project(text, text) to authenticated, service_role;
grant execute on function private.guest_can_view_task(text) to authenticated, service_role;
grant execute on function private.sync_guest_project_access(text, text, text, text[], text) to service_role;
grant select on public.guest_accounts to authenticated;
grant select on public.guest_project_access to authenticated;
grant select on public.guest_access_events to authenticated;
grant execute on function public.owner_create_guest_access(uuid, text, uuid, text, text, text, text, text[], text) to service_role;
grant execute on function public.owner_update_guest_access(uuid, text, text, text, text, text[], text) to service_role;
grant execute on function public.owner_reset_guest_key(uuid, text, text, text) to service_role;
grant execute on function public.owner_delete_guest_access(uuid, text, text) to service_role;
grant execute on function public.authenticate_guest_access(text, text, text) to service_role;
