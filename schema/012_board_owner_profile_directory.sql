-- JavoPM v1.8.0 owner profile lookup for member UI.
-- Returns the owner profile for a board only when the caller is an active
-- member of that board's workspace.

create or replace function public.get_board_owner_profile(p_board_id text)
returns table (
  user_id uuid,
  display_name text,
  nickname text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_workspace_id text;
begin
  select b.workspace_id
  into target_workspace_id
  from public.boards b
  join public.workspace_members wm on wm.workspace_id = b.workspace_id
  where b.id = p_board_id
    and b.deleted_at is null
    and wm.user_id = (select auth.uid())
    and wm.status = 'active'
    and wm.deleted_at is null
  limit 1;

  if target_workspace_id is null then
    raise exception 'No tienes acceso a este tablero.';
  end if;

  return query
  select
    profile.user_id,
    profile.display_name,
    profile.nickname
  from public.workspaces workspace
  join public.profiles profile on profile.user_id = workspace.owner_id
  where workspace.id = target_workspace_id
    and workspace.deleted_at is null
  limit 1;
end;
$$;

revoke all on function public.get_board_owner_profile(text) from public, anon, authenticated;
grant execute on function public.get_board_owner_profile(text) to authenticated;
