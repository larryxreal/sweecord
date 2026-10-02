CREATE TABLE public.channel_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_categories TO authenticated;
GRANT ALL ON public.channel_categories TO service_role;
ALTER TABLE public.channel_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_view ON public.channel_categories FOR SELECT TO authenticated USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY categories_create ON public.channel_categories FOR INSERT TO authenticated WITH CHECK (public.has_server_perm(server_id, auth.uid(), 'manage_channels'));
CREATE POLICY categories_edit ON public.channel_categories FOR UPDATE TO authenticated USING (public.has_server_perm(server_id, auth.uid(), 'manage_channels')) WITH CHECK (public.has_server_perm(server_id, auth.uid(), 'manage_channels'));
CREATE POLICY categories_remove ON public.channel_categories FOR DELETE TO authenticated USING (public.has_server_perm(server_id, auth.uid(), 'manage_channels'));
CREATE TRIGGER categories_touch BEFORE UPDATE ON public.channel_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.channels ADD COLUMN category_id uuid REFERENCES public.channel_categories(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.check_channel_category_server() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.channel_categories WHERE id = NEW.category_id AND server_id = NEW.server_id) THEN
    RAISE EXCEPTION 'category_must_belong_to_server';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER channels_category_server BEFORE INSERT OR UPDATE OF category_id, server_id ON public.channels FOR EACH ROW EXECUTE FUNCTION public.check_channel_category_server();