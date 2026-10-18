import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type {
  AdjustStockRpcResult,
  ProductRow,
  StockMovementRow,
  StockMovementType,
} from '@/types/database';

import type { ManualStockMovementType } from './schemas';

function ensureConfigured(): void {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error(
      supabaseEnvStatus.reason ??
        'Configure o arquivo .env com as credenciais públicas do Supabase.',
    );
  }
}

export type MovementHistoryFilter = 'all' | 'in' | 'out' | 'adjustments';

export interface StockMovementWithProduct extends StockMovementRow {
  productName: string;
  productSku: string | null;
}

export interface ListStockMovementsOptions {
  workspaceId: string;
  productId?: string;
  filter?: MovementHistoryFilter;
  limit?: number;
}

export async function listWorkspaceStockMovements(
  options: ListStockMovementsOptions,
): Promise<StockMovementWithProduct[]> {
  ensureConfigured();
  const limit = options.limit ?? 100;

  let query = supabase
    .from('stock_movements')
    .select('*')
    .eq('workspace_id', options.workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.productId) {
    query = query.eq('product_id', options.productId);
  }

  if (options.filter === 'in') {
    query = query.in('movement_type', [
      'entry',
      'adjustment_in',
      'return_in',
      'reversal',
    ]);
  } else if (options.filter === 'out') {
    query = query.in('movement_type', ['sale_out', 'adjustment_out', 'damage']);
  } else if (options.filter === 'adjustments') {
    query = query.in('movement_type', [
      'adjustment_in',
      'adjustment_out',
      'damage',
    ]);
  }

  const [{ data: movementsData, error: movementsError }, { data: productsData }] =
    await Promise.all([
      query,
      supabase
        .from('products')
        .select('id, name, sku')
        .eq('workspace_id', options.workspaceId),
    ]);

  if (movementsError) {
    throw new Error(movementsError.message);
  }

  const productMap = new Map<string, Pick<ProductRow, 'id' | 'name' | 'sku'>>();
  for (const prod of (productsData ?? []) as Pick<
    ProductRow,
    'id' | 'name' | 'sku'
  >[]) {
    productMap.set(prod.id, prod);
  }

  const rows = (movementsData ?? []) as StockMovementRow[];
  return rows.map((row) => {
    const prod = productMap.get(row.product_id);
    return {
      ...row,
      quantity_delta: Number(row.quantity_delta),
      previous_stock_qty: Number(row.previous_stock_qty),
      resulting_stock_qty: Number(row.resulting_stock_qty),
      productName: prod?.name ?? 'Produto',
      productSku: prod?.sku ?? null,
    };
  });
}

export interface AdjustStockInput {
  workspaceId: string;
  productId: string;
  movementType: ManualStockMovementType;
  quantity: number;
  reason?: string | null;
  idempotencyKey: string;
}

export async function adjustWorkspaceProductStock(
  input: AdjustStockInput,
): Promise<AdjustStockRpcResult> {
  ensureConfigured();

  const { data, error } = await supabase.rpc('adjust_stock', {
    p_workspace_id: input.workspaceId,
    p_product_id: input.productId,
    p_movement_type: input.movementType as StockMovementType,
    p_quantity: input.quantity,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível confirmar a movimentação de estoque.');
  }

  const result = data as AdjustStockRpcResult;
  return {
    ...result,
    quantity_delta: Number(result.quantity_delta),
    previous_stock_qty: Number(result.previous_stock_qty),
    resulting_stock_qty: Number(result.resulting_stock_qty),
  };
}

export function mapInventoryServiceError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Ocorreu um erro inesperado ao processar o estoque.';
  }

  const message = error.message;
  const normalized = message.toLowerCase();

  if (
    normalized.includes('relation "public.stock_movements" does not exist') ||
    normalized.includes('could not find the table') ||
    normalized.includes('could not find the function public.adjust_stock')
  ) {
    return 'A tabela ou função de estoque ainda não existe no Supabase. Execute a migração da Fase 4 no SQL Editor.';
  }

  if (normalized.includes('saldo de estoque insuficiente')) {
    return message;
  }

  if (normalized.includes('informe um motivo válido')) {
    return message;
  }

  if (normalized.includes('row-level security')) {
    return 'Você não tem permissão para movimentar estoque neste espaço de trabalho.';
  }

  if (normalized.includes('network request failed')) {
    return 'Falha de conexão com a internet. Verifique sua rede e tente novamente.';
  }

  return message || 'Não foi possível concluir a operação de estoque.';
}
