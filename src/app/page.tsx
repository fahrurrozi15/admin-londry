'use client';

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Scale,
  Receipt,
  Printer,
  History,
  CheckCircle,
  Clock,
  ArrowRight,
  Search,
  Filter,
  DollarSign,
  Package,
  User,
  ShieldCheck,
  RefreshCw,
  X,
  CreditCard,
  QrCode,
  Banknote,
  Send
} from 'lucide-react';
import { OperationalOrder, OrderStatus, PaymentMethod, OperationalLog } from '@/types/admin';
import {
  getOperationalOrders,
  updateOrderStatus,
  processWeightAndPayment,
  getOperationalLogs,
  isAdminSupabaseConfigured
} from '@/lib/supabase-admin';

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'pos_orders' | 'audit_logs'>('pos_orders');
  const [orders, setOrders] = useState<OperationalOrder[]>([]);
  const [logs, setLogs] = useState<OperationalLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Active cashier session
  const currentCashier = 'Siti Rahma (Kasir Utama)';
  const currentCashierUser = 'kasir1';

  // POS Modal State
  const [selectedOrderForPOS, setSelectedOrderForPOS] = useState<OperationalOrder | null>(null);
  const [actualWeight, setActualWeight] = useState<number>(0);
  const [pieceCount, setPieceCount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS');
  const [posNotes, setPosNotes] = useState('');
  const [processingPOS, setProcessingPOS] = useState(false);

  // Thermal Receipt Modal State
  const [receiptData, setReceiptData] = useState<{
    invoiceNo: string;
    orderCode: string;
    customerName: string;
    serviceName: string;
    weight: number;
    pricePerUnit: number;
    subtotal: number;
    discount: number;
    total: number;
    paymentMethod: string;
    paidAt: string;
    cashierName: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [fetchedOrders, fetchedLogs] = await Promise.all([
      getOperationalOrders(),
      getOperationalLogs(),
    ]);
    setOrders(fetchedOrders);
    setLogs(fetchedLogs);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.order_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_phone.includes(searchQuery);

    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    if (filterStatus === 'UNPAID') return o.payment_status === 'UNPAID';
    if (filterStatus === 'PAID') return o.payment_status === 'PAID';
    return o.order_status === filterStatus;
  });

  // Calculate Metrics
  const totalOrdersCount = orders.length;
  const pendingOrdersCount = orders.filter((o) => o.order_status === 'ORDER_RECEIVED' || o.order_status === 'IN_LAUNDRY').length;
  const washingOrdersCount = orders.filter((o) => o.order_status === 'WASHING_DRYING' || o.order_status === 'IRONING').length;
  const readyOrdersCount = orders.filter((o) => o.order_status === 'READY_FOR_DELIVERY').length;
  const totalRevenue = orders.reduce((sum, o) => (o.payment_status === 'PAID' ? sum + (o.total_amount || 0) : sum), 0);

  // Status handler (1-Click)
  const handleStatusChange = async (orderCode: string, newStatus: OrderStatus) => {
    await updateOrderStatus(orderCode, newStatus, currentCashierUser);
    await loadData();
  };

  // Open POS Modal
  const openPOSModal = (order: OperationalOrder) => {
    setSelectedOrderForPOS(order);
    setActualWeight(order.actual_weight_kg || order.estimated_weight_kg || 4.0);
    setPieceCount(0);
    setDiscountAmount(0);
    setPaymentMethod('QRIS');
    setPosNotes('');
  };

  // Calculate POS Subtotal & Total
  const unitRate = 8000; // Standar Cuci Komplit Rp 8.000 / KG
  const posSubtotal = (actualWeight || 0) * unitRate;
  const posTotal = Math.max(0, posSubtotal - (discountAmount || 0));

  // Submit POS
  const handleProcessPOS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForPOS) return;

    if (actualWeight <= 0) {
      alert('Mohon masukkan berat aktual cucian.');
      return;
    }

    setProcessingPOS(true);
    const result = await processWeightAndPayment({
      orderCode: selectedOrderForPOS.order_code,
      customerName: selectedOrderForPOS.customer_name,
      serviceType: selectedOrderForPOS.service_name,
      actualWeightKg: actualWeight,
      pieceCount,
      pricePerUnit: unitRate,
      discountAmount,
      paymentMethod,
      notes: posNotes,
      adminUsername: currentCashierUser,
    });

    setProcessingPOS(false);

    if (result.success) {
      // Set Receipt for Printing
      setReceiptData({
        invoiceNo: result.invoiceNo,
        orderCode: selectedOrderForPOS.order_code,
        customerName: selectedOrderForPOS.customer_name,
        serviceName: selectedOrderForPOS.service_name,
        weight: actualWeight,
        pricePerUnit: unitRate,
        subtotal: posSubtotal,
        discount: discountAmount,
        total: posTotal,
        paymentMethod,
        paidAt: new Date().toLocaleString('id-ID'),
        cashierName: currentCashier,
      });

      setSelectedOrderForPOS(null);
      await loadData();
    }
  };

  const printThermal = () => {
    window.print();
  };

  const renderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'ORDER_RECEIVED':
        return <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded border border-amber-300">ORDER MASUK</span>;
      case 'COURIER_PICKUP':
        return <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded border border-blue-300">PENJEMPUTAN</span>;
      case 'IN_LAUNDRY':
        return <span className="bg-indigo-100 text-indigo-800 text-[11px] font-bold px-2 py-0.5 rounded border border-indigo-300">TIBA DI OUTLET</span>;
      case 'WASHING_DRYING':
        return <span className="bg-cyan-100 text-cyan-800 text-[11px] font-bold px-2 py-0.5 rounded border border-cyan-300">CUCI / KERING</span>;
      case 'IRONING':
        return <span className="bg-teal-100 text-teal-800 text-[11px] font-bold px-2 py-0.5 rounded border border-teal-300">SETRIKA & PACKING</span>;
      case 'READY_FOR_DELIVERY':
        return <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded border border-purple-300">SIAP ANTAR / AMBIL</span>;
      case 'COMPLETED':
        return <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-300">SELESAI</span>;
      case 'CANCELLED':
        return <span className="bg-red-100 text-red-800 text-[11px] font-bold px-2 py-0.5 rounded border border-red-300">BATAL</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-[11px] px-2 py-0.5 rounded">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar Header */}
      <header className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2 rounded">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-base sm:text-lg">AURA LAUNDRY POS</span>
                <span className="bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 text-[10px] font-mono px-2 py-0.5 rounded uppercase">
                  Admin System
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Database: <code className="text-sky-300 font-mono">db_admin (Supabase Project 2)</code> &bull; Foreign Data Wrapper: <code className="text-emerald-400 font-mono">v_operational_orders</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentCashier}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            </div>
            <button
              onClick={() => loadData()}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-2 rounded transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-1 space-y-6">
        
        {/* KPI & Summary Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 p-4 rounded shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Total Pesanan Masuk</span>
                <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{totalOrdersCount}</span>
              </div>
              <div className="p-2 bg-amber-50 text-amber-600 rounded">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <span className="text-[11px] text-amber-600 font-medium block mt-2">
              {pendingOrdersCount} menunggu diproses
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Sedang Dicuci & Setrika</span>
                <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{washingOrdersCount}</span>
              </div>
              <div className="p-2 bg-sky-50 text-sky-600 rounded">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <span className="text-[11px] text-sky-600 font-medium block mt-2">
              Dalam operasional mesin
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Siap Diantar / Diambil</span>
                <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{readyOrdersCount}</span>
              </div>
              <div className="p-2 bg-purple-50 text-purple-600 rounded">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <span className="text-[11px] text-purple-600 font-medium block mt-2">
              Packing bersih selesai
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Total Omset Kasir</span>
                <span className="text-2xl font-bold text-emerald-600 mt-0.5 block">
                  Rp {totalRevenue.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium block mt-2">
              Tercatat di tabel payments
            </span>
          </div>
        </div>

        {/* Tab Switcher & Filter Bar */}
        <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
            {/* Tab Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('pos_orders')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold transition ${
                  activeTab === 'pos_orders'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                POS Kasir & Antrean Cucian
              </button>
              <button
                onClick={() => setActiveTab('audit_logs')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold transition ${
                  activeTab === 'audit_logs'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Audit Trail Keamanan ({logs.length})
              </button>
            </div>

            {/* Quick Search */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari kode resi, nama, HP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-600"
              >
                <option value="all">Semua Status</option>
                <option value="ORDER_RECEIVED">Order Masuk</option>
                <option value="IN_LAUNDRY">Tiba di Outlet</option>
                <option value="WASHING_DRYING">Cuci / Kering</option>
                <option value="IRONING">Setrika Uap</option>
                <option value="READY_FOR_DELIVERY">Siap Antar</option>
                <option value="COMPLETED">Selesai</option>
                <option value="UNPAID">Belum Bayar</option>
                <option value="PAID">Lunas</option>
              </select>
            </div>
          </div>

          {/* TAB 1: High Density Data Table for POS Kasir */}
          {activeTab === 'pos_orders' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Kode Resi</th>
                    <th className="py-2.5 px-3">Pelanggan</th>
                    <th className="py-2.5 px-3">Layanan</th>
                    <th className="py-2.5 px-3">Berat Aktual</th>
                    <th className="py-2.5 px-3">Status Cucian</th>
                    <th className="py-2.5 px-3">Tagihan & Bayar</th>
                    <th className="py-2.5 px-3 text-right">Aksi Cepat Kasir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map((o) => (
                      <tr key={o.order_code} className="hover:bg-slate-50/80 transition">
                        {/* Resi & Timestamp */}
                        <td className="py-3 px-3">
                          <span className="font-mono font-bold text-slate-900 block">{o.order_code}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(o.order_created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>

                        {/* Customer Info */}
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-800 block">{o.customer_name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{o.customer_phone}</span>
                          <span className="text-[10px] text-slate-400 block truncate max-w-xs">{o.customer_address}</span>
                        </td>

                        {/* Service Name */}
                        <td className="py-3 px-3">
                          <span className="font-medium text-slate-800 block">{o.service_name}</span>
                          <span className="text-[10px] text-slate-500 capitalize">
                            {o.delivery_type.replace(/_/g, ' ')}
                          </span>
                        </td>

                        {/* Weight */}
                        <td className="py-3 px-3">
                          {o.actual_weight_kg ? (
                            <span className="font-mono font-bold text-slate-900 text-sm">{o.actual_weight_kg} KG</span>
                          ) : (
                            <span className="text-amber-600 font-medium text-[11px] italic">
                              Est: {o.estimated_weight_kg || 0} KG (Belum Timbang)
                            </span>
                          )}
                        </td>

                        {/* Order Status with 1-Click Update */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <div>{renderStatusBadge(o.order_status)}</div>
                            <select
                              value={o.order_status}
                              onChange={(e) => handleStatusChange(o.order_code, e.target.value as OrderStatus)}
                              className="bg-white border border-slate-300 rounded text-[11px] px-1.5 py-0.5 text-slate-700 focus:outline-none focus:border-indigo-600"
                            >
                              <option value="ORDER_RECEIVED">1. Order Masuk</option>
                              <option value="COURIER_PICKUP">2. Kurir Jemput</option>
                              <option value="IN_LAUNDRY">3. Tiba di Outlet</option>
                              <option value="WASHING_DRYING">4. Cuci/Kering</option>
                              <option value="IRONING">5. Setrika Uap</option>
                              <option value="READY_FOR_DELIVERY">6. Siap Antar</option>
                              <option value="COMPLETED">7. Selesai</option>
                              <option value="CANCELLED">Batal</option>
                            </select>
                          </div>
                        </td>

                        {/* Payment & Invoice */}
                        <td className="py-3 px-3">
                          {o.payment_status === 'PAID' ? (
                            <div>
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                LUNAS ({o.payment_method || 'CASH'})
                              </span>
                              <span className="block font-bold text-slate-900 text-xs mt-0.5">
                                Rp {(o.total_amount || 0).toLocaleString('id-ID')}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">{o.payment_invoice_no}</span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                BELUM BAYAR
                              </span>
                              <span className="block text-slate-400 text-[11px] mt-0.5">Menunggu timbangan</span>
                            </div>
                          )}
                        </td>

                        {/* Quick POS Actions */}
                        <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                          <button
                            onClick={() => openPOSModal(o)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded text-[11px] font-semibold transition inline-flex items-center gap-1 shadow-2xs"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            {o.payment_status === 'PAID' ? 'Edit / POS' : 'Timbang & Bayar'}
                          </button>

                          {o.payment_status === 'PAID' && (
                            <button
                              onClick={() => {
                                setReceiptData({
                                  invoiceNo: o.payment_invoice_no || `INV-${o.order_code}`,
                                  orderCode: o.order_code,
                                  customerName: o.customer_name,
                                  serviceName: o.service_name,
                                  weight: o.actual_weight_kg || 0,
                                  pricePerUnit: 8000,
                                  subtotal: (o.actual_weight_kg || 0) * 8000,
                                  discount: 0,
                                  total: o.total_amount || 0,
                                  paymentMethod: o.payment_method || 'CASH',
                                  paidAt: new Date(o.paid_at || o.order_created_at).toLocaleString('id-ID'),
                                  cashierName: currentCashier,
                                });
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2 py-1.5 rounded text-[11px] font-semibold transition inline-flex items-center gap-1"
                              title="Cetak Struk Kasir"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Struk
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        Tidak ada transaksi yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: Audit Trail Log */}
          {activeTab === 'audit_logs' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">Staf / Kasir</th>
                    <th className="py-2.5 px-3">Aksi Keamanan</th>
                    <th className="py-2.5 px-3">Resi Target</th>
                    <th className="py-2.5 px-3">Detail Perubahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {new Date(l.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {l.username}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded text-[10px] font-mono">
                          {l.action_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {l.target_order_code}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                        {JSON.stringify(l.details || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* MODAL 1: POS Kasir (Timbangan & Pembayaran) */}
      {selectedOrderForPOS && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm sm:text-base">POS Kasir - Input Timbangan & Tagihan</h3>
              </div>
              <button
                onClick={() => setSelectedOrderForPOS(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessPOS} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block">Kode Resi:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedOrderForPOS.order_code}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Pelanggan:</span>
                  <span className="font-semibold text-slate-800">{selectedOrderForPOS.customer_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Paket Layanan:</span>
                  <span className="font-semibold text-slate-800">{selectedOrderForPOS.service_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Tarif Satuan:</span>
                  <span className="font-semibold text-slate-800">Rp {unitRate.toLocaleString('id-ID')} / KG</span>
                </div>
              </div>

              {/* Input Berat Aktual (KG) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Berat Aktual Timbangan (KG) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    autoFocus
                    placeholder="0.0"
                    value={actualWeight || ''}
                    onChange={(e) => setActualWeight(parseFloat(e.target.value) || 0)}
                    className="w-full text-xl font-bold bg-white border-2 border-indigo-500 rounded px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <span className="absolute right-3 top-3 font-bold text-slate-500 text-sm">KG</span>
                </div>
              </div>

              {/* Input Diskon */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">Potongan / Diskon (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={discountAmount || ''}
                    onChange={(e) => setDiscountAmount(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>

                {/* Metode Pembayaran */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">Metode Pembayaran</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  >
                    <option value="QRIS">QRIS Dinamis</option>
                    <option value="CASH">Tunai (CASH)</option>
                    <option value="DEBIT_EDC">Kartu Debit (EDC)</option>
                    <option value="TRANSFER_BANK">Transfer Bank</option>
                  </select>
                </div>
              </div>

              {/* Total Calculation Card */}
              <div className="bg-indigo-50 border border-indigo-200 rounded p-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal ({actualWeight} KG &times; Rp {unitRate.toLocaleString('id-ID')}):</span>
                  <span className="font-mono font-semibold">Rp {posSubtotal.toLocaleString('id-ID')}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Diskon:</span>
                    <span className="font-mono font-semibold">- Rp {discountAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="border-t border-indigo-200 pt-1.5 flex justify-between items-center text-sm font-extrabold text-indigo-950">
                  <span>TOTAL TAGIHAN:</span>
                  <span className="text-xl text-indigo-700 font-mono">Rp {posTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForPOS(null)}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={processingPOS}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Receipt className="w-4 h-4" />
                  {processingPOS ? 'Memproses...' : 'Proses Pembayaran & Cetak Struk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Struk Thermal Kasir (Print Ready) */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center print:hidden">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-emerald-400" />
                Preview Struk Kasir 80mm
              </span>
              <button onClick={() => setReceiptData(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thermal Print Area */}
            <div id="thermal-receipt" className="p-6 font-mono text-xs text-slate-900 bg-white space-y-3">
              <div className="text-center space-y-0.5 border-b border-dashed border-slate-400 pb-3">
                <h2 className="font-extrabold text-base tracking-wider">AURA LAUNDRY</h2>
                <p className="text-[10px]">Jl. Merdeka No. 45, Jakarta</p>
                <p className="text-[10px]">WhatsApp: 0812-3456-7890</p>
              </div>

              <div className="text-[11px] space-y-1 border-b border-dashed border-slate-400 pb-2">
                <div className="flex justify-between">
                  <span>No. Faktur:</span>
                  <span className="font-bold">{receiptData.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>No. Resi:</span>
                  <span className="font-bold">{receiptData.orderCode}</span>
                </div>
                <div className="flex justify-between">
                  <span>Waktu:</span>
                  <span>{receiptData.paidAt}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kasir:</span>
                  <span>{receiptData.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span className="font-bold">{receiptData.customerName}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-1 border-b border-dashed border-slate-400 pb-2 text-[11px]">
                <div className="font-bold">{receiptData.serviceName}</div>
                <div className="flex justify-between text-slate-600">
                  <span>{receiptData.weight} KG &times; Rp {receiptData.pricePerUnit.toLocaleString('id-ID')}</span>
                  <span>Rp {receiptData.subtotal.toLocaleString('id-ID')}</span>
                </div>
                {receiptData.discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Diskon Promo:</span>
                    <span>- Rp {receiptData.discount.toLocaleString('id-ID')}</span>
                  </div>
                )}
              </div>

              {/* Total & Payment Method */}
              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL:</span>
                  <span>Rp {receiptData.total.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Metode:</span>
                  <span>{receiptData.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Status:</span>
                  <span>LUNAS</span>
                </div>
              </div>

              <div className="text-center pt-3 border-t border-dashed border-slate-400 space-y-1 text-[10px] text-slate-500">
                <p>Terima kasih atas kepercayaan Anda.</p>
                <p>Simpan struk ini untuk bukti pengambilan.</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between gap-2 print:hidden">
              <button
                onClick={() => setReceiptData(null)}
                className="w-1/2 px-3 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Tutup
              </button>
              <button
                onClick={() => printThermal()}
                className="w-1/2 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>AURA LAUNDRY Management &bull; Admin POS Internal System</span>
          <span className="text-[11px] text-slate-400">
            Tugas Integrasi Sistem &copy; 2026. Mode Terdistribusi Dual-Database.
          </span>
        </div>
      </footer>
    </div>
  );
}
