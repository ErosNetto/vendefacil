import { z } from 'zod';

import type { ExpenseCategoryRow, ExpenseRow, PaymentMethod, PaymentRow, SaleRow } from '@/types/database';
import { PAYMENT_METHOD_OPTIONS } from '@/features/finance/schemas';
import { formatCentsToBRL, formatDateBR, parseBRLInputToCents } from '@/utils/formatters';

export const expenseFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(2, 'Informe a descrição da despesa (mínimo 2 caracteres).')
    .max(120, 'A descrição deve ter no máximo 120 caracteres.'),
  amountInput: z
    .string()
    .trim()
    .min(1, 'Informe o valor da despesa.')
    .refine((val) => {
      const cents = parseBRLInputToCents(val);
      return cents !== null && cents > 0;
    }, 'O valor deve ser maior que zero.'),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (formato YYYY-MM-DD).'),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.enum([
    'pix',
    'cash',
    'credit_card',
    'debit_card',
    'bank_transfer',
    'other',
  ]),
  notes: z
    .string()
    .trim()
    .max(300, 'As observações devem ter no máximo 300 caracteres.')
    .optional()
    .or(z.literal('')),
});

export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;

export interface NormalizedExpensePayload {
  description: string;
  amount_cents: number;
  expense_date: string;
  category_id: string | null;
  payment_method: PaymentMethod;
  notes: string | null;
}

export function normalizeExpensePayload(
  values: ExpenseFormInput,
): NormalizedExpensePayload {
  const amount_cents = parseBRLInputToCents(values.amountInput);
  if (!amount_cents || amount_cents <= 0) {
    throw new Error('Valor da despesa inválido.');
  }

  const cleanNotes = values.notes?.trim() ?? '';

  return {
    description: values.description.trim(),
    amount_cents,
    expense_date: values.expenseDate,
    category_id: values.categoryId || null,
    payment_method: values.paymentMethod,
    notes: cleanNotes ? cleanNotes : null,
  };
}

export interface FinancialReportOverview {
  // DRE (Regime de Competência)
  grossRevenueCents: number;
  cogsCents: number; // Custo das mercadorias vendidas
  grossProfitCents: number;
  grossMarginPercent: number;
  totalExpensesCents: number;
  netProfitCents: number;
  netMarginPercent: number;

  // Fluxo de Caixa (Regime de Caixa)
  totalCashInCents: number;
  totalCashOutCents: number;
  netCashFlowCents: number;

  // Contadores
  salesCount: number;
  expensesCount: number;
  paymentsCount: number;

  // Despesas agrupadas por categoria
  categoryBreakdown: {
    categoryName: string;
    totalCents: number;
    count: number;
    percentage: number;
  }[];
}

