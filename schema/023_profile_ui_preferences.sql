-- JavoPM v2.x user UI preferences.
-- Stores per-user interface preferences such as the last opened section.

alter table public.profiles
  add column if not exists ui_preferences jsonb not null default '{}'::jsonb;

create or replace function public.update_profile_ui_preference(
  p_key text,
  p_value text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  next_preferences jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'No hay una sesión activa.';
  end if;

  if p_key is null or p_key !~ '^[a-zA-Z0-9_.-]{1,64}$' then
    raise exception 'La preferencia no es válida.';
  end if;

  update public.profiles profile
  set
    ui_preferences = jsonb_set(
      coalesce(profile.ui_preferences, '{}'::jsonb),
      array[p_key],
      to_jsonb(coalesce(p_value, '')),
      true
    ),
    updated_at = now()
  where profile.user_id = (select auth.uid())
  returning profile.ui_preferences into next_preferences;

  if next_preferences is null then
    raise exception 'No encontramos el perfil de usuario.';
  end if;

  return next_preferences;
end;
$$;

revoke all on function public.update_profile_ui_preference(text, text) from public, anon, authenticated;
grant execute on function public.update_profile_ui_preference(text, text) to authenticated;
