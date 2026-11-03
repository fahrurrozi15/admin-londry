import { createClient } from '@supabase/supabase-js';
import { OperationalOrder, PaymentRecord, OperationalLog, OrderStatus, PaymentMethod } from '@/types/admin';
import { SAMPLE_OPERATIONAL_ORDERS, SAMPLE_LOGS } from './mock-admin-data';

// 1. Supabase Admin (Database 2: db_admin)
const adminSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const adminSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isAdminSupabaseConfigured = Boolean(
  adminSupabaseUrl &&
  adminSupabaseKey &&
  !adminSupabaseUrl.includes('your-admin-project')
);

export const adminSupabase = isAdminSupabaseConfigured
  ? createClient(adminSupabaseUrl, adminSupabaseKey)
  : null;

// 2. Supabase Client (Database 1: db_client - direct integration fallback)
const clientSupabaseUrl = process.env.NEXT_PUBLIC_CLIENT_SUPABASE_URL || '';
const clientSupabaseKey = process.env.CLIENT_SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_CLIENT_SUPABASE_ANON_KEY || '';

export const isClientSupabaseConfigured = Boolean(
  clientSupabaseUrl &&
  clientSupabaseKey &&
  !clientSupabaseUrl.includes('your-client-project')
);

export const clientSupabase = isClientSupabaseConfigured
  ? createClient(clientSupabaseUrl, clientSupabaseKey)
  : null;

/**
 * Mengambil seluruh pesanan operasional
 * Jalur 1: Membaca dari PostgreSQL FDW View `v_operational_orders` di db_admin
 * Jalur 2: Integrasi dual-client langsung (query client_orders di DB 1 + payments di DB 2)
 * Jalur 3: Fallback ke mock/local
 */
export async function getOperationalOrders(): Promise<OperationalOrder[]> {
  // 1. Coba dari view FDW di db_admin
  if (isAdminSupabaseConfigured && adminSupabase) {
    try {
      const { data, error } = await adminSupabase
        .from('v_operational_orders')
        .select('*')
        .order('order_created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data as OperationalOrder[];
      }
    } catch (e) {
      console.warn('View FDW v_operational_orders belum aktif, menggunakan integrasi dual-client API:', e);
    }
  }

  // 2. Integrasi Dual-Database API (Tarik client_orders dari DB1 & payments dari DB2)
  if (clientSupabase && adminSupabase) {
    try {
      const [{ data: clientOrders, error: errClient }, { data: payments, error: errPayments }] = await Promise.all([
        clientSupabase.from('client_orders').select('*').order('created_at', { ascending: false }),
        adminSupabase.from('payments').select('*'),
      ]);

      if (!errClient && clientOrders && clientOrders.length > 0) {
        const paymentMap = new Map<string, any>();
        if (payments) {
          payments.forEach((p) => paymentMap.set(p.order_code, p));
        }

        const integrated: OperationalOrder[] = clientOrders.map((co: any) => {
          const pay = paymentMap.get(co.order_code);
          return {
            client_order_id: co.id,
            order_code: co.order_code,
            customer_name: co.customer_name,
            customer_phone: co.customer_phone,
            customer_address: co.customer_address,
            delivery_type: co.delivery_type,
            service_name: co.service_name,
            estimated_weight_kg: co.estimated_weight_kg || 0,
            customer_notes: co.customer_notes,
            order_status: co.status,
            order_created_at: co.created_at,
            payment_id: pay?.id,
            payment_invoice_no: pay?.payment_invoice_no,
            actual_weight_kg: pay?.actual_weight_kg,
            total_amount: pay?.total_amount,
            payment_status: pay?.payment_status || 'UNPAID',
            payment_method: pay?.payment_method,
            paid_at: pay?.paid_at,
          };
        });

        return integrated;
      }
    } catch (err) {
      console.error('Error saat fetch dual-database API:', err);
    }
  }

  // 3. Fallback LocalStorage (bila offline)
  if (typeof window !== 'undefined') {
    const localSaved = localStorage.getItem('local_operational_orders');
    if (localSaved) {
      return JSON.parse(localSaved);
    }
  }

  return SAMPLE_OPERATIONAL_ORDERS;
}

/**
 * 1-Click Update Status Cucian
 * - Mengubah status di `client_orders` (db_client)
 * - Merekam audit log di `operational_logs` (db_admin)
 */
