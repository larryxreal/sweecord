DROP POLICY IF EXISTS servers_select_member ON public.servers;
CREATE POLICY servers_select_member ON public.servers
FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR public.is_server_member(id, auth.uid()));