-- JavoPM v2.0.0 CRM section.
-- CRM is local-first in the browser and syncs through these board-scoped tables for cloud accounts.

create table if not exists public.crm_prospects (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  company_name text not null default '',
  contact_name text not null default '',
  mobile_phone text not null default '',
  email text not null default '',
  phone text not null default '',
  extension text not null default '',
  rfc text not null default '',
  address text not null default '',
  comments text not null default '',
  status text not null default 'Nuevo' check (
    status in ('Nuevo', 'Contactado', 'Calificado', 'Propuesta', 'Seguimiento', 'Cerrado', 'Descartado')
  ),
  order_index integer not null default 0,
  sort_key text not null default '000000',
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_prospects_board_order_idx
  on public.crm_prospects (board_id, order_index, created_at);

create index if not exists crm_prospects_board_status_idx
  on public.crm_prospects (board_id, status)
  where deleted_at is null;

create table if not exists public.crm_prospect_contacts (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  prospect_id text not null references public.crm_prospects(id) on delete cascade,
  full_name text not null default '',
  position text not null default '',
  mobile_phone text not null default '',
  phone text not null default '',
  extension text not null default '',
  order_index integer not null default 0,
  sort_key text not null default '000000',
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_prospect_contacts_prospect_order_idx
  on public.crm_prospect_contacts (prospect_id, order_index, created_at);

create index if not exists crm_prospect_contacts_board_idx
  on public.crm_prospect_contacts (board_id);

create table if not exists public.crm_prospect_interactions (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  prospect_id text not null references public.crm_prospects(id) on delete cascade,
  comment text not null default '',
  author_user_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  occurred_at timestamptz not null default now(),
  order_index integer not null default 0,
  sort_key text not null default '000000',
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_prospect_interactions_prospect_order_idx
  on public.crm_prospect_interactions (prospect_id, order_index, occurred_at);

create index if not exists crm_prospect_interactions_board_idx
  on public.crm_prospect_interactions (board_id, occurred_at desc);

create table if not exists public.crm_prospect_checklists (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  prospect_id text not null references public.crm_prospects(id) on delete cascade,
  title text not null default 'Checklist',
  order_index integer not null default 0,
  sort_key text not null default '000000',
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_prospect_checklists_prospect_order_idx
  on public.crm_prospect_checklists (prospect_id, order_index, created_at);

create index if not exists crm_prospect_checklists_board_idx
  on public.crm_prospect_checklists (board_id);

create table if not exists public.crm_prospect_checklist_items (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  checklist_id text not null references public.crm_prospect_checklists(id) on delete cascade,
  text text not null default '',
  completed boolean not null default false,
  order_index integer not null default 0,
  sort_key text not null default '000000',
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_prospect_checklist_items_checklist_order_idx
  on public.crm_prospect_checklist_items (checklist_id, order_index, created_at);

create index if not exists crm_prospect_checklist_items_board_idx
  on public.crm_prospect_checklist_items (board_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'crm_prospects',
    'crm_prospect_contacts',
    'crm_prospect_interactions',
    'crm_prospect_checklists',
    'crm_prospect_checklist_items'
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

alter table public.crm_prospects enable row level security;
alter table public.crm_prospect_contacts enable row level security;
alter table public.crm_prospect_interactions enable row level security;
alter table public.crm_prospect_checklists enable row level security;
alter table public.crm_prospect_checklist_items enable row level security;

drop policy if exists "crm prospects manage by board members" on public.crm_prospects;
drop policy if exists "crm prospect contacts manage by board members" on public.crm_prospect_contacts;
drop policy if exists "crm prospect interactions manage by board members" on public.crm_prospect_interactions;
drop policy if exists "crm prospect checklists manage by board members" on public.crm_prospect_checklists;
drop policy if exists "crm prospect checklist items manage by board members" on public.crm_prospect_checklist_items;

create policy "crm prospects manage by board members"
on public.crm_prospects
for all
to authenticated
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "crm prospect contacts manage by board members"
on public.crm_prospect_contacts
for all
to authenticated
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "crm prospect interactions manage by board members"
on public.crm_prospect_interactions
for all
to authenticated
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "crm prospect checklists manage by board members"
on public.crm_prospect_checklists
for all
to authenticated
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "crm prospect checklist items manage by board members"
on public.crm_prospect_checklist_items
for all
to authenticated
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

grant select, insert, update, delete on public.crm_prospects to authenticated;
grant select, insert, update, delete on public.crm_prospect_contacts to authenticated;
grant select, insert, update, delete on public.crm_prospect_interactions to authenticated;
grant select, insert, update, delete on public.crm_prospect_checklists to authenticated;
grant select, insert, update, delete on public.crm_prospect_checklist_items to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'crm_prospects',
    'crm_prospect_contacts',
    'crm_prospect_interactions',
    'crm_prospect_checklists',
    'crm_prospect_checklist_items'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then null;
    end;
  end loop;
end;
$$;
