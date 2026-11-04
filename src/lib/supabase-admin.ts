import { createClient } from '@supabase/supabase-js';
import {
  OperationalOrder,
  OperationalLog,
  OrderStatus,
  PaymentMethod,
  ServicePackage,
  QRISSetting
} from '@/types/admin';
import {
  SAMPLE_OPERATIONAL_ORDERS,
  SAMPLE_LOGS,
  SAMPLE_SERVICES,
  DEFAULT_QRIS_SETTINGS
} from './mock-admin-data';

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
      const [{ data: clientOrders, error: errClient }, { data: payments }, { data: settingsList }] = await Promise.all([
        clientSupabase.from('client_orders').select('*').order('created_at', { ascending: false }),
        adminSupabase.from('payments').select('*'),
        clientSupabase.from('app_settings').select('key, value').like('key', 'proof_%'),
      ]);

      if (!errClient && clientOrders && clientOrders.length > 0) {
        const paymentMap = new Map<string, Record<string, unknown>>();
        if (payments) {
          (payments as Record<string, unknown>[]).forEach((p) => 
            paymentMap.set(p.order_code as string, p)
          );
        }

        const proofSettingsMap = new Map<string, string>();
        if (settingsList) {
          (settingsList as { key: string; value: string }[]).forEach((s) => {
            const code = s.key.replace(/^proof_/, '').toUpperCase();
            proofSettingsMap.set(code, s.value);
          });
        }

        const integrated: OperationalOrder[] = (clientOrders as Record<string, unknown>[]).map((co) => {
          const pay = paymentMap.get(co.order_code as string);
          const orderCodeUpper = (co.order_code as string || '').toUpperCase();
          const fallbackProof = proofSettingsMap.get(orderCodeUpper) || 
            (typeof window !== 'undefined' ? localStorage.getItem(`proof_${orderCodeUpper}`) : null);

          return {
            client_order_id: co.id as string,
            order_code: co.order_code as string,
            customer_name: co.customer_name as string,
            customer_phone: co.customer_phone as string,
            customer_address: co.customer_address as string,
            delivery_type: co.delivery_type as string,
            service_name: co.service_name as string,
            estimated_weight_kg: (co.estimated_weight_kg as number) || 0,
            price_per_unit: co.price_per_unit as number | undefined,
            unit_name: co.unit_name as string | undefined,
            customer_notes: co.customer_notes as string | undefined,
            order_status: co.status as OrderStatus,
            order_created_at: co.created_at as string,
            payment_id: pay?.id as string | undefined,
            payment_invoice_no: pay?.payment_invoice_no as string | undefined,
            actual_weight_kg: pay?.actual_weight_kg as number | undefined,
            piece_count: pay?.piece_count as number | undefined,
            total_amount: pay?.total_amount ? Number(pay.total_amount) : (co.total_amount ? Number(co.total_amount) : undefined),
            payment_status: (pay?.payment_status as 'UNPAID' | 'PAID' | 'REFUNDED') || (co.payment_status as 'UNPAID' | 'PAID') || 'UNPAID',
            payment_method: (pay?.payment_method as PaymentMethod | undefined) || (co.payment_method as PaymentMethod | undefined),
            payment_proof_url: (co.payment_proof_url as string | undefined) || (pay?.payment_proof_url as string | undefined) || fallbackProof || undefined,
            paid_at: pay?.paid_at as string | undefined,
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
    const localClientOrdersRaw = localStorage.getItem('local_client_orders');
    const localClientMap = new Map<string, { payment_proof_url?: string; total_amount?: number; payment_status?: string }>();
    if (localClientOrdersRaw) {
      try {
        const clientList = JSON.parse(localClientOrdersRaw);
        clientList.forEach((c: { order_code: string; payment_proof_url?: string; total_amount?: number; payment_status?: string }) => {
          localClientMap.set(c.order_code, c);
        });
      } catch (e) {
        console.warn('Error parse local_client_orders:', e);
      }
    }

    if (localSaved) {
      const parsed: OperationalOrder[] = JSON.parse(localSaved);
      // Merge bukti pembayaran terbaru jika ada
      parsed.forEach((item) => {
        const cOrder = localClientMap.get(item.order_code);
        if (cOrder?.payment_proof_url && !item.payment_proof_url) {
          item.payment_proof_url = cOrder.payment_proof_url;
        }
      });
      return parsed;
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
 * 
 * FIX: Tidak lagi mengirim payment_invoice_no dari kode TS.
 *      Nomor invoice sepenuhnya di-generate oleh trigger PostgreSQL
 *      fn_generate_invoice_no() agar berurutan dan tidak bentrok.
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

  // Fallback invoice number (dipakai hanya jika Supabase tidak tersedia)
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const fallbackInv = `INV-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Simpan tagihan ke DB 2 (Admin DB)
  if (adminSupabase) {
    try {
      // FIX: Tidak mengirim payment_invoice_no — biar trigger DB yang generate
      const { data, error } = await adminSupabase
        .from('payments')
        .insert([
          {
            // payment_invoice_no: sengaja dikosongkan → ditangani trigger fn_generate_invoice_no
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
        .select('payment_invoice_no')
        .single();

      if (error) {
        console.error('Gagal simpan payment ke Supabase:', error);
        return { success: false, invoiceNo: '', message: error.message };
      }

      const finalInvoiceNo = data?.payment_invoice_no || fallbackInv;

      // Rekam Audit Trail
      await adminSupabase.from('operational_logs').insert([
        {
          username: payload.adminUsername,
          action_type: 'PAYMENT_PROCESSED',
          target_order_code: payload.orderCode,
          details: { invoice: finalInvoiceNo, weight: payload.actualWeightKg, total: totalAmount },
        },
      ]);

      // Update status di DB 1 menjadi 'IN_LAUNDRY' (Tiba di Outlet & Ditimbang)
      if (clientSupabase) {
        const { error: updateErr } = await clientSupabase
          .from('client_orders')
          .update({ status: 'IN_LAUNDRY', updated_at: new Date().toISOString() })
          .eq('order_code', payload.orderCode);
        if (updateErr) {
          console.warn('Gagal update status client_orders:', updateErr.message);
        }
      }

      return { success: true, invoiceNo: finalInvoiceNo };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Error processWeightAndPayment:', e);
      return { success: false, invoiceNo: '', message: errMsg };
    }
  }

  // Fallback Local (bila Supabase offline)
  if (typeof window !== 'undefined') {
    const orders: OperationalOrder[] = JSON.parse(
      localStorage.getItem('local_operational_orders') || JSON.stringify(SAMPLE_OPERATIONAL_ORDERS)
    );
    const target = orders.find((o) => o.order_code === payload.orderCode);
    if (target) {
      target.payment_invoice_no = fallbackInv;
      target.actual_weight_kg = payload.actualWeightKg;
      target.piece_count = payload.pieceCount;
      target.total_amount = totalAmount;
      target.payment_status = 'PAID';
      target.payment_method = payload.paymentMethod;
      target.paid_at = new Date().toISOString();
      target.order_status = 'IN_LAUNDRY';
      localStorage.setItem('local_operational_orders', JSON.stringify(orders));
    }
  }

  return { success: true, invoiceNo: fallbackInv };
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

/**
 * AUTO REFRESH / REALTIME SUBSCRIPTION
 * Memantau perubahan database secara langsung dan menjalankan callback.
 * Dilengkapi dengan interval 3 detik sebagai fallback handal.
 */
export function subscribeToAdminUpdates(onChange: () => void): () => void {
  const unsubscribers: (() => void)[] = [];

  // Polling fallback 3.5 detik (sangat mulus tanpa reload halaman)
  const timer = setInterval(() => {
    onChange();
  }, 3500);
  unsubscribers.push(() => clearInterval(timer));

  // Supabase Realtime di client_orders
  if (clientSupabase) {
    try {
      const channel = clientSupabase
        .channel('admin_realtime_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'client_orders' }, () => {
          onChange();
        })
        .subscribe();
      unsubscribers.push(() => {
        clientSupabase.removeChannel(channel);
      });
    } catch (e) {
      console.warn('Realtime client_orders subscribe notice:', e);
    }
  }

  // Supabase Realtime di payments
  if (adminSupabase) {
    try {
      const channelAdmin = adminSupabase
        .channel('admin_realtime_payments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
          onChange();
        })
        .subscribe();
      unsubscribers.push(() => {
        adminSupabase.removeChannel(channelAdmin);
      });
    } catch (e) {
      console.warn('Realtime payments subscribe notice:', e);
    }
  }

  return () => {
    unsubscribers.forEach((fn) => fn());
  };
}

/**
 * UNGGAH TAGIHAN QRIS DARI OUTLET (Menunggu Pembayaran Pelanggan)
 * Kasir menimbang pakaian, sistem menghitung total tagihan,
 * dan mengunggah status 'UNPAID' (Menunggu Pembayaran QRIS)
 */
export async function uploadQRISBill(payload: {
  orderCode: string;
  customerName: string;
  serviceType: string;
  actualWeightKg: number;
  pieceCount: number;
  pricePerUnit: number;
  discountAmount: number;
  notes?: string;
  adminUsername: string;
}): Promise<{ success: boolean; invoiceNo: string; message?: string }> {
  const subtotal = (payload.actualWeightKg > 0 ? payload.actualWeightKg : payload.pieceCount) * payload.pricePerUnit;
  const totalAmount = Math.max(0, subtotal - payload.discountAmount);

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fallbackInv = `INV-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  if (adminSupabase) {
    try {
      // 1. Simpan pembayaran status UNPAID di db_admin
      const { data, error } = await adminSupabase
        .from('payments')
        .insert([
          {
            order_code: payload.orderCode,
            customer_name: payload.customerName,
            service_type: payload.serviceType,
            actual_weight_kg: payload.actualWeightKg,
            piece_count: payload.pieceCount,
            price_per_unit: payload.pricePerUnit,
            subtotal,
            discount_amount: payload.discountAmount,
            total_amount: totalAmount,
            payment_status: 'UNPAID',
            payment_method: 'QRIS',
            notes: payload.notes || 'Tagihan QRIS diunggah kasir',
          },
        ])
        .select('payment_invoice_no')
        .single();

      if (error) {
        console.warn('Gagal insert payment UNPAID:', error.message);
      }

      const finalInv = data?.payment_invoice_no || fallbackInv;

      // 2. Update status order di db_client
      if (clientSupabase) {
        await clientSupabase
          .from('client_orders')
          .update({
            status: 'IN_LAUNDRY',
            payment_method: 'QRIS',
            payment_status: 'UNPAID',
            total_amount: totalAmount,
            actual_weight_kg: payload.actualWeightKg,
            piece_count: payload.pieceCount,
            updated_at: new Date().toISOString(),
          })
          .eq('order_code', payload.orderCode);
      }

      // 3. Catat audit log
      await adminSupabase.from('operational_logs').insert([
        {
          username: payload.adminUsername,
          action_type: 'QRIS_BILL_UPLOADED',
          target_order_code: payload.orderCode,
          details: { invoice: finalInv, weight: payload.actualWeightKg, total: totalAmount },
        },
      ]);

      return { success: true, invoiceNo: finalInv };
    } catch (e: unknown) {
      console.warn('Gagal upload tagihan QRIS ke Supabase:', e);
    }
  }

  // Fallback Local
  if (typeof window !== 'undefined') {
    const orders: OperationalOrder[] = JSON.parse(
      localStorage.getItem('local_operational_orders') || JSON.stringify(SAMPLE_OPERATIONAL_ORDERS)
    );
    const target = orders.find((o) => o.order_code === payload.orderCode);
    if (target) {
      target.payment_invoice_no = fallbackInv;
      target.actual_weight_kg = payload.actualWeightKg;
      target.piece_count = payload.pieceCount;
      target.total_amount = totalAmount;
      target.payment_status = 'UNPAID';
      target.payment_method = 'QRIS';
      target.order_status = 'IN_LAUNDRY';
      localStorage.setItem('local_operational_orders', JSON.stringify(orders));
    }
  }

  return { success: true, invoiceNo: fallbackInv };
}

/**
 * 1-KLIK VERIFIKASI PEMBAYARAN QRIS (Mengubah status menjadi PAID / Lunas)
 */
export async function verifyQRISPayment(
  orderCode: string,
  cashierUsername: string = 'kasir1'
): Promise<{ success: boolean; message?: string }> {
  if (adminSupabase) {
    try {
      await adminSupabase
        .from('payments')
        .update({
          payment_status: 'PAID',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('order_code', orderCode);

      await adminSupabase.from('operational_logs').insert([
        {
          username: cashierUsername,
          action_type: 'QRIS_VERIFIED_PAID',
          target_order_code: orderCode,
          details: { verified_at: new Date().toISOString() },
        },
      ]);
    } catch (e) {
      console.warn('Gagal verifikasi pembayaran QRIS di DB Admin:', e);
    }
  }

  if (clientSupabase) {
    try {
      await clientSupabase
        .from('client_orders')
        .update({
          payment_status: 'PAID',
          updated_at: new Date().toISOString(),
        })
        .eq('order_code', orderCode);
    } catch (e) {
      console.warn('Gagal verifikasi pembayaran QRIS di DB Client:', e);
    }
  }

  // Local Storage update
  if (typeof window !== 'undefined') {
    const orders: OperationalOrder[] = JSON.parse(
      localStorage.getItem('local_operational_orders') || JSON.stringify(SAMPLE_OPERATIONAL_ORDERS)
    );
    const target = orders.find((o) => o.order_code === orderCode);
    if (target) {
      target.payment_status = 'PAID';
      target.paid_at = new Date().toISOString();
      localStorage.setItem('local_operational_orders', JSON.stringify(orders));
    }

    // Juga update local_client_orders agar tracking di portal klien sinkron
    const localClientOrdersRaw = localStorage.getItem('local_client_orders');
    if (localClientOrdersRaw) {
      try {
        const clientOrders = JSON.parse(localClientOrdersRaw);
        const cTarget = clientOrders.find((c: { order_code: string }) => c.order_code === orderCode);
        if (cTarget) {
          cTarget.payment_status = 'PAID';
          cTarget.updated_at = new Date().toISOString();
          localStorage.setItem('local_client_orders', JSON.stringify(clientOrders));
        }
      } catch (e) {
        console.warn('Error update local_client_orders:', e);
      }
    }
  }

  return { success: true };
}

/**
 * ==============================================================================
 * MANAJEMEN PAKET LAYANAN SECARA DINAMIS (CUSTOM PAKET DARI ADMIN)
 * ==============================================================================
 */

export async function getAllServicePackages(): Promise<ServicePackage[]> {
  if (clientSupabase) {
    try {
      const { data, error } = await clientSupabase
        .from('service_packages')
        .select('*')
        .order('price_per_unit', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as ServicePackage[];
      }
    } catch (e) {
      console.warn('Gagal fetch services dari db_client:', e);
    }
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('local_service_packages');
    if (saved) return JSON.parse(saved);
  }

  return SAMPLE_SERVICES;
}

export async function createServicePackage(
  pkg: Omit<ServicePackage, 'id'>
): Promise<{ success: boolean; data?: ServicePackage; message?: string }> {
  const newSlug = pkg.slug || pkg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const newPackage = {
    ...pkg,
    slug: newSlug,
    is_active: pkg.is_active ?? true,
  };

  if (clientSupabase) {
    try {
      const { data, error } = await clientSupabase
        .from('service_packages')
        .insert([newPackage])
        .select()
        .single();

      if (!error && data) {
        return { success: true, data: data as ServicePackage };
      }
      if (error) {
        console.error('Error createServicePackage:', error);
        return { success: false, message: error.message };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, message: msg };
    }
  }

  // Local fallback
  if (typeof window !== 'undefined') {
    const pkgs: ServicePackage[] = JSON.parse(
      localStorage.getItem('local_service_packages') || JSON.stringify(SAMPLE_SERVICES)
    );
    const created: ServicePackage = {
      ...newPackage,
      id: `sp-${Date.now()}`,
    };
    pkgs.push(created);
    localStorage.setItem('local_service_packages', JSON.stringify(pkgs));
    return { success: true, data: created };
  }

  return { success: true };
}

export async function updateServicePackage(
  id: string,
  pkg: Partial<ServicePackage>
): Promise<{ success: boolean; message?: string }> {
  if (clientSupabase) {
    try {
      const { error } = await clientSupabase
        .from('service_packages')
        .update(pkg)
        .eq('id', id);

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, message: msg };
    }
  }

  if (typeof window !== 'undefined') {
    const pkgs: ServicePackage[] = JSON.parse(
      localStorage.getItem('local_service_packages') || JSON.stringify(SAMPLE_SERVICES)
    );
    const idx = pkgs.findIndex((p) => p.id === id);
    if (idx !== -1) {
      pkgs[idx] = { ...pkgs[idx], ...pkg };
      localStorage.setItem('local_service_packages', JSON.stringify(pkgs));
    }
  }

  return { success: true };
}

export async function deleteServicePackage(id: string): Promise<{ success: boolean; message?: string }> {
  if (clientSupabase) {
    try {
      const { error } = await clientSupabase
        .from('service_packages')
        .delete()
        .eq('id', id);

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, message: msg };
    }
  }

  if (typeof window !== 'undefined') {
    let pkgs: ServicePackage[] = JSON.parse(
      localStorage.getItem('local_service_packages') || JSON.stringify(SAMPLE_SERVICES)
    );
    pkgs = pkgs.filter((p) => p.id !== id);
    localStorage.setItem('local_service_packages', JSON.stringify(pkgs));
  }

  return { success: true };
}

/**
 * ==============================================================================
 * SISTEM PENGATURAN QRIS & OUTLET
 * ==============================================================================
 */

export async function getQRISSettings(): Promise<QRISSetting> {
  if (clientSupabase) {
    try {
      const { data, error } = await clientSupabase
        .from('app_settings')
        .select('*');

      if (!error && data && data.length > 0) {
        const map = new Map<string, string>();
        data.forEach((row: { key: string; value: string }) => map.set(row.key, row.value));

        return {
          merchant_name: map.get('qris_merchant_name') || DEFAULT_QRIS_SETTINGS.merchant_name,
          image_url: map.get('qris_image_url') || DEFAULT_QRIS_SETTINGS.image_url,
          nmid: map.get('qris_nmid') || DEFAULT_QRIS_SETTINGS.nmid,
          info: map.get('qris_info') || DEFAULT_QRIS_SETTINGS.info,
          updated_at: map.get('qris_updated_at') || DEFAULT_QRIS_SETTINGS.updated_at,
        };
      }
    } catch (e) {
      console.warn('Gagal ambil QRIS settings dari Supabase:', e);
    }
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('aura_qris_settings');
    if (saved) return JSON.parse(saved);
  }

  return DEFAULT_QRIS_SETTINGS;
}

/**
 * Unggah file gambar QRIS ke Supabase Storage (bucket 'qris-images')
 */
export async function uploadQRISToSupabaseStorage(
  base64OrBlob: string | Blob,
  fileName: string = `qris_outlet_${Date.now()}.png`
): Promise<string | null> {
  const sbClient = clientSupabase || adminSupabase;
  if (!sbClient) return null;

  try {
    let fileBody: Blob;
    if (typeof base64OrBlob === 'string') {
      const res = await fetch(base64OrBlob);
      fileBody = await res.blob();
    } else {
      fileBody = base64OrBlob;
    }

    const { data, error } = await sbClient.storage
      .from('qris-images')
      .upload(fileName, fileBody, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
      console.warn('Gagal upload QRIS ke Supabase Storage:', error.message);
      return null;
    }

    if (data) {
      const { data: publicUrlData } = sbClient.storage
        .from('qris-images')
        .getPublicUrl(fileName);
      return publicUrlData?.publicUrl || null;
    }
  } catch (err) {
    console.warn('Exception saat upload QRIS ke storage:', err);
  }
  return null;
}

export async function saveQRISSettings(
  settings: QRISSetting
): Promise<{ success: boolean; message?: string }> {
  const finalSettings = { ...settings };

  // Jika gambar berupa data base64, coba unggah ke Supabase Storage bucket 'qris-images'
  if (finalSettings.image_url && finalSettings.image_url.startsWith('data:image/')) {
    try {
      const storageUrl = await uploadQRISToSupabaseStorage(finalSettings.image_url);
      if (storageUrl) {
        finalSettings.image_url = storageUrl;
      }
    } catch (e) {
      console.warn('Gagal simpan gambar QRIS ke Storage, menggunakan fallback base64:', e);
    }
  }

  if (clientSupabase) {
    try {
      const upserts = [
        { key: 'qris_merchant_name', value: finalSettings.merchant_name, updated_at: new Date().toISOString() },
        { key: 'qris_image_url', value: finalSettings.image_url, updated_at: new Date().toISOString() },
        { key: 'qris_nmid', value: finalSettings.nmid || '', updated_at: new Date().toISOString() },
        { key: 'qris_info', value: finalSettings.info || '', updated_at: new Date().toISOString() },
        { key: 'qris_updated_at', value: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];

      await clientSupabase.from('app_settings').upsert(upserts);
    } catch (e) {
      console.warn('Gagal simpan QRIS settings ke Supabase:', e);
    }
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem('aura_qris_settings', JSON.stringify(finalSettings));
  }

  return { success: true };
}
