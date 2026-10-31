import {
  addDaysToISODate,
  buildInstallmentPreview,
  calculateSuggestedLateCharges,
  getInstallmentDisplayMeta,
  getTodayISODate,
  PAYMENT_METHOD_LABELS,
  SALE_PAYMENT_MODE_LABELS,
  type WorkspaceFinanceSettings,
} from '@/features/finance/schemas';
import type {
  InstallmentRow,
  PaymentMethod,
  PixKeyType,
  SaleItemRow,
  SaleRow,
  WorkspaceRow,
} from '@/types/database';
import { formatCentsToBRL, formatDateBR, maskPhoneBR } from '@/utils/formatters';

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf_cnpj: 'CPF / CNPJ',
  phone: 'Celular',
  email: 'E-mail',
  random: 'Chave Aleatória',
};

export const PIX_KEY_TYPE_OPTIONS: {
  key: PixKeyType;
  label: string;
}[] = [
  { key: 'cpf_cnpj', label: 'CPF / CNPJ' },
  { key: 'phone', label: 'Celular' },
  { key: 'email', label: 'E-mail' },
  { key: 'random', label: 'Aleatória' },
];

export interface WorkspacePixSettings {
  pixKeyType: PixKeyType;
  pixKey: string;
  pixBankName: string;
  pixHolderName: string;
}

export const DEFAULT_WORKSPACE_PIX_SETTINGS: WorkspacePixSettings = {
  pixKeyType: 'cpf_cnpj',
  pixKey: '',
  pixBankName: '',
  pixHolderName: '',
};

export function getWorkspacePixSettings(
  workspace: WorkspaceRow | null | undefined,
  fallback?: WorkspacePixSettings | null,
): WorkspacePixSettings {
  if (workspace?.pix_key && workspace.pix_key.trim().length > 0) {
    return {
      pixKeyType: workspace.pix_key_type ?? 'cpf_cnpj',
      pixKey: workspace.pix_key.trim(),
      pixBankName: (workspace.pix_bank_name ?? '').trim(),
      pixHolderName: (workspace.pix_holder_name ?? '').trim(),
    };
  }

  if (fallback && fallback.pixKey.trim().length > 0) {
    return {
      pixKeyType: fallback.pixKeyType ?? 'cpf_cnpj',
      pixKey: fallback.pixKey.trim(),
      pixBankName: fallback.pixBankName.trim(),
      pixHolderName: fallback.pixHolderName.trim(),
    };
  }

  return DEFAULT_WORKSPACE_PIX_SETTINGS;
}

export function hasConfiguredPix(
  pix: WorkspacePixSettings | null | undefined,
): boolean {
  return Boolean(pix && pix.pixKey.trim().length > 0);
}

/**
 * Define se uma parcela deve exibir o botão de "Lembrar / Cobrar" no WhatsApp.
 * Vendas no Cartão de Crédito já foram passadas na maquininha (cobradas na fatura do cliente),
 * portanto não exibem botão de cobrança para evitar cobrança duplicada.
 */
export function shouldShowInstallmentWhatsAppCharge(
  paymentMethod?: PaymentMethod | null,
): boolean {
  return paymentMethod !== 'credit_card';
}

/**
 * Define se a mensagem de WhatsApp deve anexar o bloco com a Chave PIX do vendedor.
 * Para Cartão de Crédito e Cartão de Débito, a chave PIX não é enviada.
 */
export function shouldIncludePixInWhatsApp(
  paymentMethod?: PaymentMethod | null,
): boolean {
  return paymentMethod !== 'credit_card' && paymentMethod !== 'debit_card';
}

/**
 * Aplica máscara automática de CPF (000.000.000-00) até 11 dígitos
 * ou CNPJ (00.000.000/0000-00) de 12 a 14 dígitos.
 */
