ALTER TABLE public.server_roles
  ADD COLUMN IF NOT EXISTS manage_server boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manage_roles boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS create_invite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connect_voice boolean NOT NULL DEFAULT false;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS everyone_connect boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS everyone_attach boolean NOT NULL DEFAULT true;

ALTER TABLE public.channel_role_perms
  ADD COLUMN IF NOT EXISTS can_connect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_attach boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_server_perm(_server_id uuid, _user_id uuid, _perm text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_server_owner(_server_id, _user_id) OR EXISTS (
    SELECT 1 FROM public.member_roles mr JOIN public.server_roles r ON r.id = mr.role_id
    WHERE mr.server_id = _server_id AND mr.user_id = _user_id AND (
      (_perm = 'manage_channels' AND r.manage_channels) OR
      (_perm = 'manage_messages' AND r.manage_messages) OR
      (_perm = 'kick_members' AND r.kick_members) OR
      (_perm = 'manage_server' AND r.manage_server) OR
      (_perm = 'manage_roles' AND r.manage_roles) OR
      (_perm = 'create_invite' AND r.create_invite) OR
      (_perm = 'connect_voice' AND r.connect_voice)))
$$;

-- Highest rank (lowest position) the user holds in the server; NULL when no roles.
CREATE OR REPLACE FUNCTION public.member_top_position(_server_id uuid, _user_id uuid)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT min(r.position) FROM public.member_roles mr JOIN public.server_roles r ON r.id = mr.role_id
  WHERE mr.server_id = _server_id AND mr.user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.channel_access(_channel_id uuid, _user_id uuid, _kind text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = _channel_id AND public.is_server_member(c.server_id, _user_id) AND (
      public.has_server_perm(c.server_id, _user_id, 'manage_channels')
      OR (CASE
            WHEN _kind = 'send' THEN c.everyone_send AND c.everyone_view
            WHEN _kind = 'attach' THEN c.everyone_attach AND c.everyone_send AND c.everyone_view
            WHEN _kind = 'connect' THEN c.everyone_connect AND c.everyone_view
            ELSE c.everyone_view END)
      OR EXISTS (
        SELECT 1 FROM public.channel_role_perms p
        JOIN public.member_roles mr ON mr.role_id = p.role_id AND mr.user_id = _user_id
        WHERE p.channel_id = c.id AND (CASE
            WHEN _kind = 'send' THEN p.can_send AND p.can_view
            WHEN _kind = 'attach' THEN p.can_attach AND p.can_send AND p.can_view
            WHEN _kind = 'connect' THEN p.can_connect AND p.can_view
            ELSE p.can_view END)
      )
      OR (_kind = 'connect' AND public.has_server_perm(c.server_id, _user_id, 'connect_voice')
          AND public.channel_access(c.id, _user_id, 'view'))
    )
  );
$$;

-- Attachments (images / voice messages) require the attach permission.
DROP POLICY IF EXISTS messages_insert_member ON public.messages;
CREATE POLICY messages_insert_member ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.channel_access(channel_id, auth.uid(), 'send')
    AND ((image_url IS NULL AND audio_url IS NULL) OR public.channel_access(channel_id, auth.uid(), 'attach')));

-- Server settings: owner or manage_server; ownership and invite code stay owner-only.
DROP POLICY IF EXISTS servers_update_owner ON public.servers;
CREATE POLICY servers_update_owner ON public.servers FOR UPDATE TO authenticated
  USING (public.has_server_perm(id, auth.uid(), 'manage_server'))
  WITH CHECK (public.has_server_perm(id, auth.uid(), 'manage_server'));

CREATE OR REPLACE FUNCTION public.guard_server_update()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_server_owner(OLD.id, auth.uid()) THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN
      RAISE EXCEPTION 'owner_only_field';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS servers_guard_update ON public.servers;
CREATE TRIGGER servers_guard_update BEFORE UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION public.guard_server_update();

DROP POLICY IF EXISTS media_server_write ON storage.objects;
CREATE POLICY media_server_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (
    ((storage.foldername(name))[1] = 'servers' AND public.has_server_perm(((storage.foldername(name))[2])::uuid, auth.uid(), 'manage_server'))
    OR ((storage.foldername(name))[1] = 'voice' AND (storage.foldername(name))[2] = auth.uid()::text)));

