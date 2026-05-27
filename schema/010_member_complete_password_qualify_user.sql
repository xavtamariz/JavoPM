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
set search_path = public, private, extensions, pg_temp
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

  update private.member_credentials mc
  set
    member_password_hash = crypt(p_password, gen_salt('bf')),
    password_setup_required = false,
    updated_by = p_user_id,
    updated_at = now()
  where mc.user_id = p_user_id
  returning * into credential_row;

  update public.profiles p
  set
    password_setup_required = false,
    updated_at = now()
  where p.user_id = p_user_id;

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

revoke all on function public.complete_team_member_password_setup(uuid, text)
  from public, anon, authenticated;

grant execute on function public.complete_team_member_password_setup(uuid, text)
  to service_role;
