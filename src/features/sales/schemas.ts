import { z } from 'zod';

import type { ProductRow, SaleRow, SaleStatus } from '@/types/database';
import { parseBRLInputToCents } from '@/utils/formatters';

export interface SaleStatusMeta {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'neutral';
}

export const SALE_STATUS_META: Record<SaleStatus, SaleStatusMeta> = {
  confirmed: {
    label: 'Confirmada',
    tone: 'success',
  },
  draft: {
    label: 'Rascunho',
    tone: 'warning',
  },
  cancelled: {
    label: 'Cancelada',
    tone: 'error',
  },
};

export interface SaleCartItem {
  productId: string;
  productName: string;
  sku: string | null;
  unitPriceCents: number;
  unitCostCents: number;
  availableStockQty: number;
  quantity: number;
  primaryImagePath: string | null;
}

export interface SaleCartTotals {
  itemCount: number;
  totalUnits: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  estimatedCostCents: number;
  estimatedProfitCents: number;
  isDiscountExceedingSubtotal: boolean;
  stockOverflowItems: SaleCartItem[];
}

export function calculateCartTotals(
  items: SaleCartItem[],
  discountCentsInput: number,
): SaleCartTotals {
  let subtotalCents = 0;
  let estimatedCostCents = 0;
  let totalUnits = 0;
  const stockOverflowItems: SaleCartItem[] = [];

  for (const item of items) {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const lineTotal = Math.round(qty * item.unitPriceCents);
    const lineCost = Math.round(qty * item.unitCostCents);

    subtotalCents += lineTotal;
    estimatedCostCents += lineCost;
    totalUnits = Math.round((totalUnits + qty) * 1000) / 1000;

    if (qty > item.availableStockQty) {
      stockOverflowItems.push(item);
    }
  }

  const safeDiscount = Math.max(0, Math.round(discountCentsInput || 0));
  const isDiscountExceedingSubtotal = safeDiscount > subtotalCents;
  const appliedDiscount = Math.min(safeDiscount, subtotalCents);
  const totalCents = Math.max(0, subtotalCents - appliedDiscount);
  const estimatedProfitCents = totalCents - estimatedCostCents;

  return {
    itemCount: items.length,
    totalUnits,
    subtotalCents,
    discountCents: safeDiscount,
    totalCents,
    estimatedCostCents,
    estimatedProfitCents,
    isDiscountExceedingSubtotal,
    stockOverflowItems,
  };
}

export function addOrIncrementCartItem(
  cart: SaleCartItem[],
  product: ProductRow,
  delta = 1,
): SaleCartItem[] {
  const existingIndex = cart.findIndex((item) => item.productId === product.id);
  const availableStockQty = Number(product.current_stock_qty ?? 0);

  if (existingIndex === -1) {
    if (delta <= 0) {
      return cart;
    }

    return [
      ...cart,
      {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceCents: product.price_cents,
        unitCostCents: product.cost_cents,
        availableStockQty,
        quantity: Math.round(delta * 1000) / 1000,
        primaryImagePath: product.primary_image_path,
      },
    ];
  }

  return cart.map((item, idx) => {
    if (idx !== existingIndex) {
      return item;
    }
    const nextQty = Math.round((item.quantity + delta) * 1000) / 1000;
    return {
      ...item,
      availableStockQty,
      quantity: nextQty,
    };
  }).filter((item) => item.quantity > 0);
}

export function updateCartItemQuantity(
  cart: SaleCartItem[],
  productId: string,
  nextQuantity: number,
): SaleCartItem[] {
  if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    return cart.filter((item) => item.productId !== productId);
  }

  const rounded = Math.round(nextQuantity * 1000) / 1000;
  return cart.map((item) =>
    item.productId === productId ? { ...item, quantity: rounded } : item,
  );
}

export function createSaleIdempotencyKey(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `sale_${timestamp}_${randomSuffix}`;
}

export function parseDiscountBRLInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = parseBRLInputToCents(trimmed);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

export interface ValidateSaleSubmissionInput {
  items: SaleCartItem[];
  discountInput: string;
  notes: string;
  confirmImmediately: boolean;
}

export interface ValidatedSaleSubmissionResult {
  success: boolean;
  errorMessage?: string;
  payload?: {
    items: { product_id: string; quantity: number }[];
    discountCents: number;
    notes: string | null;
    confirmImmediately: boolean;
  };
}

export function validateSaleSubmission(
  input: ValidateSaleSubmissionInput,
): ValidatedSaleSubmissionResult {
  if (input.items.length === 0) {
    return {
      success: false,
      errorMessage: 'Adicione pelo menos um produto ao carrinho da venda.',
    };
  }

  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return {
        success: false,
        errorMessage: `Informe uma quantidade maior que zero para "${item.productName}".`,
      };
    }
  }

  const discountCents = parseDiscountBRLInput(input.discountInput);
  if (discountCents === null) {
    return {
      success: false,
      errorMessage: 'Informe um valor de desconto válido em reais (ex.: 10,00).',
    };
  }

  const totals = calculateCartTotals(input.items, discountCents);

  if (totals.isDiscountExceedingSubtotal) {
    return {
      success: false,
      errorMessage: 'O desconto não pode ser maior que o subtotal dos produtos.',
    };
  }

  if (input.confirmImmediately && totals.stockOverflowItems.length > 0) {
    const firstOverflow = totals.stockOverflowItems[0]!;
    return {
      success: false,
      errorMessage: `Estoque insuficiente para "${firstOverflow.productName}" (disponível: ${firstOverflow.availableStockQty} un., no carrinho: ${firstOverflow.quantity} un.). Salve como rascunho ou ajuste a quantidade.`,
    };
  }

  const cleanNotes = input.notes.trim();
  if (cleanNotes.length > 500) {
    return {
      success: false,
      errorMessage: 'A observação da venda deve ter no máximo 500 caracteres.',
    };
  }

  return {
    success: true,
    payload: {
      items: input.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
      discountCents,
      notes: cleanNotes ? cleanNotes : null,
      confirmImmediately: input.confirmImmediately,
    },
  };
}

export const cancelSaleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Informe o motivo do cancelamento (mínimo de 3 caracteres).')
    .max(300, 'O motivo deve ter no máximo 300 caracteres.'),
});

export interface SalesOverviewMetrics {
  totalCount: number;
  confirmedCount: number;
  draftCount: number;
  cancelledCount: number;
  confirmedRevenueCents: number;
  confirmedProfitCents: number;
  draftTotalCents: number;
}

export function calculateSalesOverviewMetrics(
  sales: SaleRow[],
): SalesOverviewMetrics {
  let confirmedCount = 0;
  let draftCount = 0;
  let cancelledCount = 0;
  let confirmedRevenueCents = 0;
  let confirmedProfitCents = 0;
  let draftTotalCents = 0;

  for (const sale of sales) {
    if (sale.status === 'confirmed') {
      confirmedCount += 1;
      confirmedRevenueCents += sale.total_cents;
      confirmedProfitCents += sale.estimated_profit_cents;
    } else if (sale.status === 'draft') {
      draftCount += 1;
      draftTotalCents += sale.total_cents;
    } else if (sale.status === 'cancelled') {
      cancelledCount += 1;
    }
  }

  return {
    totalCount: sales.length,
    confirmedCount,
    draftCount,
    cancelledCount,
    confirmedRevenueCents,
    confirmedProfitCents,
    draftTotalCents,
  };
}
