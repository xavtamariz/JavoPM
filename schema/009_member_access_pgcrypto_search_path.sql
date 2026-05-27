alter function public.owner_create_team_member_access(
  uuid, text, uuid, text, text, text, text, text
) set search_path = public, private, extensions, pg_temp;

alter function public.owner_reset_team_member_key(
  uuid, text, text, text
) set search_path = public, private, extensions, pg_temp;

alter function public.authenticate_team_member_access(
  text, text, text
) set search_path = public, private, extensions, pg_temp;

alter function public.complete_team_member_password_setup(
  uuid, text
) set search_path = public, private, extensions, pg_temp;
