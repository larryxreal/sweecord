REVOKE EXECUTE ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_role(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;