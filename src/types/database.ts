export type WorkspaceRole = 'owner' | 'admin' | 'seller';

export type ProfileRow = {
  id: string;
  full_name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRow = {
  id: string;
  name: string;
  owner_id: string;
  currency_code: 'BRL';
  late_fee_enabled?: boolean;
  default_fine_percent?: number;
  default_monthly_interest_percent?: number;
  grace_period_days?: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CustomerRow = {
  id: string;
  workspace_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  workspace_id: string;
  name: string;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  workspace_id: string;
  category_id: string | null;
  name: string;
  brand: string | null;
  sku: string | null;
  barcode: string | null;
  cost_cents: number;
  price_cents: number;
  min_stock_qty: number;
  current_stock_qty: number;
  description: string | null;
  primary_image_path: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductImageRow = {
  id: string;
  workspace_id: string;
  product_id: string;
  storage_path: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  file_size_bytes: number;
  created_by: string | null;
  created_at: string;
};

export type StockMovementType =
  | 'entry'
  | 'sale_out'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'damage'
  | 'return_in'
  | 'reversal';

export type StockMovementRow = {
  id: string;
  workspace_id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity_delta: number;
  previous_stock_qty: number;
  resulting_stock_qty: number;
  reason: string | null;
  idempotency_key: string;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type AdjustStockRpcResult = {
  movement_id: string;
  workspace_id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity_delta: number;
  previous_stock_qty: number;
  resulting_stock_qty: number;
  reason: string | null;
  created_at: string;
  idempotent_replay: boolean;
};

export type SaleStatus = 'draft' | 'confirmed' | 'cancelled';

export type PaymentMethod =
  | 'pix'
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'other';

export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

export type SalePaymentMode = 'cash' | 'installments';

export type SaleRow = {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  status: SaleStatus;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  estimated_cost_cents: number;
  estimated_profit_cents: number;
  item_count: number;
  notes: string | null;
  cancellation_reason: string | null;
  idempotency_key: string;
  payment_mode?: SalePaymentMode;
  payment_method?: PaymentMethod;
  down_payment_cents?: number;
  installment_count?: number;
  first_due_date?: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SaleItemRow = {
  id: string;
  workspace_id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number;
  line_total_cents: number;
  line_cost_cents: number;
  created_at: string;
};

export type InstallmentRow = {
  id: string;
  workspace_id: string;
  sale_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  installment_number: number;
  total_installments: number;
  due_date: string;
  principal_cents: number;
  paid_principal_cents: number;
  accrued_fine_cents: number;
  accrued_interest_cents: number;
  paid_total_cents: number;
  remaining_principal_cents: number;
  status: InstallmentStatus;
  paid_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  workspace_id: string;
  sale_id: string | null;
  customer_id: string | null;
  payment_method: PaymentMethod;
  amount_cents: number;
  principal_allocated_cents: number;
  fine_cents: number;
  interest_cents: number;
  paid_at: string;
  notes: string | null;
  idempotency_key: string;
  is_reversed: boolean;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type PaymentAllocationRow = {
  id: string;
  workspace_id: string;
  payment_id: string;
  installment_id: string;
  principal_allocated_cents: number;
  fine_allocated_cents: number;
  interest_allocated_cents: number;
  total_allocated_cents: number;
  created_at: string;
};

export type ExpenseCategoryRow = {
  id: string;
  workspace_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string;
};

export type ExpenseRow = {
  id: string;
  workspace_id: string;
  category_id: string | null;
  description: string;
  amount_cents: number;
  expense_date: string;
  payment_method: PaymentMethod;
  notes: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LinkSaleCustomerRpcResult = {
  success: boolean;
  sale_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
};

export type RecordInstallmentPaymentRpcResult = {
  payment_id: string;
  workspace_id: string;
  amount_cents: number;
  principal_allocated_cents: number;
  fine_cents: number;
  interest_cents: number;
  paid_at: string;
  idempotent_replay: boolean;
};

export type UpdateWorkspaceFinanceSettingsRpcResult = {
  workspace_id: string;
  late_fee_enabled: boolean;
  default_fine_percent: number;
  default_monthly_interest_percent: number;
  grace_period_days: number;
};

export type CreateOrConfirmSaleRpcResult = {
  sale_id: string;
  workspace_id: string;
  status: SaleStatus;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  estimated_profit_cents: number;
  item_count: number;
  created_at: string;
  idempotent_replay: boolean;
};

export type ConfirmDraftSaleRpcResult = {
  sale_id: string;
  status: SaleStatus;
  confirmed_at: string | null;
  idempotent_replay: boolean;
};

export type CancelSaleRpcResult = {
  sale_id: string;
  status: SaleStatus;
  cancelled_at: string | null;
  idempotent_replay: boolean;
};

export type CreateWorkspaceRpcResult = {
  workspace_id: string;
  name: string;
  owner_id: string;
  currency_code: 'BRL';
  role: WorkspaceRole;
  created_at: string;
};

export interface WorkspaceMembershipSummary {
  membershipId: string;
  role: WorkspaceRole;
  isActive: boolean;
  workspace: WorkspaceRow;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          full_name?: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: WorkspaceRow;
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          currency_code?: 'BRL';
          late_fee_enabled?: boolean;
          default_fine_percent?: number;
          default_monthly_interest_percent?: number;
          grace_period_days?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          late_fee_enabled?: boolean;
          default_fine_percent?: number;
          default_monthly_interest_percent?: number;
          grace_period_days?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: WorkspaceMemberRow;
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: WorkspaceRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: WorkspaceRole;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: {
          id?: string;
          workspace_id: string;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          action?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: CustomerRow;
        Insert: {
          id?: string;
          workspace_id: string;
          full_name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: CategoryRow;
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          is_archived?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          is_archived?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: ProductRow;
        Insert: {
          id?: string;
          workspace_id: string;
          category_id?: string | null;
          name: string;
          brand?: string | null;
          sku?: string | null;
          barcode?: string | null;
          cost_cents?: number;
          price_cents: number;
          min_stock_qty?: number;
          current_stock_qty?: number;
          description?: string | null;
          primary_image_path?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          name?: string;
          brand?: string | null;
          sku?: string | null;
          barcode?: string | null;
          cost_cents?: number;
          price_cents?: number;
          min_stock_qty?: number;
          current_stock_qty?: number;
          description?: string | null;
          primary_image_path?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      product_images: {
        Row: ProductImageRow;
        Insert: {
          id?: string;
          workspace_id: string;
          product_id: string;
          storage_path: string;
          mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
          file_size_bytes: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          storage_path?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: StockMovementRow;
        Insert: {
          id?: string;
          workspace_id: string;
          product_id: string;
          movement_type: StockMovementType;
          quantity_delta: number;
          previous_stock_qty: number;
          resulting_stock_qty: number;
          reason?: string | null;
          idempotency_key: string;
          reference_type?: string | null;
          reference_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_product_workspace_fkey';
            columns: ['product_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      sales: {
        Row: SaleRow;
        Insert: {
          id?: string;
          workspace_id: string;
          customer_id?: string | null;
          customer_name_snapshot?: string | null;
          status?: SaleStatus;
          subtotal_cents?: number;
          discount_cents?: number;
          total_cents?: number;
          estimated_cost_cents?: number;
          estimated_profit_cents?: number;
          item_count?: number;
          notes?: string | null;
          cancellation_reason?: string | null;
          idempotency_key: string;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: SaleStatus;
          notes?: string | null;
          cancellation_reason?: string | null;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_customer_workspace_fkey';
            columns: ['customer_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      sale_items: {
        Row: SaleItemRow;
        Insert: {
          id?: string;
          workspace_id: string;
          sale_id: string;
          product_id: string;
          product_name_snapshot: string;
          sku_snapshot?: string | null;
          quantity: number;
          unit_price_cents: number;
          unit_cost_cents?: number;
          line_total_cents: number;
          line_cost_cents?: number;
          created_at?: string;
        };
        Update: {
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_items_sale_workspace_fkey';
            columns: ['sale_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      installments: {
        Row: InstallmentRow;
        Insert: {
          id?: string;
          workspace_id: string;
          sale_id: string;
          customer_id?: string | null;
          customer_name_snapshot?: string | null;
          installment_number: number;
          total_installments: number;
          due_date: string;
          principal_cents: number;
          paid_principal_cents?: number;
          accrued_fine_cents?: number;
          accrued_interest_cents?: number;
          paid_total_cents?: number;
          remaining_principal_cents: number;
          status?: InstallmentStatus;
          paid_at?: string | null;
          cancelled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: InstallmentStatus;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: PaymentRow;
        Insert: {
          id?: string;
          workspace_id: string;
          sale_id?: string | null;
          customer_id?: string | null;
          payment_method?: PaymentMethod;
          amount_cents: number;
          principal_allocated_cents: number;
          fine_cents?: number;
          interest_cents?: number;
          paid_at?: string;
          notes?: string | null;
          idempotency_key: string;
          is_reversed?: boolean;
          reversed_at?: string | null;
          reversal_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          notes?: string | null;
        };
        Relationships: [];
      };
      payment_allocations: {
        Row: PaymentAllocationRow;
        Insert: {
          id?: string;
          workspace_id: string;
          payment_id: string;
          installment_id: string;
          principal_allocated_cents: number;
          fine_allocated_cents?: number;
          interest_allocated_cents?: number;
          total_allocated_cents: number;
          created_at?: string;
        };
        Update: {
          total_allocated_cents?: number;
        };
        Relationships: [];
      };
      expense_categories: {
        Row: ExpenseCategoryRow;
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          icon?: string | null;
          color?: string | null;
        };
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: {
          id?: string;
          workspace_id: string;
          category_id?: string | null;
          description: string;
          amount_cents: number;
          expense_date?: string;
          payment_method?: PaymentMethod;
          notes?: string | null;
          is_cancelled?: boolean;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          description?: string;
          amount_cents?: number;
          expense_date?: string;
          payment_method?: PaymentMethod;
          notes?: string | null;
          is_cancelled?: boolean;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      seed_default_expense_categories: {
        Args: {
          target_workspace_id: string;
        };
        Returns: void;
      };
      create_workspace: {
        Args: {
          p_name: string;
        };
        Returns: CreateWorkspaceRpcResult;
      };
      add_workspace_member: {
        Args: {
          p_workspace_id: string;
          p_target_user_id: string;
          p_role?: WorkspaceRole;
        };
        Returns: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          is_active: boolean;
        };
      };
      is_workspace_member: {
        Args: {
          p_workspace_id: string;
        };
        Returns: boolean;
      };
      has_workspace_role: {
        Args: {
          p_workspace_id: string;
          p_allowed_roles: WorkspaceRole[];
        };
        Returns: boolean;
      };
      can_access_product_image_object: {
        Args: {
          p_bucket_id: string;
          p_object_name: string;
        };
        Returns: boolean;
      };
      adjust_stock: {
        Args: {
          p_workspace_id: string;
          p_product_id: string;
          p_movement_type: StockMovementType;
          p_quantity: number;
          p_reason?: string | null;
          p_idempotency_key?: string;
        };
        Returns: AdjustStockRpcResult;
      };
      create_or_confirm_sale: {
        Args: {
          p_workspace_id: string;
          p_items: { product_id: string; quantity: number }[];
          p_customer_id?: string | null;
          p_discount_cents?: number;
          p_notes?: string | null;
          p_confirm_immediately?: boolean;
          p_idempotency_key?: string;
          p_payment_mode?: SalePaymentMode;
          p_payment_method?: PaymentMethod;
          p_down_payment_cents?: number;
          p_installment_count?: number;
          p_first_due_date?: string | null;
        };
        Returns: CreateOrConfirmSaleRpcResult;
      };
      confirm_draft_sale: {
        Args: {
          p_workspace_id: string;
          p_sale_id: string;
        };
        Returns: ConfirmDraftSaleRpcResult;
      };
      cancel_sale: {
        Args: {
          p_workspace_id: string;
          p_sale_id: string;
          p_reason: string;
        };
        Returns: CancelSaleRpcResult;
      };
      update_draft_sale: {
        Args: {
          p_workspace_id: string;
          p_sale_id: string;
          p_items: { product_id: string; quantity: number }[];
          p_customer_id?: string | null;
          p_discount_cents?: number;
          p_notes?: string | null;
          p_confirm_immediately?: boolean;
          p_payment_mode?: SalePaymentMode;
          p_payment_method?: PaymentMethod;
          p_down_payment_cents?: number;
          p_installment_count?: number;
          p_first_due_date?: string | null;
        };
        Returns: CreateOrConfirmSaleRpcResult;
      };
      update_workspace_finance_settings: {
        Args: {
          p_workspace_id: string;
          p_late_fee_enabled: boolean;
          p_default_fine_percent: number;
          p_default_monthly_interest_percent: number;
          p_grace_period_days: number;
        };
        Returns: UpdateWorkspaceFinanceSettingsRpcResult;
      };
      record_installment_payment: {
        Args: {
          p_workspace_id: string;
          p_installment_ids: string[];
          p_principal_payment_cents: number;
          p_fine_cents?: number;
          p_interest_cents?: number;
          p_payment_method?: PaymentMethod;
          p_notes?: string | null;
          p_idempotency_key?: string;
        };
        Returns: RecordInstallmentPaymentRpcResult;
      };
      link_sale_customer: {
        Args: {
          p_workspace_id: string;
          p_sale_id: string;
          p_customer_id?: string | null;
        };
        Returns: LinkSaleCustomerRpcResult;
      };
    };
    Enums: {
      workspace_role: WorkspaceRole;
      stock_movement_type: StockMovementType;
      sale_status: SaleStatus;
      payment_method: PaymentMethod;
      installment_status: InstallmentStatus;
      sale_payment_mode: SalePaymentMode;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
