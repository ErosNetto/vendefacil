import { describe, expect, it } from 'vitest';

import type { InstallmentRow, PaymentRow, ProductRow, SaleRow } from '@/types/database';
import {
  calculateDashboardMetrics,
  getDashboardDateCutoffs,
  groupInstallmentsForCalendar,
} from './schemas';

describe('Dashboard Schemas and Metrics', () => {
  const referenceDate = '2026-10-24';

  it('calcula datas de corte corretamente sem problemas de timezone', () => {
    const cutoffs = getDashboardDateCutoffs(referenceDate);
    expect(cutoffs.today).toBe('2026-10-24');
    expect(cutoffs.sevenDaysAgo).toBe('2026-10-18');
    expect(cutoffs.monthStart).toBe('2026-10-01');
  });

  const mockSales: SaleRow[] = [
    {
      id: 'sale-1',
      workspace_id: 'ws-1',
      customer_id: 'c-1',
      customer_name_snapshot: 'João',
      status: 'confirmed',
      total_cents: 10000,
      subtotal_cents: 10000,
      discount_cents: 0,
      estimated_cost_cents: 6000,
      estimated_profit_cents: 4000,
      item_count: 1,
      notes: null,
      cancellation_reason: null,
      idempotency_key: 'idem-1',
      confirmed_at: '2026-10-24T10:00:00Z',
      cancelled_at: null,
      created_by: 'u-1',
      created_at: '2026-10-24T10:00:00Z',
      updated_at: '2026-10-24T10:00:00Z',
    },
    {
      id: 'sale-2',
      workspace_id: 'ws-1',
      customer_id: 'c-2',
      customer_name_snapshot: 'Maria',
      status: 'confirmed',
      total_cents: 20000,
      subtotal_cents: 20000,
      discount_cents: 0,
      estimated_cost_cents: 12000,
      estimated_profit_cents: 8000,
      item_count: 2,
      notes: null,
      cancellation_reason: null,
      idempotency_key: 'idem-2',
      confirmed_at: '2026-10-20T14:00:00Z',
      cancelled_at: null,
      created_by: 'u-1',
      created_at: '2026-10-20T14:00:00Z',
      updated_at: '2026-10-20T14:00:00Z',
    },
    {
      id: 'sale-3',
      workspace_id: 'ws-1',
      customer_id: null,
      customer_name_snapshot: 'Rascunho',
      status: 'draft',
      total_cents: 5000,
      subtotal_cents: 5000,
      discount_cents: 0,
      estimated_cost_cents: 3000,
      estimated_profit_cents: 2000,
      item_count: 1,
      notes: null,
      cancellation_reason: null,
      idempotency_key: 'idem-3',
      confirmed_at: null,
      cancelled_at: null,
      created_by: 'u-1',
      created_at: '2026-10-24T11:00:00Z',
      updated_at: '2026-10-24T11:00:00Z',
    },
  ];

  const mockPayments: PaymentRow[] = [
    {
      id: 'pay-1',
      workspace_id: 'ws-1',
      sale_id: 'sale-1',
      customer_id: 'c-1',
      payment_method: 'pix',
      amount_cents: 10000,
      principal_allocated_cents: 10000,
      fine_cents: 0,
      interest_cents: 0,
      notes: null,
      idempotency_key: 'idem-pay-1',
      is_reversed: false,
      reversed_at: null,
      reversal_reason: null,
      created_by: 'u-1',
      paid_at: '2026-10-24T10:05:00Z',
      created_at: '2026-10-24T10:05:00Z',
    },
  ];

  const mockInstallments: InstallmentRow[] = [
    {
      id: 'inst-1',
      workspace_id: 'ws-1',
      sale_id: 'sale-2',
      customer_id: 'c-2',
      customer_name_snapshot: 'Maria',
      installment_number: 1,
      total_installments: 2,
      due_date: '2026-10-20', // Vencida
      principal_cents: 10000,
      paid_principal_cents: 0,
      remaining_principal_cents: 10000,
      paid_total_cents: 0,
      accrued_fine_cents: 0,
      accrued_interest_cents: 0,
      status: 'pending',
      paid_at: null,
      cancelled_at: null,
      notes: null,
      created_at: '2026-10-20T14:00:00Z',
      updated_at: '2026-10-20T14:00:00Z',
    },
    {
      id: 'inst-2',
      workspace_id: 'ws-1',
      sale_id: 'sale-2',
      customer_id: 'c-2',
      customer_name_snapshot: 'Maria',
      installment_number: 2,
      total_installments: 2,
      due_date: '2026-10-25', // Amanhã
      principal_cents: 10000,
      paid_principal_cents: 0,
      remaining_principal_cents: 10000,
      paid_total_cents: 0,
      accrued_fine_cents: 0,
      accrued_interest_cents: 0,
      status: 'pending',
      paid_at: null,
      cancelled_at: null,
      notes: null,
      created_at: '2026-10-20T14:00:00Z',
      updated_at: '2026-10-20T14:00:00Z',
    },
  ];

  const mockProducts: ProductRow[] = [
    {
      id: 'prod-1',
      workspace_id: 'ws-1',
      category_id: null,
      name: 'Camiseta',
      brand: null,
      sku: 'CAM-01',
      barcode: null,
      price_cents: 5000,
      cost_cents: 2500,
      current_stock_qty: 0, // Zerado
      min_stock_qty: 5,
      description: null,
      is_archived: false,
      archived_at: null,
      created_by: 'u-1',
      primary_image_path: null,
      created_at: '2026-10-18T00:00:00Z',
      updated_at: '2026-10-18T00:00:00Z',
    },
    {
      id: 'prod-2',
      workspace_id: 'ws-1',
      category_id: null,
      name: 'Calça',
      brand: null,
      sku: 'CAL-01',
      barcode: null,
      price_cents: 10000,
      cost_cents: 5000,
      current_stock_qty: 2, // Abaixo do mínimo (min=5)
      min_stock_qty: 5,
      description: null,
      is_archived: false,
      archived_at: null,
      created_by: 'u-1',
      primary_image_path: null,
      created_at: '2026-10-18T00:00:00Z',
      updated_at: '2026-10-18T00:00:00Z',
    },
  ];

  it('calcula métricas para o período "today"', () => {
    const metrics = calculateDashboardMetrics({
      sales: mockSales,
      payments: mockPayments,
      installments: mockInstallments,
      products: mockProducts,
      period: 'today',
      todayISO: referenceDate,
    });

    expect(metrics.totalSoldCents).toBe(10000);
    expect(metrics.salesCount).toBe(1);
    expect(metrics.draftSalesCount).toBe(1);
    expect(metrics.totalReceivedCents).toBe(10000);
    expect(metrics.paymentsCount).toBe(1);
    expect(metrics.totalToReceiveCents).toBe(0); // Nenhuma vence hoje
    expect(metrics.openInstallmentsCount).toBe(0);
    expect(metrics.toReceiveTitle).toBe('Vence hoje');
    expect(metrics.totalOverdueCents).toBe(10000);
    expect(metrics.overdueCount).toBe(1);
    expect(metrics.outOfStockCount).toBe(1);
    expect(metrics.lowStockCount).toBe(1);
  });

  it('calcula métricas para o período "all"', () => {
    const metrics = calculateDashboardMetrics({
      sales: mockSales,
      payments: mockPayments,
      installments: mockInstallments,
      products: mockProducts,
      period: 'all',
      todayISO: referenceDate,
    });

    expect(metrics.totalToReceiveCents).toBe(20000);
    expect(metrics.openInstallmentsCount).toBe(2);
    expect(metrics.toReceiveTitle).toBe('Carteira a receber');
    expect(metrics.totalOverdueCents).toBe(10000);
    expect(metrics.overdueCount).toBe(1);
  });

  it('calcula métricas para o período "month"', () => {
    const metrics = calculateDashboardMetrics({
      sales: mockSales,
      payments: mockPayments,
      installments: mockInstallments,
      products: mockProducts,
      period: 'month',
      todayISO: referenceDate,
    });

    expect(metrics.totalSoldCents).toBe(30000);
    expect(metrics.salesCount).toBe(2);
  });

  it('agrupa e filtra parcelas para agenda de vencimentos corretamente', () => {
    const overdueList = groupInstallmentsForCalendar({
      installments: mockInstallments,
      filter: 'overdue',
      todayISO: referenceDate,
    });
    expect(overdueList).toHaveLength(1);
    expect(overdueList[0]?.id).toBe('inst-1');

    const tomorrowList = groupInstallmentsForCalendar({
      installments: mockInstallments,
      filter: 'tomorrow',
      todayISO: referenceDate,
    });
    expect(tomorrowList).toHaveLength(1);
    expect(tomorrowList[0]?.id).toBe('inst-2');
  });
});
