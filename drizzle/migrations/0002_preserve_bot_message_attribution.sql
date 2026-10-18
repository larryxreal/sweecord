ALTER TABLE public.messages ADD COLUMN bot_name text;
COMMENT ON COLUMN public.messages.bot_name IS 'Bot name snapshot preserves attribution after uninstall or application deletion.';
UPDATE public.messages m SET bot_name=b.name FROM public.bot_applications b WHERE m.bot_application_id=b.id;
CREATE OR REPLACE FUNCTION public.validate_bot_message() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE app_name text;
BEGIN
  IF NEW.bot_application_id IS NOT NULL OR NEW.bot_name IS NOT NULL THEN
    IF current_user NOT IN ('service_role','postgres') THEN
      RAISE EXCEPTION 'Bot messages require bot authentication';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND (OLD.bot_application_id IS NOT NULL OR OLD.bot_name IS NOT NULL) AND NEW.bot_application_id IS NULL THEN
    IF current_user NOT IN ('service_role','postgres') THEN
      RAISE EXCEPTION 'Bot attribution cannot be removed';
    END IF;
    NEW.bot_name := OLD.bot_name;
    RETURN NEW;
  END IF;
  IF NEW.bot_application_id IS NOT NULL THEN
    SELECT b.name INTO app_name FROM public.bot_applications b
      JOIN public.bot_installations i ON i.application_id=b.id
      JOIN public.channels c ON c.server_id=i.server_id
      WHERE b.id=NEW.bot_application_id AND b.owner_id=NEW.user_id AND c.id=NEW.channel_id
        AND c.type='text' AND i.can_send AND c.everyone_view AND c.everyone_send;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bot cannot send to this channel'; END IF;
    NEW.bot_name := app_name;
  ELSIF NEW.bot_name IS NOT NULL AND TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Bot application is required';
  END IF;
  RETURN NEW;
END;
$$;