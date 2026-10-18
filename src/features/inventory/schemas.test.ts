import { describe, expect, it } from 'vitest';

import type { ProductRow } from '@/types/database';

import {
  calculateInventoryOverviewMetrics,
  calculateStockPreview,
  createStockIdempotencyKey,
  getProductStockHealth,
  normalizeStockAdjustmentPayload,
  parsePositiveQuantityInput,
  stockAdjustmentFormSchema,
} from './schemas';

describe('inventory schemas and helpers', () => {
  it('parses positive integer and decimal quantities in pt-BR or dot format', () => {
    expect(parsePositiveQuantityInput('10')).toBe(10);
    expect(parsePositiveQuantityInput('2,5')).toBe(2.5);
    expect(parsePositiveQuantityInput('0.75')).toBe(0.75);
    expect(parsePositiveQuantityInput('0')).toBeNull();
    expect(parsePositiveQuantityInput('-3')).toBeNull();
    expect(parsePositiveQuantityInput('abc')).toBeNull();
  });

  it('calculates stock preview and flags negative stock', () => {
    expect(calculateStockPreview(5, 'entry', 3)).toEqual({
      delta: 3,
      resultingStock: 8,
      wouldGoNegative: false,
    });

    expect(calculateStockPreview(5, 'adjustment_out', 2)).toEqual({
      delta: -2,
      resultingStock: 3,
      wouldGoNegative: false,
    });

    expect(calculateStockPreview(2, 'damage', 5)).toEqual({
      delta: -5,
      resultingStock: -3,
      wouldGoNegative: true,
    });
  });

  it('generates valid idempotency keys within database constraints', () => {
    const key1 = createStockIdempotencyKey('prod-123456');
    const key2 = createStockIdempotencyKey('prod-123456');

    expect(key1.length).toBeGreaterThanOrEqual(6);
    expect(key1.length).toBeLessThanOrEqual(120);
    expect(key1).not.toEqual(key2);
  });

  it('validates entry without reason and normalizes payload', () => {
    const parsed = stockAdjustmentFormSchema.safeParse({
      productId: 'prod-1',
      movementType: 'entry',
      quantityInput: '12',
      reason: '  Compra mensal  ',
      currentStockQty: 4,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(normalizeStockAdjustmentPayload(parsed.data)).toEqual({
        productId: 'prod-1',
        movementType: 'entry',
        quantity: 12,
        reason: 'Compra mensal',
      });
    }
  });

  it('requires a reason for adjustments and damage movements', () => {
    const parsed = stockAdjustmentFormSchema.safeParse({
      productId: 'prod-1',
      movementType: 'damage',
      quantityInput: '1',
      reason: '',
      currentStockQty: 5,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['reason']);
    }
  });

  it('blocks outgoing movements that would result in negative stock (RF-034)', () => {
    const parsed = stockAdjustmentFormSchema.safeParse({
      productId: 'prod-1',
      movementType: 'adjustment_out',
      quantityInput: '6',
      reason: 'Contagem física menor',
      currentStockQty: 5,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['quantityInput']);
      expect(parsed.error.issues[0]?.message).toContain('Saldo insuficiente');
    }
  });

  it('computes stock health and overview metrics accurately', () => {
    const baseProduct: ProductRow = {
      id: 'p1',
      workspace_id: 'w1',
      category_id: null,
      name: 'Produto A',
      brand: null,
      sku: null,
      barcode: null,
      cost_cents: 1000,
      price_cents: 2500,
      min_stock_qty: 3,
      current_stock_qty: 10,
      description: null,
      primary_image_path: null,
      is_archived: false,
      archived_at: null,
      created_by: null,
      created_at: '2026-10-18T10:00:00Z',
      updated_at: '2026-10-18T10:00:00Z',
    };

    const products: ProductRow[] = [
      baseProduct,
      {
        ...baseProduct,
        id: 'p_min',
        name: 'Produto No Limite',
        current_stock_qty: 3,
        min_stock_qty: 3,
      },
      {
        ...baseProduct,
        id: 'p2',
        name: 'Produto Baixo',
        current_stock_qty: 2,
        min_stock_qty: 3,
      },
      {
        ...baseProduct,
        id: 'p3',
        name: 'Produto Zerado',
        current_stock_qty: 0,
        min_stock_qty: 2,
      },
      {
        ...baseProduct,
        id: 'p4',
        name: 'Produto Arquivado',
        current_stock_qty: 0,
        is_archived: true,
      },
    ];

    expect(getProductStockHealth(products[0]!)).toBe('healthy');
    expect(getProductStockHealth(products[1]!)).toBe('at_minimum');
    expect(getProductStockHealth(products[2]!)).toBe('low');
    expect(getProductStockHealth(products[3]!)).toBe('out');
    expect(getProductStockHealth(products[4]!)).toBe('archived');

    const metrics = calculateInventoryOverviewMetrics(products);
    expect(metrics).toEqual({
      totalActiveProducts: 4,
      healthyCount: 1,
      atMinimumCount: 1,
      lowStockCount: 1,
      outOfStockCount: 1,
      attentionCount: 3,
      totalUnits: 15,
      totalCostCents: 15000,
      totalRetailCents: 37500,
    });
  });
});
