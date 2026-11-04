-- ==============================================================================
-- PERBAIKAN DATABASE 2: db_admin (Supabase Project 2)
-- Tujuan: Memperbaiki bug invoice trigger bypass & memastikan policy benar
-- Jalankan script ini di SQL Editor Supabase Project 2 (db_admin)
-- ==============================================================================

-- ==============================================================================
-- BUG FIX #1: Trigger generate_invoice_no ter-bypass oleh kode TS
-- PENYEBAB: Kode TypeScript mengirim payment_invoice_no langsung (nilai acak),
--           sehingga trigger COALESCE tidak pernah membuat nomor urut yang rapi.
-- SOLUSI: Perbaiki trigger agar SELALU menimpa / generate nomor baru
--         (terlepas dari nilai yang dikirim app), menggunakan sequence urut.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_generate_invoice_no()
RETURNS TRIGGER AS $$
DECLARE
    today_str VARCHAR(8);
    seq_num INT;
    new_inv VARCHAR(50);
BEGIN
    today_str := TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
    
    -- Hitung berapa invoice yang sudah ada hari ini, buat nomor urut berikutnya
    SELECT COUNT(*) + 1 INTO seq_num 
    FROM public.payments 
    WHERE payment_invoice_no LIKE 'INV-' || today_str || '-%';
    
    new_inv := 'INV-' || today_str || '-' || LPAD(seq_num::TEXT, 4, '0');
    
    -- SELALU timpa dengan nomor yang benar (tidak pakai COALESCE)
    NEW.payment_invoice_no := new_inv;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_invoice ON public.payments;
CREATE TRIGGER trg_payments_invoice
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.fn_generate_invoice_no();

-- ==============================================================================
-- BUG FIX #2: Pastikan RLS policies di db_admin sudah benar
-- PENYEBAB: Saat menggunakan anon key di browser, INSERT payments bisa ditolak
-- SOLUSI: Pastikan semua policy FOR ALL sudah aktif
-- ==============================================================================

-- Cek dan buat ulang policy jika perlu
DO $$
BEGIN
    -- payments
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payments' AND policyname = 'Admin access payments'
    ) THEN
        CREATE POLICY "Admin access payments" ON public.payments FOR ALL USING (true);
    END IF;

    -- operational_logs  
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'operational_logs' AND policyname = 'Admin access logs'
    ) THEN
        CREATE POLICY "Admin access logs" ON public.operational_logs FOR ALL USING (true);
    END IF;

    -- admin_users
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'admin_users' AND policyname = 'Admin access admin_users'
    ) THEN
        CREATE POLICY "Admin access admin_users" ON public.admin_users FOR ALL USING (true);
    END IF;
END;
$$;

-- ==============================================================================
-- VERIFIKASI: Cek semua policy yang aktif di db_admin
-- ==============================================================================

SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('payments', 'operational_logs', 'admin_users')
ORDER BY tablename, policyname;

-- ==============================================================================
-- BONUS: Test insert manual untuk verifikasi trigger invoice berjalan dengan benar
-- Uncomment bagian ini untuk menguji, lalu hapus datanya:
-- ==============================================================================
/*
INSERT INTO public.payments (
    order_code, customer_name, service_type,
    actual_weight_kg, price_per_unit, subtotal,
    discount_amount, total_amount, payment_status, payment_method, paid_at
) VALUES (
    'LND-TEST-0001', 'Test Pelanggan', 'Cuci Komplit Reguler',
    3.5, 8000, 28000,
    0, 28000, 'PAID', 'CASH', NOW()
);

-- Cek hasilnya (payment_invoice_no harus berformat INV-YYYYMMDD-XXXX, urut)
SELECT payment_invoice_no, order_code, created_at FROM public.payments ORDER BY created_at DESC LIMIT 5;

-- Hapus data test
DELETE FROM public.payments WHERE order_code = 'LND-TEST-0001';
*/
