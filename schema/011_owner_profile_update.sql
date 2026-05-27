-- JavoPM owner profile editing.
-- Lets the authenticated owner update their visible name and owner nickname through an Edge Function.

create or replace function public.owner_update_profile(
  p_user_id uuid,
  p_display_name text,
  p_nickname text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  next_display_name text;
  next_nickname text;
  profile_row public.profiles;
begin
  next_display_name := trim(coalesce(p_display_name, ''));

  if length(next_display_name) = 0 then
    raise exception 'Escribe el nombre visible de la cuenta maestra.';
  end if;

  next_nickname := private.assert_member_nickname(p_nickname);

  if exists (
    select 1
    from public.profiles profile
    where profile.nickname = next_nickname
      and profile.user_id <> p_user_id
  ) then
    raise exception 'Ese nickname ya existe.';
  end if;

  if exists (
    select 1
    from public.team_members team_member
    where team_member.deleted_at is null
      and lower(team_member.nickname) = next_nickname
      and team_member.user_id is distinct from p_user_id
  ) then
    raise exception 'Ese nickname ya existe.';
  end if;

  update public.profiles profile
  set
    display_name = next_display_name,
    nickname = next_nickname,
    updated_at = now()
  where profile.user_id = p_user_id
    and profile.account_type = 'owner'
  returning * into profile_row;

  if profile_row.user_id is null then
    raise exception 'No encontramos la cuenta maestra.';
  end if;

  return profile_row;
end;
$$;

revoke all on function public.owner_update_profile(uuid, text, text) from public, anon, authenticated;
grant execute on function public.owner_update_profile(uuid, text, text) to service_role;
