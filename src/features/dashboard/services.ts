import { supabase } from '@/lib/supabase';
import type { InstallmentRow, PaymentRow, ProductRow, SaleRow } from '@/types/database';

export interface DashboardRawData {
  sales: SaleRow[];
  payments: PaymentRow[];
  installments: InstallmentRow[];
  products: ProductRow[];
  recentSales: SaleRow[];
}

export async function fetchDashboardRawData(
  workspaceId: string,
): Promise<DashboardRawData> {
  // Executar buscas em paralelo com isolamento estrito por workspace_id
  const [salesRes, paymentsRes, installmentsRes, productsRes] = await Promise.all([
    supabase
      .from('sales')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('paid_at', { ascending: false }),
    supabase
      .from('installments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false),
  ]);

  if (salesRes.error) {
    throw new Error(`Falha ao carregar vendas do dashboard: ${salesRes.error.message}`);
  }
  if (paymentsRes.error) {
    throw new Error(`Falha ao carregar recebimentos: ${paymentsRes.error.message}`);
  }
  if (installmentsRes.error) {
    throw new Error(`Falha ao carregar contas a receber: ${installmentsRes.error.message}`);
  }
  if (productsRes.error) {
    throw new Error(`Falha ao carregar estoque: ${productsRes.error.message}`);
  }

  const sales = (salesRes.data ?? []) as SaleRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const installments = (installmentsRes.data ?? []) as InstallmentRow[];
  const products = (productsRes.data ?? []) as ProductRow[];

  // As 5 vendas mais recentes
  const recentSales = sales.slice(0, 5);

  return {
    sales,
    payments,
    installments,
    products,
    recentSales,
  };
}

export async function fetchCalendarInstallments(
  workspaceId: string,
): Promise<InstallmentRow[]> {
  const { data, error } = await supabase
    .from('installments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('status', 'cancelled')
    .neq('status', 'paid')
    .gt('remaining_principal_cents', 0)
    .order('due_date', { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar agenda de vencimentos: ${error.message}`);
  }

  return (data ?? []) as InstallmentRow[];
}
