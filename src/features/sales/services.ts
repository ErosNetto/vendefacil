import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type {
  CancelSaleRpcResult,
  ConfirmDraftSaleRpcResult,
  CreateOrConfirmSaleRpcResult,
  SaleItemRow,
  SaleRow,
  SaleStatus,
} from '@/types/database';

function ensureConfigured(): void {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error(
      supabaseEnvStatus.reason ??
        'Configure o arquivo .env com as credenciais públicas do Supabase.',
    );
  }
}

export type SaleFilterKey = 'all' | SaleStatus;

export interface ListWorkspaceSalesOptions {
  workspaceId: string;
  statusFilter?: SaleFilterKey;
  customerId?: string;
  limit?: number;
}

export async function listWorkspaceSales(
  options: ListWorkspaceSalesOptions,
): Promise<SaleRow[]> {
  ensureConfigured();
  const limit = options.limit ?? 100;

  let query = supabase
    .from('sales')
    .select('*')
    .eq('workspace_id', options.workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.statusFilter && options.statusFilter !== 'all') {
    query = query.eq('status', options.statusFilter);
  }

  if (options.customerId) {
    query = query.eq('customer_id', options.customerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SaleRow[];
}

export interface SaleDetailResult {
  sale: SaleRow;
  items: SaleItemRow[];
}

export async function getWorkspaceSaleDetail(
  workspaceId: string,
  saleId: string,
): Promise<SaleDetailResult | null> {
  ensureConfigured();

  const [
    { data: saleData, error: saleError },
    { data: itemsData, error: itemsError },
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', saleId)
      .maybeSingle(),
    supabase
      .from('sale_items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true }),
  ]);

  if (saleError) {
    throw new Error(saleError.message);
  }
  if (itemsError) {
    throw new Error(itemsError.message);
  }
  if (!saleData) {
    return null;
  }

  const normalizedItems = ((itemsData ?? []) as SaleItemRow[]).map((item) => ({
    ...item,
    quantity: Number(item.quantity),
  }));

  return {
    sale: saleData as SaleRow,
    items: normalizedItems,
  };
}

export interface CreateOrConfirmSaleInput {
  workspaceId: string;
  customerId?: string | null;
  items: { product_id: string; quantity: number }[];
  discountCents: number;
  notes?: string | null;
  confirmImmediately: boolean;
  idempotencyKey: string;
  paymentMode?: 'cash' | 'installments';
  paymentMethod?: 'pix' | 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other';
  downPaymentCents?: number;
  installmentCount?: number;
  firstDueDateISO?: string | null;
}

export async function createOrConfirmWorkspaceSale(
  input: CreateOrConfirmSaleInput,
): Promise<CreateOrConfirmSaleRpcResult> {
  ensureConfigured();

  const { data, error } = await supabase.rpc('create_or_confirm_sale', {
    p_workspace_id: input.workspaceId,
    p_items: input.items,
    p_customer_id: input.customerId ?? null,
    p_discount_cents: input.discountCents,
    p_notes: input.notes ?? null,
    p_confirm_immediately: input.confirmImmediately,
    p_idempotency_key: input.idempotencyKey,
    p_payment_mode: input.paymentMode ?? 'cash',
    p_payment_method: input.paymentMethod ?? 'pix',
    p_down_payment_cents: input.downPaymentCents ?? 0,
    p_installment_count: input.installmentCount ?? 1,
    p_first_due_date: input.firstDueDateISO ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível registrar a venda.');
  }

  return data as CreateOrConfirmSaleRpcResult;
}

export interface UpdateDraftSaleInput {
  workspaceId: string;
  saleId: string;
  customerId?: string | null;
  items: { product_id: string; quantity: number }[];
  discountCents: number;
  notes?: string | null;
  confirmImmediately: boolean;
  paymentMode?: 'cash' | 'installments';
  paymentMethod?: 'pix' | 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other';
  downPaymentCents?: number;
  installmentCount?: number;
  firstDueDateISO?: string | null;
}

export async function updateWorkspaceDraftSale(
  input: UpdateDraftSaleInput,
): Promise<CreateOrConfirmSaleRpcResult> {
  ensureConfigured();

  const { data, error } = await supabase.rpc('update_draft_sale', {
    p_workspace_id: input.workspaceId,
    p_sale_id: input.saleId,
    p_items: input.items,
    p_customer_id: input.customerId ?? null,
    p_discount_cents: input.discountCents,
    p_notes: input.notes ?? null,
    p_confirm_immediately: input.confirmImmediately,
    p_payment_mode: input.paymentMode ?? 'cash',
    p_payment_method: input.paymentMethod ?? 'pix',
    p_down_payment_cents: input.downPaymentCents ?? 0,
    p_installment_count: input.installmentCount ?? 1,
    p_first_due_date: input.firstDueDateISO ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível atualizar o rascunho da venda.');
  }

  return data as CreateOrConfirmSaleRpcResult;
}

export async function confirmWorkspaceDraftSale(
  workspaceId: string,
  saleId: string,
): Promise<ConfirmDraftSaleRpcResult> {
  ensureConfigured();

  const { data, error } = await supabase.rpc('confirm_draft_sale', {
    p_workspace_id: workspaceId,
    p_sale_id: saleId,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível confirmar o rascunho da venda.');
  }

  return data as ConfirmDraftSaleRpcResult;
}

export async function cancelWorkspaceSale(
  workspaceId: string,
  saleId: string,
  reason: string,
): Promise<CancelSaleRpcResult> {
  ensureConfigured();

  const { data, error } = await supabase.rpc('cancel_sale', {
    p_workspace_id: workspaceId,
    p_sale_id: saleId,
    p_reason: reason,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível cancelar a venda.');
  }

  return data as CancelSaleRpcResult;
}

export async function linkSaleCustomer(
  workspaceId: string,
  saleId: string,
  customerId: string | null,
): Promise<{ customerId: string | null; customerName: string | null }> {
  ensureConfigured();

  const { data, error } = await supabase.rpc('link_sale_customer', {
    p_workspace_id: workspaceId,
    p_sale_id: saleId,
    p_customer_id: customerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    customerId: data.customer_id,
    customerName: data.customer_name_snapshot,
  };
}

export function mapSaleServiceError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Ocorreu um erro inesperado ao processar a venda.';
  }

  const message = error.message;
  const normalized = message.toLowerCase();

  if (
    normalized.includes('relation "public.sales" does not exist') ||
    normalized.includes('relation "public.sale_items" does not exist') ||
    normalized.includes('could not find the table') ||
    normalized.includes('could not find the function public.create_or_confirm_sale') ||
    normalized.includes('could not find the function public.update_draft_sale')
  ) {
    return 'As tabelas ou funções de vendas ainda não estão atualizadas no Supabase. Execute a migração da Fase 5 no SQL Editor.';
  }

  if (
    normalized.includes('estoque insuficiente') ||
    normalized.includes('desconto') ||
    normalized.includes('motivo válido') ||
    normalized.includes('arquivado') ||
    normalized.includes('apenas vendas em rascunho')
  ) {
    return message;
  }

  if (normalized.includes('row-level security') || normalized.includes('42501')) {
    return 'Você não tem permissão para realizar vendas neste espaço de trabalho.';
  }

  if (normalized.includes('network request failed')) {
    return 'Falha de conexão com a internet. Verifique sua rede e tente novamente.';
  }

  return message || 'Não foi possível concluir a operação de venda.';
}
