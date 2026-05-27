-- Keep service-role access explicit after locking down v1.8.0 member access RPCs.

grant execute on function public.owner_create_team_member_access(uuid, text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.owner_update_team_member_access(uuid, text, text, text, text, text) to service_role;
grant execute on function public.owner_reset_team_member_key(uuid, text, text, text) to service_role;
grant execute on function public.authenticate_team_member_access(text, text, text) to service_role;
grant execute on function public.complete_team_member_password_setup(uuid, text) to service_role;
grant select on public.member_access_events to authenticated;
