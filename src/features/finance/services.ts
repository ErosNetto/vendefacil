import {
  getInstallmentDisplayMeta,
  getTodayISODate,
} from '@/features/finance/schemas';
import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type {
  InstallmentRow,
  PaymentMethod,
  PaymentRow,
  RecordInstallmentPaymentRpcResult,
  UpdateWorkspaceFinanceSettingsRpcResult,
} from '@/types/database';

function ensureConfigured(): void {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error(
      supabaseEnvStatus.reason ??
        'Configure o arquivo .env com as credenciais públicas do Supabase.',
    );
  }
}

export type ReceivableFilterKey =
  | 'all_open'
  | 'overdue'
  | 'due_today'
  | 'upcoming'
  | 'paid';

export async function listWorkspaceInstallments(
  workspaceId: string,
  options?: {
    saleId?: string;
    customerId?: string;
    limit?: number;
  },
): Promise<InstallmentRow[]> {
  ensureConfigured();
  const limit = options?.limit ?? 300;

  let query = supabase
    .from('installments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('due_date', { ascending: true })
    .order('installment_number', { ascending: true })
    .limit(limit);

  if (options?.saleId) {
    query = query.eq('sale_id', options.saleId);
  }

  if (options?.customerId) {
    query = query.eq('customer_id', options.customerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as InstallmentRow[];
}

export async function listWorkspacePayments(
  workspaceId: string,
  options?: {
    saleId?: string;
    customerId?: string;
    limit?: number;
  },
): Promise<PaymentRow[]> {
  ensureConfigured();
  const limit = options?.limit ?? 150;

  let query = supabase
    .from('payments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('paid_at', { ascending: false })
    .limit(limit);

  if (options?.saleId) {
    query = query.eq('sale_id', options.saleId);
  }

  if (options?.customerId) {
    query = query.eq('customer_id', options.customerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PaymentRow[];
}

export interface WorkspaceReceivablesOverview {
  installments: InstallmentRow[];
  recentPayments: PaymentRow[];
  totalOpenPrincipalCents: number;
  overduePrincipalCents: number;
  overdueCount: number;
  dueTodayCount: number;
  receivedTotalCents: number;
}

export async function getWorkspaceReceivablesOverview(
  workspaceId: string,
): Promise<WorkspaceReceivablesOverview> {
  ensureConfigured();

  const [installments, recentPayments] = await Promise.all([
    listWorkspaceInstallments(workspaceId, { limit: 400 }),
    listWorkspacePayments(workspaceId, { limit: 100 }),
  ]);

  const todayISO = getTodayISODate();
  let totalOpenPrincipalCents = 0;
  let overduePrincipalCents = 0;
  let overdueCount = 0;
  let dueTodayCount = 0;

  for (const inst of installments) {
    if (inst.status === 'cancelled' || inst.status === 'paid') {
      continue;
    }

    totalOpenPrincipalCents += inst.remaining_principal_cents;
    const meta = getInstallmentDisplayMeta(inst, todayISO);
    if (meta.state === 'overdue') {
      overduePrincipalCents += inst.remaining_principal_cents;
      overdueCount += 1;
    } else if (meta.state === 'due_today') {
      dueTodayCount += 1;
    }
  }

  const receivedTotalCents = recentPayments
    .filter((p) => !p.is_reversed)
    .reduce((acc, p) => acc + p.amount_cents, 0);

  return {
    installments,
    recentPayments,
    totalOpenPrincipalCents,
    overduePrincipalCents,
    overdueCount,
    dueTodayCount,
    receivedTotalCents,
  };
}

export interface RecordInstallmentPaymentInput {
  workspaceId: string;
  installmentIds: string[];
  principalPaymentCents: number;
  fineCents: number;
  interestCents: number;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  idempotencyKey: string;
}

export async function recordWorkspaceInstallmentPayment(
  input: RecordInstallmentPaymentInput,
): Promise<RecordInstallmentPaymentRpcResult> {
  ensureConfigured();

  const { data, error } = await supabase.rpc('record_installment_payment', {
    p_workspace_id: input.workspaceId,
    p_installment_ids: input.installmentIds,
    p_principal_payment_cents: input.principalPaymentCents,
    p_fine_cents: input.fineCents,
    p_interest_cents: input.interestCents,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível registrar o recebimento.');
  }

  return data as RecordInstallmentPaymentRpcResult;
}

export interface UpdateWorkspaceFinanceSettingsInput {
  workspaceId: string;
  lateFeeEnabled: boolean;
  defaultFinePercent: number;
  defaultMonthlyInterestPercent: number;
  gracePeriodDays: number;
}

export async function updateWorkspaceFinanceSettings(
  input: UpdateWorkspaceFinanceSettingsInput,
): Promise<UpdateWorkspaceFinanceSettingsRpcResult> {
  ensureConfigured();

  const { data, error } = await supabase.rpc(
    'update_workspace_finance_settings',
    {
      p_workspace_id: input.workspaceId,
      p_late_fee_enabled: input.lateFeeEnabled,
      p_default_fine_percent: input.defaultFinePercent,
      p_default_monthly_interest_percent: input.defaultMonthlyInterestPercent,
      p_grace_period_days: input.gracePeriodDays,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível salvar as regras de cobrança.');
  }

  return data as UpdateWorkspaceFinanceSettingsRpcResult;
}

export function mapFinanceServiceError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Ocorreu um erro inesperado na operação financeira.';
  }

  const message = error.message;
  const normalized = message.toLowerCase();

  if (
    normalized.includes('relation "public.installments" does not exist') ||
    normalized.includes('relation "public.payments" does not exist') ||
    normalized.includes('could not find the table') ||
    normalized.includes('could not find the function public.record_installment_payment') ||
    normalized.includes('could not find the function public.update_workspace_finance_settings')
  ) {
    return 'As tabelas ou funções financeiras ainda não estão no Supabase. Execute a migração da Fase 6 no SQL Editor.';
  }

  if (
    normalized.includes('excede o saldo') ||
    normalized.includes('já está totalmente quitada') ||
    normalized.includes('parcela cancelada') ||
    normalized.includes('multa') ||
    normalized.includes('juros')
  ) {
    return message;
  }

  if (normalized.includes('row-level security') || normalized.includes('42501')) {
    return 'Você não tem permissão para realizar esta operação neste espaço de trabalho.';
  }

  if (normalized.includes('network request failed')) {
    return 'Falha de conexão com a internet. Verifique sua rede e tente novamente.';
  }

  return message || 'Não foi possível concluir a operação financeira.';
}
