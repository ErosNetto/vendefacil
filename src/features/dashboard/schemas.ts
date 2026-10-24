import { z } from 'zod';

import type { InstallmentRow, PaymentRow, ProductRow, SaleRow } from '@/types/database';
import { getProductStockHealth } from '@/features/inventory/schemas';

export type DashboardPeriodKey = 'today' | '7d' | 'month' | 'all';

export const DASHBOARD_PERIOD_OPTIONS: { key: DashboardPeriodKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'all', label: 'Geral' },
];

export interface DashboardMetrics {
  totalSoldCents: number;
  salesCount: number;
  totalReceivedCents: number;
  paymentsCount: number;
  totalToReceiveCents: number;
  openInstallmentsCount: number;
  toReceiveTitle: string;
  toReceiveSubtitle: string;
  totalOverdueCents: number;
  overdueCount: number;
  overdueTitle: string;
  overdueSubtitle: string;
  estimatedProfitCents: number;
  lowStockCount: number;
  outOfStockCount: number;
  draftSalesCount: number;
}

export interface CalendarDayOverview {
  dateISO: string; // YYYY-MM-DD
  dayLabel: string; // ex: "Seg", "Ter", "Hoje"
  dayNumber: number; // 24
  installments: InstallmentRow[];
  totalDueCents: number;
  hasOverdue: boolean;
}

export type CalendarFilterKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'month';

export const CALENDAR_FILTER_OPTIONS: { key: CalendarFilterKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'tomorrow', label: 'Amanhã' },
  { key: 'week', label: 'Próximos 7 dias' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'month', label: 'Este mês' },
];

/**
 * Retorna as datas de corte (strings YYYY-MM-DD) com base numa data ISO de referência.
 */
export function getDashboardDateCutoffs(todayISO: string) {
  const parts = todayISO.split('-');
  const year = parseInt(parts[0] ?? '2026', 10);
  const month = parseInt(parts[1] ?? '01', 10);
  const day = parseInt(parts[2] ?? '01', 10);

  // Hoje no formato YYYY-MM-DD
  const today = todayISO;

  // 7 dias atrás
  const dateAgoObj = new Date(Date.UTC(year, month - 1, day));
  dateAgoObj.setUTCDate(dateAgoObj.getUTCDate() - 6);
  const sevenDaysAgo = dateAgoObj.toISOString().slice(0, 10);

  // Próximos 7 dias
  const dateAheadObj = new Date(Date.UTC(year, month - 1, day));
  dateAheadObj.setUTCDate(dateAheadObj.getUTCDate() + 7);
  const nextSevenDays = dateAheadObj.toISOString().slice(0, 10);

  // Início do mês atual
  const yearStr = String(year);
  const monthStr = String(month).padStart(2, '0');
  const monthStart = `${yearStr}-${monthStr}-01`;
  const currentMonthPrefix = `${yearStr}-${monthStr}`;

  return {
    today,
    sevenDaysAgo,
    nextSevenDays,
    monthStart,
    currentMonthPrefix,
  };
}

/**
 * Calcula métricas do dashboard de forma pura e testável para qualquer período.
 */
