import { supabase } from '@/lib/supabase';
import type {
  ExpenseCategoryRow,
  ExpenseRow,
  PaymentRow,
  SaleRow,
} from '@/types/database';
import {
  calculateFinancialReportMetrics,
  type FinancialReportOverview,
  type NormalizedExpensePayload,
} from './schemas';

export interface ListExpensesPaginatedParams {
  workspaceId: string;
  categoryId?: string | null;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export async function listWorkspaceExpenseCategories(
  workspaceId: string,
): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar categorias de despesa: ${error.message}`);
  }

  const list = (data ?? []) as ExpenseCategoryRow[];
  if (list.length === 0) {
    // Semear categorias padrão para o workspace se ainda não houver
    await supabase.rpc('seed_default_expense_categories', {
      target_workspace_id: workspaceId,
    });

    const refetch = await supabase
      .from('expense_categories')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true });

    return (refetch.data ?? []) as ExpenseCategoryRow[];
  }

  return list;
}

export async function listWorkspaceExpensesPaginated(
  params: ListExpensesPaginatedParams,
): Promise<{ items: ExpenseRow[]; totalCount: number }> {
  const {
    workspaceId,
    categoryId,
    search,
    startDate,
    endDate,
    page = 1,
    pageSize = 20,
  } = params;

  let query = supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('is_cancelled', false);

  if (categoryId && categoryId !== 'all') {
    query = query.eq('category_id', categoryId);
  }

  if (startDate) {
    query = query.gte('expense_date', startDate);
  }

  if (endDate) {
    query = query.lte('expense_date', endDate);
  }

  const cleanSearch = search?.trim();
  if (cleanSearch) {
    query = query.ilike('description', `%${cleanSearch}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Falha ao listar despesas: ${error.message}`);
  }

  return {
    items: (data ?? []) as ExpenseRow[],
    totalCount: count ?? 0,
  };
}

export async function createWorkspaceExpense(
  workspaceId: string,
  payload: NormalizedExpensePayload,
): Promise<ExpenseRow> {
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      workspace_id: workspaceId,
      category_id: payload.category_id,
      description: payload.description,
      amount_cents: payload.amount_cents,
      expense_date: payload.expense_date,
      payment_method: payload.payment_method,
      notes: payload.notes,
      created_by: userData.user?.id ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Falha ao registrar despesa: ${error.message}`);
  }

  return data as ExpenseRow;
}

export async function cancelWorkspaceExpense(params: {
  expenseId: string;
  workspaceId: string;
  reason?: string;
}): Promise<void> {
  const { expenseId, workspaceId, reason } = params;

  const { error } = await supabase
    .from('expenses')
    .update({
      is_cancelled: true,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason?.trim() || 'Cancelado pelo usuário',
    })
    .eq('id', expenseId)
    .eq('workspace_id', workspaceId);

  if (error) {
    throw new Error(`Falha ao cancelar despesa: ${error.message}`);
  }
}

export async function getWorkspaceExpenseById(
  workspaceId: string,
  expenseId: string,
): Promise<ExpenseRow | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', expenseId)
    .single();

  if (error) {
    return null;
  }

  return data as ExpenseRow;
}

export async function updateWorkspaceExpense(params: {
  workspaceId: string;
  expenseId: string;
  payload: NormalizedExpensePayload;
}): Promise<ExpenseRow> {
  const { workspaceId, expenseId, payload } = params;

  const { data, error } = await supabase
    .from('expenses')
    .update({
      category_id: payload.category_id,
      description: payload.description,
      amount_cents: payload.amount_cents,
      expense_date: payload.expense_date,
      payment_method: payload.payment_method,
      notes: payload.notes,
    })
    .eq('id', expenseId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar despesa: ${error.message}`);
  }

  return data as ExpenseRow;
}

export async function fetchWorkspaceFinancialReport(params: {
  workspaceId: string;
  startDateISO: string;
  endDateISO: string;
}): Promise<{
  report: FinancialReportOverview;
  sales: SaleRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  categories: ExpenseCategoryRow[];
}> {
  const { workspaceId, startDateISO, endDateISO } = params;

  const [salesRes, paymentsRes, expensesRes, categories] = await Promise.all([
    supabase
      .from('sales')
      .select('*')
      .eq('workspace_id', workspaceId)
      .neq('status', 'cancelled')
      .gte('created_at', `${startDateISO}T00:00:00Z`)
      .lte('created_at', `${endDateISO}T23:59:59Z`),
    supabase
      .from('payments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_reversed', false)
      .gte('paid_at', `${startDateISO}T00:00:00Z`)
      .lte('paid_at', `${endDateISO}T23:59:59Z`),
    supabase
      .from('expenses')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_cancelled', false)
      .gte('expense_date', startDateISO)
      .lte('expense_date', endDateISO),
    listWorkspaceExpenseCategories(workspaceId),
  ]);

  if (salesRes.error) {
    throw new Error(`Erro ao buscar vendas do relatório: ${salesRes.error.message}`);
  }
  if (paymentsRes.error) {
    throw new Error(`Erro ao buscar pagamentos do relatório: ${paymentsRes.error.message}`);
  }
  if (expensesRes.error) {
    throw new Error(`Erro ao buscar despesas do relatório: ${expensesRes.error.message}`);
  }

  const sales = (salesRes.data ?? []) as SaleRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const expenses = (expensesRes.data ?? []) as ExpenseRow[];

  const report = calculateFinancialReportMetrics({
    sales,
    payments,
    expenses,
    categories,
  });

  return {
    report,
    sales,
    payments,
    expenses,
    categories,
  };
}
