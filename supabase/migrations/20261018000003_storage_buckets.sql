-- ============================================================
-- ClaimLane Migration 003 – Private Receipt Storage Bucket
-- ============================================================

-- Create private bucket for receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  20971520, -- 20 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/pdf'];

-- RLS for receipts bucket
-- 1. Authorized read: employee can read own receipts, finance can read company receipts
CREATE POLICY "receipt_select_auth"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND (
      -- Check if path starts with company_id/user_id
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM memberships WHERE user_id = auth.uid()
      )
    )
  );

-- 2. Direct upload via signed upload URLs is managed via Supabase signed URLs
