import { describe, expect, it } from 'vitest';

import type { ProductRow, SaleRow } from '@/types/database';

import {
  addOrIncrementCartItem,
  calculateCartTotals,
  calculateSalesOverviewMetrics,
  cancelSaleSchema,
  createSaleIdempotencyKey,
  updateCartItemQuantity,
  validateSaleSubmission,
} from './schemas';

const mockProductA: ProductRow = {
  id: 'prod-a',
  workspace_id: 'ws-1',
  category_id: null,
  name: 'Perfume A',
  brand: 'Boticário',
  sku: 'SKU-A',
  barcode: null,
  cost_cents: 5000,
  price_cents: 12000,
  min_stock_qty: 2,
  current_stock_qty: 5,
  description: null,
  primary_image_path: null,
  is_archived: false,
  archived_at: null,
  created_by: null,
  created_at: '2026-10-18T10:00:00Z',
  updated_at: '2026-10-18T10:00:00Z',
};

const mockProductB: ProductRow = {
  ...mockProductA,
  id: 'prod-b',
  name: 'Creme B',
  sku: 'SKU-B',
  cost_cents: 2000,
  price_cents: 4500,
  current_stock_qty: 2,
};

describe('sales schemas and cart calculations', () => {
  it('adds, increments, and removes items from the cart', () => {
    let cart = addOrIncrementCartItem([], mockProductA, 1);
    expect(cart).toHaveLength(1);
    expect(cart[0]?.quantity).toBe(1);

    cart = addOrIncrementCartItem(cart, mockProductA, 2);
    expect(cart).toHaveLength(1);
    expect(cart[0]?.quantity).toBe(3);

    cart = addOrIncrementCartItem(cart, mockProductB, 1);
    expect(cart).toHaveLength(2);

    cart = updateCartItemQuantity(cart, 'prod-a', 0);
    expect(cart).toHaveLength(1);
    expect(cart[0]?.productId).toBe('prod-b');
  });

  it('calculates subtotal, discount, total, profit, and stock overflow', () => {
    let cart = addOrIncrementCartItem([], mockProductA, 2); // 24000 sell, 10000 cost
    cart = addOrIncrementCartItem(cart, mockProductB, 3); // 13500 sell, 6000 cost (overflows stock of 2)

    const totals = calculateCartTotals(cart, 1500);
    expect(totals.subtotalCents).toBe(37500);
    expect(totals.discountCents).toBe(1500);
    expect(totals.totalCents).toBe(36000);
    expect(totals.estimatedCostCents).toBe(16000);
    expect(totals.estimatedProfitCents).toBe(20000);
    expect(totals.isDiscountExceedingSubtotal).toBe(false);
    expect(totals.stockOverflowItems).toHaveLength(1);
    expect(totals.stockOverflowItems[0]?.productId).toBe('prod-b');
  });

  it('blocks confirming a sale when stock is insufficient, but allows saving as draft', () => {
    const cart = addOrIncrementCartItem([], mockProductB, 3); // available is 2

    const confirmResult = validateSaleSubmission({
      items: cart,
      discountInput: '0,00',
      notes: '',
      confirmImmediately: true,
    });
    expect(confirmResult.success).toBe(false);
    expect(confirmResult.errorMessage).toContain('Estoque insuficiente');

    const draftResult = validateSaleSubmission({
      items: cart,
      discountInput: '5,00',
      notes: 'Reserva para amanhã',
      confirmImmediately: false,
    });
    expect(draftResult.success).toBe(true);
    expect(draftResult.payload?.discountCents).toBe(500);
  });

  it('blocks discounts greater than the subtotal', () => {
    const cart = addOrIncrementCartItem([], mockProductB, 1); // 4500 cents

    const result = validateSaleSubmission({
      items: cart,
      discountInput: '50,00',
      notes: '',
      confirmImmediately: true,
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('desconto não pode ser maior');
  });

  it('validates cancellation reason and generates unique idempotency keys', () => {
    expect(cancelSaleSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(
      cancelSaleSchema.safeParse({ reason: 'Cliente desistiu da compra' })
        .success,
    ).toBe(true);

    const k1 = createSaleIdempotencyKey();
    const k2 = createSaleIdempotencyKey();
    expect(k1).not.toBe(k2);
    expect(k1.length).toBeGreaterThanOrEqual(6);
  });

  it('computes sales overview metrics separating confirmed, draft, and cancelled', () => {
    const baseSale: SaleRow = {
      id: 's1',
      workspace_id: 'ws-1',
      customer_id: null,
      customer_name_snapshot: 'Cliente 1',
      status: 'confirmed',
      subtotal_cents: 10000,
      discount_cents: 0,
      total_cents: 10000,
      estimated_cost_cents: 6000,
      estimated_profit_cents: 4000,
      item_count: 1,
      notes: null,
      cancellation_reason: null,
      idempotency_key: 'sale_1',
      confirmed_at: '2026-10-18T10:00:00Z',
      cancelled_at: null,
      created_by: null,
      created_at: '2026-10-18T10:00:00Z',
      updated_at: '2026-10-18T10:00:00Z',
    };

    const metrics = calculateSalesOverviewMetrics([
      baseSale,
      {
        ...baseSale,
        id: 's2',
        status: 'draft',
        total_cents: 5000,
        estimated_profit_cents: 2000,
      },
      {
        ...baseSale,
        id: 's3',
        status: 'cancelled',
        total_cents: 8000,
      },
    ]);

    expect(metrics).toEqual({
      totalCount: 3,
      confirmedCount: 1,
      draftCount: 1,
      cancelledCount: 1,
      confirmedRevenueCents: 10000,
      confirmedProfitCents: 4000,
      draftTotalCents: 5000,
    });
  });
});
