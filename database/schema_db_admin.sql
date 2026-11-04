-- ==============================================================================
-- DATABASE 2: db_admin (Supabase Project 2 - Confidential & Operational Domain)
-- Deskripsi: Menyimpan akun kasir, POS timbangan, pembayaran, audit trail,
--            dan jembatan integrasi FDW ke db_client.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- 2. TABEL: admin_users (Staf Operasional, Kasir, Kurir, Supervisor)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'cashier', 'courier')),
    phone VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Kasir & Admin Default (Password: 'admin123' / 'kasir123')
INSERT INTO public.admin_users (username, full_name, password_hash, role, phone)
VALUES 
    ('admin', 'Manager Operasional', crypt('admin123', gen_salt('bf')), 'superadmin', '081234567890'),
    ('kasir1', 'Siti Rahma (Kasir Utama)', crypt('kasir123', gen_salt('bf')), 'cashier', '081298765432'),
    ('kurir1', 'Budi Santoso (Kurir)', crypt('kurir123', gen_salt('bf')), 'courier', '081311223344')
ON CONFLICT (username) DO NOTHING;

-- 3. TABEL: payments (Transaksi POS Kasir, Timbangan Aktual & Pembayaran)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_invoice_no VARCHAR(50) UNIQUE NOT NULL,
    order_code VARCHAR(30) NOT NULL,                -- Terhubung ke LND-XXXX di db_client
    customer_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    actual_weight_kg NUMERIC(6, 2) DEFAULT 0.00,
    piece_count INT DEFAULT 0,
    price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' 
        CHECK (payment_status IN ('UNPAID', 'PAID', 'REFUNDED')),
    payment_method VARCHAR(20) DEFAULT 'CASH' 
        CHECK (payment_method IN ('CASH', 'QRIS', 'DEBIT_EDC', 'TRANSFER_BANK')),
    cashier_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_code ON public.payments(order_code);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(payment_status);

-- 4. TABEL: operational_logs (Audit Trail Aktivitas Kasir & Admin)
CREATE TABLE IF NOT EXISTS public.operational_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    username VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'STATUS_CHANGE', 'WEIGHT_INPUT', 'PAYMENT_PROCESSED', 'PRINT_RECEIPT'
    target_order_code VARCHAR(30) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_op_logs_order ON public.operational_logs(target_order_code);

-- 5. TRIGGER: Auto-Generate Nomor Invoice Unik (INV-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION public.fn_generate_invoice_no()
RETURNS TRIGGER AS $$
DECLARE
    today_str VARCHAR(8);
    seq_num INT;
    new_inv VARCHAR(50);
BEGIN
    today_str := TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
    
    SELECT COUNT(*) + 1 INTO seq_num 
    FROM public.payments 
    WHERE payment_invoice_no LIKE 'INV-' || today_str || '-%';
    
    new_inv := 'INV-' || today_str || '-' || LPAD(seq_num::TEXT, 4, '0');
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

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access admin_users" ON public.admin_users FOR ALL USING (true);
CREATE POLICY "Admin access payments" ON public.payments FOR ALL USING (true);
CREATE POLICY "Admin access logs" ON public.operational_logs FOR ALL USING (true);

-- ==============================================================================
-- 7. KONEKSI INTEGRASI SISTEM: postgres_fdw (Jembatan db_admin -> db_client)
-- Jalankan bagian ini setelah memasukkan Host & Password Project 1 (db_client) Anda:
-- ==============================================================================

/*
-- Bersihkan server lama jika ada
DROP SCHEMA IF EXISTS client_remote CASCADE;
DROP USER MAPPING IF EXISTS FOR postgres SERVER client_supabase_server;
DROP SERVER IF EXISTS client_supabase_server CASCADE;

-- Daftarkan Server Database 1 (db_client)
CREATE SERVER client_supabase_server
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (
    host 'db.ozhgrecbtyuaqzbtrmai.supabase.co', -- Host Project 1 (Client DB)
    port '5432',
    dbname 'postgres'
);

-- Hubungkan Kredensial Database 1 (db_client)
CREATE USER MAPPING FOR postgres
SERVER client_supabase_server
OPTIONS (
    user 'postgres',
    password 'MASUKKAN_DATABASE_PASSWORD_PROJECT_CLIENT_ANDA' -- Password DB saat buat project Supabase
);

-- Impor Tabel client_orders dari Database 1 ke Schema client_remote di Database 2
CREATE SCHEMA IF NOT EXISTS client_remote;

IMPORT FOREIGN SCHEMA public
LIMIT TO (client_orders, order_tracking, service_packages)
FROM SERVER client_supabase_server
INTO client_remote;

-- VIEW INTEGRASI: Menggabungkan data pesanan (db_client) dan pembayaran (db_admin)
CREATE OR REPLACE VIEW public.v_operational_orders AS
SELECT 
    co.id AS client_order_id,
    co.order_code,
    co.customer_name,
    co.customer_phone,
    co.customer_address,
    co.delivery_type,
    co.service_name,
    co.estimated_weight_kg,
    co.customer_notes,
    co.status AS order_status,
    co.created_at AS order_created_at,
    p.id AS payment_id,
    p.payment_invoice_no,
    p.actual_weight_kg,
    p.total_amount,
    COALESCE(p.payment_status, 'UNPAID') AS payment_status,
    p.payment_method,
    p.paid_at
FROM client_remote.client_orders co
LEFT JOIN public.payments p ON p.order_code = co.order_code;

GRANT SELECT ON public.v_operational_orders TO anon, authenticated, service_role;
*/
