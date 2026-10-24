import { describe, expect, it } from 'vitest';

import {
  buildInstallmentPreview,
  calculateSuggestedLateCharges,
  getDaysOverdue,
  parseBRDateInputToISO,
  validateFinanceSettingsInput,
  validatePaymentSubmission,
} from '@/features/finance/schemas';

describe('finance schemas & configurable late fee calculations', () => {
  it('converte datas em formato brasileiro dd/MM/yyyy e ISO com validação de calendário', () => {
    expect(parseBRDateInputToISO('18/10/2026')).toBe('2026-10-18');
    expect(parseBRDateInputToISO('2026-11-05')).toBe('2026-11-05');
    expect(parseBRDateInputToISO('31/02/2026')).toBeNull();
    expect(parseBRDateInputToISO('invalido')).toBeNull();
  });

  it('calcula dias de atraso sem desvio de fuso horário', () => {
    expect(getDaysOverdue('2026-10-10', '2026-10-25')).toBe(15);
    expect(getDaysOverdue('2026-10-25', '2026-10-25')).toBe(0);
    expect(getDaysOverdue('2026-10-30', '2026-10-25')).toBe(0);
  });

  it('calcula multa (2%) e juros simples pro rata die (1% a.m.) sobre o saldo em aberto com arredondamento exato', () => {
    // R$ 100,00 (10000 centavos) vencidos há 15 dias -> multa 2% = 200, juros (1% / 30 * 15 = 0.5%) = 50
    const res = calculateSuggestedLateCharges({
      remainingPrincipalCents: 10000,
      dueDateISO: '2026-10-01',
      referenceDateISO: '2026-10-16',
      settings: {
        lateFeeEnabled: true,
        defaultFinePercent: 2,
        defaultMonthlyInterestPercent: 1,
        gracePeriodDays: 0,
      },
    });

    expect(res.daysOverdue).toBe(15);
    expect(res.isOverdue).toBe(true);
    expect(res.suggestedFineCents).toBe(200);
    expect(res.suggestedInterestCents).toBe(50);
    expect(res.suggestedTotalCents).toBe(10250);
  });

  it('respeita dias de carência (gracePeriodDays) e chave lateFeeEnabled desligada', () => {
    const withinGrace = calculateSuggestedLateCharges({
      remainingPrincipalCents: 10000,
      dueDateISO: '2026-10-10',
      referenceDateISO: '2026-10-13',
      settings: {
        lateFeeEnabled: true,
        defaultFinePercent: 2,
        defaultMonthlyInterestPercent: 1,
        gracePeriodDays: 5,
      },
    });

    expect(withinGrace.isOverdue).toBe(true);
    expect(withinGrace.withinGracePeriod).toBe(true);
    expect(withinGrace.suggestedFineCents).toBe(0);
    expect(withinGrace.suggestedInterestCents).toBe(0);

    const disabled = calculateSuggestedLateCharges({
      remainingPrincipalCents: 10000,
      dueDateISO: '2026-09-01',
      referenceDateISO: '2026-10-15',
      settings: {
        lateFeeEnabled: false,
        defaultFinePercent: 2,
        defaultMonthlyInterestPercent: 1,
        gracePeriodDays: 0,
      },
    });

    expect(disabled.suggestedFineCents).toBe(0);
    expect(disabled.suggestedInterestCents).toBe(0);
  });

  it('gera prévia de parcelamento com entrada e divisão exata de centavos sem sobra', () => {
    const preview = buildInstallmentPreview({
      totalCents: 11000, // R$ 110,00
      paymentMode: 'installments',
      downPaymentCents: 1000, // R$ 10,00 de entrada -> R$ 100,00 em 3x (3334, 3333, 3333)
      installmentCount: 3,
      firstDueDateISO: '2026-11-10',
      todayISO: '2026-10-10',
    });

    expect(preview).toHaveLength(4);
    expect(preview[0]).toMatchObject({
      installmentNumber: 0,
      amountCents: 1000,
      isEntry: true,
      dueDateISO: '2026-10-10',
    });
    expect(preview.slice(1).map((p) => p.amountCents)).toEqual([
      3334, 3333, 3333,
    ]);
    expect(preview.slice(1).map((p) => p.dueDateISO)).toEqual([
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
    ]);
  });

  it('valida configurações financeiras e submissão de recebimento com juros/multa editáveis', () => {
    const settingsCheck = validateFinanceSettingsInput({
      lateFeeEnabled: true,
      finePercentInput: '2,5',
      monthlyInterestPercentInput: '1,2',
      gracePeriodDaysInput: '3',
    });
    expect(settingsCheck.success).toBe(true);
    expect(settingsCheck.payload?.defaultFinePercent).toBe(2.5);

    const paymentCheck = validatePaymentSubmission({
      maxPrincipalCents: 5000,
      principalInput: '30,00',
      fineInput: '1,00',
      interestInput: '0,50',
      paymentMethod: 'pix',
      notes: 'Recebido via PIX com juros negociados',
    });
    expect(paymentCheck.success).toBe(true);
    expect(paymentCheck.payload?.totalReceivedCents).toBe(3150);
  });
});
