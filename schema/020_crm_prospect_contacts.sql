-- Add structured contacts to CRM prospects.

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

drop trigger if exists set_updated_at on public.crm_prospect_contacts;
create trigger set_updated_at
before update on public.crm_prospect_contacts
for each row execute function public.set_updated_at();

alter table public.crm_prospect_contacts enable row level security;

drop policy if exists "crm prospect contacts manage by board members" on public.crm_prospect_contacts;

create policy "crm prospect contacts manage by board members"
on public.crm_prospect_contacts
for all
to authenticated
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

grant select, insert, update, delete on public.crm_prospect_contacts to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.crm_prospect_contacts;
  exception
    when duplicate_object then null;
  end;
end;
$$;
