-- JavoPM v1.7.0 account and cloud sync foundation.
-- Apply this migration to the Supabase project that will back JavoPM.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('owner', 'member')),
  email text,
  nickname text unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workspace_members (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, user_id)
);

create table if not exists public.boards (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  title text not null,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.columns (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  title text not null,
  sort_key text not null,
  order_index integer not null default 0,
  allow_task_creation boolean not null default true,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.projects (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  name text not null,
  sort_key text not null,
  order_index integer not null default 0,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (board_id, name)
);

create table if not exists public.team_members (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  name text not null,
  nickname text,
  sort_key text not null,
  order_index integer not null default 0,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (board_id, name),
  unique (board_id, nickname)
);

create table if not exists public.tasks (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  column_id text not null,
  project_id text,
  project_name text not null,
  type text not null check (type in ('Bug', 'Tarea', 'Evento')),
  folio text not null,
  folio_number integer,
  start_date date,
  end_date date,
  points numeric not null default 0,
  responsible_member_id text,
  responsible_name text not null,
  short_description text not null,
  long_description text not null default '',
  sort_key text not null,
  order_index integer not null default 0,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (board_id, folio)
);

create table if not exists public.checklists (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  title text not null,
  sort_key text not null,
  order_index integer not null default 0,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.checklist_items (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  checklist_id text not null references public.checklists(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  sort_key text not null,
  order_index integer not null default 0,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.chart_cards (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  column_id text not null,
  title text not null,
  chart_type text not null,
  settings jsonb not null default '{}'::jsonb,
  sort_key text not null,
  order_index integer not null default 0,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.task_events (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  task_id text not null,
  column_id text not null,
  event_type text not null,
  sort_key text not null default '',
  order_index integer not null default 0,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.client_mutations (
  id text primary key,
  mutation_id text not null unique,
  board_id text not null references public.boards(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('insert', 'update', 'delete', 'move')),
  patch jsonb not null default '{}'::jsonb,
  base_version integer,
  status text not null default 'pending',
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.board_counters (
  board_id text primary key references public.boards(id) on delete cascade,
  next_folio_number integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id);
create index if not exists boards_workspace_idx on public.boards (workspace_id);
create index if not exists tasks_board_column_idx on public.tasks (board_id, column_id, sort_key);
create index if not exists chart_cards_board_column_idx on public.chart_cards (board_id, column_id, sort_key);
create index if not exists task_events_board_created_idx on public.task_events (board_id, created_at);
create index if not exists client_mutations_board_created_idx on public.client_mutations (board_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'workspaces',
    'workspace_members',
    'boards',
    'columns',
    'projects',
    'team_members',
    'tasks',
    'checklists',
    'checklist_items',
    'chart_cards',
    'task_events',
    'client_mutations'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.allocate_task_folio(p_board_id text)
returns integer
language plpgsql
as $$
declare
  allocated_number integer;
begin
  if not exists (
    select 1
    from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = p_board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  ) then
    raise exception 'Not allowed to allocate folio for this board';
  end if;

  insert into public.board_counters (board_id, next_folio_number)
  values (p_board_id, 2)
  on conflict (board_id)
  do update set
    next_folio_number = public.board_counters.next_folio_number + 1,
    updated_at = now()
  returning next_folio_number - 1 into allocated_number;

  return allocated_number;
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.projects enable row level security;
alter table public.team_members enable row level security;
alter table public.tasks enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.chart_cards enable row level security;
alter table public.task_events enable row level security;
alter table public.client_mutations enable row level security;
alter table public.board_counters enable row level security;

create policy "profiles own row" on public.profiles
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "workspaces select for members" on public.workspaces
for select
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
  )
);

create policy "workspaces insert by owner" on public.workspaces
for insert
with check (owner_id = auth.uid());

create policy "workspaces update by owner" on public.workspaces
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "workspace members visible to self or owner" on public.workspace_members
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
      and w.deleted_at is null
  )
);

create policy "workspace members insert by owner" on public.workspace_members
for insert
with check (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
      and w.deleted_at is null
  )
);

create policy "workspace members update by owner" on public.workspace_members
for update
using (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
      and w.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
      and w.deleted_at is null
  )
);

create policy "boards manage by active members" on public.boards
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = boards.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = boards.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
  )
);

create policy "columns manage by board members" on public.columns
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = columns.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = columns.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "projects manage by board members" on public.projects
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = projects.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = projects.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "team members manage by board members" on public.team_members
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = team_members.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = team_members.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "tasks manage by board members" on public.tasks
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = tasks.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = tasks.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "checklists manage by board members" on public.checklists
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = checklists.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = checklists.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "checklist items manage by board members" on public.checklist_items
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = checklist_items.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = checklist_items.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "chart cards manage by board members" on public.chart_cards
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = chart_cards.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = chart_cards.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "task events manage by board members" on public.task_events
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = task_events.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = task_events.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "client mutations manage by board members" on public.client_mutations
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = client_mutations.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = client_mutations.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

create policy "board counters manage by board members" on public.board_counters
for all
using (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = board_counters.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = board_counters.board_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.allocate_task_folio(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table
    public.columns,
    public.projects,
    public.team_members,
    public.tasks,
    public.checklists,
    public.checklist_items,
    public.chart_cards,
    public.task_events,
    public.client_mutations;
exception
  when duplicate_object then null;
end;
$$;
