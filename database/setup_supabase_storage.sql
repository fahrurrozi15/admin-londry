-- ==============================================================================
-- SETUP SUPABASE STORAGE: PENYIMPANAN FILE GAMBAR BUKTI PEMBAYARAN & QRIS
-- ==============================================================================
-- Skrip ini menyiapkan bucket penyimpanan file gambar (Supabase Storage) 
-- dan mengatur Row Level Security (RLS) policies pada tabel storage.objects.
--
-- Panduan Eksekusi:
-- 1. Buka Dashboard Supabase: https://supabase.com/dashboard
-- 2. Pilih Proyek Anda:
--    - Supabase Project 1 (db_client): Jalankan BAGIAN A (payment-proofs)
--    - Supabase Project 2 (db_admin) : Jalankan BAGIAN B (qris-images)
--    *ATAU* Anda dapat menjalankan seluruh skrip ini di KEDUA proyek sekaligus 
--    karena skrip ini sudah menggunakan klausa IF NOT EXISTS dan ON CONFLICT.
-- ==============================================================================

-- ==============================================================================
-- BAGIAN A: BUCKET 'payment-proofs' (BUKTI TRANSFER / PEMBAYARAN KLIEN)
-- Digunakan untuk menyimpan foto tangkapan layar / bukti transfer dari portal klien
-- ==============================================================================

-- 1. Buat bucket 'payment-proofs' di schema storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  true, -- Publik agar URL gambar dapat diakses oleh kasir di dashboard admin
  5242880, -- Maksimal ukuran file: 5 MB (5 * 1024 * 1024 byte)
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- 2. Kebijakan RLS (Row Level Security) untuk Bucket 'payment-proofs'
-- Memastikan storage.objects mengizinkan akses upload & view

-- A1. Izin Membaca/Melihat Gambar (SELECT) untuk Publik & Kasir
DROP POLICY IF EXISTS "Public and Admin can view payment proofs" ON storage.objects;
CREATE POLICY "Public and Admin can view payment proofs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-proofs');

-- A2. Izin Mengunggah Gambar (INSERT) untuk Klien / Pelanggan (Anon & Authenticated)
DROP POLICY IF EXISTS "Clients can upload payment proofs" ON storage.objects;
CREATE POLICY "Clients can upload payment proofs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'payment-proofs');

-- A3. Izin Memperbarui/Ganti Gambar (UPDATE)
DROP POLICY IF EXISTS "Clients can update payment proofs" ON storage.objects;
CREATE POLICY "Clients can update payment proofs"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'payment-proofs')
WITH CHECK (bucket_id = 'payment-proofs');

-- A4. Izin Menghapus Gambar (DELETE)
DROP POLICY IF EXISTS "Allow delete payment proofs" ON storage.objects;
CREATE POLICY "Allow delete payment proofs"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'payment-proofs');


-- ==============================================================================
-- BAGIAN B: BUCKET 'qris-images' (FOTO BARCODE QRIS OUTLET & ASET LAUNDRY)
-- Digunakan oleh Admin POS untuk mengunggah gambar QRIS resmi outlet
-- ==============================================================================

-- 1. Buat bucket 'qris-images' di schema storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qris-images',
  'qris-images',
  true, -- Publik agar pelanggan dapat memindai barcode QRIS di portal resi
  5242880, -- Batas ukuran file 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

-- 2. Kebijakan RLS untuk Bucket 'qris-images'

-- B1. Izin Membaca/Melihat QRIS (SELECT) untuk Semua Pengunjung
DROP POLICY IF EXISTS "Public can view qris images" ON storage.objects;
CREATE POLICY "Public can view qris images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'qris-images');

-- B2. Izin Mengunggah QRIS (INSERT) untuk Admin Kasir
DROP POLICY IF EXISTS "Admin can upload qris images" ON storage.objects;
CREATE POLICY "Admin can upload qris images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'qris-images');

-- B3. Izin Memperbarui QRIS (UPDATE)
DROP POLICY IF EXISTS "Admin can update qris images" ON storage.objects;
CREATE POLICY "Admin can update qris images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'qris-images')
WITH CHECK (bucket_id = 'qris-images');

-- B4. Izin Menghapus QRIS (DELETE)
DROP POLICY IF EXISTS "Admin can delete qris images" ON storage.objects;
CREATE POLICY "Admin can delete qris images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'qris-images');


-- ==============================================================================
-- VERIFIKASI SETUP STORAGE
-- ==============================================================================

-- Cek bucket yang berhasil dibuat:
SELECT id, name, public, file_size_limit, allowed_mime_types, created_at 
FROM storage.buckets 
WHERE id IN ('payment-proofs', 'qris-images');

-- Cek kebijakan keamanan (RLS) yang telah aktif di storage.objects:
SELECT policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'objects' AND policyname LIKE '%payment proofs%' OR policyname LIKE '%qris images%';