-- Roles: owner or manage_roles, limited by hierarchy and own permissions.
DROP POLICY IF EXISTS roles_insert ON public.server_roles;
DROP POLICY IF EXISTS roles_update ON public.server_roles;
DROP POLICY IF EXISTS roles_delete ON public.server_roles;
CREATE POLICY roles_insert ON public.server_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_server_perm(server_id, auth.uid(), 'manage_roles'));
CREATE POLICY roles_update ON public.server_roles FOR UPDATE TO authenticated
  USING (public.has_server_perm(server_id, auth.uid(), 'manage_roles'))
  WITH CHECK (public.has_server_perm(server_id, auth.uid(), 'manage_roles'));
CREATE POLICY roles_delete ON public.server_roles FOR DELETE TO authenticated
  USING (public.has_server_perm(server_id, auth.uid(), 'manage_roles'));

CREATE OR REPLACE FUNCTION public.guard_role_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE _sid uuid; _top int;
BEGIN
  _sid := COALESCE(NEW.server_id, OLD.server_id);
  IF auth.uid() IS NULL OR public.is_server_owner(_sid, auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  _top := public.member_top_position(_sid, auth.uid());
  IF _top IS NULL THEN RAISE EXCEPTION 'role_hierarchy'; END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.position <= _top THEN RAISE EXCEPTION 'role_hierarchy'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.server_id <> _sid OR (TG_OP = 'UPDATE' AND NEW.server_id <> OLD.server_id) THEN RAISE EXCEPTION 'bad_server'; END IF;
  IF NEW.position <= _top THEN RAISE EXCEPTION 'role_hierarchy'; END IF;
  IF (NEW.manage_channels AND NOT public.has_server_perm(_sid, auth.uid(), 'manage_channels'))
    OR (NEW.manage_messages AND NOT public.has_server_perm(_sid, auth.uid(), 'manage_messages'))
    OR (NEW.kick_members AND NOT public.has_server_perm(_sid, auth.uid(), 'kick_members'))
    OR (NEW.manage_server AND NOT public.has_server_perm(_sid, auth.uid(), 'manage_server'))
    OR (NEW.manage_roles AND NOT public.has_server_perm(_sid, auth.uid(), 'manage_roles'))
    OR (NEW.create_invite AND NOT public.has_server_perm(_sid, auth.uid(), 'create_invite'))
    OR (NEW.connect_voice AND NOT public.has_server_perm(_sid, auth.uid(), 'connect_voice')) THEN
    RAISE EXCEPTION 'perm_not_held';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS server_roles_guard ON public.server_roles;
CREATE TRIGGER server_roles_guard BEFORE INSERT OR UPDATE OR DELETE ON public.server_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_role_change();

CREATE OR REPLACE FUNCTION public.set_member_role(_server_id uuid, _user_id uuid, _role_id uuid, _on boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _top int; _rpos int; _ttop int;
BEGIN
  IF NOT public.is_server_member(_server_id, _user_id) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT position INTO _rpos FROM public.server_roles WHERE id = _role_id AND server_id = _server_id;
  IF _rpos IS NULL THEN RAISE EXCEPTION 'bad_role'; END IF;
  IF NOT public.is_server_owner(_server_id, auth.uid()) THEN
    IF NOT public.has_server_perm(_server_id, auth.uid(), 'manage_roles') THEN RAISE EXCEPTION 'not_allowed'; END IF;
    IF public.is_server_owner(_server_id, _user_id) THEN RAISE EXCEPTION 'role_hierarchy'; END IF;
    _top := public.member_top_position(_server_id, auth.uid());
    _ttop := public.member_top_position(_server_id, _user_id);
    IF _top IS NULL OR _rpos <= _top OR (_user_id <> auth.uid() AND _ttop IS NOT NULL AND _ttop <= _top) THEN
      RAISE EXCEPTION 'role_hierarchy';
    END IF;
  END IF;
  IF _on THEN
    INSERT INTO public.member_roles (server_id, user_id, role_id) VALUES (_server_id, _user_id, _role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  ELSE
    DELETE FROM public.member_roles WHERE server_id = _server_id AND user_id = _user_id AND role_id = _role_id;
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.member_top_position(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.member_top_position(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_member_role(uuid, uuid, uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid, uuid, uuid, boolean) TO authenticated;