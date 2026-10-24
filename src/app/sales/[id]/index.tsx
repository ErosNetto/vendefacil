import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  ConfirmDialog,
  ErrorState,
  FormField,
  LoadingState,
  MoneyText,
  PrimaryButton,
  Screen,
  SearchField,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { listWorkspaceCustomers } from '@/features/customers/services';
import { ReceivePaymentModal } from '@/features/finance/ReceivePaymentModal';
import {
  calculateSuggestedLateCharges,
  getInstallmentDisplayMeta,
  getWorkspaceFinanceSettings,
  PAYMENT_METHOD_LABELS,
  SALE_PAYMENT_MODE_LABELS,
} from '@/features/finance/schemas';
import {
  listWorkspaceInstallments,
  listWorkspacePayments,
} from '@/features/finance/services';
import { cancelSaleSchema, SALE_STATUS_META } from '@/features/sales/schemas';
import {
  cancelWorkspaceSale,
  confirmWorkspaceDraftSale,
  getWorkspaceSaleDetail,
  linkSaleCustomer,
  mapSaleServiceError,
} from '@/features/sales/services';
import type {
  CustomerRow,
  InstallmentRow,
  PaymentRow,
  SaleItemRow,
  SaleRow,
} from '@/types/database';
import {
  formatCentsToBRL,
  formatDateBR,
  formatDateTimeBR,
} from '@/utils/formatters';

