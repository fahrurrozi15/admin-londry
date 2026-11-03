export type AdminRole = 'superadmin' | 'cashier' | 'courier';

export interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  role: AdminRole;
  phone?: string;
  is_active: boolean;
  created_at?: string;
}

export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'QRIS' | 'DEBIT_EDC' | 'TRANSFER_BANK';

export interface PaymentRecord {
  id: string;
  payment_invoice_no: string;
  order_code: string;
  customer_name: string;
  service_type: string;
  actual_weight_kg: number;
  piece_count: number;
  price_per_unit: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  cashier_id?: string;
  paid_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'ORDER_RECEIVED'
  | 'COURIER_PICKUP'
  | 'IN_LAUNDRY'
  | 'WASHING_DRYING'
  | 'IRONING'
  | 'READY_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED';

// Unified Order representation (as returned by FDW or integrated dual-query)
export interface OperationalOrder {
  client_order_id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_type: string;
  service_name: string;
  estimated_weight_kg: number;
  customer_notes?: string;
  order_status: OrderStatus;
  order_created_at: string;
  
  // Payment info from Admin DB
  payment_id?: string;
  payment_invoice_no?: string;
  actual_weight_kg?: number;
  total_amount?: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  paid_at?: string;
}

export interface OperationalLog {
  id: string;
  user_id?: string;
  username: string;
  action_type: string;
  target_order_code: string;
  details?: Record<string, unknown>;
  created_at: string;
}
