import { describe, expect, it } from 'vitest';

import type { ExpenseCategoryRow, ExpenseRow, PaymentRow, SaleRow } from '@/types/database';
import {
  buildFinancialReportCSV,
  calculateFinancialReportMetrics,
  normalizeExpensePayload,
} from './schemas';

describe('Expenses and Financial Report Schemas', () => {
  it('normaliza payload de despesa com sucesso', () => {
    const payload = normalizeExpensePayload({
      description: 'Conta de Energia',
      amountInput: '150,50',
      expenseDate: '2026-10-24',
      categoryId: 'cat-1',
      paymentMethod: 'pix',
      notes: 'Referente ao mês passado',
    });

    expect(payload.description).toBe('Conta de Energia');
    expect(payload.amount_cents).toBe(15050);
    expect(payload.expense_date).toBe('2026-10-24');
    expect(payload.category_id).toBe('cat-1');
    expect(payload.payment_method).toBe('pix');
    expect(payload.notes).toBe('Referente ao mês passado');
  });

  const mockCategories: ExpenseCategoryRow[] = [
    {
      id: 'cat-1',
      workspace_id: 'ws-1',
      name: 'Energia e Água',
      icon: 'flash-outline',
      color: '#059669',
      created_at: '2026-10-18T00:00:00Z',
    },
    {
      id: 'cat-2',
      workspace_id: 'ws-1',
      name: 'Aluguel',
      icon: 'business-outline',
      color: '#2563EB',
      created_at: '2026-10-18T00:00:00Z',
    },
  ];

  const mockSales: SaleRow[] = [
    {
      id: 's-1',
      workspace_id: 'ws-1',
      customer_id: 'c-1',
      customer_name_snapshot: 'Cliente 1',
      status: 'confirmed',
      total_cents: 100000, // R$ 1.000,00
      subtotal_cents: 100000,
      discount_cents: 0,
      estimated_cost_cents: 60000, // CMV R$ 600,00 (Lucro Bruto = R$ 400,00)
      estimated_profit_cents: 40000,
      item_count: 5,
      notes: null,
      cancellation_reason: null,
      idempotency_key: 'idem-1',
      confirmed_at: '2026-10-20T10:00:00Z',
      cancelled_at: null,
      created_by: 'u-1',
      created_at: '2026-10-20T10:00:00Z',
      updated_at: '2026-10-20T10:00:00Z',
    },
  ];

  const mockPayments: PaymentRow[] = [
    {
      id: 'p-1',
      workspace_id: 'ws-1',
      sale_id: 's-1',
      customer_id: 'c-1',
      payment_method: 'pix',
      amount_cents: 80000, // R$ 800,00 recebidos no caixa
      principal_allocated_cents: 80000,
      fine_cents: 0,
      interest_cents: 0,
      notes: null,
      idempotency_key: 'idem-p-1',
      is_reversed: false,
      reversed_at: null,
      reversal_reason: null,
      created_by: 'u-1',
      paid_at: '2026-10-20T10:00:00Z',
      created_at: '2026-10-20T10:00:00Z',
    },
  ];

  const mockExpenses: ExpenseRow[] = [
    {
      id: 'e-1',
      workspace_id: 'ws-1',
      category_id: 'cat-1',
      description: 'Luz Outubro',
      amount_cents: 10000, // R$ 100,00
      expense_date: '2026-10-20',
      payment_method: 'pix',
      notes: null,
      is_cancelled: false,
      cancelled_at: null,
      cancellation_reason: null,
      created_by: 'u-1',
      created_at: '2026-10-20T10:00:00Z',
      updated_at: '2026-10-20T10:00:00Z',
    },
    {
      id: 'e-2',
      workspace_id: 'ws-1',
      category_id: 'cat-2',
      description: 'Aluguel Outubro',
      amount_cents: 20000, // R$ 200,00
      expense_date: '2026-10-20',
      payment_method: 'bank_transfer',
      notes: null,
      is_cancelled: false,
      cancelled_at: null,
      cancellation_reason: null,
      created_by: 'u-1',
      created_at: '2026-10-20T10:00:00Z',
      updated_at: '2026-10-20T10:00:00Z',
    },
  ];

  it('calcula métricas de DRE e fluxo de caixa corretamente', () => {
    const report = calculateFinancialReportMetrics({
      sales: mockSales,
      payments: mockPayments,
      expenses: mockExpenses,
      categories: mockCategories,
    });

    // DRE
    expect(report.grossRevenueCents).toBe(100000);
    expect(report.cogsCents).toBe(60000);
    expect(report.grossProfitCents).toBe(40000);
    expect(report.grossMarginPercent).toBe(40);
    expect(report.totalExpensesCents).toBe(30000);
    expect(report.netProfitCents).toBe(10000); // R$ 400 - R$ 300 = R$ 100
    expect(report.netMarginPercent).toBe(10);

    // Fluxo de Caixa
    expect(report.totalCashInCents).toBe(80000); // R$ 800 recebidos
    expect(report.totalCashOutCents).toBe(30000); // R$ 300 pagos
    expect(report.netCashFlowCents).toBe(50000); // Saldo R$ 500

    // Categorias
    expect(report.categoryBreakdown).toHaveLength(2);
    expect(report.categoryBreakdown[0]?.categoryName).toBe('Aluguel');
    expect(report.categoryBreakdown[0]?.totalCents).toBe(20000);
  });

  it('gera relatório formatado em CSV corretamente', () => {
    const report = calculateFinancialReportMetrics({
      sales: mockSales,
      payments: mockPayments,
      expenses: mockExpenses,
      categories: mockCategories,
    });

    const categoryNameById = new Map<string, string>([
      ['cat-1', 'Energia e Água'],
      ['cat-2', 'Aluguel'],
    ]);

    const csv = buildFinancialReportCSV({
      workspaceName: 'Minha Loja',
      periodLabel: 'Outubro de 2026',
      report,
      sales: mockSales,
      expenses: mockExpenses,
      categoryNameById,
    });

    expect(csv).toContain('RELATÓRIO FINANCEIRO E DRE — VENDEFÁCIL');
    expect(csv).toContain('DEMONSTRATIVO DE RESULTADO (DRE)');
    expect(csv).toContain('Minha Loja');
    expect(csv).toContain('Outubro de 2026');
    expect(csv).toContain('Aluguel');
    expect(csv).toContain('Luz Outubro');
  });
});