export function calculateFinancialReportMetrics(params: {
  sales: SaleRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  categories: ExpenseCategoryRow[];
}): FinancialReportOverview {
  const { sales, payments, expenses, categories } = params;

  // 1. Receita e Custo de Vendas
  let grossRevenueCents = 0;
  let cogsCents = 0;
  let salesCount = 0;

  for (const s of sales) {
    if (s.status === 'confirmed') {
      grossRevenueCents += s.total_cents;
      cogsCents += s.estimated_cost_cents || 0;
      salesCount += 1;
    }
  }

  const grossProfitCents = grossRevenueCents - cogsCents;
  const grossMarginPercent =
    grossRevenueCents > 0
      ? Math.round((grossProfitCents / grossRevenueCents) * 1000) / 10
      : 0;

  // 2. Despesas
  let totalExpensesCents = 0;
  let expensesCount = 0;
  const expensesByCategory = new Map<string, { total: number; count: number }>();

  const categoryNameById = new Map<string, string>();
  for (const c of categories) {
    categoryNameById.set(c.id, c.name);
  }

  for (const e of expenses) {
    if (e.is_cancelled) {
      continue;
    }
    totalExpensesCents += e.amount_cents;
    expensesCount += 1;

    const catName =
      (e.category_id ? categoryNameById.get(e.category_id) : null) ||
      'Outras Despesas';

    const current = expensesByCategory.get(catName) ?? { total: 0, count: 0 };
    expensesByCategory.set(catName, {
      total: current.total + e.amount_cents,
      count: current.count + 1,
    });
  }

  const netProfitCents = grossProfitCents - totalExpensesCents;
  const netMarginPercent =
    grossRevenueCents > 0
      ? Math.round((netProfitCents / grossRevenueCents) * 1000) / 10
      : 0;

  // 3. Fluxo de Caixa Real
  let totalCashInCents = 0;
  let paymentsCount = 0;

  for (const p of payments) {
    if (!p.is_reversed) {
      totalCashInCents += p.amount_cents;
      paymentsCount += 1;
    }
  }

  const totalCashOutCents = totalExpensesCents;
  const netCashFlowCents = totalCashInCents - totalCashOutCents;

  // 4. Detalhamento por categoria
  const categoryBreakdown = Array.from(expensesByCategory.entries())
    .map(([categoryName, data]) => ({
      categoryName,
      totalCents: data.total,
      count: data.count,
      percentage:
        totalExpensesCents > 0
          ? Math.round((data.total / totalExpensesCents) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    grossRevenueCents,
    cogsCents,
    grossProfitCents,
    grossMarginPercent,
    totalExpensesCents,
    netProfitCents,
    netMarginPercent,
    totalCashInCents,
    totalCashOutCents,
    netCashFlowCents,
    salesCount,
    expensesCount,
    paymentsCount,
    categoryBreakdown,
  };
}

/**
 * Gera texto formatado em CSV compatível com Excel brasileiro (separador ponto-e-vírgula).
 */
export function buildFinancialReportCSV(params: {
  workspaceName: string;
  periodLabel: string;
  report: FinancialReportOverview;
  sales: SaleRow[];
  expenses: ExpenseRow[];
  categoryNameById: Map<string, string>;
}): string {
  const { workspaceName, periodLabel, report, sales, expenses, categoryNameById } = params;

  const lines: string[] = [];

  // Cabeçalho institucional
  lines.push(`"RELATÓRIO FINANCEIRO E DRE — VENDEFÁCIL"`);
  lines.push(`"Espaço de Trabalho:";"${workspaceName}"`);
  lines.push(`"Período:";"${periodLabel}"`);
  lines.push(`"Data de Geração:";"${formatDateBR(new Date().toISOString().slice(0, 10))}"`);
  lines.push('');

  // 1. Resumo DRE
  lines.push(`"DEMONSTRATIVO DE RESULTADO (DRE)";""`);
  lines.push(`"Item";"Valor (R$)"`);
  lines.push(`"Receita Bruta de Vendas (+)";"${formatCentsToBRL(report.grossRevenueCents)}"`);
  lines.push(`"Custo das Mercadorias Vendidas - CMV (-)";"${formatCentsToBRL(report.cogsCents)}"`);
  lines.push(`"Lucro Bruto (=)";"${formatCentsToBRL(report.grossProfitCents)}"`);
  lines.push(`"Margem Bruta";"${report.grossMarginPercent}%"`);
  lines.push(`"Despesas Operacionais (-)";"${formatCentsToBRL(report.totalExpensesCents)}"`);
  lines.push(`"LUCRO LÍQUIDO REAL (=)";"${formatCentsToBRL(report.netProfitCents)}"`);
  lines.push(`"Margem Líquida";"${report.netMarginPercent}%"`);
  lines.push('');

  // 2. Resumo de Caixa
  lines.push(`"FLUXO DE CAIXA REAL (ENTRADAS X SAÍDAS)";""`);
  lines.push(`"Total Recebido no Caixa (+)";"${formatCentsToBRL(report.totalCashInCents)}"`);
  lines.push(`"Total Despesas Pagas (-)";"${formatCentsToBRL(report.totalCashOutCents)}"`);
  lines.push(`"SALDO LÍQUIDO DE CAIXA (=)";"${formatCentsToBRL(report.netCashFlowCents)}"`);
  lines.push('');

  // 3. Detalhamento de Despesas por Categoria
  lines.push(`"DESPESAS POR CATEGORIA";""`);
  lines.push(`"Categoria";"Qtd";"Total (R$)";"% do Total"`);
  for (const cat of report.categoryBreakdown) {
    lines.push(
      `"${cat.categoryName}";"${cat.count}";"${formatCentsToBRL(cat.totalCents)}";"${cat.percentage}%"`
    );
  }
  lines.push('');

  // 4. Extrato de Despesas
  lines.push(`"EXTRATO DE DESPESAS DO PERÍODO";""`);
  lines.push(`"Data";"Descrição";"Categoria";"Meio de Pagamento";"Valor (R$)"`);
  for (const exp of expenses) {
    if (exp.is_cancelled) continue;
    const catName = (exp.category_id ? categoryNameById.get(exp.category_id) : null) || 'Outros';
    const methodMeta = PAYMENT_METHOD_OPTIONS.find((m) => m.value === exp.payment_method);
    lines.push(
      `"${formatDateBR(exp.expense_date)}";"${exp.description.replace(/"/g, '""')}";"${catName}";"${methodMeta?.label ?? exp.payment_method}";"${formatCentsToBRL(exp.amount_cents)}"`
    );
  }
  lines.push('');

  // 5. Extrato de Vendas
  lines.push(`"EXTRATO DE VENDAS DO PERÍODO";""`);
  lines.push(`"Data";"Cliente";"Status";"Itens";"Valor Total (R$)"`);
  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    const dateFormatted = s.created_at.slice(0, 10);
    lines.push(
      `"${formatDateBR(dateFormatted)}";"${(s.customer_name_snapshot || 'Balcão').replace(/"/g, '""')}";"${s.status}";"${s.item_count}";"${formatCentsToBRL(s.total_cents)}"`
    );
  }

  // UTF-8 BOM para garantir acentos corretos no Excel
  return '\uFEFF' + lines.join('\r\n');
}
