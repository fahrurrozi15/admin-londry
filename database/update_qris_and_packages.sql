-- ==============================================================================
-- UPDATE SUPABASE DATABASE 1 (db_client): QRIS, AUTO REFRESH & CUSTOM PAKET
-- Jalankan skrip ini di SQL Editor Supabase Project 1 (db_client)
-- ==============================================================================

-- 1. Tambah kolom pembayaran ke client_orders (jika belum ada)
ALTER TABLE public.client_orders 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'CASH',
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID',
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_weight_kg NUMERIC(6, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS piece_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;

-- 2. Buat tabel app_settings (untuk simpan foto QRIS dan konfigurasi outlet)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aktifkan RLS dan izin penuh untuk app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on app_settings" ON public.app_settings;
CREATE POLICY "Allow all on app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- 3. Izinkan Admin mengelola paket layanan secara dinamis (Tambah, Edit, Hapus)
DROP POLICY IF EXISTS "Allow manage packages" ON public.service_packages;
CREATE POLICY "Allow manage packages" ON public.service_packages FOR ALL USING (true) WITH CHECK (true);

-- 4. Aktifkan Supabase Realtime Replication untuk tabel agar auto-refresh instan
-- (Memungkinkan browser menerima perubahan seketika tanpa perlu reload)
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_packages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;

-- 5. Seed default QRIS jika belum ada
INSERT INTO public.app_settings (key, value)
VALUES 
    ('qris_merchant_name', 'AURA LAUNDRY OFFICIAL'),
    ('qris_nmid', 'ID102030405060'),
    ('qris_info', 'Scan QRIS untuk pembayaran GoPay, OVO, Dana, ShopeePay, BCA, Mandiri, BRI, dll.')
ON CONFLICT (key) DO NOTHING;

-- Verifikasi tabel
SELECT tablename, policyname, cmd FROM pg_policies 
WHERE tablename IN ('client_orders', 'service_packages', 'app_settings');
