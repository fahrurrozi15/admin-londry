import { createClient } from '@supabase/supabase-js';
import { OperationalOrder, PaymentRecord, OperationalLog, OrderStatus, PaymentMethod } from '@/types/admin';
import { SAMPLE_OPERATIONAL_ORDERS, SAMPLE_LOGS } from './mock-admin-data';

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

// Fallback client Supabase (jika FDW belum di-setup di database)
const clientSupabaseUrl = process.env.NEXT_PUBLIC_CLIENT_SUPABASE_URL || '';
const clientSupabaseKey = process.env.NEXT_PUBLIC_CLIENT_SUPABASE_ANON_KEY || '';
export const clientSupabaseFallback = Boolean(clientSupabaseUrl && clientSupabaseKey)
  ? createClient(clientSupabaseUrl, clientSupabaseKey)
  : null;

/**
 * Mengambil seluruh pesanan operasional (Mengutamakan view FDW: v_operational_orders)
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
      console.warn('View FDW v_operational_orders belum aktif, mencoba metode fallback:', e);
    }
  }

  // 2. Fallback: LocalStorage gabungan (jika dijalankan lokal browser)
  if (typeof window !== 'undefined') {
    const localSaved = localStorage.getItem('local_operational_orders');
    if (localSaved) {
      return JSON.parse(localSaved);
    }

    // Ambil order baru dari client app localStorage jika ada
    const clientAppOrders = localStorage.getItem('local_client_orders');
    if (clientAppOrders) {
      const parsedClient = JSON.parse(clientAppOrders);
      const combined: OperationalOrder[] = parsedClient.map((co: any) => ({
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
        payment_status: 'UNPAID',
      }));

      // Gabungkan dengan sample
      const existingCodes = new Set(combined.map((c) => c.order_code));
      for (const s of SAMPLE_OPERATIONAL_ORDERS) {
        if (!existingCodes.has(s.order_code)) {
          combined.push(s);
        }
      }
      localStorage.setItem('local_operational_orders', JSON.stringify(combined));
      return combined;
    }
  }

  return SAMPLE_OPERATIONAL_ORDERS;
}

/**
 * 1-Click Update Status Cucian
 * Di arsitektur FDW: Mengupdate status di db_client (via foreign table atau direct)
 * Dan mencatat audit trail di tabel operational_logs (db_admin).
 */
export async function updateOrderStatus(
  orderCode: string,
  newStatus: OrderStatus,
  adminUsername: string = 'kasir1'
): Promise<{ success: boolean; message?: string }> {
  // Simpan log audit ke db_admin
  if (isAdminSupabaseConfigured && adminSupabase) {
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
      console.warn('Gagal mencatat audit log ke Supabase:', e);
    }
  }

  // Update status di LocalStorage fallback
  if (typeof window !== 'undefined') {
    const orders: OperationalOrder[] = JSON.parse(
      localStorage.getItem('local_operational_orders') || JSON.stringify(SAMPLE_OPERATIONAL_ORDERS)
    );
    const target = orders.find((o) => o.order_code === orderCode);
    if (target) {
      target.order_status = newStatus;
      localStorage.setItem('local_operational_orders', JSON.stringify(orders));
    }

    // Update juga di localStorage client jika ada
    const clientOrders = JSON.parse(localStorage.getItem('local_client_orders') || '[]');
    const targetClient = clientOrders.find((o: any) => o.order_code === orderCode);
    if (targetClient) {
      targetClient.status = newStatus;
      localStorage.setItem('local_client_orders', JSON.stringify(clientOrders));
    }

    // Catat local audit log
    const logs: OperationalLog[] = JSON.parse(
      localStorage.getItem('local_operational_logs') || JSON.stringify(SAMPLE_LOGS)
    );
    logs.unshift({
      id: `log-${Date.now()}`,
      username: adminUsername,
      action_type: 'STATUS_CHANGE',
      target_order_code: orderCode,
      details: { new_status: newStatus },
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('local_operational_logs', JSON.stringify(logs));
  }

  return { success: true };
}

/**
 * Modul Kasir POS: Menyimpan Berat Timbangan Aktual & Proses Pembayaran
 * Data tersimpan di tabel payments di db_admin!
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

  if (isAdminSupabaseConfigured && adminSupabase) {
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

      // Catat log
      await adminSupabase.from('operational_logs').insert([
        {
          username: payload.adminUsername,
          action_type: 'PAYMENT_PROCESSED',
          target_order_code: payload.orderCode,
          details: { invoice: randomInv, weight: payload.actualWeightKg, total: totalAmount },
        },
      ]);

      if (!error && data) {
        return { success: true, invoiceNo: data.payment_invoice_no };
      }
    } catch (e) {
      console.warn('Gagal simpan payment ke Supabase:', e);
    }
  }

  // Fallback LocalStorage
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
      if (target.order_status === 'ORDER_RECEIVED' || target.order_status === 'COURIER_PICKUP') {
        target.order_status = 'IN_LAUNDRY';
      }
      localStorage.setItem('local_operational_orders', JSON.stringify(orders));
    }

    const logs: OperationalLog[] = JSON.parse(
      localStorage.getItem('local_operational_logs') || JSON.stringify(SAMPLE_LOGS)
    );
    logs.unshift({
      id: `log-${Date.now()}`,
      username: payload.adminUsername,
      action_type: 'PAYMENT_PROCESSED',
      target_order_code: payload.orderCode,
      details: { invoice: randomInv, weight: payload.actualWeightKg, total: totalAmount },
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('local_operational_logs', JSON.stringify(logs));
  }

  return { success: true, invoiceNo: randomInv };
}

export async function getOperationalLogs(): Promise<OperationalLog[]> {
  if (isAdminSupabaseConfigured && adminSupabase) {
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
