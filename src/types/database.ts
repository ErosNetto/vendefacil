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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
    };
    Enums: {
      workspace_role: WorkspaceRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
