-- Fix recursive RLS checks by moving membership lookups into private SECURITY DEFINER helpers.
-- The helpers live outside the exposed public schema.

create schema if not exists private;

create or replace function private.is_workspace_member(p_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
  );
$$;

create or replace function private.is_workspace_owner(p_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_id = auth.uid()
      and w.deleted_at is null
  );
$$;

create or replace function private.is_board_member(p_board_id text)
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
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
      and b.deleted_at is null
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(text) to authenticated;
grant execute on function private.is_workspace_owner(text) to authenticated;
grant execute on function private.is_board_member(text) to authenticated;

drop policy if exists "workspaces select for members" on public.workspaces;
drop policy if exists "workspaces insert by owner" on public.workspaces;
drop policy if exists "workspaces update by owner" on public.workspaces;
drop policy if exists "workspace members visible to self or owner" on public.workspace_members;
drop policy if exists "workspace members insert by owner" on public.workspace_members;
drop policy if exists "workspace members update by owner" on public.workspace_members;
drop policy if exists "boards manage by active members" on public.boards;
drop policy if exists "columns manage by board members" on public.columns;
drop policy if exists "projects manage by board members" on public.projects;
drop policy if exists "team members manage by board members" on public.team_members;
drop policy if exists "tasks manage by board members" on public.tasks;
drop policy if exists "checklists manage by board members" on public.checklists;
drop policy if exists "checklist items manage by board members" on public.checklist_items;
drop policy if exists "chart cards manage by board members" on public.chart_cards;
drop policy if exists "task events manage by board members" on public.task_events;
drop policy if exists "client mutations manage by board members" on public.client_mutations;
drop policy if exists "board counters manage by board members" on public.board_counters;

create policy "workspaces select for members" on public.workspaces
for select
using (owner_id = auth.uid() or private.is_workspace_member(id));

create policy "workspaces insert by owner" on public.workspaces
for insert
with check (owner_id = auth.uid());

create policy "workspaces update by owner" on public.workspaces
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "workspace members visible to workspace members" on public.workspace_members
for select
using (user_id = auth.uid() or private.is_workspace_member(workspace_id));

create policy "workspace members insert by owner" on public.workspace_members
for insert
with check (private.is_workspace_owner(workspace_id));

create policy "workspace members update by owner" on public.workspace_members
for update
using (private.is_workspace_owner(workspace_id))
with check (private.is_workspace_owner(workspace_id));

create policy "boards manage by active members" on public.boards
for all
using (private.is_workspace_member(workspace_id))
with check (private.is_workspace_member(workspace_id));

create policy "columns manage by board members" on public.columns
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "projects manage by board members" on public.projects
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "team members manage by board members" on public.team_members
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "tasks manage by board members" on public.tasks
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "checklists manage by board members" on public.checklists
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "checklist items manage by board members" on public.checklist_items
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "chart cards manage by board members" on public.chart_cards
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "task events manage by board members" on public.task_events
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "client mutations manage by board members" on public.client_mutations
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));

create policy "board counters manage by board members" on public.board_counters
for all
using (private.is_board_member(board_id))
with check (private.is_board_member(board_id));
