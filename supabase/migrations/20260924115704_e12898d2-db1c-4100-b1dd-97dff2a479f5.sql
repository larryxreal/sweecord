ALTER TABLE public.server_members ADD CONSTRAINT server_members_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.messages ADD CONSTRAINT messages_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

CREATE TABLE public.server_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 32),
  color text NOT NULL DEFAULT '#99aab5',
  position integer NOT NULL DEFAULT 0,
  manage_channels boolean NOT NULL DEFAULT false,
  manage_messages boolean NOT NULL DEFAULT false,
  kick_members boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_roles TO authenticated;
GRANT ALL ON public.server_roles TO service_role;
ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_select ON public.server_roles FOR SELECT TO authenticated USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY roles_insert ON public.server_roles FOR INSERT TO authenticated WITH CHECK (public.is_server_owner(server_id, auth.uid()));
CREATE POLICY roles_update ON public.server_roles FOR UPDATE TO authenticated USING (public.is_server_owner(server_id, auth.uid())) WITH CHECK (public.is_server_owner(server_id, auth.uid()));
CREATE POLICY roles_delete ON public.server_roles FOR DELETE TO authenticated USING (public.is_server_owner(server_id, auth.uid()));

CREATE TABLE public.member_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.server_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);
GRANT SELECT, INSERT, DELETE ON public.member_roles TO authenticated;
GRANT ALL ON public.member_roles TO service_role;
ALTER TABLE public.member_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY mr_select ON public.member_roles FOR SELECT TO authenticated USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY mr_insert ON public.member_roles FOR INSERT TO authenticated WITH CHECK (public.is_server_owner(server_id, auth.uid()) AND public.is_server_member(server_id, user_id));
CREATE POLICY mr_delete ON public.member_roles FOR DELETE TO authenticated USING (public.is_server_owner(server_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.has_server_perm(_server_id uuid, _user_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_server_owner(_server_id, _user_id) OR EXISTS (
    SELECT 1 FROM public.member_roles mr JOIN public.server_roles r ON r.id = mr.role_id
    WHERE mr.server_id = _server_id AND mr.user_id = _user_id AND (
      (_perm = 'manage_channels' AND r.manage_channels) OR
      (_perm = 'manage_messages' AND r.manage_messages) OR
      (_perm = 'kick_members' AND r.kick_members)))
$$;
REVOKE EXECUTE ON FUNCTION public.has_server_perm(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_server_perm(uuid, uuid, text) TO authenticated;

DROP POLICY channels_write_owner ON public.channels;
DROP POLICY channels_update_owner ON public.channels;
DROP POLICY channels_delete_owner ON public.channels;
CREATE POLICY channels_insert_perm ON public.channels FOR INSERT TO authenticated WITH CHECK (public.has_server_perm(server_id, auth.uid(), 'manage_channels'));
CREATE POLICY channels_update_perm ON public.channels FOR UPDATE TO authenticated USING (public.has_server_perm(server_id, auth.uid(), 'manage_channels')) WITH CHECK (public.has_server_perm(server_id, auth.uid(), 'manage_channels'));
CREATE POLICY channels_delete_perm ON public.channels FOR DELETE TO authenticated USING (public.has_server_perm(server_id, auth.uid(), 'manage_channels'));

DROP POLICY messages_delete ON public.messages;
CREATE POLICY messages_delete ON public.messages FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_server_perm(public.channel_server_id(channel_id), auth.uid(), 'manage_messages'));

DROP POLICY members_delete ON public.server_members;
CREATE POLICY members_delete ON public.server_members FOR DELETE TO authenticated USING (auth.uid() = user_id OR (role <> 'owner' AND public.has_server_perm(server_id, auth.uid(), 'kick_members')));

ALTER TABLE public.server_roles REPLICA IDENTITY FULL;
ALTER TABLE public.member_roles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_roles, public.member_roles;