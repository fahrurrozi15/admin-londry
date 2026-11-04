'use client';

import React, { useState, useEffect } from 'react';
import {
  Scale,
  Receipt,
  Printer,
  History,
  CheckCircle,
  Clock,
  Search,
  DollarSign,
  Package,
  User,
  RefreshCw,
  X,
  QrCode,
  Banknote,
  Upload,
  Plus,
  Edit,
  Trash2,
  Menu,
  ShieldCheck,
  Check,
  Layers,
  Eye,
  FileCheck2,
  ExternalLink
} from 'lucide-react';
import {
  OperationalOrder,
  OrderStatus,
  PaymentMethod,
  OperationalLog,
  ServicePackage,
  QRISSetting
} from '@/types/admin';
import {
  getOperationalOrders,
  updateOrderStatus,
  processWeightAndPayment,
  getOperationalLogs,
  getAllServicePackages,
  createServicePackage,
  updateServicePackage,
  deleteServicePackage,
  getQRISSettings,
  saveQRISSettings,
  uploadQRISBill,
  verifyQRISPayment,
  subscribeToAdminUpdates
} from '@/lib/supabase-admin';
import { DEFAULT_QRIS_SETTINGS } from '@/lib/mock-admin-data';

export default function AdminDashboardPage() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'pos_orders' | 'payment_qris' | 'custom_packages' | 'audit_logs'>('pos_orders');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data States
  const [orders, setOrders] = useState<OperationalOrder[]>([]);
  const [logs, setLogs] = useState<OperationalLog[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [, setQrisSettings] = useState<QRISSetting>(DEFAULT_QRIS_SETTINGS);

  // Filter & Search
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
  const [cashReceived, setCashReceived] = useState<number>(0);

  // Thermal Receipt Modal State
  const [receiptData, setReceiptData] = useState<{
    invoiceNo: string;
    orderCode: string;
    customerName: string;
    serviceName: string;
    weight: number;
    unitName: string;
    pricePerUnit: number;
    subtotal: number;
    discount: number;
    total: number;
    cashReceived: number;
    cashChange: number;
    paymentMethod: string;
    paidAt: string;
    cashierName: string;
  } | null>(null);

  // Verifikasi Bukti Transfer Modal State
  const [proofModalOrder, setProofModalOrder] = useState<OperationalOrder | null>(null);
  const [verifyingInProofModal, setVerifyingInProofModal] = useState(false);

  // Package Form Modal State
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [packageFormData, setPackageFormData] = useState<{
    name: string;
    service_type: 'kiloan' | 'satuan' | 'express';
    price_per_unit: number;
    unit_name: string;
    estimated_duration_hours: number;
    description: string;
    is_active: boolean;
  }>({
    name: '',
    service_type: 'kiloan',
    price_per_unit: 8000,
    unit_name: 'KG',
    estimated_duration_hours: 48,
    description: '',
    is_active: true,
  });

  // QRIS Settings Form State
  const [qrisMerchantInput, setQrisMerchantInput] = useState('');
  const [qrisNmidInput, setQrisNmidInput] = useState('');
  const [qrisInfoInput, setQrisInfoInput] = useState('');
  const [qrisImageInput, setQrisImageInput] = useState('');
  const [savingQRIS, setSavingQRIS] = useState(false);
  const [qrisSaveSuccess, setQrisSaveSuccess] = useState(false);

  // Load All Data (Initial & Manual)
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [fetchedOrders, fetchedLogs, fetchedPkgs, fetchedQris] = await Promise.all([
        getOperationalOrders(),
        getOperationalLogs(),
        getAllServicePackages(),
        getQRISSettings(),
      ]);
      setOrders(fetchedOrders);
      setLogs(fetchedLogs);
      setPackages(fetchedPkgs);
      setQrisSettings(fetchedQris);
      setQrisMerchantInput(fetchedQris.merchant_name);
      setQrisNmidInput(fetchedQris.nmid || '');
      setQrisInfoInput(fetchedQris.info || '');
      setQrisImageInput(fetchedQris.image_url);
    } finally {
      setLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    let ignore = false;
    (async () => {
      const [fetchedOrders, fetchedLogs, fetchedPkgs, fetchedQris] = await Promise.all([
        getOperationalOrders(),
        getOperationalLogs(),
        getAllServicePackages(),
        getQRISSettings(),
      ]);
      if (!ignore) {
        setOrders(fetchedOrders);
        setLogs(fetchedLogs);
        setPackages(fetchedPkgs);
        setQrisSettings(fetchedQris);
        setQrisMerchantInput(fetchedQris.merchant_name);
        setQrisNmidInput(fetchedQris.nmid || '');
        setQrisInfoInput(fetchedQris.info || '');
        setQrisImageInput(fetchedQris.image_url);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // AUTO REFRESH / REALTIME SUBSCRIPTION
  useEffect(() => {
    const unsubscribe = subscribeToAdminUpdates(async () => {
      // Silent background refresh without reloading page
      const [fetchedOrders, fetchedLogs, fetchedPkgs] = await Promise.all([
        getOperationalOrders(),
        getOperationalLogs(),
        getAllServicePackages(),
      ]);
      setOrders(fetchedOrders);
      setLogs(fetchedLogs);
      setPackages(fetchedPkgs);
    });

    return () => {
      unsubscribe();
    };
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
    if (filterStatus === 'QRIS') return o.payment_method === 'QRIS';
    if (filterStatus === 'CASH') return o.payment_method === 'CASH';
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
    const updated = await getOperationalOrders();
    setOrders(updated);
  };

  // Open POS Modal
  const openPOSModal = (order: OperationalOrder) => {
    setSelectedOrderForPOS(order);
    const isSatuan = order.unit_name === 'PCS';
    setActualWeight(isSatuan ? 0 : (order.actual_weight_kg || order.estimated_weight_kg || 0));
    setPieceCount(isSatuan ? (order.piece_count || 1) : 0);
    setDiscountAmount(0);
    // HANYA CASH ATAU QRIS
    setPaymentMethod(order.payment_method === 'CASH' ? 'CASH' : 'QRIS');
    setPosNotes('');
    setCashReceived(0);
  };

  // Dynamic Service Rate Calculation
  const getServiceRate = (order: OperationalOrder | null) => {
    if (!order) return { rate: 8000, unit: 'KG' };
    const matchedPkg = packages.find((p) => p.name.toLowerCase() === order.service_name.toLowerCase());
    if (matchedPkg) {
      return { rate: matchedPkg.price_per_unit, unit: matchedPkg.unit_name };
    }
    if (order.price_per_unit && order.unit_name) {
      return { rate: order.price_per_unit, unit: order.unit_name };
    }
    return { rate: 8000, unit: 'KG' };
  };

  const currentServiceRate = getServiceRate(selectedOrderForPOS);
  const unitRate = currentServiceRate.rate;
  const unitName = currentServiceRate.unit;
  const isUnitSatuan = unitName === 'PCS';

  const posQty = isUnitSatuan ? pieceCount : actualWeight;
  const posSubtotal = posQty * unitRate;
  const posTotal = Math.max(0, posSubtotal - (discountAmount || 0));
  const cashChange = Math.max(0, cashReceived - posTotal);

  // 1. Submit POS - Langsung Bayar (CASH atau QRIS Lunas)
  const handleProcessPOS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForPOS) return;

    if (isUnitSatuan && pieceCount <= 0) {
      alert('Mohon masukkan jumlah item (PCS).');
      return;
    }
    if (!isUnitSatuan && actualWeight <= 0) {
      alert('Mohon masukkan berat aktual cucian.');
      return;
    }

    if (paymentMethod === 'CASH' && cashReceived < posTotal) {
      alert(`Uang tunai diterima (Rp ${cashReceived.toLocaleString('id-ID')}) kurang dari total tagihan (Rp ${posTotal.toLocaleString('id-ID')}).`);
      return;
    }

    setProcessingPOS(true);
    const result = await processWeightAndPayment({
      orderCode: selectedOrderForPOS.order_code,
      customerName: selectedOrderForPOS.customer_name,
      serviceType: selectedOrderForPOS.service_name,
      actualWeightKg: isUnitSatuan ? 0 : actualWeight,
      pieceCount: isUnitSatuan ? pieceCount : 0,
      pricePerUnit: unitRate,
      discountAmount,
      paymentMethod,
      notes: posNotes,
      adminUsername: currentCashierUser,
    });

    setProcessingPOS(false);

    if (result.success) {
      setReceiptData({
        invoiceNo: result.invoiceNo,
        orderCode: selectedOrderForPOS.order_code,
        customerName: selectedOrderForPOS.customer_name,
        serviceName: selectedOrderForPOS.service_name,
        weight: isUnitSatuan ? pieceCount : actualWeight,
        unitName,
        pricePerUnit: unitRate,
        subtotal: posSubtotal,
        discount: discountAmount,
        total: posTotal,
        cashReceived: paymentMethod === 'CASH' ? cashReceived : 0,
        cashChange: paymentMethod === 'CASH' ? cashChange : 0,
        paymentMethod,
        paidAt: new Date().toLocaleString('id-ID'),
        cashierName: currentCashier,
      });

      setSelectedOrderForPOS(null);
      const updated = await getOperationalOrders();
      setOrders(updated);
    } else {
      alert(`Gagal: ${result.message || 'Terjadi kesalahan saat memproses.'}`);
    }
  };

  // 2. Submit POS - UNGGAH TAGIHAN QRIS (Menunggu Pembayaran Pelanggan)
  const handleUploadQRISBill = async () => {
    if (!selectedOrderForPOS) return;
    if (isUnitSatuan && pieceCount <= 0) {
      alert('Mohon masukkan jumlah item (PCS).');
      return;
    }
    if (!isUnitSatuan && actualWeight <= 0) {
      alert('Mohon masukkan berat aktual cucian.');
      return;
    }

    setProcessingPOS(true);
    const result = await uploadQRISBill({
      orderCode: selectedOrderForPOS.order_code,
      customerName: selectedOrderForPOS.customer_name,
      serviceType: selectedOrderForPOS.service_name,
      actualWeightKg: isUnitSatuan ? 0 : actualWeight,
      pieceCount: isUnitSatuan ? pieceCount : 0,
      pricePerUnit: unitRate,
      discountAmount,
      notes: posNotes,
      adminUsername: currentCashierUser,
    });
    setProcessingPOS(false);

    if (result.success) {
      alert(`Berhasil! Tagihan QRIS Rp ${posTotal.toLocaleString('id-ID')} telah diunggah ke sistem. Pelanggan sekarang dapat melihat rincian & scan QRIS di portal pelanggan.`);
      setSelectedOrderForPOS(null);
      const updated = await getOperationalOrders();
      setOrders(updated);
    } else {
      alert(`Gagal unggah tagihan: ${result.message || 'Terjadi kesalahan'}`);
    }
  };

  // 3. Verifikasi Pembayaran QRIS setelah melihat Bukti Transfer
  const handleAccFromProofModal = async () => {
    if (!proofModalOrder) return;
    setVerifyingInProofModal(true);
    await verifyQRISPayment(proofModalOrder.order_code, currentCashierUser);

    // Otomatis siapkan data struk kasir
    const svcRate = getServiceRate(proofModalOrder);
    const isSatuanUnit = svcRate.unit === 'PCS';
    const qty = isSatuanUnit ? (proofModalOrder.piece_count || 0) : (proofModalOrder.actual_weight_kg || 0);

    setReceiptData({
      invoiceNo: proofModalOrder.payment_invoice_no || `INV-${proofModalOrder.order_code}`,
      orderCode: proofModalOrder.order_code,
      customerName: proofModalOrder.customer_name,
      serviceName: proofModalOrder.service_name,
      weight: qty,
      unitName: svcRate.unit,
      pricePerUnit: svcRate.rate,
      subtotal: qty * svcRate.rate,
      discount: 0,
      total: proofModalOrder.total_amount || 0,
      cashReceived: 0,
      cashChange: 0,
      paymentMethod: 'QRIS',
      paidAt: new Date().toLocaleString('id-ID'),
      cashierName: currentCashier,
    });

    setVerifyingInProofModal(false);
    setProofModalOrder(null);

    const updated = await getOperationalOrders();
    setOrders(updated);
  };

  // Package Management Handlers
  const openNewPackageModal = () => {
    setEditingPackageId(null);
    setPackageFormData({
      name: '',
      service_type: 'kiloan',
      price_per_unit: 8000,
      unit_name: 'KG',
      estimated_duration_hours: 48,
      description: '',
      is_active: true,
    });
    setIsPackageModalOpen(true);
  };

  const openEditPackageModal = (pkg: ServicePackage) => {
    setEditingPackageId(pkg.id);
    setPackageFormData({
      name: pkg.name,
      service_type: pkg.service_type,
      price_per_unit: pkg.price_per_unit,
      unit_name: pkg.unit_name,
      estimated_duration_hours: pkg.estimated_duration_hours,
      description: pkg.description || '',
      is_active: pkg.is_active,
    });
    setIsPackageModalOpen(true);
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageFormData.name.trim() || packageFormData.price_per_unit <= 0) {
      alert('Mohon isi nama paket dan tarif yang valid.');
      return;
    }

    if (editingPackageId) {
      await updateServicePackage(editingPackageId, packageFormData);
    } else {
      await createServicePackage({
        ...packageFormData,
        slug: packageFormData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      });
    }

    setIsPackageModalOpen(false);
    const updated = await getAllServicePackages();
    setPackages(updated);
  };

  const handleDeletePackage = async (id: string, name: string) => {
    if (confirm(`Yakin ingin menghapus paket layanan "${name}"?`)) {
      await deleteServicePackage(id);
      const updated = await getAllServicePackages();
      setPackages(updated);
    }
  };

  // QRIS Image Upload Handler
  const handleQRISFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Mohon unggah file gambar (PNG, JPG, JPEG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setQrisImageInput(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveQRISSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingQRIS(true);
    await saveQRISSettings({
      merchant_name: qrisMerchantInput || 'AURA LAUNDRY OFFICIAL',
      image_url: qrisImageInput || DEFAULT_QRIS_SETTINGS.image_url,
      nmid: qrisNmidInput || 'ID102030405060',
      info: qrisInfoInput || 'Scan QRIS untuk pembayaran',
      updated_at: new Date().toISOString(),
    });
    setSavingQRIS(false);
    setQrisSaveSuccess(true);
    setTimeout(() => setQrisSaveSuccess(false), 3000);
  };

  const printThermal = () => {
    window.print();
  };

  const renderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'ORDER_RECEIVED':
        return <span className="bg-amber-50 text-amber-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-amber-200">ORDER MASUK</span>;
      case 'COURIER_PICKUP':
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">PENJEMPUTAN</span>;
      case 'IN_LAUNDRY':
        return <span className="bg-teal-50 text-teal-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-teal-200">TIBA DI OUTLET</span>;
      case 'WASHING_DRYING':
        return <span className="bg-cyan-50 text-cyan-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-cyan-200">CUCI / KERING</span>;
      case 'IRONING':
        return <span className="bg-emerald-50 text-emerald-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">SETRIKA UAP</span>;
      case 'READY_FOR_DELIVERY':
        return <span className="bg-purple-50 text-purple-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-purple-200">SIAP ANTAR / AMBIL</span>;
      case 'COMPLETED':
        return <span className="bg-emerald-100 text-emerald-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-300">SELESAI</span>;
      case 'CANCELLED':
        return <span className="bg-rose-50 text-rose-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-rose-200">BATAL</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-[10px] px-2.5 py-0.5 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex font-sans" suppressHydrationWarning>
      {/* ============================================================================== */}
      {/* SIDEBAR NAVIGATION (DESKTOP & MOBILE) */}
      {/* ============================================================================== */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 text-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 md:static ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Sidebar Brand Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xs">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-extrabold tracking-tight text-base text-slate-900">AURA LAUNDRY</h1>
                <span className="text-[10px] font-mono text-slate-500 block uppercase font-bold tracking-wider">POS Admin System</span>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cashier Badge */}
          <div className="p-3 mx-3 my-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2.5 shadow-2xs">
            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-slate-900 block truncate">{currentCashier}</span>
              <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Kasir Aktif Online
              </span>
            </div>
          </div>

          {/* Sidebar Menu Links */}
          <nav className="px-3 space-y-1">
            <button
              onClick={() => { setActiveTab('pos_orders'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'pos_orders'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-slate-600 hover:text-black hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4" />
                <span>POS & Antrean Cucian</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${activeTab === 'pos_orders' ? 'bg-neutral-800 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                {orders.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('payment_qris'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'payment_qris'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-slate-600 hover:text-black hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <QrCode className="w-4 h-4" />
                <span>Sistem Bayar & QRIS</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${activeTab === 'payment_qris' ? 'bg-neutral-800 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                Dinamis
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('custom_packages'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'custom_packages'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-slate-600 hover:text-black hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4" />
                <span>Manajemen Paket</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${activeTab === 'custom_packages' ? 'bg-neutral-800 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                {packages.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('audit_logs'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'audit_logs'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-slate-600 hover:text-black hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4" />
                <span>Audit Trail Keamanan</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${activeTab === 'audit_logs' ? 'bg-neutral-800 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                {logs.length}
              </span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Backdrop for Mobile Sidebar */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      {/* ============================================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ============================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Sticky Header */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {activeTab === 'pos_orders' && 'POS Kasir & Antrean Cucian'}
                {activeTab === 'payment_qris' && 'Sistem Pembayaran & QRIS Dinamis'}
                {activeTab === 'custom_packages' && 'Manajemen Custom Paket Layanan'}
                {activeTab === 'audit_logs' && 'Audit Trail Aktivitas Kasir'}
              </h2>
              <p className="text-xs text-slate-400 hidden sm:block">
                Mode Terdistribusi Dual-Database Supabase &bull; Auto-Refresh Aktif
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAllData()}
              className="bg-black hover:bg-neutral-800 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
              title="Refresh Data Sekarang"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>
          </div>
        </header>

        {/* Dynamic Main Body Content */}
        <main className="p-4 md:p-6 space-y-6 flex-1">
          {/* ============================================================================== */}
          {/* VIEW 1: POS KASIR & ANTREAN CUCIAN */}
          {/* ============================================================================== */}
          {activeTab === 'pos_orders' && (
            <div className="space-y-6">
              {/* Summary Metrics Bar */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-slate-500 font-medium block">Total Pesanan Masuk</span>
                      <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{totalOrdersCount}</span>
                    </div>
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                      <Package className="w-5 h-5" />
                    </div>
                  </div>
                  <span className="text-[11px] text-amber-600 font-medium block mt-2">
                    {pendingOrdersCount} menunggu diproses
                  </span>
                </div>

                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-slate-500 font-medium block">Sedang Cuci & Setrika</span>
                      <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{washingOrdersCount}</span>
                    </div>
                    <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl">
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium block mt-2">
                    Dalam proses operasional mesin
                  </span>
                </div>

                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-slate-500 font-medium block">Siap Antar / Ambil</span>
                      <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{readyOrdersCount}</span>
                    </div>
                    <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <span className="text-[11px] text-purple-700 font-medium block mt-2">
                    Packing bersih selesai
                  </span>
                </div>

                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-slate-500 font-medium block">Total Omset Kasir</span>
                      <span className="text-2xl font-bold text-emerald-700 mt-0.5 block">
                        Rp {totalRevenue.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-medium block mt-2">
                    Tercatat di payments (db_admin)
                  </span>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Cari kode resi, nama, HP..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                    >
                      <option value="all">Semua Status Order</option>
                      <option value="ORDER_RECEIVED">Order Masuk</option>
                      <option value="IN_LAUNDRY">Tiba di Outlet</option>
                      <option value="WASHING_DRYING">Cuci / Kering</option>
                      <option value="IRONING">Setrika Uap</option>
                      <option value="READY_FOR_DELIVERY">Siap Antar</option>
                      <option value="COMPLETED">Selesai</option>
                      <option value="UNPAID">Tagihan Belum Bayar</option>
                      <option value="PAID">Lunas</option>
                      <option value="QRIS">Metode QRIS</option>
                      <option value="CASH">Metode Tunai</option>
                    </select>
                  </div>
                </div>

                {/* High Density POS Orders Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Kode Resi</th>
                        <th className="py-2.5 px-3">Pelanggan</th>
                        <th className="py-2.5 px-3">Layanan</th>
                        <th className="py-2.5 px-3">Berat / Jumlah</th>
                        <th className="py-2.5 px-3">Status Cucian</th>
                        <th className="py-2.5 px-3">Tagihan & Bayar</th>
                        <th className="py-2.5 px-3 text-right">Aksi Cepat Kasir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrders.length > 0 ? (
                        filteredOrders.map((o) => {
                          const isQRIS = o.payment_method === 'QRIS' || (o.customer_notes && o.customer_notes.includes('QRIS'));
                          const isUnpaidWithBill = o.payment_status === 'UNPAID' && o.total_amount && o.total_amount > 0;

                          return (
                            <tr key={o.order_code} className="hover:bg-slate-50/80 transition">
                              {/* Resi */}
                              <td className="py-3 px-3">
                                <span className="font-mono font-bold text-slate-900 block">{o.order_code}</span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(o.order_created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </td>

                              {/* Customer */}
                              <td className="py-3 px-3">
                                <span className="font-semibold text-slate-800 block">{o.customer_name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">{o.customer_phone}</span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-xs">{o.customer_address}</span>
                              </td>

                              {/* Service */}
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
                                ) : o.piece_count ? (
                                  <span className="font-mono font-bold text-slate-900 text-sm">{o.piece_count} PCS</span>
                                ) : (
                                  <span className="text-amber-600 font-medium text-[11px] italic">
                                    Est: {o.estimated_weight_kg || 0} KG (Belum Timbang)
                                  </span>
                                )}
                              </td>

                              {/* Status Update */}
                              <td className="py-3 px-3">
                                <div className="space-y-1">
                                  <div>{renderStatusBadge(o.order_status)}</div>
                                  <select
                                    value={o.order_status}
                                    onChange={(e) => handleStatusChange(o.order_code, e.target.value as OrderStatus)}
                                    className="bg-white border border-slate-200 rounded-lg text-[11px] px-2 py-1 text-slate-700 focus:outline-none focus:border-slate-800 transition"
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
                                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                                      LUNAS ({o.payment_method || 'CASH'})
                                    </span>
                                    <span className="block font-bold text-slate-900 text-xs mt-0.5">
                                      Rp {(o.total_amount || 0).toLocaleString('id-ID')}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">{o.payment_invoice_no}</span>
                                  </div>
                                ) : isQRIS && isUnpaidWithBill ? (
                                  <div>
                                    <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 w-fit">
                                      <QrCode className="w-3 h-3" />
                                      MENUNGGU QRIS
                                    </span>
                                    <span className="block font-bold text-slate-900 text-xs mt-0.5">
                                      Rp {(o.total_amount || 0).toLocaleString('id-ID')}
                                    </span>
                                    {o.payment_proof_url ? (
                                      <button
                                        type="button"
                                        onClick={() => setProofModalOrder(o)}
                                        className="mt-1 text-[10px] text-white bg-black hover:bg-neutral-800 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1 transition shadow-xs"
                                        title="Pelanggan sudah mengunggah bukti transfer. Klik untuk verifikasi."
                                      >
                                        <FileCheck2 className="w-3 h-3 text-emerald-400" />
                                        Bukti Transfer Ada
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 block mt-0.5">Tagihan terunggah (belum ada bukti)</span>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                                      BELUM BAYAR
                                    </span>
                                    <span className="block text-slate-400 text-[11px] mt-0.5">
                                      {isQRIS ? 'Menunggu timbangan (QRIS)' : 'Menunggu kasir (Tunai)'}
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Quick Actions */}
                              <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                                {isQRIS && isUnpaidWithBill && (
                                  o.payment_proof_url ? (
                                    <button
                                      onClick={() => setProofModalOrder(o)}
                                      className="bg-black hover:bg-neutral-800 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-xs"
                                      title="Pelanggan sudah mengirim bukti transfer. Kasir harus memeriksa bukti sebelum meng-acc."
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Lihat Bukti Transfer & Acc
                                    </button>
                                  ) : (
                                    <span
                                      className="bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-xl text-[11px] font-medium inline-flex items-center gap-1 cursor-not-allowed select-none"
                                      title="Admin tidak bisa meng-acc pembayaran sebelum pelanggan mengunggah bukti transfer di portal klien."
                                    >
                                      <Clock className="w-3 h-3 text-amber-500" />
                                      Menunggu Bukti Klien
                                    </span>
                                  )
                                )}

                                <button
                                  onClick={() => openPOSModal(o)}
                                  className="bg-black hover:bg-neutral-800 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-xs"
                                >
                                  <Scale className="w-3.5 h-3.5" />
                                  {o.payment_status === 'PAID' ? 'Edit Tagihan' : 'Timbang & Bayar'}
                                </button>

                                {o.payment_status === 'PAID' && (() => {
                                  const svcRate = getServiceRate(o);
                                  const isSatuanUnit = svcRate.unit === 'PCS';
                                  const qty = isSatuanUnit ? (o.piece_count || 0) : (o.actual_weight_kg || 0);
                                  return (
                                    <button
                                      onClick={() => {
                                        setReceiptData({
                                          invoiceNo: o.payment_invoice_no || `INV-${o.order_code}`,
                                          orderCode: o.order_code,
                                          customerName: o.customer_name,
                                          serviceName: o.service_name,
                                          weight: qty,
                                          unitName: svcRate.unit,
                                          pricePerUnit: svcRate.rate,
                                          subtotal: qty * svcRate.rate,
                                          discount: 0,
                                          total: o.total_amount || 0,
                                          cashReceived: 0,
                                          cashChange: 0,
                                          paymentMethod: o.payment_method || 'CASH',
                                          paidAt: new Date(o.paid_at || o.order_created_at).toLocaleString('id-ID'),
                                          cashierName: currentCashier,
                                        });
                                      }}
                                      className="bg-black hover:bg-neutral-800 text-white px-2.5 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1 shadow-xs"
                                      title="Cetak Struk Kasir"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                      Struk
                                    </button>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-400">
                            Tidak ada pesanan yang sesuai dengan filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================================== */}
          {/* VIEW 2: SISTEM PEMBAYARAN & QRIS DINAMIS */}
          {/* ============================================================================== */}
          {activeTab === 'payment_qris' && (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-12 gap-6">
                {/* Form Pengaturan QRIS */}
                <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-slate-700" />
                      Konfigurasi QRIS Outlet Laundry
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Unggah foto QRIS outlet Anda. Pelanggan yang memilih opsi QRIS akan melihat barcode ini di portal pelacakan resi setelah pakaian ditimbang.
                    </p>
                  </div>

                  {qrisSaveSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Pengaturan QRIS berhasil disimpan dan langsung aktif di portal pelanggan!
                    </div>
                  )}

                  <form onSubmit={handleSaveQRISSettings} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Nama Merchant / Outlet di QRIS <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={qrisMerchantInput}
                        onChange={(e) => setQrisMerchantInput(e.target.value)}
                        placeholder="Contoh: AURA LAUNDRY OFFICIAL"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 block">
                          NMID / ID Merchant (Opsional)
                        </label>
                        <input
                          type="text"
                          value={qrisNmidInput}
                          onChange={(e) => setQrisNmidInput(e.target.value)}
                          placeholder="Contoh: ID102030405060"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 block">
                          Petunjuk Singkat Pembayaran
                        </label>
                        <input
                          type="text"
                          value={qrisInfoInput}
                          onChange={(e) => setQrisInfoInput(e.target.value)}
                          placeholder="Scan dengan GoPay, OVO, Dana, BCA, dll."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                        />
                      </div>
                    </div>

                    {/* Upload Foto QRIS */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Unggah Gambar / Foto QRIS Resmi <span className="text-red-500">*</span>
                      </label>
                      <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 text-center bg-slate-50/70 hover:bg-slate-100/70 transition relative">
                        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-1.5" />
                        <span className="text-xs font-semibold text-slate-700 block">
                          Klik untuk memilih file foto QRIS
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Format PNG, JPG, JPEG atau SVG
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleQRISFileUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Atau URL Gambar QRIS:
                      </label>
                      <input
                        type="url"
                        value={qrisImageInput}
                        onChange={(e) => setQrisImageInput(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={savingQRIS}
                        className="bg-black hover:bg-neutral-800 text-white font-medium text-xs px-5 py-2.5 rounded-xl transition shadow-xs flex items-center gap-2"
                      >
                        {savingQRIS ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Menyimpan...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Simpan & Publikasikan QRIS
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Live Preview QRIS (Seperti yang dilihat pelanggan) */}
                <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                      Live Preview Tampilan Pelanggan
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Ini adalah bentuk kartu pembayaran yang akan dilihat pelanggan di portal resi.
                    </p>
                  </div>

                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-5 text-center space-y-3">
                    <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-[10px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                      <QrCode className="w-3.5 h-3.5" />
                      QRIS Nasional
                    </div>

                    <h4 className="font-extrabold text-slate-900 text-sm">
                      {qrisMerchantInput || 'AURA LAUNDRY OFFICIAL'}
                    </h4>

                    {qrisNmidInput && (
                      <span className="text-[10px] font-mono text-slate-500 block">
                        NMID: {qrisNmidInput}
                      </span>
                    )}

                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs inline-block mx-auto">
                      <img
                        src={qrisImageInput || DEFAULT_QRIS_SETTINGS.image_url}
                        alt="Preview QRIS"
                        className="w-48 h-48 object-contain mx-auto"
                      />
                    </div>

                    <div className="bg-white rounded-xl p-3 text-[11px] text-slate-600 space-y-1 border border-slate-200/70 shadow-2xs">
                      <span className="font-bold text-slate-900 block">Contoh Tagihan: Rp 36.000</span>
                      <p className="text-[10px] text-slate-500">
                        {qrisInfoInput || 'Buka GoPay, OVO, Dana, BCA, Livin, dll. lalu scan QR di atas.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================================== */}
          {/* VIEW 3: MANAJEMEN PAKET LAYANAN SECARA DINAMIS */}
          {/* ============================================================================== */}
          {activeTab === 'custom_packages' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Package className="w-5 h-5 text-slate-700" />
                      Katalog Paket Layanan Laundry
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kelola tarif resmi dan paket secara dinamis. Perubahan langsung terupdate otomatis di portal pelanggan!
                    </p>
                  </div>

                  <button
                    onClick={openNewPackageModal}
                    className="bg-black hover:bg-neutral-800 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-xs flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Paket Baru
                  </button>
                </div>

                {/* Table of Packages */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-y border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Nama Paket</th>
                        <th className="py-2.5 px-3">Kategori</th>
                        <th className="py-2.5 px-3">Tarif Resmi</th>
                        <th className="py-2.5 px-3">Satuan</th>
                        <th className="py-2.5 px-3">Durasi</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {packages.map((pkg) => (
                        <tr key={pkg.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-900 block">{pkg.name}</span>
                            <span className="text-[10px] text-slate-400 max-w-xs block truncate">{pkg.description}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="capitalize px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {pkg.service_type}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900 text-sm">
                            Rp {Number(pkg.price_per_unit).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            per {pkg.unit_name}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {pkg.estimated_duration_hours} Jam
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                                pkg.is_active
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {pkg.is_active ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => openEditPackageModal(pkg)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                              title="Edit Paket"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePackage(pkg.id, pkg.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Hapus Paket"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================================== */}
          {/* VIEW 4: AUDIT TRAIL KEAMANAN */}
          {/* ============================================================================== */}
          {activeTab === 'audit_logs' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-slate-700" />
                  Audit Trail Keamanan Operasional ({logs.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mencatat seluruh aksi staf kasir saat timbang pakaian, update status, dan verifikasi pembayaran QRIS di database admin.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-y border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">Staf / Kasir</th>
                      <th className="py-2.5 px-3">Aksi Keamanan</th>
                      <th className="py-2.5 px-3">Resi Target</th>
                      <th className="py-2.5 px-3">Detail Perubahan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {new Date(l.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {l.username}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-mono">
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
            </div>
          )}
        </main>
      </div>

      {/* ============================================================================== */}
      {/* MODAL 1: POS KASIR (INPUT TIMBANGAN, PILIH METODE & UNGGAH TAGIHAN) */}
      {/* ============================================================================== */}
      {selectedOrderForPOS && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-slate-300" />
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
              {/* Order Info */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs grid grid-cols-2 gap-2">
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
                  <span className="font-semibold text-slate-900">
                    Rp {unitRate.toLocaleString('id-ID')} / {unitName}
                  </span>
                </div>
              </div>

              {/* Input Berat KG atau PCS */}
              {isUnitSatuan ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Jumlah Item (PCS) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      autoFocus
                      placeholder="0"
                      value={pieceCount || ''}
                      onChange={(e) => setPieceCount(parseInt(e.target.value) || 0)}
                      className="w-full text-xl font-bold bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                    />
                    <span className="absolute right-3.5 top-3.5 font-bold text-slate-400 text-sm">PCS</span>
                  </div>
                </div>
              ) : (
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
                      className="w-full text-xl font-bold bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                    />
                    <span className="absolute right-3.5 top-3.5 font-bold text-slate-400 text-sm">KG</span>
                  </div>
                </div>
              )}

              {/* Diskon & Pilihan Metode Pembayaran HANYA QRIS & CASH */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">Diskon / Potongan (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={discountAmount || ''}
                    onChange={(e) => setDiscountAmount(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">Metode Pembayaran</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setPaymentMethod('QRIS'); setCashReceived(0); }}
                      className={`text-xs py-2 px-2 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition ${
                        paymentMethod === 'QRIS'
                          ? 'bg-black border-black text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      QRIS
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`text-xs py-2 px-2 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition ${
                        paymentMethod === 'CASH'
                          ? 'bg-black border-black text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      Tunai
                    </button>
                  </div>
                </div>
              </div>

              {/* Kalkulator Kembalian jika TUNAI (CASH) */}
              {paymentMethod === 'CASH' && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-amber-950 block">Uang Tunai Diterima (Rp)</label>
                    <input
                      type="number"
                      min={posTotal}
                      step="1000"
                      value={cashReceived || ''}
                      onChange={(e) => setCashReceived(parseInt(e.target.value) || 0)}
                      placeholder={`Min: ${posTotal.toLocaleString('id-ID')}`}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-black"
                    />
                  </div>
                  {cashReceived >= posTotal && posTotal > 0 && (
                    <div className="flex justify-between items-center font-bold text-emerald-800 text-sm pt-1 border-t border-amber-200">
                      <span>Kembalian Kasir:</span>
                      <span className="font-mono text-base">Rp {cashChange.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Total Calculation Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal ({posQty} {unitName} &times; Rp {unitRate.toLocaleString('id-ID')}):</span>
                  <span className="font-mono font-semibold">Rp {posSubtotal.toLocaleString('id-ID')}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Diskon:</span>
                    <span className="font-mono font-semibold">- Rp {discountAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-extrabold text-slate-900">
                  <span>TOTAL TAGIHAN:</span>
                  <span className="text-xl text-slate-900 font-mono">Rp {posTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* POS Action Buttons: Sesuai Alur QRIS vs CASH */}
              <div className="pt-2 flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForPOS(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>

                {/* Tombol Khusus QRIS: Unggah tagihan agar pelanggan bisa scan */}
                {paymentMethod === 'QRIS' && (
                  <button
                    type="button"
                    onClick={handleUploadQRISBill}
                    disabled={processingPOS}
                    className="bg-black hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <QrCode className="w-4 h-4" />
                    {processingPOS ? 'Mengunggah...' : 'Unggah Tagihan QRIS (Menunggu Bayar)'}
                  </button>
                )}

                {/* Tombol Konfirmasi Lunas / Tunai */}
                <button
                  type="submit"
                  disabled={processingPOS}
                  className="bg-black hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-60"
                >
                  <Receipt className="w-4 h-4" />
                  {processingPOS ? 'Memproses...' : paymentMethod === 'QRIS' ? 'Konfirmasi Lunas QRIS & Cetak' : 'Bayar Tunai & Cetak Struk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL 2: STRUK THERMAL KASIR 80MM */}
      {/* ============================================================================== */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden border border-slate-200">
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
                  <span>{receiptData.weight} {receiptData.unitName || 'KG'} &times; Rp {receiptData.pricePerUnit.toLocaleString('id-ID')}</span>
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
                {receiptData.paymentMethod === 'CASH' && receiptData.cashReceived > 0 && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Tunai Diterima:</span>
                      <span>Rp {receiptData.cashReceived.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>Kembalian:</span>
                      <span>Rp {receiptData.cashChange.toLocaleString('id-ID')}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Status:</span>
                  <span>LUNAS</span>
                </div>
              </div>

              <div className="text-center pt-3 border-t border-dashed border-slate-400 space-y-1 text-[10px] text-slate-500">
                <p>Terima kasih atas kepercayaan Anda.</p>
                <p>Simpan struk ini untuk bukti pengambilan cucian.</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between gap-2 print:hidden">
              <button
                onClick={() => setReceiptData(null)}
                className="w-1/2 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Tutup
              </button>
              <button
                onClick={printThermal}
                className="w-1/2 bg-black hover:bg-neutral-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL 3: TAMBAH / EDIT PAKET LAYANAN DINAMIS */}
      {/* ============================================================================== */}
      {isPackageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-slate-300" />
                <h3 className="font-bold text-sm sm:text-base">
                  {editingPackageId ? 'Edit Paket Layanan' : 'Tambah Paket Layanan Baru'}
                </h3>
              </div>
              <button onClick={() => setIsPackageModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePackage} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Nama Paket Layanan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={packageFormData.name}
                  onChange={(e) => setPackageFormData({ ...packageFormData, name: e.target.value })}
                  placeholder="Contoh: Cuci Karpet Premium"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">Kategori</label>
                  <select
                    value={packageFormData.service_type}
                    onChange={(e) => setPackageFormData({ ...packageFormData, service_type: e.target.value as 'kiloan' | 'satuan' | 'express' })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                  >
                    <option value="kiloan">Kiloan</option>
                    <option value="satuan">Satuan</option>
                    <option value="express">Express</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">Satuan Unit</label>
                  <select
                    value={packageFormData.unit_name}
                    onChange={(e) => setPackageFormData({ ...packageFormData, unit_name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                  >
                    <option value="KG">Kilogram (KG)</option>
                    <option value="PCS">Satuan (PCS)</option>
                    <option value="MTR">Meter (MTR)</option>
                    <option value="PASANG">Pasang</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Tarif per Satuan (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    required
                    value={packageFormData.price_per_unit}
                    onChange={(e) => setPackageFormData({ ...packageFormData, price_per_unit: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">Durasi Kerja (Jam)</label>
                  <input
                    type="number"
                    min="1"
                    value={packageFormData.estimated_duration_hours}
                    onChange={(e) => setPackageFormData({ ...packageFormData, estimated_duration_hours: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">Deskripsi Layanan</label>
                <textarea
                  rows={2}
                  value={packageFormData.description}
                  onChange={(e) => setPackageFormData({ ...packageFormData, description: e.target.value })}
                  placeholder="Keterangan proses pengerjaan layanan..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pkgActiveCheck"
                  checked={packageFormData.is_active}
                  onChange={(e) => setPackageFormData({ ...packageFormData, is_active: e.target.checked })}
                  className="rounded-md text-slate-900 focus:ring-slate-900"
                />
                <label htmlFor="pkgActiveCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Aktifkan paket ini di katalog pelanggan
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPackageModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-black hover:bg-neutral-800 text-white font-medium text-xs px-5 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Simpan Paket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL VERIFIKASI BUKTI TRANSFER QRIS */}
      {/* ============================================================================== */}
      {proofModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
            {/* Header Modal */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-slate-800 text-slate-200 rounded-xl">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Verifikasi Bukti Transfer Klien</h3>
                  <span className="text-[11px] text-slate-300 font-mono">
                    Resi: {proofModalOrder.order_code}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setProofModalOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Rincian Pesanan & Tagihan */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs grid grid-cols-2 gap-2.5">
                <div>
                  <span className="text-slate-500 block text-[11px]">Nama Pelanggan:</span>
                  <span className="font-bold text-slate-800">{proofModalOrder.customer_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">No. WhatsApp:</span>
                  <span className="font-mono font-semibold text-slate-800">{proofModalOrder.customer_phone}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Layanan:</span>
                  <span className="font-medium text-slate-800">{proofModalOrder.service_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Total Tagihan QRIS:</span>
                  <span className="font-mono font-extrabold text-slate-900 text-sm">
                    Rp {(proofModalOrder.total_amount || 0).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Tampilan Bukti Transfer Screenshot */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Foto / Screenshot Bukti Transfer:</span>
                  {proofModalOrder.payment_proof_url && (
                    <a
                      href={proofModalOrder.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900 font-semibold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Buka Ukuran Penuh
                    </a>
                  )}
                </div>

                {proofModalOrder.payment_proof_url ? (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-900/5 p-2 flex items-center justify-center">
                    <img
                      src={proofModalOrder.payment_proof_url}
                      alt={`Bukti Transfer ${proofModalOrder.order_code}`}
                      className="max-h-80 w-auto rounded-xl object-contain shadow-xs"
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-400 text-xs">
                    Pelanggan belum mengunggah bukti transfer.
                  </div>
                )}

                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Pastikan nominal bukti transfer sesuai dengan total tagihan <strong>Rp {(proofModalOrder.total_amount || 0).toLocaleString('id-ID')}</strong> sebelum mengonfirmasi status lunas.
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Modal Action */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setProofModalOrder(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Tutup (Belum Valid)
              </button>

              <button
                type="button"
                disabled={!proofModalOrder.payment_proof_url || verifyingInProofModal}
                onClick={handleAccFromProofModal}
                className="bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-medium text-xs px-5 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5"
              >
                {verifyingInProofModal ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Acc & Konfirmasi Lunas
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