export async function updateOrderStatus(
  orderCode: string,
  newStatus: OrderStatus,
  adminUsername: string = 'kasir1'
): Promise<{ success: boolean; message?: string }> {
  // Update status di DB 1 (Client DB)
  if (clientSupabase) {
    try {
      await clientSupabase
        .from('client_orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('order_code', orderCode);
    } catch (e) {
      console.warn('Gagal update client_orders via direct client:', e);
    }
  }

  // Rekam Audit Trail ke DB 2 (Admin DB)
  if (adminSupabase) {
    try {
      await adminSupabase.from('operational_logs').insert([
        {
          username: adminUsername,
          action_type: 'STATUS_CHANGE',
          target_order_code: orderCode,
          details: { new_status: newStatus, timestamp: new Date().toISOString() },
        },
      ]);
    } catch (e) {
      console.warn('Gagal mencatat audit log ke DB Admin:', e);
    }
  }

  // Update juga di localStorage fallback
  if (typeof window !== 'undefined') {
    const orders: OperationalOrder[] = JSON.parse(
      localStorage.getItem('local_operational_orders') || JSON.stringify(SAMPLE_OPERATIONAL_ORDERS)
    );
    const target = orders.find((o) => o.order_code === orderCode);
    if (target) {
      target.order_status = newStatus;
      localStorage.setItem('local_operational_orders', JSON.stringify(orders));
    }
  }

  return { success: true };
}

/**
 * Modul Kasir POS: Timbangan Aktual & Transaksi Pembayaran
 * - Menyimpan data tagihan ke tabel `payments` (db_admin)
 * - Mengupdate status cucian ke `IN_LAUNDRY` jika masih order baru
 * - Merekam log transaksi ke `operational_logs` (db_admin)
 */
export async function processWeightAndPayment(payload: {
  orderCode: string;
  customerName: string;
  serviceType: string;
  actualWeightKg: number;
  pieceCount: number;
  pricePerUnit: number;
  discountAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  adminUsername: string;
}): Promise<{ success: boolean; invoiceNo: string; message?: string }> {
  const subtotal = payload.actualWeightKg * payload.pricePerUnit;
  const totalAmount = Math.max(0, subtotal - payload.discountAmount);

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomInv = `INV-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Simpan tagihan ke DB 2 (Admin DB)
  if (adminSupabase) {
    try {
      const { data, error } = await adminSupabase
        .from('payments')
        .insert([
          {
            payment_invoice_no: randomInv,
            order_code: payload.orderCode,
            customer_name: payload.customerName,
            service_type: payload.serviceType,
            actual_weight_kg: payload.actualWeightKg,
            piece_count: payload.pieceCount,
            price_per_unit: payload.pricePerUnit,
            subtotal,
            discount_amount: payload.discountAmount,
            total_amount: totalAmount,
            payment_status: 'PAID',
            payment_method: payload.paymentMethod,
            paid_at: new Date().toISOString(),
            notes: payload.notes || '',
          },
        ])
        .select()
        .single();

      // Rekam Audit Trail
      await adminSupabase.from('operational_logs').insert([
        {
          username: payload.adminUsername,
          action_type: 'PAYMENT_PROCESSED',
          target_order_code: payload.orderCode,
          details: { invoice: randomInv, weight: payload.actualWeightKg, total: totalAmount },
        },
      ]);

      // Update status di DB 1 menjadi 'IN_LAUNDRY' (Tiba di Outlet & Ditimbang)
      if (clientSupabase) {
        await clientSupabase
          .from('client_orders')
          .update({ status: 'IN_LAUNDRY', updated_at: new Date().toISOString() })
          .eq('order_code', payload.orderCode);
      }

      if (!error && data) {
        return { success: true, invoiceNo: data.payment_invoice_no };
      }
    } catch (e) {
      console.warn('Gagal simpan payment ke Supabase:', e);
    }
  }

  // Fallback Local
  if (typeof window !== 'undefined') {
    const orders: OperationalOrder[] = JSON.parse(
      localStorage.getItem('local_operational_orders') || JSON.stringify(SAMPLE_OPERATIONAL_ORDERS)
    );
    const target = orders.find((o) => o.order_code === payload.orderCode);
    if (target) {
      target.payment_invoice_no = randomInv;
      target.actual_weight_kg = payload.actualWeightKg;
      target.total_amount = totalAmount;
      target.payment_status = 'PAID';
      target.payment_method = payload.paymentMethod;
      target.paid_at = new Date().toISOString();
      target.order_status = 'IN_LAUNDRY';
      localStorage.setItem('local_operational_orders', JSON.stringify(orders));
    }
  }

  return { success: true, invoiceNo: randomInv };
}

/**
 * Mengambil riwayat audit trail dari `operational_logs` di db_admin
 */
export async function getOperationalLogs(): Promise<OperationalLog[]> {
  if (adminSupabase) {
    try {
      const { data, error } = await adminSupabase
        .from('operational_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        return data as OperationalLog[];
      }
    } catch (e) {
      console.warn('Gagal ambil audit log:', e);
    }
  }

  if (typeof window !== 'undefined') {
    const logs = localStorage.getItem('local_operational_logs');
    if (logs) return JSON.parse(logs);
  }

  return SAMPLE_LOGS;
}
