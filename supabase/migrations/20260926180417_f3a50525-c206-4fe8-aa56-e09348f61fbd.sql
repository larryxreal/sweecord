ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_url text;

CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.friend_requests WHERE status = 'accepted'
    AND ((sender_id = _a AND receiver_id = _b) OR (sender_id = _b AND receiver_id = _a)));
$$;

CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  audio_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dm_pair_idx ON public.direct_messages (sender_id, receiver_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY dm_select ON public.direct_messages FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY dm_insert ON public.direct_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND public.are_friends(sender_id, receiver_id));
CREATE POLICY dm_delete ON public.direct_messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

CREATE OR REPLACE FUNCTION public.set_member_role(_server_id uuid, _user_id uuid, _role_id uuid, _on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_server_owner(_server_id, auth.uid()) THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF NOT public.is_server_member(_server_id, _user_id) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.server_roles WHERE id = _role_id AND server_id = _server_id) THEN RAISE EXCEPTION 'bad_role'; END IF;
  IF _on THEN
    INSERT INTO public.member_roles (server_id, user_id, role_id) VALUES (_server_id, _user_id, _role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  ELSE
    DELETE FROM public.member_roles WHERE server_id = _server_id AND user_id = _user_id AND role_id = _role_id;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid, uuid, uuid, boolean) TO authenticated;

-- storage: media bucket. paths: servers/<server_id>/..., voice/<user_id>/...
CREATE POLICY media_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media');
CREATE POLICY media_server_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'media' AND (
    ((storage.foldername(name))[1] = 'servers' AND public.is_server_owner(((storage.foldername(name))[2])::uuid, auth.uid()))
    OR ((storage.foldername(name))[1] = 'voice' AND (storage.foldername(name))[2] = auth.uid()::text)
  ));