import {
  customerFormSchema,
  type CustomerFormInput,
} from '@/features/customers/schemas';
import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type { CustomerRow } from '@/types/database';

function ensureConfigured(): void {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error(
      supabaseEnvStatus.reason ??
        'Configure o arquivo .env com as credenciais públicas do Supabase.',
    );
  }
}

export function mapCustomerServiceError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Não foi possível concluir a operação de clientes. Tente novamente.';
  }

  const raw =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

  if (raw.includes('relation') && raw.includes('customers')) {
    return 'A tabela de clientes (customers) ainda não existe no Supabase. Execute a migração SQL da Fase 2 no SQL Editor.';
  }
  if (raw.includes('row-level security') || raw.includes('42501')) {
    return 'Você não tem permissão para acessar ou alterar clientes deste espaço de trabalho.';
  }

  return 'Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente.';
}

export async function listWorkspaceCustomers(
  workspaceId: string,
): Promise<CustomerRow[]> {
  ensureConfigured();

  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, workspace_id, full_name, phone, email, address, notes, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .order('full_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getWorkspaceCustomerById(
  workspaceId: string,
  customerId: string,
): Promise<CustomerRow | null> {
  ensureConfigured();

  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, workspace_id, full_name, phone, email, address, notes, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function createWorkspaceCustomer(
  workspaceId: string,
  input: CustomerFormInput,
): Promise<CustomerRow> {
  ensureConfigured();

  const validated = customerFormSchema.parse(input);

  const { data, error } = await supabase
    .from('customers')
    .insert({
      workspace_id: workspaceId,
      full_name: validated.fullName,
      phone: validated.phone,
      email: validated.email,
      address: validated.address,
      notes: validated.notes,
      is_archived: false,
      archived_at: null,
    })
    .select(
      'id, workspace_id, full_name, phone, email, address, notes, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateWorkspaceCustomer(
  workspaceId: string,
  customerId: string,
  input: CustomerFormInput,
): Promise<CustomerRow> {
  ensureConfigured();

  const validated = customerFormSchema.parse(input);

  const { data, error } = await supabase
    .from('customers')
    .update({
      full_name: validated.fullName,
      phone: validated.phone,
      email: validated.email,
      address: validated.address,
      notes: validated.notes,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', customerId)
    .select(
      'id, workspace_id, full_name, phone, email, address, notes, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Arquiva ou restaura um cliente sem apagar nenhum registro histórico (RF-013).
 */
export async function setWorkspaceCustomerArchived(
  workspaceId: string,
  customerId: string,
  isArchived: boolean,
): Promise<CustomerRow> {
  ensureConfigured();

  const { data, error } = await supabase
    .from('customers')
    .update({
      is_archived: isArchived,
      archived_at: isArchived ? new Date().toISOString() : null,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', customerId)
    .select(
      'id, workspace_id, full_name, phone, email, address, notes, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}
