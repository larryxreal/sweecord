
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- SERVERS
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(5), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servers TO authenticated;
GRANT ALL ON public.servers TO service_role;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- MEMBERS
CREATE TABLE public.server_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.server_members TO authenticated;
GRANT ALL ON public.server_members TO service_role;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

-- CHANNELS
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_channel_created_idx ON public.messages (channel_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.is_server_member(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_server_owner(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.servers WHERE id = _server_id AND owner_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.channel_server_id(_channel_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT server_id FROM public.channels WHERE id = _channel_id;
$$;

-- POLICIES
CREATE POLICY "servers_select_member" ON public.servers FOR SELECT TO authenticated
  USING (public.is_server_member(id, auth.uid()));
CREATE POLICY "servers_insert_own" ON public.servers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "servers_update_owner" ON public.servers FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "servers_delete_owner" ON public.servers FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "members_select" ON public.server_members FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "members_insert_self" ON public.server_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_delete" ON public.server_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_server_owner(server_id, auth.uid()));

CREATE POLICY "channels_select_member" ON public.channels FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "channels_write_owner" ON public.channels FOR INSERT TO authenticated
  WITH CHECK (public.is_server_owner(server_id, auth.uid()));
CREATE POLICY "channels_update_owner" ON public.channels FOR UPDATE TO authenticated
  USING (public.is_server_owner(server_id, auth.uid())) WITH CHECK (public.is_server_owner(server_id, auth.uid()));
CREATE POLICY "channels_delete_owner" ON public.channels FOR DELETE TO authenticated
  USING (public.is_server_owner(server_id, auth.uid()));

CREATE POLICY "messages_select_member" ON public.messages FOR SELECT TO authenticated
  USING (public.is_server_member(public.channel_server_id(channel_id), auth.uid()));
CREATE POLICY "messages_insert_member" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_server_member(public.channel_server_id(channel_id), auth.uid()));
CREATE POLICY "messages_delete" ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_server_owner(public.channel_server_id(channel_id), auth.uid()));

-- AUTO SETUP ON SERVER CREATE
CREATE OR REPLACE FUNCTION public.handle_new_server()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.server_members (server_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner');
  INSERT INTO public.channels (server_id, name, position) VALUES (NEW.id, 'genel', 0);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_server_created AFTER INSERT ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.handle_new_server();

-- JOIN BY INVITE CODE
CREATE OR REPLACE FUNCTION public.join_server_by_code(_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _server_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT id INTO _server_id FROM public.servers WHERE invite_code = lower(trim(_code));
  IF _server_id IS NULL THEN RAISE EXCEPTION 'invalid_invite_code'; END IF;
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (_server_id, auth.uid(), 'member')
  ON CONFLICT (server_id, user_id) DO NOTHING;
  RETURN _server_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_server_by_code(TEXT) TO authenticated;

-- UPDATED_AT
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- REALTIME
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
ALTER TABLE public.server_members REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;
