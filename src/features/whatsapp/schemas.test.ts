import { describe, expect, it } from 'vitest';

import {
  buildDraftQuoteWhatsAppMessage,
  buildInstallmentReminderWhatsAppMessage,
  buildOverdueInstallmentWhatsAppMessage,
  buildSaleReceiptWhatsAppMessage,
  formatPixBlockForWhatsApp,
  maskPixKeyInput,
  normalizeWhatsAppPhoneBR,
  shouldIncludePixInWhatsApp,
  shouldShowInstallmentWhatsAppCharge,
  validatePixSettingsInput,
  type WorkspacePixSettings,
} from '@/features/whatsapp/schemas';
import type { InstallmentRow, SaleItemRow, SaleRow } from '@/types/database';

const SAMPLE_PIX: WorkspacePixSettings = {
  pixKeyType: 'phone',
  pixKey: '(41) 98513-7391',
  pixBankName: 'Nubank',
  pixHolderName: 'Eros Netto',
};

const SAMPLE_SALE: SaleRow = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  workspace_id: '00000000-0000-4000-8000-000000000001',
  customer_id: '00000000-0000-4000-8000-000000000002',
  customer_name_snapshot: 'Maria Oliveira',
  status: 'confirmed',
  subtotal_cents: 20000,
  discount_cents: 1000,
  total_cents: 19000,
  estimated_cost_cents: 10000,
  estimated_profit_cents: 9000,
  item_count: 2,
  notes: null,
  cancellation_reason: null,
  idempotency_key: 'idem-1',
  payment_mode: 'installments',
  payment_method: 'pix',
  down_payment_cents: 5000,
  installment_count: 2,
  first_due_date: '2026-11-30',
  sale_date: '2026-10-31',
  confirmed_at: '2026-10-31T12:00:00Z',
  cancelled_at: null,
  created_by: null,
  created_at: '2026-10-31T12:00:00Z',
  updated_at: '2026-10-31T12:00:00Z',
};

const SAMPLE_ITEMS: SaleItemRow[] = [
  {
    id: 'item-1',
    workspace_id: SAMPLE_SALE.workspace_id,
    sale_id: SAMPLE_SALE.id,
    product_id: 'prod-1',
    product_name_snapshot: 'Perfume Egeo Bomb',
    sku_snapshot: 'EGEO-01',
    quantity: 2,
    unit_price_cents: 10000,
    unit_cost_cents: 5000,
    line_total_cents: 20000,
    line_cost_cents: 10000,
    created_at: '2026-10-31T12:00:00Z',
  },
];

const SAMPLE_INSTALLMENT: InstallmentRow = {
  id: 'inst-1',
  workspace_id: SAMPLE_SALE.workspace_id,
  sale_id: SAMPLE_SALE.id,
  customer_id: SAMPLE_SALE.customer_id,
  customer_name_snapshot: 'Maria Oliveira',
  installment_number: 1,
  total_installments: 2,
  due_date: '2026-11-30',
  principal_cents: 7000,
  paid_principal_cents: 0,
  accrued_fine_cents: 0,
  accrued_interest_cents: 0,
  paid_total_cents: 0,
  remaining_principal_cents: 7000,
  status: 'pending',
  paid_at: null,
  cancelled_at: null,
  notes: null,
  created_at: '2026-10-31T12:00:00Z',
  updated_at: '2026-10-31T12:00:00Z',
};

const SAMPLE_INSTALLMENTS: InstallmentRow[] = [SAMPLE_INSTALLMENT];

