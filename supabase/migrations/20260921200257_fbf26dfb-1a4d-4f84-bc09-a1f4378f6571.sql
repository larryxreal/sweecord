
REVOKE ALL ON FUNCTION public.is_server_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_server_owner(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.channel_server_id(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_server_by_code(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_server() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_server_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_server_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_server_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_server_by_code(TEXT) TO authenticated;

CREATE POLICY "avatars_read_authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
