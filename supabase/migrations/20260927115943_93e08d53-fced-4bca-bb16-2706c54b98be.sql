ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'text';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS everyone_view boolean NOT NULL DEFAULT true;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS everyone_send boolean NOT NULL DEFAULT true;

CREATE TABLE public.channel_role_perms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.server_roles(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_send boolean NOT NULL DEFAULT true,
  UNIQUE (channel_id, role_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_role_perms TO authenticated;
GRANT ALL ON public.channel_role_perms TO service_role;
ALTER TABLE public.channel_role_perms ENABLE ROW LEVEL SECURITY;
CREATE POLICY crp_select ON public.channel_role_perms FOR SELECT TO authenticated
  USING (public.is_server_member(public.channel_server_id(channel_id), auth.uid()));
CREATE POLICY crp_write ON public.channel_role_perms FOR ALL TO authenticated
  USING (public.has_server_perm(public.channel_server_id(channel_id), auth.uid(), 'manage_channels'))
  WITH CHECK (public.has_server_perm(public.channel_server_id(channel_id), auth.uid(), 'manage_channels'));

CREATE OR REPLACE FUNCTION public.channel_access(_channel_id uuid, _user_id uuid, _kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = _channel_id AND public.is_server_member(c.server_id, _user_id) AND (
      public.has_server_perm(c.server_id, _user_id, 'manage_channels')
      OR (CASE WHEN _kind = 'send' THEN c.everyone_send AND c.everyone_view ELSE c.everyone_view END)
      OR EXISTS (
        SELECT 1 FROM public.channel_role_perms p
        JOIN public.member_roles mr ON mr.role_id = p.role_id AND mr.user_id = _user_id
        WHERE p.channel_id = c.id AND (CASE WHEN _kind = 'send' THEN p.can_send AND p.can_view ELSE p.can_view END)
      )
    )
  );
$$;

DROP POLICY IF EXISTS channels_select_member ON public.channels;
CREATE POLICY channels_select_member ON public.channels FOR SELECT TO authenticated
  USING (public.channel_access(id, auth.uid(), 'view'));
DROP POLICY IF EXISTS messages_select_member ON public.messages;
CREATE POLICY messages_select_member ON public.messages FOR SELECT TO authenticated
  USING (public.channel_access(channel_id, auth.uid(), 'view'));
DROP POLICY IF EXISTS messages_insert_member ON public.messages;
CREATE POLICY messages_insert_member ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.channel_access(channel_id, auth.uid(), 'send'));