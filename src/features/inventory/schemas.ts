import { z } from 'zod';

import type { ProductRow, StockMovementType } from '@/types/database';

export const MANUAL_STOCK_MOVEMENT_TYPES = [
  'entry',
  'adjustment_in',
  'adjustment_out',
  'damage',
  'return_in',
] as const;

export type ManualStockMovementType =
  (typeof MANUAL_STOCK_MOVEMENT_TYPES)[number];

export interface StockMovementMeta {
  label: string;
  shortLabel: string;
  direction: 'in' | 'out';
  tone: 'success' | 'warning' | 'error' | 'neutral';
  requiresReason: boolean;
  helperText: string;
}

export const STOCK_MOVEMENT_META: Record<StockMovementType, StockMovementMeta> =
  {
    entry: {
      label: 'Entrada de mercadoria',
      shortLabel: 'Entrada',
      direction: 'in',
      tone: 'success',
      requiresReason: false,
      helperText: 'Compra de fornecedor ou reposição de estoque.',
    },
    return_in: {
      label: 'Devolução de cliente',
      shortLabel: 'Devolução',
      direction: 'in',
      tone: 'success',
      requiresReason: false,
      helperText: 'Produto devolvido em boas condições para venda.',
    },
    adjustment_in: {
      label: 'Ajuste positivo (+)',
      shortLabel: 'Ajuste (+)',
      direction: 'in',
      tone: 'warning',
      requiresReason: true,
      helperText: 'Correção de contagem física para mais (motivo obrigatório).',
    },
    adjustment_out: {
      label: 'Ajuste negativo (-)',
      shortLabel: 'Ajuste (-)',
      direction: 'out',
      tone: 'warning',
      requiresReason: true,
      helperText: 'Correção de contagem física para menos (motivo obrigatório).',
    },
    damage: {
      label: 'Perda / Avaria',
      shortLabel: 'Avaria',
      direction: 'out',
      tone: 'error',
      requiresReason: true,
      helperText:
        'Produto vencido, quebrado ou danificado (motivo obrigatório).',
    },
    sale_out: {
      label: 'Saída por venda',
      shortLabel: 'Venda',
      direction: 'out',
      tone: 'neutral',
      requiresReason: false,
      helperText: 'Baixa automática gerada ao confirmar venda.',
    },
    reversal: {
      label: 'Estorno de venda',
      shortLabel: 'Estorno',
      direction: 'in',
      tone: 'warning',
      requiresReason: false,
      helperText: 'Retorno automático ao cancelar uma venda.',
    },
  };

export function isIncomingMovement(movementType: StockMovementType): boolean {
  return STOCK_MOVEMENT_META[movementType].direction === 'in';
}

export function parsePositiveQuantityInput(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) {
    return null;
  }

  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999999) {
    return null;
  }

  return Math.round(parsed * 1000) / 1000;
}

export interface StockPreviewCalculation {
  delta: number;
  resultingStock: number;
  wouldGoNegative: boolean;
}

export function calculateStockPreview(
  currentStockQty: number,
  movementType: StockMovementType,
  quantity: number,
): StockPreviewCalculation {
  const safeCurrent = Number.isFinite(currentStockQty) ? currentStockQty : 0;
  const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const delta = isIncomingMovement(movementType) ? safeQty : -safeQty;
  const resultingStock = Math.round((safeCurrent + delta) * 1000) / 1000;

  return {
    delta,
    resultingStock,
    wouldGoNegative: resultingStock < 0,
  };
}

export function createStockIdempotencyKey(productId: string): string {
  const cleanProduct = productId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `stk_${cleanProduct || 'prod'}_${timestamp}_${randomSuffix}`;
}

