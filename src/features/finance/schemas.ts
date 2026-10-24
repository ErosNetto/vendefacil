import type { StatusTone } from '@/components/ui/StatusBadge';
import type {
  InstallmentRow,
  PaymentMethod,
  SalePaymentMode,
  WorkspaceRow,
} from '@/types/database';
import {
  distributeCentsAcrossInstallments,
  parseBRLInputToCents,
} from '@/utils/formatters';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  bank_transfer: 'Transferência',
  other: 'Outro',
};

export const PAYMENT_METHOD_OPTIONS: {
  value: PaymentMethod;
  label: string;
}[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'other', label: 'Outro' },
];

export const SALE_PAYMENT_MODE_LABELS: Record<SalePaymentMode, string> = {
  cash: 'À vista',
  installments: 'Parcelado / A prazo',
};

export interface WorkspaceFinanceSettings {
  lateFeeEnabled: boolean;
  defaultFinePercent: number;
  defaultMonthlyInterestPercent: number;
  gracePeriodDays: number;
}

export const DEFAULT_WORKSPACE_FINANCE_SETTINGS: WorkspaceFinanceSettings = {
  lateFeeEnabled: true,
  defaultFinePercent: 2.0,
  defaultMonthlyInterestPercent: 1.0,
  gracePeriodDays: 0,
};

export function getWorkspaceFinanceSettings(
  workspace: WorkspaceRow | null | undefined,
): WorkspaceFinanceSettings {
  if (!workspace) {
    return DEFAULT_WORKSPACE_FINANCE_SETTINGS;
  }

  return {
    lateFeeEnabled:
      typeof workspace.late_fee_enabled === 'boolean'
        ? workspace.late_fee_enabled
        : DEFAULT_WORKSPACE_FINANCE_SETTINGS.lateFeeEnabled,
    defaultFinePercent:
      workspace.default_fine_percent !== undefined &&
      workspace.default_fine_percent !== null
        ? Number(workspace.default_fine_percent)
        : DEFAULT_WORKSPACE_FINANCE_SETTINGS.defaultFinePercent,
    defaultMonthlyInterestPercent:
      workspace.default_monthly_interest_percent !== undefined &&
      workspace.default_monthly_interest_percent !== null
        ? Number(workspace.default_monthly_interest_percent)
        : DEFAULT_WORKSPACE_FINANCE_SETTINGS.defaultMonthlyInterestPercent,
    gracePeriodDays:
      workspace.grace_period_days !== undefined &&
      workspace.grace_period_days !== null
        ? Number(workspace.grace_period_days)
        : DEFAULT_WORKSPACE_FINANCE_SETTINGS.gracePeriodDays,
  };
}

/**
 * Retorna a data local atual como `YYYY-MM-DD` sem desvio de fuso horário UTC.
 */
export function getTodayISODate(now: Date = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToISODate(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return isoDate;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month, day + days));
  const y = String(d.getUTCFullYear());
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

export function addMonthsToISODate(isoDate: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return isoDate;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const maxDayInTargetMonth = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, maxDayInTargetMonth);

  const y = String(targetYear);
  const m = String(normalizedMonth + 1).padStart(2, '0');
  const d = String(clampedDay).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converte data digitada em `dd/MM/yyyy` ou `YYYY-MM-DD` para `YYYY-MM-DD` validada.
 */
export function parseBRDateInputToISO(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let year: number;
  let month: number;
  let day: number;

  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (brMatch) {
    day = Number(brMatch[1]);
    month = Number(brMatch[2]);
    year = Number(brMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return null;
  }

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return null;
  }

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > maxDay) {
    return null;
  }

  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Calcula quantos dias corridos uma data `YYYY-MM-DD` está vencida em relação à data de referência.
 */
