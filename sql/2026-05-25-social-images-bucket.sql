-- Public Supabase Storage bucket for AI-generated social post images
-- =====================================================================
-- gpt-image-1 returns base64 (no URL). We decode + upload to this
-- bucket so Zernio can fetch a real public URL when queueing posts.
--
-- Public READ so Zernio + Facebook + Instagram CDNs can fetch the
-- images. Service-role-only WRITE (uploads happen from our backend).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('social-images', 'social-images', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

-- Public read policy
DROP POLICY IF EXISTS "social-images public read" ON storage.objects;
CREATE POLICY "social-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-images');

-- Service-role-only write (no auth-user uploads)
DROP POLICY IF EXISTS "social-images service write" ON storage.objects;
CREATE POLICY "social-images service write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'social-images' AND auth.role() = 'service_role');

-- Sanity check
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'social-images';
