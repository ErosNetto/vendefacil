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
    };
    Enums: {
      workspace_role: WorkspaceRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
