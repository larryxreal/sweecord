CREATE TABLE public.bot_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.profiles(id), name text NOT NULL CHECK (length(name) BETWEEN 2 AND 40), description text NOT NULL DEFAULT '' CHECK (length(description) <= 500), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bot_applications TO authenticated;
GRANT ALL ON public.bot_applications TO service_role;
ALTER TABLE public.bot_applications ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_installations (
 application_id uuid NOT NULL REFERENCES public.bot_applications(id) ON DELETE CASCADE, server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE, installed_by uuid NOT NULL REFERENCES public.profiles(id), can_send boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(application_id,server_id)
);
GRANT SELECT ON public.bot_installations TO authenticated;
GRANT ALL ON public.bot_installations TO service_role;
ALTER TABLE public.bot_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY bot_installations_read ON public.bot_installations FOR SELECT TO authenticated USING (public.is_server_member(server_id,auth.uid()) OR EXISTS (SELECT 1 FROM public.bot_applications b WHERE b.id=application_id AND b.owner_id=auth.uid()));
CREATE FUNCTION public.can_read_bot(_application_id uuid,_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.bot_installations i WHERE i.application_id=_application_id AND public.is_server_member(i.server_id,_user_id)); $$;
REVOKE ALL ON FUNCTION public.can_read_bot(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_bot(uuid,uuid) TO authenticated,service_role;
CREATE POLICY bot_applications_read ON public.bot_applications FOR SELECT TO authenticated USING (owner_id=auth.uid() OR public.can_read_bot(id,auth.uid()));
CREATE TABLE public.bot_credentials (
 application_id uuid PRIMARY KEY REFERENCES public.bot_applications(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_credentials TO service_role;
ALTER TABLE public.bot_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ADD COLUMN bot_application_id uuid REFERENCES public.bot_applications(id) ON DELETE SET NULL;
CREATE FUNCTION public.validate_bot_message() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.bot_application_id IS NOT NULL THEN IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Bot messages require bot authentication'; END IF; IF NOT EXISTS (SELECT 1 FROM public.bot_applications b JOIN public.bot_installations i ON i.application_id=b.id JOIN public.channels c ON c.server_id=i.server_id WHERE b.id=NEW.bot_application_id AND b.owner_id=NEW.user_id AND c.id=NEW.channel_id AND c.type='text' AND i.can_send AND c.everyone_view AND c.everyone_send) THEN RAISE EXCEPTION 'Bot cannot send to this channel'; END IF; END IF; RETURN NEW; END; $$;
CREATE TRIGGER validate_bot_message BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.validate_bot_message();