import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  FormField,
  MoneyText,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  calculateSuggestedLateCharges,
  createPaymentIdempotencyKey,
  getInstallmentDisplayMeta,
  PAYMENT_METHOD_OPTIONS,
  validatePaymentSubmission,
  type WorkspaceFinanceSettings,
} from '@/features/finance/schemas';
import {
  mapFinanceServiceError,
  recordWorkspaceInstallmentPayment,
} from '@/features/finance/services';
import type { InstallmentRow, PaymentMethod } from '@/types/database';
import {
  formatCentsToBRL,
  formatDateBR,
  maskBRLCurrencyInput,
  parseBRLInputToCents,
} from '@/utils/formatters';

export interface ReceivePaymentModalProps {
  visible: boolean;
  workspaceId: string;
  installments: InstallmentRow[];
  financeSettings: WorkspaceFinanceSettings;
  title?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function centsToInputString(cents: number): string {
  if (cents <= 0) {
    return '0,00';
  }
  return (cents / 100).toFixed(2).replace('.', ',');
}

function computeInstallmentsSummary(
  targetInstallments: InstallmentRow[],
  financeSettings: WorkspaceFinanceSettings,
) {
  let principalCents = 0;
  let fineCents = 0;
  let interestCents = 0;
  let maxDaysOverdue = 0;
  let anyOverdue = false;
  let anyWithinGrace = false;

  for (const inst of targetInstallments) {
    principalCents += inst.remaining_principal_cents;
    const calc = calculateSuggestedLateCharges({
      remainingPrincipalCents: inst.remaining_principal_cents,
      dueDateISO: inst.due_date,
      settings: financeSettings,
    });
    fineCents += calc.suggestedFineCents;
    interestCents += calc.suggestedInterestCents;
    if (calc.daysOverdue > maxDaysOverdue) {
      maxDaysOverdue = calc.daysOverdue;
    }
    if (calc.isOverdue) {
      anyOverdue = true;
    }
    if (calc.withinGracePeriod) {
      anyWithinGrace = true;
    }
  }

  return {
    principalCents,
    fineCents,
    interestCents,
    maxDaysOverdue,
    anyOverdue,
    anyWithinGrace,
  };
}

export function ReceivePaymentModal({
  visible,
  workspaceId,
  installments,
  financeSettings,
  title,
  onClose,
  onSuccess,
}: ReceivePaymentModalProps) {
  const openInstallments = useMemo(
    () =>
      installments.filter(
        (item) =>
          item.status !== 'cancelled' &&
          item.status !== 'paid' &&
          item.remaining_principal_cents > 0,
      ),
    [installments],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [principalInput, setPrincipalInput] = useState('');
  const [fineInput, setFineInput] = useState('0,00');
  const [interestInput, setInterestInput] = useState('0,00');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const idempotencyKeyRef = useRef<string>(createPaymentIdempotencyKey());

  const selectedInstallments = useMemo(
    () => openInstallments.filter((item) => selectedIds.includes(item.id)),
    [openInstallments, selectedIds],
  );

  const suggestedCharges = useMemo(
    () => computeInstallmentsSummary(selectedInstallments, financeSettings),
    [financeSettings, selectedInstallments],
  );

  const maxPrincipalCents = suggestedCharges.principalCents;

  const prevVisibleRef = useRef(false);
  const prevKeyRef = useRef('');

  useEffect(() => {
    const currentKey = openInstallments.map((item) => item.id).join(',');
    const wasClosed = !prevVisibleRef.current && visible;
    const keyChanged = prevKeyRef.current !== currentKey;

    if (visible && openInstallments.length > 0 && (wasClosed || keyChanged)) {
      prevKeyRef.current = currentKey;
      const initialIds = openInstallments.map((item) => item.id);
      const initialSummary = computeInstallmentsSummary(
        openInstallments,
        financeSettings,
      );
      setSelectedIds(initialIds);
      setPrincipalInput(centsToInputString(initialSummary.principalCents));
      setFineInput(centsToInputString(initialSummary.fineCents));
      setInterestInput(centsToInputString(initialSummary.interestCents));
      setPaymentMethod('pix');
      setNotes('');
      setErrorMessage(null);
      idempotencyKeyRef.current = createPaymentIdempotencyKey();
    }
    prevVisibleRef.current = visible;
  }, [financeSettings, openInstallments, visible]);

  useEffect(() => {
    idempotencyKeyRef.current = createPaymentIdempotencyKey();
  }, [
    selectedIds,
    principalInput,
    fineInput,
    interestInput,
    paymentMethod,
    notes,
  ]);

  function applySelectionIds(nextIds: string[]): void {
    const nextList = openInstallments.filter((item) =>
      nextIds.includes(item.id),
    );
    const summary = computeInstallmentsSummary(nextList, financeSettings);
    setSelectedIds(nextIds);
    setPrincipalInput(centsToInputString(summary.principalCents));
    setFineInput(centsToInputString(summary.fineCents));
    setInterestInput(centsToInputString(summary.interestCents));
    setErrorMessage(null);
  }

  function handleToggleInstallment(installmentId: string): void {
    const isCurrentlySelected = selectedIds.includes(installmentId);
    const nextIds = isCurrentlySelected
      ? selectedIds.filter((id) => id !== installmentId)
      : [...selectedIds, installmentId];
    applySelectionIds(nextIds);
  }

  function handleToggleAllInstallments(): void {
    const allSelected = selectedIds.length === openInstallments.length;
    const nextIds = allSelected
      ? []
      : openInstallments.map((item) => item.id);
    applySelectionIds(nextIds);
  }

  const parsedPrincipalCents = parseBRLInputToCents(principalInput) ?? 0;
  const parsedFineCents = parseBRLInputToCents(fineInput) ?? 0;
  const parsedInterestCents = parseBRLInputToCents(interestInput) ?? 0;
  const previewTotalReceivedCents = Math.max(
    0,
    parsedPrincipalCents + parsedFineCents + parsedInterestCents,
  );
  const remainingAfterPaymentCents = Math.max(
    0,
    maxPrincipalCents - Math.max(0, parsedPrincipalCents),
  );
  const isWaivedSelected =
    parsedFineCents === 0 && parsedInterestCents === 0;
  const isSuggestedSelected =
    (suggestedCharges.fineCents > 0 || suggestedCharges.interestCents > 0) &&
    parsedFineCents === suggestedCharges.fineCents &&
    parsedInterestCents === suggestedCharges.interestCents;

  function handleApplySuggestedCharges(): void {
    setFineInput(centsToInputString(suggestedCharges.fineCents));
    setInterestInput(centsToInputString(suggestedCharges.interestCents));
    setErrorMessage(null);
  }

  function handleWaiveCharges(): void {
    setFineInput('0,00');
    setInterestInput('0,00');
    setErrorMessage(null);
  }

  async function handleConfirmPayment(): Promise<void> {
    if (isSubmitting || openInstallments.length === 0) {
      return;
    }

    if (selectedInstallments.length === 0) {
      setErrorMessage(
        'Selecione pelo menos uma parcela para registrar o recebimento.',
      );
      return;
    }

    setErrorMessage(null);

    const validation = validatePaymentSubmission({
      maxPrincipalCents,
      principalInput,
      fineInput,
      interestInput,
      paymentMethod,
      notes,
    });

    if (!validation.success || !validation.payload) {
      setErrorMessage(
        validation.errorMessage ?? 'Verifique os valores informados.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await recordWorkspaceInstallmentPayment({
        workspaceId,
        installmentIds: selectedInstallments.map((item) => item.id),
        principalPaymentCents: validation.payload.principalCents,
        fineCents: validation.payload.fineCents,
        interestCents: validation.payload.interestCents,
        paymentMethod: validation.payload.paymentMethod,
        notes: validation.payload.notes,
        idempotencyKey: idempotencyKeyRef.current,
      });

      onSuccess();
    } catch (error) {
      setErrorMessage(mapFinanceServiceError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const singleInstallment =
    openInstallments.length === 1 ? openInstallments[0] : null;
  const isMultipleAvailable = openInstallments.length > 1;
  const allSelected =
    isMultipleAvailable && selectedIds.length === openInstallments.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.headerTitleCol}>
              <Text style={styles.sheetTitle}>
                {title ??
                  (singleInstallment
                    ? singleInstallment.installment_number === 0
                      ? 'Receber entrada'
                      : `Receber parcela ${singleInstallment.installment_number}/${singleInstallment.total_installments}`
                    : `Receber parcelas (${selectedInstallments.length}/${openInstallments.length})`)}
              </Text>
              <Text style={styles.sheetSubtitle}>
                {singleInstallment
                  ? `${singleInstallment.customer_name_snapshot ?? 'Venda avulsa'} • Venc.: ${formatDateBR(singleInstallment.due_date)}`
                  : 'Marque as parcelas que deseja incluir neste recebimento'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              disabled={isSubmitting}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Seletor de Parcelas quando há mais de uma em aberto */}
            {isMultipleAvailable ? (
              <View style={styles.selectorBox}>
                <View style={styles.selectorHeaderRow}>
                  <Text style={styles.selectorTitle}>
                    Parcelas selecionadas ({selectedInstallments.length} de{' '}
                    {openInstallments.length})
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleToggleAllInstallments}
                    style={styles.selectAllBtn}
                  >
                    <Text style={styles.selectAllBtnText}>
                      {allSelected ? 'Limpar seleção' : 'Selecionar todas'}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.selectorList}>
                  {openInstallments.map((inst) => {
                    const isChecked = selectedIds.includes(inst.id);
                    const meta = getInstallmentDisplayMeta(inst);
                    return (
                      <Pressable
                        key={inst.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isChecked }}
                        onPress={() => handleToggleInstallment(inst.id)}
                        style={[
                          styles.selectorItem,
                          isChecked ? styles.selectorItemChecked : null,
                        ]}
                      >
                        <Ionicons
                          name={isChecked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={
                            isChecked ? colors.primary : colors.textSecondary
                          }
                        />
                        <View style={styles.selectorItemInfo}>
                          <Text style={styles.selectorItemTitle}>
                            {inst.installment_number === 0
                              ? 'Entrada'
                              : `Parcela ${inst.installment_number}/${inst.total_installments}`}
                          </Text>
                          <Text style={styles.selectorItemSubtitle}>
                            Venc.: {formatDateBR(inst.due_date)}
                            {meta.state === 'overdue'
                              ? ` • ${meta.label}`
                              : ''}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.selectorItemAmount,
                            isChecked ? styles.selectorItemAmountChecked : null,
                          ]}
                        >
                          {formatCentsToBRL(inst.remaining_principal_cents)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Card de Saldo e Regra de Atraso */}
            <View style={styles.balanceBanner}>
              <View style={styles.balanceTopRow}>
                <View>
                  <Text style={styles.balanceLabel}>
                    {isMultipleAvailable
                      ? 'Saldo principal das selecionadas'
                      : 'Saldo principal em aberto'}
                  </Text>
                  <MoneyText
                    cents={maxPrincipalCents}
                    size="md"
                    tone="primary"
                  />
                </View>

                {selectedInstallments.length === 0 ? (
                  <StatusBadge label="Nenhuma marcada" tone="warning" />
                ) : suggestedCharges.anyOverdue ? (
                  <StatusBadge
                    label={
                      suggestedCharges.anyWithinGrace
                        ? `Em carência (${suggestedCharges.maxDaysOverdue}d)`
                        : `Atraso de ${suggestedCharges.maxDaysOverdue}d`
                    }
                    tone={
                      suggestedCharges.anyWithinGrace ? 'warning' : 'error'
                    }
                  />
                ) : (
                  <StatusBadge label="Em dia" tone="success" />
                )}
              </View>

              {suggestedCharges.anyOverdue ? (
                <View style={styles.lateRuleBox}>
                  <Text style={styles.lateRuleText}>
                    {financeSettings.lateFeeEnabled
                      ? `Regra padrão do negócio: multa ${financeSettings.defaultFinePercent
                          .toFixed(2)
                          .replace('.', ',')}% + juros ${financeSettings.defaultMonthlyInterestPercent
                          .toFixed(2)
                          .replace('.', ',')}% a.m. (${financeSettings.gracePeriodDays}d de carência). Você pode editar ou isentar abaixo.`
                      : 'Cálculo automático de multa/juros desativado nas configurações, mas você pode informar valores manualmente abaixo.'}
                  </Text>
                  <View style={styles.quickChargeButtonsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isWaivedSelected }}
                      onPress={handleWaiveCharges}
                      style={[
                        styles.chipButton,
                        isWaivedSelected ? styles.chipButtonPrimary : null,
                      ]}
                    >
                      <Ionicons
                        name={
                          isWaivedSelected
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={15}
                        color={
                          isWaivedSelected
                            ? colors.primaryDark
                            : colors.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.chipButtonText,
                          isWaivedSelected
                            ? styles.chipButtonPrimaryText
                            : null,
                        ]}
                      >
                        Isentar juros/multa
                      </Text>
                    </Pressable>
                    {suggestedCharges.fineCents > 0 ||
                    suggestedCharges.interestCents > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSuggestedSelected }}
                        onPress={handleApplySuggestedCharges}
                        style={[
                          styles.chipButton,
                          isSuggestedSelected ? styles.chipButtonPrimary : null,
                        ]}
                      >
                        <Ionicons
                          name={
                            isSuggestedSelected
                              ? 'checkmark-circle'
                              : 'ellipse-outline'
                          }
                          size={15}
                          color={
                            isSuggestedSelected
                              ? colors.primaryDark
                              : colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.chipButtonText,
                            isSuggestedSelected
                              ? styles.chipButtonPrimaryText
                              : null,
                          ]}
                        >
                          Aplicar padrão
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Valor Principal (permite pagamento total ou parcial) */}
            <FormField
              label="Valor principal a abater (R$) *"
              placeholder="0,00"
              keyboardType="decimal-pad"
              value={principalInput}
              onChangeText={(val) => {
                setPrincipalInput(maskBRLCurrencyInput(val));
                setErrorMessage(null);
              }}
              helperText={
                selectedInstallments.length === 0
                  ? 'Marque pelo menos uma parcela acima.'
                  : remainingAfterPaymentCents > 0
                    ? `Pagamento parcial: restarão ${formatCentsToBRL(remainingAfterPaymentCents)} em aberto na(s) parcela(s) selecionada(s).`
                    : 'Quitação integral do saldo principal selecionado.'
              }
            />

            {/* Multa e Juros Editáveis */}
            <View style={styles.twoColumnsRow}>
              <View style={styles.halfCol}>
                <FormField
                  label="Multa (R$)"
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  value={fineInput}
                  onChangeText={(val) => {
                    setFineInput(maskBRLCurrencyInput(val));
                    setErrorMessage(null);
                  }}
                />
              </View>
              <View style={styles.halfCol}>
                <FormField
                  label="Juros / Acréscimo (R$)"
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  value={interestInput}
                  onChangeText={(val) => {
                    setInterestInput(maskBRLCurrencyInput(val));
                    setErrorMessage(null);
                  }}
                />
              </View>
            </View>

            {/* Método de Pagamento */}
            <Text style={styles.fieldTitle}>Forma de recebimento</Text>
            <View style={styles.methodGrid}>
              {PAYMENT_METHOD_OPTIONS.map((opt) => {
                const isSelected = paymentMethod === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setPaymentMethod(opt.value)}
                    style={[
                      styles.methodChip,
                      isSelected ? styles.methodChipSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.methodChipText,
                        isSelected ? styles.methodChipTextSelected : null,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <FormField
              label="Observação do recebimento (opcional)"
              placeholder="Ex.: Comprovante PIX enviado no WhatsApp"
              value={notes}
              onChangeText={(val) => {
                setNotes(val);
                setErrorMessage(null);
              }}
            />

            {/* Total Efetivo a Receber */}
            <View style={styles.totalSummaryBox}>
              <View style={styles.totalSummaryRow}>
                <Text style={styles.totalSummaryLabel}>
                  Total recebido agora
                </Text>
                <MoneyText
                  cents={previewTotalReceivedCents}
                  size="lg"
                  tone="primary"
                />
              </View>
              {parsedFineCents + parsedInterestCents > 0 ? (
                <Text style={styles.totalSummaryBreakdown}>
                  Principal: {formatCentsToBRL(parsedPrincipalCents)} + Multa:{' '}
                  {formatCentsToBRL(parsedFineCents)} + Juros:{' '}
                  {formatCentsToBRL(parsedInterestCents)}
                </Text>
              ) : null}
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.actionsColumn}>
              <PrimaryButton
                label="Confirmar recebimento"
                iconName="checkmark-circle-outline"
                loading={isSubmitting}
                onPress={() => {
                  void handleConfirmPayment();
                }}
              />
              <SecondaryButton
                label="Cancelar"
                disabled={isSubmitting}
                onPress={onClose}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerTitleCol: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    ...typography.section,
    color: colors.text,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  selectorBox: {
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  selectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectorTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  selectAllBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectAllBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  selectorList: {
    gap: spacing.xs,
  },
  selectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectorItemChecked: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  selectorItemInfo: {
    flex: 1,
    gap: 1,
  },
  selectorItemTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  selectorItemSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  selectorItemAmount: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  selectorItemAmountChecked: {
    color: colors.primaryDark,
  },
  balanceBanner: {
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  balanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  balanceLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  lateRuleBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  lateRuleText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  quickChargeButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipButtonPrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipButtonPrimaryText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  twoColumnsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfCol: {
    flex: 1,
  },
  fieldTitle: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  methodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  methodChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  methodChipTextSelected: {
    color: colors.primaryDark,
  },
  totalSummaryBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
  },
  totalSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalSummaryLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  totalSummaryBreakdown: {
    ...typography.caption,
    color: colors.primaryDark,
  },
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.error,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.error,
  },
  actionsColumn: {
    gap: spacing.sm,
  },
});