export const stockAdjustmentFormSchema = z
  .object({
    productId: z.string().trim().min(1, 'Selecione um produto.'),
    movementType: z.enum(MANUAL_STOCK_MOVEMENT_TYPES, {
      message: 'Selecione o tipo de movimentação.',
    }),
    quantityInput: z
      .string()
      .trim()
      .min(1, 'Informe a quantidade movimentada.')
      .refine((val) => parsePositiveQuantityInput(val) !== null, {
        message: 'Informe uma quantidade válida maior que zero.',
      }),
    reason: z
      .string()
      .trim()
      .max(300, 'O motivo deve ter no máximo 300 caracteres.')
      .optional()
      .or(z.literal('')),
    currentStockQty: z.number().min(0),
  })
  .superRefine((values, ctx) => {
    const meta = STOCK_MOVEMENT_META[values.movementType];
    const cleanReason = values.reason?.trim() ?? '';

    if (meta.requiresReason && cleanReason.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message:
          'Informe um motivo com pelo menos 3 caracteres para ajustes ou avarias.',
      });
    }

    const quantity = parsePositiveQuantityInput(values.quantityInput);
    if (quantity !== null) {
      const preview = calculateStockPreview(
        values.currentStockQty,
        values.movementType,
        quantity,
      );
      if (preview.wouldGoNegative) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityInput'],
          message: `Saldo insuficiente para esta saída (disponível: ${values.currentStockQty} un.).`,
        });
      }
    }
  });

export type StockAdjustmentFormInput = z.infer<
  typeof stockAdjustmentFormSchema
>;

export interface NormalizedStockAdjustmentPayload {
  productId: string;
  movementType: ManualStockMovementType;
  quantity: number;
  reason: string | null;
}

export function normalizeStockAdjustmentPayload(
  values: StockAdjustmentFormInput,
): NormalizedStockAdjustmentPayload {
  const quantity = parsePositiveQuantityInput(values.quantityInput);
  if (quantity === null) {
    throw new Error('Quantidade inválida para ajuste de estoque.');
  }

  const cleanReason = values.reason?.trim() ?? '';

  return {
    productId: values.productId.trim(),
    movementType: values.movementType,
    quantity,
    reason: cleanReason ? cleanReason : null,
  };
}

export type InventoryStockHealth =
  | 'healthy'
  | 'at_minimum'
  | 'low'
  | 'out'
  | 'archived';

export function getProductStockHealth(
  product: Pick<
    ProductRow,
    'current_stock_qty' | 'min_stock_qty' | 'is_archived'
  >,
): InventoryStockHealth {
  if (product.is_archived) {
    return 'archived';
  }

  const current = Number(product.current_stock_qty ?? 0);
  const minimum = Number(product.min_stock_qty ?? 0);

  if (current <= 0) {
    return 'out';
  }

  if (minimum > 0 && current < minimum) {
    return 'low';
  }

  if (minimum > 0 && current === minimum) {
    return 'at_minimum';
  }

  return 'healthy';
}

export interface InventoryOverviewMetrics {
  totalActiveProducts: number;
  healthyCount: number;
  atMinimumCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  attentionCount: number;
  totalUnits: number;
  totalCostCents: number;
  totalRetailCents: number;
}

export function calculateInventoryOverviewMetrics(
  products: ProductRow[],
): InventoryOverviewMetrics {
  let totalActiveProducts = 0;
  let healthyCount = 0;
  let atMinimumCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalUnits = 0;
  let totalCostCents = 0;
  let totalRetailCents = 0;

  for (const product of products) {
    if (product.is_archived) {
      continue;
    }

    totalActiveProducts += 1;
    const current = Math.max(0, Number(product.current_stock_qty ?? 0));
    const health = getProductStockHealth(product);

    if (health === 'out') {
      outOfStockCount += 1;
    } else if (health === 'low') {
      lowStockCount += 1;
    } else if (health === 'at_minimum') {
      atMinimumCount += 1;
    } else {
      healthyCount += 1;
    }

    totalUnits = Math.round((totalUnits + current) * 1000) / 1000;
    totalCostCents += Math.round(current * (product.cost_cents ?? 0));
    totalRetailCents += Math.round(current * (product.price_cents ?? 0));
  }

  return {
    totalActiveProducts,
    healthyCount,
    atMinimumCount,
    lowStockCount,
    outOfStockCount,
    attentionCount: atMinimumCount + lowStockCount + outOfStockCount,
    totalUnits,
    totalCostCents,
    totalRetailCents,
  };
}