export function calculateDashboardMetrics(params: {
  sales: SaleRow[];
  payments: PaymentRow[];
  installments: InstallmentRow[];
  products: ProductRow[];
  period: DashboardPeriodKey;
  todayISO: string;
}): DashboardMetrics {
  const { sales, payments, installments, products, period, todayISO } = params;
  const cutoffs = getDashboardDateCutoffs(todayISO);

  // 1. Filtrar vendas confirmadas do período
  let totalSoldCents = 0;
  let salesCount = 0;
  let draftSalesCount = 0;

  for (const sale of sales) {
    if (sale.status === 'cancelled') {
      continue;
    }
    if (sale.status === 'draft') {
      draftSalesCount += 1;
      continue;
    }

    const saleDateISO = sale.created_at.slice(0, 10);
    const matchesPeriod =
      period === 'all' ||
      (period === 'today' && saleDateISO === cutoffs.today) ||
      (period === '7d' && saleDateISO >= cutoffs.sevenDaysAgo && saleDateISO <= cutoffs.today) ||
      (period === 'month' && saleDateISO >= cutoffs.monthStart && saleDateISO <= cutoffs.today);

    if (matchesPeriod) {
      totalSoldCents += sale.total_cents;
      salesCount += 1;
    }
  }

  // 2. Filtrar pagamentos recebidos no período
  let totalReceivedCents = 0;
  let paymentsCount = 0;

  for (const payment of payments) {
    const paymentDateISO = payment.paid_at.slice(0, 10);
    const matchesPeriod =
      period === 'all' ||
      (period === 'today' && paymentDateISO === cutoffs.today) ||
      (period === '7d' && paymentDateISO >= cutoffs.sevenDaysAgo && paymentDateISO <= cutoffs.today) ||
      (period === 'month' && paymentDateISO >= cutoffs.monthStart && paymentDateISO <= cutoffs.today);

    if (matchesPeriod) {
      totalReceivedCents += payment.amount_cents;
      paymentsCount += 1;
    }
  }

  // 3. Contas a receber e atrasos filtrados pelo período
  let totalToReceiveCents = 0;
  let openInstallmentsCount = 0;
  let totalOverdueCents = 0;
  let overdueCount = 0;

  for (const inst of installments) {
    if (inst.status === 'paid' || inst.status === 'cancelled') {
      continue;
    }

    const remaining = inst.remaining_principal_cents;
    if (remaining <= 0) {
      continue;
    }

    const isOverdue = inst.due_date < todayISO;

    // A receber de acordo com o período selecionado
    const matchesToReceive =
      period === 'all' ||
      (period === 'today' && inst.due_date === cutoffs.today) ||
      (period === '7d' && inst.due_date >= cutoffs.today && inst.due_date <= cutoffs.nextSevenDays) ||
      (period === 'month' && inst.due_date.slice(0, 7) === cutoffs.currentMonthPrefix && !isOverdue);

    if (matchesToReceive) {
      totalToReceiveCents += remaining;
      openInstallmentsCount += 1;
    }

    // Vencidos de acordo com o período selecionado
    const matchesOverdue =
      isOverdue &&
      (period === 'all' ||
        period === 'today' ||
        (period === '7d' && inst.due_date >= cutoffs.sevenDaysAgo) ||
        (period === 'month' && inst.due_date.slice(0, 7) === cutoffs.currentMonthPrefix));

    if (matchesOverdue) {
      totalOverdueCents += remaining;
      overdueCount += 1;
    }
  }

  // Labels dinâmicos conforme período
  let toReceiveTitle: string;
  let toReceiveSubtitle: string;
  let overdueTitle: string;
  let overdueSubtitle: string;

  if (period === 'today') {
    toReceiveTitle = 'Vence hoje';
    toReceiveSubtitle =
      openInstallmentsCount === 1
        ? '1 parcela vence hoje'
        : `${openInstallmentsCount} parcelas vencem hoje`;
    overdueTitle = 'Atrasadas hoje';
    overdueSubtitle =
      overdueCount === 1
        ? '1 parcela vencida'
        : `${overdueCount} parcelas vencidas`;
  } else if (period === '7d') {
    toReceiveTitle = 'Vence em 7 dias';
    toReceiveSubtitle =
      openInstallmentsCount === 1
        ? '1 parcela na semana'
        : `${openInstallmentsCount} parcelas na semana`;
    overdueTitle = 'Atrasadas (7d)';
    overdueSubtitle =
      overdueCount === 1
        ? '1 vencida recente'
        : `${overdueCount} vencidas recentes`;
  } else if (period === 'month') {
    toReceiveTitle = 'A receber no mês';
    toReceiveSubtitle =
      openInstallmentsCount === 1
        ? '1 parcela no mês'
        : `${openInstallmentsCount} parcelas no mês`;
    overdueTitle = 'Vencidas do mês';
    overdueSubtitle =
      overdueCount === 1
        ? '1 parcela em atraso'
        : `${overdueCount} parcelas em atraso`;
  } else {
    toReceiveTitle = 'Carteira a receber';
    toReceiveSubtitle = `${openInstallmentsCount} parcelas em aberto`;
    overdueTitle = 'Total em atraso';
    overdueSubtitle = `${overdueCount} parcelas em atraso`;
  }

  // 4. Estoque em atenção
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const prod of products) {
    if (prod.is_archived) {
      continue;
    }
    const health = getProductStockHealth(prod);
    if (health === 'out') {
      outOfStockCount += 1;
    } else if (health === 'low' || health === 'at_minimum') {
      lowStockCount += 1;
    }
  }

  const estimatedProfitCents = Math.round(totalSoldCents * 0.4);

  return {
    totalSoldCents,
    salesCount,
    totalReceivedCents,
    paymentsCount,
    totalToReceiveCents,
    openInstallmentsCount,
    toReceiveTitle,
    toReceiveSubtitle,
    totalOverdueCents,
    overdueCount,
    overdueTitle,
    overdueSubtitle,
    estimatedProfitCents,
    lowStockCount,
    outOfStockCount,
    draftSalesCount,
  };
}

/**
 * Agrupa parcelas por data para visão de agenda/calendário.
 */
export function groupInstallmentsForCalendar(params: {
  installments: InstallmentRow[];
  filter: CalendarFilterKey;
  todayISO: string;
}): InstallmentRow[] {
  const { installments, filter, todayISO } = params;

  const parts = todayISO.split('-');
  const year = parseInt(parts[0] ?? '2026', 10);
  const month = parseInt(parts[1] ?? '01', 10);
  const day = parseInt(parts[2] ?? '01', 10);

  // Amanhã
  const tomorrowObj = new Date(Date.UTC(year, month - 1, day));
  tomorrowObj.setUTCDate(tomorrowObj.getUTCDate() + 1);
  const tomorrowISO = tomorrowObj.toISOString().slice(0, 10);

  // Daqui 7 dias
  const next7Obj = new Date(Date.UTC(year, month - 1, day));
  next7Obj.setUTCDate(next7Obj.getUTCDate() + 7);
  const next7ISO = next7Obj.toISOString().slice(0, 10);

  // Mês atual
  const currentMonthPrefix = todayISO.slice(0, 7);

  return installments
    .filter((item) => {
      if (item.status === 'cancelled') {
        return false;
      }
      const isOpen = item.status !== 'paid' && item.remaining_principal_cents > 0;
      if (!isOpen) {
        return false;
      }

      const isOverdue = item.due_date < todayISO;

      if (filter === 'overdue') {
        return isOverdue;
      }
      if (filter === 'today') {
        return item.due_date === todayISO;
      }
      if (filter === 'tomorrow') {
        return item.due_date === tomorrowISO;
      }
      if (filter === 'week') {
        return item.due_date >= todayISO && item.due_date <= next7ISO;
      }
      if (filter === 'month') {
        return item.due_date.slice(0, 7) === currentMonthPrefix;
      }
      return true;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export const dashboardFilterSchema = z.enum(['today', '7d', 'month', 'all']);