describe('whatsapp/schemas', () => {
  it('normalizes Brazilian phone numbers with DDI 55', () => {
    expect(normalizeWhatsAppPhoneBR('(41) 98513-7391')).toBe('5541985137391');
    expect(normalizeWhatsAppPhoneBR('5541985137391')).toBe('5541985137391');
    expect(normalizeWhatsAppPhoneBR('123')).toBeNull();
    expect(normalizeWhatsAppPhoneBR(null)).toBeNull();
  });

  it('validates and formats PIX block with key, bank and holder', () => {
    const valid = validatePixSettingsInput({
      pixKeyType: 'phone',
      pixKeyInput: ' (41) 98513-7391 ',
      pixBankNameInput: ' Nubank ',
      pixHolderNameInput: ' Eros Netto ',
    });
    expect(valid.success).toBe(true);
    expect(valid.payload?.pixKey).toBe('(41) 98513-7391');

    const block = formatPixBlockForWhatsApp(SAMPLE_PIX);
    expect(block).toContain('Chave (Celular):* (41) 98513-7391');
    expect(block).toContain('Banco:* Nubank');
    expect(block).toContain('Favorecido:* Eros Netto');
  });

  it('builds sale receipt message with items, installments and PIX', () => {
    const msg = buildSaleReceiptWhatsAppMessage({
      workspaceName: 'Perfumaria Fácil',
      sale: SAMPLE_SALE,
      items: SAMPLE_ITEMS,
      installments: SAMPLE_INSTALLMENTS,
      pix: SAMPLE_PIX,
    });
    expect(msg).toContain('Maria Oliveira');
    expect(msg).toContain('Perfumaria Fácil');
    expect(msg).toContain('2x Perfume Egeo Bomb');
    expect(msg).toContain('Parcela 1/2');
    expect(msg).toContain('Nubank');
  });

  it('masks PIX keys automatically for CPF/CNPJ and phone', () => {
    expect(maskPixKeyInput('12345678900', 'cpf_cnpj')).toBe('123.456.789-00');
    expect(maskPixKeyInput('12345678000190', 'cpf_cnpj')).toBe(
      '12.345.678/0001-90',
    );
    expect(maskPixKeyInput('41985137391', 'phone')).toBe('(41) 98513-7391');
    expect(maskPixKeyInput('loja@email.com', 'email')).toBe('loja@email.com');
  });

  it('builds draft quote message with items, installment values and PIX', () => {
    const msg = buildDraftQuoteWhatsAppMessage({
      workspaceName: 'Perfumaria Fácil',
      sale: { ...SAMPLE_SALE, status: 'draft' },
      items: SAMPLE_ITEMS,
      pix: SAMPLE_PIX,
    });
    expect(msg).toContain('orçamento do seu pedido');
    expect(msg).toContain('Parcela 1/2');
    expect(msg).toContain('Venc. 30/11/2026');
    expect(msg).toContain('Eros Netto');
  });

  it('builds installment reminder and overdue messages with PIX', () => {
    const reminder = buildInstallmentReminderWhatsAppMessage({
      workspaceName: 'Perfumaria Fácil',
      installment: SAMPLE_INSTALLMENT,
      todayISO: '2026-11-30',
      pix: SAMPLE_PIX,
    });
    expect(reminder).toContain('vence *hoje (30/11/2026)*');
    expect(reminder).toContain('(41) 98513-7391');

    const overdue = buildOverdueInstallmentWhatsAppMessage({
      workspaceName: 'Perfumaria Fácil',
      installment: SAMPLE_INSTALLMENT,
      financeSettings: {
        lateFeeEnabled: true,
        defaultFinePercent: 2,
        defaultMonthlyInterestPercent: 1,
        gracePeriodDays: 0,
      },
      todayISO: '2026-12-10',
      pix: SAMPLE_PIX,
    });
    expect(overdue).toContain('10 dias de atraso');
    expect(overdue).toContain('Encargos por atraso');
    expect(overdue).toContain('Nubank');
  });

  it('respects credit_card and debit_card rules for WhatsApp charges and PIX block', () => {
    expect(shouldShowInstallmentWhatsAppCharge('credit_card')).toBe(false);
    expect(shouldShowInstallmentWhatsAppCharge('debit_card')).toBe(true);
    expect(shouldShowInstallmentWhatsAppCharge('pix')).toBe(true);

    expect(shouldIncludePixInWhatsApp('credit_card')).toBe(false);
    expect(shouldIncludePixInWhatsApp('debit_card')).toBe(false);
    expect(shouldIncludePixInWhatsApp('pix')).toBe(true);
    expect(shouldIncludePixInWhatsApp('cash')).toBe(true);

    const creditReceipt = buildSaleReceiptWhatsAppMessage({
      workspaceName: 'Perfumaria Fácil',
      sale: { ...SAMPLE_SALE, payment_method: 'credit_card' },
      items: SAMPLE_ITEMS,
      installments: SAMPLE_INSTALLMENTS,
      pix: SAMPLE_PIX,
    });
    expect(creditReceipt).toContain('Cartão de Crédito');
    expect(creditReceipt).not.toContain('Nubank');

    const debitReminder = buildInstallmentReminderWhatsAppMessage({
      workspaceName: 'Perfumaria Fácil',
      installment: SAMPLE_INSTALLMENT,
      paymentMethod: 'debit_card',
      todayISO: '2026-11-30',
      pix: SAMPLE_PIX,
    });
    expect(debitReminder).toContain('Forma de pagamento combinada:* Cartão de Débito');
    expect(debitReminder).not.toContain('Nubank');
  });
});