export function maskCpfCnpjBR(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  if (!digits) {
    return '';
  }

  if (digits.length <= 11) {
    if (digits.length <= 3) {
      return digits;
    }
    if (digits.length <= 6) {
      return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    }
    if (digits.length <= 9) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Aplica máscara automática na chave PIX de acordo com o tipo selecionado.
 */
export function maskPixKeyInput(raw: string, keyType: PixKeyType): string {
  if (keyType === 'cpf_cnpj') {
    return maskCpfCnpjBR(raw);
  }
  if (keyType === 'phone') {
    return maskPhoneBR(raw);
  }
  return raw;
}

export interface ValidatePixSettingsResult {
  success: boolean;
  errorMessage?: string;
  payload?: WorkspacePixSettings;
}

export function validatePixSettingsInput(input: {
  pixKeyType: PixKeyType;
  pixKeyInput: string;
  pixBankNameInput: string;
  pixHolderNameInput: string;
}): ValidatePixSettingsResult {
  const cleanKey = input.pixKeyInput.trim();
  const cleanBank = input.pixBankNameInput.trim();
  const cleanHolder = input.pixHolderNameInput.trim();

  // Permite limpar os dados PIX caso o usuário apague a chave
  if (!cleanKey) {
    return {
      success: true,
      payload: {
        pixKeyType: input.pixKeyType,
        pixKey: '',
        pixBankName: '',
        pixHolderName: '',
      },
    };
  }

  if (cleanKey.length > 140) {
    return {
      success: false,
      errorMessage: 'A chave PIX deve ter no máximo 140 caracteres.',
    };
  }

  if (cleanBank.length > 80) {
    return {
      success: false,
      errorMessage: 'O nome do banco deve ter no máximo 80 caracteres.',
    };
  }

  if (cleanHolder.length > 120) {
    return {
      success: false,
      errorMessage: 'O nome do titular no banco deve ter no máximo 120 caracteres.',
    };
  }

  return {
    success: true,
    payload: {
      pixKeyType: input.pixKeyType,
      pixKey: cleanKey,
      pixBankName: cleanBank,
      pixHolderName: cleanHolder,
    },
  };
}

/**
 * Normaliza telefone brasileiro para uso em links do WhatsApp (`55` + DDD + número).
 * Retorna `null` se não houver dígitos suficientes.
 */
export function normalizeWhatsAppPhoneBR(
  phone: string | null | undefined,
): string | null {
  if (!phone) {
    return null;
  }
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits.length >= 10 ? digits : null;
}

/**
 * Formata o bloco de PIX do vendedor (Chave + Banco + Nome) para anexar em mensagens do WhatsApp.
 */
export function formatPixBlockForWhatsApp(
  pix: WorkspacePixSettings | null | undefined,
): string {
  if (!pix || !pix.pixKey.trim()) {
    return '';
  }

  const keyLabel = PIX_KEY_TYPE_LABELS[pix.pixKeyType] ?? 'PIX';
  const lines: string[] = [
    '💳 *Dados para pagamento via PIX:*',
    `• *Chave (${keyLabel}):* ${pix.pixKey.trim()}`,
  ];

  if (pix.pixBankName.trim()) {
    lines.push(`• *Banco:* ${pix.pixBankName.trim()}`);
  }
  if (pix.pixHolderName.trim()) {
    lines.push(`• *Favorecido:* ${pix.pixHolderName.trim()}`);
  }

  return lines.join('\n');
}

/**
 * 1. Comprovante / Recibo de Venda Confirmada
 */
export function buildSaleReceiptWhatsAppMessage(params: {
  workspaceName: string;
  sale: SaleRow;
  items: SaleItemRow[];
  installments: InstallmentRow[];
  pix?: WorkspacePixSettings | null;
}): string {
  const { workspaceName, sale, items, installments, pix } = params;
  const code = sale.id.slice(0, 8).toUpperCase();
  const saleDateStr = formatDateBR(sale.sale_date ?? sale.created_at);
  const customerName = sale.customer_name_snapshot?.trim();

  const lines: string[] = [];
  if (customerName) {
    lines.push(`Olá, *${customerName}*! Tudo bem?`);
    lines.push(`Segue o comprovante da sua compra em *${workspaceName}*:`);
  } else {
    lines.push(`🧾 *COMPROVANTE DE VENDA — ${workspaceName}*`);
  }

  lines.push('');
  lines.push(`📌 *Pedido:* #${code} • *Data:* ${saleDateStr}`);

  if (items.length > 0) {
    lines.push('');
    lines.push('🛍️ *Itens da compra:*');
    for (const item of items) {
      lines.push(
        `• ${item.quantity}x ${item.product_name_snapshot} — ${formatCentsToBRL(item.line_total_cents)}`,
      );
    }
  }

  lines.push('');
  if (sale.discount_cents > 0) {
    lines.push(`Subtotal: ${formatCentsToBRL(sale.subtotal_cents)}`);
    lines.push(`Desconto: - ${formatCentsToBRL(sale.discount_cents)}`);
  }
  lines.push(`💰 *Total da venda: ${formatCentsToBRL(sale.total_cents)}*`);

  const mode = sale.payment_mode ?? 'cash';
  const methodLabel = PAYMENT_METHOD_LABELS[sale.payment_method ?? 'pix'];

  lines.push('');
  if (mode === 'cash') {
    lines.push(`✅ *Forma de pagamento:* À vista (${methodLabel})`);
  } else {
    lines.push(
      `📅 *Condição:* ${SALE_PAYMENT_MODE_LABELS[mode]} (${methodLabel})`,
    );

    const activeInstallments = installments.filter(
      (i) => i.status !== 'cancelled',
    );
    if (activeInstallments.length > 0) {
      for (const inst of activeInstallments) {
        const label =
          inst.installment_number === 0
            ? 'Entrada'
            : `Parcela ${inst.installment_number}/${inst.total_installments}`;
        if (inst.status === 'paid' || inst.remaining_principal_cents <= 0) {
          lines.push(
            `• ${label}: ${formatCentsToBRL(inst.principal_cents)} — ✅ Paga`,
          );
        } else {
          lines.push(
            `• ${label}: ${formatCentsToBRL(inst.remaining_principal_cents)} — ⏳ Venc. ${formatDateBR(inst.due_date)}`,
          );
        }
      }
    }
  }

  const hasOpenInstallment = installments.some(
    (i) =>
      i.status !== 'cancelled' &&
      i.status !== 'paid' &&
      i.remaining_principal_cents > 0,
  );

  if (
    hasOpenInstallment &&
    shouldIncludePixInWhatsApp(sale.payment_method) &&
    hasConfiguredPix(pix)
  ) {
    lines.push('');
    lines.push(formatPixBlockForWhatsApp(pix));
  }

  lines.push('');
  lines.push('Obrigado pela preferência! 🤝');

  return lines.join('\n');
}

/**
 * 2. Orçamento / Resumo de Rascunho de Venda
 */
export function buildDraftQuoteWhatsAppMessage(params: {
  workspaceName: string;
  sale: SaleRow;
  items: SaleItemRow[];
  pix?: WorkspacePixSettings | null;
}): string {
  const { workspaceName, sale, items, pix } = params;
  const customerName = sale.customer_name_snapshot?.trim();

  const lines: string[] = [];
  if (customerName) {
    lines.push(`Olá, *${customerName}*! Tudo bem?`);
    lines.push(`Segue o orçamento do seu pedido em *${workspaceName}*:`);
  } else {
    lines.push(`📋 *ORÇAMENTO DE PEDIDO — ${workspaceName}*`);
  }

  if (items.length > 0) {
    lines.push('');
    lines.push('🛍️ *Itens do pedido:*');
    for (const item of items) {
      lines.push(
        `• ${item.quantity}x ${item.product_name_snapshot} (${formatCentsToBRL(item.unit_price_cents)} un.) — ${formatCentsToBRL(item.line_total_cents)}`,
      );
    }
  }

  lines.push('');
  if (sale.discount_cents > 0) {
    lines.push(`Subtotal: ${formatCentsToBRL(sale.subtotal_cents)}`);
    lines.push(`Desconto especial: - ${formatCentsToBRL(sale.discount_cents)}`);
  }
  lines.push(`💰 *Valor Total: ${formatCentsToBRL(sale.total_cents)}*`);

  const mode = sale.payment_mode ?? 'cash';
  const methodLabel = PAYMENT_METHOD_LABELS[sale.payment_method ?? 'pix'];
  lines.push('');
  if (mode === 'cash') {
    lines.push(`📌 *Condição:* À vista (${methodLabel})`);
  } else {
    const count = Math.max(1, sale.installment_count ?? 1);
    const down = Math.max(0, sale.down_payment_cents ?? 0);
    const baseSaleDate =
      sale.sale_date ?? sale.created_at.slice(0, 10) ?? getTodayISODate();
    const firstDueISO =
      sale.first_due_date ?? addDaysToISODate(baseSaleDate, 30);

    const previewItems = buildInstallmentPreview({
      totalCents: sale.total_cents,
      paymentMode: 'installments',
      downPaymentCents: down,
      installmentCount: count,
      firstDueDateISO: firstDueISO,
      todayISO: baseSaleDate,
    });

    const regularInstallments = previewItems.filter((item) => !item.isEntry);
    const firstInstallmentAmount = regularInstallments[0]?.amountCents ?? 0;

    if (down > 0 && firstInstallmentAmount > 0) {
      lines.push(
        `📌 *Condição:* Entrada de ${formatCentsToBRL(down)} + ${count}x de ${formatCentsToBRL(firstInstallmentAmount)} (${methodLabel})`,
      );
    } else if (firstInstallmentAmount > 0) {
      lines.push(
        `📌 *Condição:* Parcelado em ${count}x de ${formatCentsToBRL(firstInstallmentAmount)} (${methodLabel})`,
      );
    } else {
      lines.push(`📌 *Condição:* Parcelado em ${count}x (${methodLabel})`);
    }

    if (previewItems.length > 0) {
      for (const item of previewItems) {
        if (item.isEntry) {
          lines.push(`• Entrada: ${formatCentsToBRL(item.amountCents)}`);
        } else {
          lines.push(
            `• Parcela ${item.installmentNumber}/${item.totalInstallments}: ${formatCentsToBRL(item.amountCents)} — Venc. ${formatDateBR(item.dueDateISO)}`,
          );
        }
      }
    }
  }

  if (shouldIncludePixInWhatsApp(sale.payment_method) && hasConfiguredPix(pix)) {
    lines.push('');
    lines.push(formatPixBlockForWhatsApp(pix));
  }

  lines.push('');
  lines.push('Fico no aguardo da sua confirmação para separar o pedido! 😊');

  return lines.join('\n');
}

/**
 * 3. Lembrete Amigável de Vencimento (Parcela a vencer ou que vence hoje)
 */
export function buildInstallmentReminderWhatsAppMessage(params: {
  workspaceName: string;
  installment: InstallmentRow;
  paymentMethod?: PaymentMethod | null;
  todayISO?: string;
  pix?: WorkspacePixSettings | null;
}): string {
  const { workspaceName, installment, paymentMethod, pix } = params;
  const today = params.todayISO ?? getTodayISODate();
  const customerName =
    installment.customer_name_snapshot?.trim() || 'Cliente';
  const parcelLabel =
    installment.installment_number === 0
      ? 'entrada'
      : `parcela ${installment.installment_number}/${installment.total_installments}`;
  const formattedDue = formatDateBR(installment.due_date);
  const formattedAmount = formatCentsToBRL(
    installment.remaining_principal_cents,
  );
  const isDueToday = installment.due_date === today;

  const lines: string[] = [
    `Olá, *${customerName}*! Tudo bem?`,
    '',
    isDueToday
      ? `Passando para lembrar que a sua *${parcelLabel}* referente à compra em *${workspaceName}* vence *hoje (${formattedDue})*.`
      : `Passando para lembrar da sua *${parcelLabel}* referente à compra em *${workspaceName}*, com vencimento em *${formattedDue}*.`,
    '',
    `💰 *Valor em aberto:* ${formattedAmount}`,
  ];

  if (paymentMethod === 'debit_card') {
    lines.push('💳 *Forma de pagamento combinada:* Cartão de Débito');
  } else if (shouldIncludePixInWhatsApp(paymentMethod) && hasConfiguredPix(pix)) {
    lines.push('');
    lines.push(formatPixBlockForWhatsApp(pix));
  }

  lines.push('');
  lines.push(
    'Caso já tenha realizado o pagamento, por favor desconsidere ou nos envie o comprovante. Muito obrigado! 🙏',
  );

  return lines.join('\n');
}

/**
 * 4. Cobrança de Parcela em Atraso
 */
export function buildOverdueInstallmentWhatsAppMessage(params: {
  workspaceName: string;
  installment: InstallmentRow;
  financeSettings: WorkspaceFinanceSettings;
  paymentMethod?: PaymentMethod | null;
  todayISO?: string;
  pix?: WorkspacePixSettings | null;
}): string {
  const { workspaceName, installment, financeSettings, paymentMethod, pix } =
    params;
  const today = params.todayISO ?? getTodayISODate();
  const customerName =
    installment.customer_name_snapshot?.trim() || 'Cliente';
  const parcelLabel =
    installment.installment_number === 0
      ? 'entrada'
      : `parcela ${installment.installment_number}/${installment.total_installments}`;
  const formattedDue = formatDateBR(installment.due_date);

  const lateCalc = calculateSuggestedLateCharges({
    remainingPrincipalCents: installment.remaining_principal_cents,
    dueDateISO: installment.due_date,
    referenceDateISO: today,
    settings: financeSettings,
  });

  const hasExtraCharges =
    lateCalc.suggestedFineCents + lateCalc.suggestedInterestCents > 0;

  const lines: string[] = [
    `Olá, *${customerName}*! Tudo bem?`,
    '',
    `Identificamos em aberto em *${workspaceName}* a *${parcelLabel}*, vencida em *${formattedDue}* (${lateCalc.daysOverdue === 1 ? '1 dia de atraso' : `${lateCalc.daysOverdue} dias de atraso`}).`,
    '',
    `• *Valor principal:* ${formatCentsToBRL(installment.remaining_principal_cents)}`,
  ];

  if (hasExtraCharges) {
    lines.push(
      `• *Encargos por atraso:* + ${formatCentsToBRL(lateCalc.suggestedFineCents + lateCalc.suggestedInterestCents)}`,
    );
    lines.push(
      `💰 *Total atualizado para quitação:* ${formatCentsToBRL(lateCalc.suggestedTotalCents)}`,
    );
  } else {
    lines.push(
      `💰 *Valor para quitação:* ${formatCentsToBRL(installment.remaining_principal_cents)}`,
    );
  }

  if (paymentMethod === 'debit_card') {
    lines.push('💳 *Forma de pagamento combinada:* Cartão de Débito');
  } else if (shouldIncludePixInWhatsApp(paymentMethod) && hasConfiguredPix(pix)) {
    lines.push('');
    lines.push(formatPixBlockForWhatsApp(pix));
  }

  lines.push('');
  lines.push(
    paymentMethod === 'debit_card'
      ? 'Qualquer dúvida ou para combinarmos o pagamento no cartão de débito, estamos à disposição!'
      : 'Assim que realizar o pagamento, pode nos enviar o comprovante por aqui para darmos baixa. Qualquer dúvida estamos à disposição!',
  );

  return lines.join('\n');
}

/**
 * Escolhe automaticamente entre Lembrete de Vencimento e Cobrança em Atraso
 * com base no estado atual da parcela.
 */
export function buildSmartInstallmentWhatsAppMessage(params: {
  workspaceName: string;
  installment: InstallmentRow;
  financeSettings: WorkspaceFinanceSettings;
  paymentMethod?: PaymentMethod | null;
  todayISO?: string;
  pix?: WorkspacePixSettings | null;
}): string {
  const today = params.todayISO ?? getTodayISODate();
  const meta = getInstallmentDisplayMeta(params.installment, today);
  if (meta.state === 'overdue') {
    return buildOverdueInstallmentWhatsAppMessage({
      ...params,
      todayISO: today,
    });
  }
  return buildInstallmentReminderWhatsAppMessage({
    workspaceName: params.workspaceName,
    installment: params.installment,
    paymentMethod: params.paymentMethod,
    todayISO: today,
    pix: params.pix,
  });
}

/**
 * 5. Resumo de Parcelas em Aberto do Cliente (Ficha do Cliente)
 */
export function buildCustomerOpenSummaryWhatsAppMessage(params: {
  workspaceName: string;
  customerName: string;
  openInstallments: InstallmentRow[];
  includePix?: boolean;
  paymentMethodNote?: string | null;
  pix?: WorkspacePixSettings | null;
}): string {
  const {
    workspaceName,
    customerName,
    openInstallments,
    includePix = true,
    paymentMethodNote,
    pix,
  } = params;

  if (openInstallments.length === 0) {
    return `Olá, *${customerName}*! Tudo bem? Aqui é da *${workspaceName}*. Como podemos ajudar você hoje?`;
  }

  const totalOpenCents = openInstallments.reduce(
    (sum, inst) => sum + inst.remaining_principal_cents,
    0,
  );

  const lines: string[] = [
    `Olá, *${customerName}*! Tudo bem?`,
    `Segue o resumo das suas parcelas em aberto em *${workspaceName}*:`,
    '',
  ];

  for (const inst of openInstallments) {
    const label =
      inst.installment_number === 0
        ? 'Entrada'
        : `Parcela ${inst.installment_number}/${inst.total_installments}`;
    lines.push(
      `• *${label}* — Venc. ${formatDateBR(inst.due_date)}: ${formatCentsToBRL(inst.remaining_principal_cents)}`,
    );
  }

  lines.push('');
  lines.push(`💰 *Total em aberto: ${formatCentsToBRL(totalOpenCents)}*`);

  if (paymentMethodNote) {
    lines.push(`💳 *Forma de pagamento combinada:* ${paymentMethodNote}`);
  }

  if (includePix && hasConfiguredPix(pix)) {
    lines.push('');
    lines.push(formatPixBlockForWhatsApp(pix));
  }

  lines.push('');
  lines.push('Qualquer dúvida estamos à disposição!');

  return lines.join('\n');
}