export default function SaleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;
  const financeSettings = getWorkspaceFinanceSettings(
    activeWorkspace?.workspace,
  );

  const [sale, setSale] = useState<SaleRow | null>(null);
  const [items, setItems] = useState<SaleItemRow[]>([]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [confirmDraftModalOpen, setConfirmDraftModalOpen] = useState(false);
  const [isConfirmingDraft, setIsConfirmingDraft] = useState(false);

  const [paymentModalInstallments, setPaymentModalInstallments] = useState<
    InstallmentRow[]
  >([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(
    null,
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customersList, setCustomersList] = useState<CustomerRow[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLinkingCustomer, setIsLinkingCustomer] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) {
      return customersList;
    }
    return customersList.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)),
    );
  }, [customerSearch, customersList]);

  async function handleOpenCustomerPicker(): Promise<void> {
    if (!workspaceId) {
      return;
    }
    setIsCustomerModalOpen(true);
    setCustomerSearch('');
    setIsLoadingCustomers(true);
    try {
      const customers = await listWorkspaceCustomers(workspaceId);
      setCustomersList(customers.filter((c) => !c.is_archived));
    } catch {
      setCustomersList([]);
    } finally {
      setIsLoadingCustomers(false);
    }
  }

  async function handleSelectCustomer(
    customer: CustomerRow | null,
  ): Promise<void> {
    if (!workspaceId || !sale || isLinkingCustomer) {
      return;
    }

    setIsLinkingCustomer(true);
    setActionError(null);
    try {
      const result = await linkSaleCustomer(
        workspaceId,
        sale.id,
        customer ? customer.id : null,
      );
      setSale((prev) =>
        prev
          ? {
              ...prev,
              customer_id: result.customerId,
              customer_name_snapshot: result.customerName,
            }
          : null,
      );
      setInstallments((prev) =>
        prev.map((inst) => ({
          ...inst,
          customer_id: result.customerId,
          customer_name_snapshot: result.customerName,
        })),
      );
      setIsCustomerModalOpen(false);
    } catch (err) {
      setActionError(mapSaleServiceError(err));
    } finally {
      setIsLinkingCustomer(false);
    }
  }

  const loadSaleDetail = useCallback(async () => {
    if (!workspaceId || !id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [detail, saleInstallments, salePayments] = await Promise.all([
        getWorkspaceSaleDetail(workspaceId, id),
        listWorkspaceInstallments(workspaceId, { saleId: id }).catch(() => []),
        listWorkspacePayments(workspaceId, { saleId: id }).catch(() => []),
      ]);
      if (!detail) {
        setErrorMessage('Venda não encontrada neste espaço de trabalho.');
        return;
      }
      setSale(detail.sale);
      setItems(detail.items);
      setInstallments(saleInstallments);
      setPayments(salePayments);
    } catch (error) {
      setErrorMessage(mapSaleServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [id, workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadSaleDetail();
    }, [loadSaleDetail]),
  );

  async function handleConfirmDraft(): Promise<void> {
    if (!workspaceId || !sale || isConfirmingDraft) {
      return;
    }

    setIsConfirmingDraft(true);
    setActionError(null);
    try {
      await confirmWorkspaceDraftSale(workspaceId, sale.id);
      setConfirmDraftModalOpen(false);
      await loadSaleDetail();
    } catch (error) {
      setConfirmDraftModalOpen(false);
      setActionError(mapSaleServiceError(error));
    } finally {
      setIsConfirmingDraft(false);
    }
  }

  async function handleCancelSale(): Promise<void> {
    if (!workspaceId || !sale || isCancelling) {
      return;
    }

    setCancelReasonError(null);
    setActionError(null);

    const parsed = cancelSaleSchema.safeParse({ reason: cancelReason });
    if (!parsed.success) {
      setCancelReasonError(
        parsed.error.issues[0]?.message ?? 'Informe o motivo do cancelamento.',
      );
      return;
    }

    setIsCancelling(true);
    try {
      await cancelWorkspaceSale(workspaceId, sale.id, parsed.data.reason);
      setShowCancelForm(false);
      setCancelReason('');
      await loadSaleDetail();
    } catch (error) {
      setActionError(mapSaleServiceError(error));
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Carregando detalhes da venda..." />
      </Screen>
    );
  }

  if (errorMessage || !sale) {
    return (
      <Screen>
        <AppHeader title="Venda" showBack />
        <ErrorState
          title="Não foi possível abrir a venda"
          message={errorMessage ?? 'Venda não localizada.'}
          onRetry={() => {
            void loadSaleDetail();
          }}
        />
      </Screen>
    );
  }

  const statusMeta = SALE_STATUS_META[sale.status];

  return (
    <Screen>
      <AppHeader
        title="Detalhe da venda"
        subtitle={`Código #${sale.id.slice(0, 8).toUpperCase()}`}
        showBack
      />

      {/* Cabeçalho e Status */}
      <View style={styles.card}>
        <View style={styles.topBadgeRow}>
          <StatusBadge
            label={`Venda ${statusMeta.label.toLowerCase()}`}
            tone={statusMeta.tone}
          />
          <Text style={styles.dateText}>
            {formatDateTimeBR(sale.created_at)}
          </Text>
        </View>

        <View style={styles.customerSection}>
          <View style={styles.customerIconWrap}>
            <Ionicons
              name="person-outline"
              size={20}
              color={colors.primaryDark}
            />
          </View>
          <View style={styles.customerTextCol}>
            <Text style={styles.metaLabel}>Cliente</Text>
            <Text style={styles.customerName}>
              {sale.customer_name_snapshot ?? 'Venda avulsa (Balcão)'}
            </Text>
          </View>
          {sale.customer_id ? (
            <View style={styles.customerButtonsCol}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/customers/${sale.customer_id}`)}
                style={styles.openCustomerButton}
              >
                <Text style={styles.openCustomerText}>Ver ficha</Text>
              </Pressable>
              {sale.status !== 'cancelled' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleOpenCustomerPicker()}
                  style={styles.changeCustomerButton}
                >
                  <Text style={styles.changeCustomerText}>Trocar</Text>
                </Pressable>
              ) : null}
            </View>
          ) : sale.status !== 'cancelled' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleOpenCustomerPicker()}
              style={styles.linkCustomerButton}
            >
              <Ionicons
                name="person-add-outline"
                size={15}
                color={colors.primaryDark}
              />
              <Text style={styles.linkCustomerText}>Vincular</Text>
            </Pressable>
          ) : null}
        </View>

        {sale.confirmed_at ? (
          <Text style={styles.timestampNote}>
            Confirmada em {formatDateTimeBR(sale.confirmed_at)}
          </Text>
        ) : null}

        {sale.status === 'cancelled' ? (
          <View style={styles.cancelledBanner}>
            <View style={styles.cancelledHeader}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.error}
              />
              <Text style={styles.cancelledTitle}>
                Venda cancelada
                {sale.cancelled_at
                  ? ` em ${formatDateTimeBR(sale.cancelled_at)}`
                  : ''}
              </Text>
            </View>
            {sale.cancellation_reason ? (
              <Text style={styles.cancelledReasonText}>
                Motivo: {sale.cancellation_reason}
              </Text>
            ) : null}
          </View>
        ) : null}

        {sale.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.metaLabel}>Observações</Text>
            <Text style={styles.notesValue}>{sale.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Itens com Snapshot Imutável (RF-041) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Itens da venda ({items.length})
        </Text>
        <Text style={styles.snapshotHint}>
          Preços e custos preservados exatamente como no momento da venda.
        </Text>

        <View style={styles.itemsList}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push(`/products/${item.product_id}`)}
              style={styles.itemRow}
            >
              <View style={styles.itemLeftCol}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.product_name_snapshot}
                </Text>
                <Text style={styles.itemSubMeta}>
                  {item.quantity} un. × {formatCentsToBRL(item.unit_price_cents)}
                  {item.sku_snapshot ? ` • SKU: ${item.sku_snapshot}` : ''}
                </Text>
                <Text style={styles.itemCostMeta}>
                  Custo snapshot: {formatCentsToBRL(item.unit_cost_cents)} / un.
                </Text>
              </View>

              <View style={styles.itemRightCol}>
                <MoneyText
                  cents={item.line_total_cents}
                  size="sm"
                  tone="primary"
                />
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textSecondary}
                />
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Parcelas e Histórico de Recebimentos (RF-050 a RF-057) */}
      {sale.status === 'confirmed' || installments.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderCol}>
              <Text style={styles.sectionTitle}>
                Parcelas e recebimentos ({installments.length})
              </Text>
              <Text style={styles.snapshotHint}>
                {SALE_PAYMENT_MODE_LABELS[sale.payment_mode ?? 'cash']} •{' '}
                {PAYMENT_METHOD_LABELS[sale.payment_method ?? 'pix']}
              </Text>
            </View>

            {installments.filter(
              (i) =>
                i.status !== 'cancelled' &&
                i.status !== 'paid' &&
                i.remaining_principal_cents > 0,
            ).length > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPaymentModalInstallments(
                    installments.filter(
                      (i) =>
                        i.status !== 'cancelled' &&
                        i.status !== 'paid' &&
                        i.remaining_principal_cents > 0,
                    ),
                  );
                  setIsPaymentModalOpen(true);
                }}
                style={styles.openCustomerButton}
              >
                <Text style={styles.openCustomerText}>Receber várias</Text>
              </Pressable>
            ) : null}
          </View>

          {installments.length > 0 ? (
            <View style={styles.itemsList}>
              {installments.map((inst) => {
                const meta = getInstallmentDisplayMeta(inst);
                const lateCalc = calculateSuggestedLateCharges({
                  remainingPrincipalCents: inst.remaining_principal_cents,
                  dueDateISO: inst.due_date,
                  settings: financeSettings,
                });
                const isOpen =
                  inst.status !== 'cancelled' &&
                  inst.status !== 'paid' &&
                  inst.remaining_principal_cents > 0;

                return (
                  <View key={inst.id} style={styles.installmentRow}>
                    <View style={styles.installmentTopRow}>
                      <View style={styles.itemLeftCol}>
                        <Text style={styles.itemName}>
                          {inst.installment_number === 0
                            ? 'Entrada'
                            : `Parcela ${inst.installment_number}/${inst.total_installments}`}
                        </Text>
                        <Text style={styles.itemSubMeta}>
                          Venc.: {formatDateBR(inst.due_date)} • Principal:{' '}
                          {formatCentsToBRL(inst.principal_cents)}
                        </Text>
                        {inst.paid_total_cents > 0 ? (
                          <Text style={styles.paidNoteText}>
                            Pago: {formatCentsToBRL(inst.paid_total_cents)}
                            {inst.accrued_fine_cents +
                              inst.accrued_interest_cents >
                            0
                              ? ` (inclui ${formatCentsToBRL(inst.accrued_fine_cents + inst.accrued_interest_cents)} de juros/multa)`
                              : ''}
                          </Text>
                        ) : null}
                        {isOpen &&
                        lateCalc.suggestedFineCents +
                          lateCalc.suggestedInterestCents >
                          0 ? (
                          <Text style={styles.lateSuggestionText}>
                            Juros/multa sugeridos hoje: +{' '}
                            {formatCentsToBRL(
                              lateCalc.suggestedFineCents +
                                lateCalc.suggestedInterestCents,
                            )}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.installmentRightCol}>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                        <MoneyText
                          cents={
                            isOpen
                              ? inst.remaining_principal_cents
                              : inst.paid_total_cents || inst.principal_cents
                          }
                          size="sm"
                          tone={
                            meta.state === 'overdue'
                              ? 'error'
                              : meta.state === 'paid'
                                ? 'primary'
                                : 'default'
                          }
                        />
                        {isOpen ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setPaymentModalInstallments([inst]);
                              setIsPaymentModalOpen(true);
                            }}
                            style={styles.receivePillButton}
                          >
                            <Ionicons
                              name="cash-outline"
                              size={14}
                              color={colors.surface}
                            />
                            <Text style={styles.receivePillText}>Receber</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.timestampNote}>
              Nenhuma parcela registrada para esta venda.
            </Text>
          )}

          {payments.length > 0 ? (
            <View style={styles.paymentsHistoryBox}>
              <Text style={styles.paymentsHistoryTitle}>
                Histórico de recebimentos ({payments.length})
              </Text>
              {payments.map((pay) => (
                <View key={pay.id} style={styles.paymentHistoryRow}>
                  <View style={styles.itemLeftCol}>
                    <Text style={styles.paymentMethodTitle}>
                      {PAYMENT_METHOD_LABELS[pay.payment_method]} •{' '}
                      {formatDateTimeBR(pay.paid_at)}
                    </Text>
                    {pay.fine_cents + pay.interest_cents > 0 ? (
                      <Text style={styles.itemSubMeta}>
                        Principal:{' '}
                        {formatCentsToBRL(pay.principal_allocated_cents)} •
                        Multa/Juros:{' '}
                        {formatCentsToBRL(pay.fine_cents + pay.interest_cents)}
                      </Text>
                    ) : null}
                    {pay.notes ? (
                      <Text style={styles.itemSubMeta}>{pay.notes}</Text>
                    ) : null}
                  </View>
                  <View style={styles.installmentRightCol}>
                    {pay.is_reversed ? (
                      <StatusBadge label="Estornado" tone="error" />
                    ) : (
                      <StatusBadge label="Recebido" tone="success" />
                    )}
                    <Text style={styles.summaryValue}>
                      {formatCentsToBRL(pay.amount_cents)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Resumo Financeiro e Ações */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Resumo financeiro</Text>

        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal dos itens</Text>
            <Text style={styles.summaryValue}>
              {formatCentsToBRL(sale.subtotal_cents)}
            </Text>
          </View>

          {sale.discount_cents > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Desconto aplicado</Text>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                - {formatCentsToBRL(sale.discount_cents)}
              </Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total da venda</Text>
            <MoneyText
              cents={sale.total_cents}
              size="lg"
              tone={sale.status === 'cancelled' ? 'error' : 'primary'}
            />
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryCaption}>Custo total estimado</Text>
            <Text style={styles.summaryCaption}>
              {formatCentsToBRL(sale.estimated_cost_cents)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryCaption}>Lucro estimado</Text>
            <Text style={styles.profitStrong}>
              {formatCentsToBRL(sale.estimated_profit_cents)}
            </Text>
          </View>
        </View>

        {actionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{actionError}</Text>
          </View>
        ) : null}

        {sale.status !== 'cancelled' ? (
          <View style={styles.actionsColumn}>
            {sale.status === 'draft' ? (
              <>
                <PrimaryButton
                  label="Confirmar venda e baixar estoque"
                  iconName="checkmark-circle-outline"
                  onPress={() => setConfirmDraftModalOpen(true)}
                />
                <SecondaryButton
                  label="Editar rascunho"
                  iconName="create-outline"
                  onPress={() =>
                    router.push({
                      pathname: '/sales/new',
                      params: { draftSaleId: sale.id },
                    })
                  }
                />
              </>
            ) : null}

            {!showCancelForm ? (
              <SecondaryButton
                label={
                  sale.status === 'confirmed'
                    ? 'Cancelar venda e estornar estoque'
                    : 'Cancelar rascunho'
                }
                iconName="close-circle-outline"
                onPress={() => setShowCancelForm(true)}
              />
            ) : (
              <View style={styles.cancelFormBox}>
                <Text style={styles.cancelFormTitle}>
                  {sale.status === 'confirmed'
                    ? 'Confirmar cancelamento e estorno de estoque'
                    : 'Confirmar cancelamento do rascunho'}
                </Text>
                <Text style={styles.cancelFormDescription}>
                  {sale.status === 'confirmed'
                    ? 'As unidades vendidas serão devolvidas automaticamente ao estoque com registro de estorno auditável.'
                    : 'O rascunho ficará registrado como cancelado para auditoria.'}
                </Text>

                <FormField
                  label="Motivo do cancelamento *"
                  placeholder="Ex.: Cliente solicitou troca ou desistiu da compra"
                  value={cancelReason}
                  onChangeText={(val) => {
                    setCancelReason(val);
                    setCancelReasonError(null);
                  }}
                  errorMessage={cancelReasonError ?? undefined}
                />

                <View style={styles.cancelFormButtons}>
                  <PrimaryButton
                    label="Confirmar cancelamento"
                    iconName="alert-circle-outline"
                    loading={isCancelling}
                    onPress={() => {
                      void handleCancelSale();
                    }}
                  />
                  <SecondaryButton
                    label="Voltar"
                    disabled={isCancelling}
                    onPress={() => {
                      setShowCancelForm(false);
                      setCancelReasonError(null);
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmDraftModalOpen}
        title="Confirmar esta venda?"
        description="Ao confirmar o rascunho, o estoque de todos os itens será baixado atomicamente."
        confirmLabel="Sim, confirmar venda"
        loading={isConfirmingDraft}
        onConfirm={() => {
          void handleConfirmDraft();
        }}
        onCancel={() => setConfirmDraftModalOpen(false)}
      />

      {workspaceId ? (
        <ReceivePaymentModal
          visible={isPaymentModalOpen}
          workspaceId={workspaceId}
          installments={paymentModalInstallments}
          financeSettings={financeSettings}
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            setIsPaymentModalOpen(false);
            void loadSaleDetail();
          }}
        />
      ) : null}

      <Modal
        visible={isCustomerModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isLinkingCustomer) {
            setIsCustomerModalOpen(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.customerPickerSheet}>
            <View style={styles.customerPickerHeader}>
              <View style={styles.customerPickerHeaderInfo}>
                <Text style={styles.customerPickerTitle}>
                  {sale.customer_id
                    ? 'Trocar cliente da venda'
                    : 'Vincular cliente à venda'}
                </Text>
                <Text style={styles.customerPickerSubtitle}>
                  Vincule um cliente para que esta venda conste no histórico dele
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                disabled={isLinkingCustomer}
                onPress={() => setIsCustomerModalOpen(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <SearchField
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Buscar cliente por nome ou telefone..."
            />

            {isLoadingCustomers ? (
              <LoadingState message="Carregando clientes..." />
            ) : (
              <ScrollView
                style={styles.customerListScroll}
                keyboardShouldPersistTaps="handled"
              >
                {sale.customer_id ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isLinkingCustomer}
                    onPress={() => void handleSelectCustomer(null)}
                    style={styles.unlinkItem}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={22}
                      color={colors.error}
                    />
                    <View style={styles.customerItemTextCol}>
                      <Text style={styles.unlinkText}>
                        Desvincular (Tornar venda avulsa)
                      </Text>
                      <Text style={styles.customerItemPhone}>
                        Remover vínculo com o cliente atual
                      </Text>
                    </View>
                  </Pressable>
                ) : null}

                {filteredCustomers.length === 0 ? (
                  <View style={styles.noCustomersBox}>
                    <Text style={styles.noCustomersText}>
                      {customersList.length === 0
                        ? 'Nenhum cliente cadastrado no momento.'
                        : 'Nenhum cliente encontrado com este nome.'}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setIsCustomerModalOpen(false);
                        router.push('/customers/new');
                      }}
                      style={styles.newCustomerLinkBtn}
                    >
                      <Ionicons
                        name="person-add-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.newCustomerLinkText}>
                        Cadastrar novo cliente
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  filteredCustomers.map((cust) => {
                    const isSelected = sale.customer_id === cust.id;
                    return (
                      <Pressable
                        key={cust.id}
                        accessibilityRole="button"
                        disabled={isLinkingCustomer}
                        onPress={() => void handleSelectCustomer(cust)}
                        style={[
                          styles.customerItem,
                          isSelected ? styles.customerItemSelected : null,
                        ]}
                      >
                        <View style={styles.customerAvatarSmall}>
                          <Text style={styles.customerAvatarTextSmall}>
                            {cust.full_name.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.customerItemTextCol}>
                          <Text
                            style={styles.customerItemName}
                            numberOfLines={1}
                          >
                            {cust.full_name}
                          </Text>
                          <Text style={styles.customerItemPhone}>
                            {cust.phone ?? 'Sem telefone'}
                          </Text>
                        </View>
                        {isSelected ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={colors.primary}
                          />
                        ) : (
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={colors.textSecondary}
                          />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            )}

            <View style={styles.customerPickerFooter}>
              <SecondaryButton
                label="Cadastrar novo cliente"
                iconName="person-add-outline"
                disabled={isLinkingCustomer}
                onPress={() => {
                  setIsCustomerModalOpen(false);
                  router.push('/customers/new');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  topBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dateText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  customerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  customerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerTextCol: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  customerName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  openCustomerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  openCustomerText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  customerButtonsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  changeCustomerButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeCustomerText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  linkCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  linkCustomerText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  timestampNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cancelledBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.error,
    padding: spacing.md,
    gap: 4,
  },
  cancelledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cancelledTitle: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  cancelledReasonText: {
    ...typography.caption,
    color: colors.text,
  },
  notesBox: {
    backgroundColor: colors.background,
    borderRadius: radius.control,
    padding: spacing.md,
    gap: 4,
  },
  notesValue: {
    ...typography.body,
    color: colors.text,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionHeaderCol: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  snapshotHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  itemsList: {
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  installmentRow: {
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  installmentTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  installmentRightCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  paidNoteText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  lateSuggestionText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
  },
  receivePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  receivePillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.surface,
  },
  paymentsHistoryBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  paymentsHistoryTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  paymentHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  paymentMethodTitle: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  itemLeftCol: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  itemSubMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemCostMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  totalLabel: {
    ...typography.section,
    color: colors.text,
  },
  summaryCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  profitStrong: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.control,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.error,
  },
  actionsColumn: {
    gap: spacing.sm,
  },
  cancelFormBox: {
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cancelFormTitle: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  cancelFormDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cancelFormButtons: {
    gap: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'flex-end',
  },
  customerPickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
    gap: spacing.md,
  },
  customerPickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  customerPickerHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  customerPickerTitle: {
    ...typography.section,
    color: colors.text,
  },
  customerPickerSubtitle: {
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
  customerListScroll: {
    maxHeight: 340,
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  customerItemSelected: {
    backgroundColor: colors.primarySoft,
  },
  customerAvatarSmall: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarTextSmall: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  customerItemTextCol: {
    flex: 1,
    gap: 2,
  },
  customerItemName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  customerItemPhone: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  unlinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.errorSoft,
    marginBottom: spacing.xs,
  },
  unlinkText: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  noCustomersBox: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  noCustomersText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  newCustomerLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
  },
  newCustomerLinkText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  customerPickerFooter: {
    paddingTop: spacing.xs,
  },
});
