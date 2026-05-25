-- Harden function search paths and add covering indexes for FK-heavy sync tables.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.allocate_task_folio(p_board_id text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  allocated_number integer;
begin
  if not private.is_board_member(p_board_id) then
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

create index if not exists workspaces_owner_idx on public.workspaces (owner_id);
create index if not exists workspace_members_created_by_idx on public.workspace_members (created_by);
create index if not exists columns_board_idx on public.columns (board_id);
create index if not exists checklists_board_idx on public.checklists (board_id);
create index if not exists checklists_task_idx on public.checklists (task_id);
create index if not exists checklist_items_board_idx on public.checklist_items (board_id);
create index if not exists checklist_items_checklist_idx on public.checklist_items (checklist_id);
