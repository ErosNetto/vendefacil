import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type {
  CreateWorkspaceRpcResult,
  WorkspaceMembershipSummary,
  WorkspaceRow,
} from '@/types/database';

function ensureConfigured(): void {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error(
      supabaseEnvStatus.reason ??
        'Configure o arquivo .env com as credenciais públicas do Supabase.',
    );
  }
}

export async function fetchUserWorkspaces(
  userId: string,
): Promise<WorkspaceMembershipSummary[]> {
  ensureConfigured();

  const { data: memberships, error: membersError } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (membersError) {
    throw membersError;
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  const workspaceIds = memberships.map((item) => item.workspace_id);
  const { data: workspacesData, error: workspacesError } = await supabase
    .from('workspaces')
    .select('id, name, owner_id, currency_code, created_at, updated_at')
    .in('id', workspaceIds);

  if (workspacesError) {
    throw workspacesError;
  }

  const workspaceById = new Map<string, WorkspaceRow>(
    (workspacesData ?? []).map((ws) => [ws.id, ws]),
  );

  const summaries: WorkspaceMembershipSummary[] = [];
  for (const membership of memberships) {
    const workspace = workspaceById.get(membership.workspace_id);
    if (workspace) {
      summaries.push({
        membershipId: membership.id,
        role: membership.role,
        isActive: membership.is_active,
        workspace,
      });
    }
  }

  return summaries;
}

/**
 * Cria um workspace e vincula o usuário autenticado como `owner` de maneira
 * atômica no PostgreSQL via RPC `create_workspace`.
 */
export async function createWorkspaceViaRpc(
  name: string,
): Promise<CreateWorkspaceRpcResult> {
  ensureConfigured();

  const cleanName = name.trim();
  const { data, error } = await supabase.rpc('create_workspace', {
    p_name: cleanName,
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object' || !('workspace_id' in data)) {
    throw new Error('Resposta inválida ao criar espaço de trabalho.');
  }

  return data as CreateWorkspaceRpcResult;
}
