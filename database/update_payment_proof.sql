-- ==============================================================================
-- UPDATE SUPABASE DATABASE 1 (db_client): BUKTI PEMBAYARAN TRANSFER (PAYMENT PROOF)
-- Jalankan skrip ini di SQL Editor Supabase Project 1 (db_client)
-- ==============================================================================

-- 1. Tambah kolom payment_proof_url ke tabel client_orders
ALTER TABLE public.client_orders 
ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;

-- 2. Pastikan kolom pendukung pembayaran lainnya juga lengkap
ALTER TABLE public.client_orders 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'CASH',
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID',
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_weight_kg NUMERIC(6, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS piece_count INT DEFAULT 0;

-- 3. Beri izin update bukti pembayaran bagi klien & anon
DROP POLICY IF EXISTS "Allow upload payment proof on client_orders" ON public.client_orders;
CREATE POLICY "Allow upload payment proof on client_orders" 
ON public.client_orders 
FOR UPDATE 
USING (true) 
WITH CHECK (true);

-- 4. Pastikan Supabase Realtime mereplikasi client_orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_orders;

-- Verifikasi kolom baru
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'client_orders' AND column_name IN ('payment_proof_url', 'payment_status', 'total_amount');
