CREATE TABLE public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_status_chk CHECK (status IN ('pending','accepted','declined')),
  CONSTRAINT friend_requests_not_self CHECK (sender_id <> receiver_id),
  CONSTRAINT friend_requests_unique UNIQUE (sender_id, receiver_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;
GRANT ALL ON public.friend_requests TO service_role;

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friend_requests_select_involved" ON public.friend_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "friend_requests_insert_sender" ON public.friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "friend_requests_update_receiver" ON public.friend_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "friend_requests_delete_involved" ON public.friend_requests
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE TRIGGER friend_requests_touch
  BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX friend_requests_receiver_idx ON public.friend_requests (receiver_id, status);
CREATE INDEX friend_requests_sender_idx ON public.friend_requests (sender_id, status);

ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;