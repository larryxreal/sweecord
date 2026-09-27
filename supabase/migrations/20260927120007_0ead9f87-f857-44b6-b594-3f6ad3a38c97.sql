CREATE POLICY media_image_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'media' AND (storage.foldername(name))[1] = 'images' AND (storage.foldername(name))[2] = auth.uid()::text
);