export function getDaysOverdue(
  dueDateISO: string,
  referenceDateISO: string = getTodayISODate(),
): number {
  const dueMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDateISO.trim());
  const refMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDateISO.trim());

  if (!dueMatch || !refMatch) {
    return 0;
  }

  const dueUTC = Date.UTC(
    Number(dueMatch[1]),
    Number(dueMatch[2]) - 1,
    Number(dueMatch[3]),
  );
  const refUTC = Date.UTC(
    Number(refMatch[1]),
    Number(refMatch[2]) - 1,
    Number(refMatch[3]),
  );

  const diffDays = Math.round((refUTC - dueUTC) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export interface SuggestedLateCharges {
  daysOverdue: number;
  isOverdue: boolean;
  withinGracePeriod: boolean;
  suggestedFineCents: number;
  suggestedInterestCents: number;
  suggestedTotalCents: number;
}

/**
 * Calcula multa fixa e juros simples pro rata die (mensal / 30 * dias de atraso)
 * sobre o saldo principal em aberto da parcela, respeitando carência e arredondamento
 * para o centavo inteiro mais próximo (`Math.round`).
 */
export function calculateSuggestedLateCharges(params: {
  remainingPrincipalCents: number;
  dueDateISO: string;
  referenceDateISO?: string;
  settings: WorkspaceFinanceSettings;
}): SuggestedLateCharges {
  const principal = Math.max(0, Math.round(params.remainingPrincipalCents));
  const daysOverdue = getDaysOverdue(
    params.dueDateISO,
    params.referenceDateISO,
  );

  if (principal <= 0 || daysOverdue <= 0) {
    return {
      daysOverdue: 0,
      isOverdue: false,
      withinGracePeriod: false,
      suggestedFineCents: 0,
      suggestedInterestCents: 0,
      suggestedTotalCents: principal,
    };
  }

  const withinGracePeriod = daysOverdue <= params.settings.gracePeriodDays;

  if (!params.settings.lateFeeEnabled || withinGracePeriod) {
    return {
      daysOverdue,
      isOverdue: true,
      withinGracePeriod,
      suggestedFineCents: 0,
      suggestedInterestCents: 0,
      suggestedTotalCents: principal,
    };
  }

  const fineRate = Math.max(0, params.settings.defaultFinePercent) / 100;
  const dailyInterestRate =
    Math.max(0, params.settings.defaultMonthlyInterestPercent) / 30 / 100;

  const suggestedFineCents = Math.round(principal * fineRate);
  const suggestedInterestCents = Math.round(
    principal * dailyInterestRate * daysOverdue,
  );

  return {
    daysOverdue,
    isOverdue: true,
    withinGracePeriod: false,
    suggestedFineCents,
    suggestedInterestCents,
    suggestedTotalCents:
      principal + suggestedFineCents + suggestedInterestCents,
  };
}

export interface InstallmentPreviewItem {
  installmentNumber: number;
  totalInstallments: number;
  dueDateISO: string;
  amountCents: number;
  isEntry: boolean;
}

export function buildInstallmentPreview(params: {
  totalCents: number;
  paymentMode: SalePaymentMode;
  downPaymentCents: number;
  installmentCount: number;
  firstDueDateISO: string;
  todayISO?: string;
}): InstallmentPreviewItem[] {
  const today = params.todayISO ?? getTodayISODate();
  const total = Math.max(0, Math.round(params.totalCents));
  if (total <= 0) {
    return [];
  }

  if (params.paymentMode === 'cash' || params.downPaymentCents >= total) {
    return [
      {
        installmentNumber: 1,
        totalInstallments: 1,
        dueDateISO: today,
        amountCents: total,
        isEntry: true,
      },
    ];
  }

  const down = Math.max(0, Math.round(params.downPaymentCents));
  const count = Math.min(36, Math.max(1, Math.trunc(params.installmentCount)));
  const remaining = total - down;

  if (remaining < count) {
    return [];
  }

  const amounts = distributeCentsAcrossInstallments(remaining, count);
  const items: InstallmentPreviewItem[] = [];

  if (down > 0) {
    items.push({
      installmentNumber: 0,
      totalInstallments: count,
      dueDateISO: today,
      amountCents: down,
      isEntry: true,
    });
  }

  amounts.forEach((amountCents, index) => {
    items.push({
      installmentNumber: index + 1,
      totalInstallments: count,
      dueDateISO: addMonthsToISODate(params.firstDueDateISO, index),
      amountCents,
      isEntry: false,
    });
  });

  return items;
}

export type InstallmentVisualState =
  | 'overdue'
  | 'due_today'
  | 'partial'
  | 'upcoming'
  | 'paid'
  | 'cancelled';

export interface InstallmentDisplayMeta {
  state: InstallmentVisualState;
  label: string;
  tone: StatusTone;
  daysOverdue: number;
}

export function getInstallmentDisplayMeta(
  installment: Pick<
    InstallmentRow,
    'status' | 'due_date' | 'remaining_principal_cents'
  >,
  todayISO: string = getTodayISODate(),
): InstallmentDisplayMeta {
  if (installment.status === 'cancelled') {
    return {
      state: 'cancelled',
      label: 'Cancelada',
      tone: 'neutral',
      daysOverdue: 0,
    };
  }

  if (
    installment.status === 'paid' ||
    installment.remaining_principal_cents <= 0
  ) {
    return {
      state: 'paid',
      label: 'Quitada',
      tone: 'success',
      daysOverdue: 0,
    };
  }

  const daysOverdue = getDaysOverdue(installment.due_date, todayISO);
  if (daysOverdue > 0) {
    return {
      state: 'overdue',
      label:
        installment.status === 'partial'
          ? `Parcial • Vencida (${daysOverdue}d)`
          : `Vencida há ${daysOverdue}d`,
      tone: 'error',
      daysOverdue,
    };
  }

  if (installment.due_date === todayISO) {
    return {
      state: 'due_today',
      label:
        installment.status === 'partial'
          ? 'Parcial • Vence hoje'
          : 'Vence hoje',
      tone: 'warning',
      daysOverdue: 0,
    };
  }

  if (installment.status === 'partial') {
    return {
      state: 'partial',
      label: 'Pago parcial',
      tone: 'warning',
      daysOverdue: 0,
    };
  }

  return {
    state: 'upcoming',
    label: 'A vencer',
    tone: 'neutral',
    daysOverdue: 0,
  };
}

export function createPaymentIdempotencyKey(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `pay_${Date.now()}_${randomSuffix}`;
}

export function parsePercentInput(raw: string): number | null {
  const cleaned = raw.replace(/%/g, '').replace(',', '.').trim();
  if (!cleaned) {
    return 0;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

export function validateFinanceSettingsInput(input: {
  lateFeeEnabled: boolean;
  finePercentInput: string;
  monthlyInterestPercentInput: string;
  gracePeriodDaysInput: string;
}): {
  success: boolean;
  errorMessage?: string;
  payload?: WorkspaceFinanceSettings;
} {
  const finePercent = parsePercentInput(input.finePercentInput);
  if (finePercent === null) {
    return {
      success: false,
      errorMessage: 'Informe uma multa padrão válida entre 0% e 100%.',
    };
  }

  const monthlyInterestPercent = parsePercentInput(
    input.monthlyInterestPercentInput,
  );
  if (monthlyInterestPercent === null) {
    return {
      success: false,
      errorMessage: 'Informe juros mensais válidos entre 0% e 100%.',
    };
  }

  const graceTrimmed = input.gracePeriodDaysInput.trim();
  const graceDays = graceTrimmed === '' ? 0 : Number(graceTrimmed);
  if (
    !Number.isInteger(graceDays) ||
    graceDays < 0 ||
    graceDays > 365
  ) {
    return {
      success: false,
      errorMessage: 'Informe dias de tolerância inteiros entre 0 e 365.',
    };
  }

  return {
    success: true,
    payload: {
      lateFeeEnabled: input.lateFeeEnabled,
      defaultFinePercent: finePercent,
      defaultMonthlyInterestPercent: monthlyInterestPercent,
      gracePeriodDays: graceDays,
    },
  };
}

export function validatePaymentSubmission(input: {
  maxPrincipalCents: number;
  principalInput: string;
  fineInput: string;
  interestInput: string;
  paymentMethod: PaymentMethod;
  notes: string;
}): {
  success: boolean;
  errorMessage?: string;
  payload?: {
    principalCents: number;
    fineCents: number;
    interestCents: number;
    totalReceivedCents: number;
    paymentMethod: PaymentMethod;
    notes: string | null;
  };
} {
  const principalCents = parseBRLInputToCents(input.principalInput);
  if (principalCents === null || principalCents <= 0) {
    return {
      success: false,
      errorMessage: 'Informe um valor principal recebido maior que R$ 0,00.',
    };
  }

  if (principalCents > input.maxPrincipalCents) {
    return {
      success: false,
      errorMessage:
        'O valor principal informado é maior que o saldo em aberto.',
    };
  }

  const fineTrimmed = input.fineInput.trim();
  const fineCents = fineTrimmed === '' ? 0 : parseBRLInputToCents(fineTrimmed);
  if (fineCents === null || fineCents < 0) {
    return {
      success: false,
      errorMessage: 'Informe um valor de multa válido (ou 0,00).',
    };
  }

  const interestTrimmed = input.interestInput.trim();
  const interestCents =
    interestTrimmed === '' ? 0 : parseBRLInputToCents(interestTrimmed);
  if (interestCents === null || interestCents < 0) {
    return {
      success: false,
      errorMessage: 'Informe um valor de juros válido (ou 0,00).',
    };
  }

  const cleanNotes = input.notes.trim();
  if (cleanNotes.length > 300) {
    return {
      success: false,
      errorMessage: 'A observação deve ter no máximo 300 caracteres.',
    };
  }

  return {
    success: true,
    payload: {
      principalCents,
      fineCents,
      interestCents,
      totalReceivedCents: principalCents + fineCents + interestCents,
      paymentMethod: input.paymentMethod,
      notes: cleanNotes || null,
    },
  };
}
