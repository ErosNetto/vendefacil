import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  MetricCard,
  Screen,
  SearchField,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { FinanceSettingsCard } from '@/features/finance/FinanceSettingsCard';
import { ReceivePaymentModal } from '@/features/finance/ReceivePaymentModal';
import {
  calculateSuggestedLateCharges,
  getInstallmentDisplayMeta,
  getTodayISODate,
  getWorkspaceFinanceSettings,
  PAYMENT_METHOD_LABELS,
} from '@/features/finance/schemas';
import {
  getWorkspaceReceivablesOverview,
  type ReceivableFilterKey,
} from '@/features/finance/services';
import type { InstallmentRow, PaymentRow } from '@/types/database';
import { formatCentsToBRL, formatDateBR } from '@/utils/formatters';

const FILTER_OPTIONS: readonly {
  key: ReceivableFilterKey;
  label: string;
}[] = [
  { key: 'all_open', label: 'Em aberto' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'due_today', label: 'Vence hoje' },
  { key: 'upcoming', label: 'Próximas' },
  { key: 'paid', label: 'Pagas' },
];

export default function FinanceTabScreen() {
  const router = useRouter();
  const { activeWorkspace, refreshWorkspaceContext } = useSession();
  const workspaceId = activeWorkspace?.workspace.id;
  const workspace = activeWorkspace?.workspace;
  const financeSettings = getWorkspaceFinanceSettings(workspace);

  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] =
    useState<ReceivableFilterKey>('all_open');
  const [showRulesCard, setShowRulesCard] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedInstallment, setSelectedInstallment] =
    useState<InstallmentRow | null>(null);

  const loadFinanceData = useCallback(async () => {
    if (!workspaceId) {
      setInstallments([]);
      setRecentPayments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const overview = await getWorkspaceReceivablesOverview(workspaceId);
      setInstallments(overview.installments);
      setRecentPayments(overview.recentPayments);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os dados financeiros.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadFinanceData();
    }, [loadFinanceData]),
  );

  const todayISO = getTodayISODate();
  const currentMonthPrefix = todayISO.slice(0, 7);

  const metrics = useMemo(() => {
    let openPrincipalCents = 0;
    let overduePrincipalCents = 0;
    let overdueCount = 0;
    let dueTodayPrincipalCents = 0;
    let dueTodayCount = 0;

    for (const item of installments) {
      if (item.status === 'paid' || item.status === 'cancelled') {
        continue;
      }

      const meta = getInstallmentDisplayMeta(item, todayISO);
      openPrincipalCents += item.remaining_principal_cents;

      if (meta.state === 'overdue') {
        overduePrincipalCents += item.remaining_principal_cents;
        overdueCount += 1;
      } else if (meta.state === 'due_today') {
        dueTodayPrincipalCents += item.remaining_principal_cents;
        dueTodayCount += 1;
      }
    }

    let receivedMonthCents = 0;
    for (const payment of recentPayments) {
      if (payment.paid_at.slice(0, 7) === currentMonthPrefix) {
        receivedMonthCents += payment.amount_cents;
      }
    }

    return {
      openPrincipalCents,
      overduePrincipalCents,
      overdueCount,
      dueTodayPrincipalCents,
      dueTodayCount,
      receivedMonthCents,
    };
  }, [installments, recentPayments, todayISO, currentMonthPrefix]);

  const filteredInstallments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return installments.filter((item) => {
      if (item.status === 'cancelled') {
        return false;
      }

      const meta = getInstallmentDisplayMeta(item, todayISO);
      const isOpen =
        item.status !== 'paid' && item.remaining_principal_cents > 0;

      if (filterMode === 'all_open' && !isOpen) {
        return false;
      }
      if (filterMode === 'overdue' && meta.state !== 'overdue') {
        return false;
      }
      if (filterMode === 'due_today' && meta.state !== 'due_today') {
        return false;
      }
      if (
        filterMode === 'upcoming' &&
        (!isOpen || meta.state === 'overdue' || meta.state === 'due_today')
      ) {
        return false;
      }
      if (filterMode === 'paid' && item.status !== 'paid') {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const customerMatch = item.customer_name_snapshot
        ?.toLowerCase()
        .includes(normalizedQuery);
      const notesMatch = item.notes?.toLowerCase().includes(normalizedQuery);

      return Boolean(customerMatch || notesMatch);
    });
  }, [installments, searchQuery, filterMode, todayISO]);

  return (
    <Screen>
      <AppHeader
        title="Financeiro"
        subtitle={workspace?.name ?? 'Contas a receber e caixa'}
        rightSlot={
          <SecondaryButton
            label={showRulesCard ? 'Ocultar regras' : 'Regras de juros'}
            iconName="options-outline"
            onPress={() => setShowRulesCard((prev) => !prev)}
          />
        }
      />

      {errorMessage ? (
        <View style={styles.errorContainer}>
          <ErrorState
            message={errorMessage}
            onRetry={() => {
              void loadFinanceData();
            }}
          />
        </View>
      ) : null}

      {showRulesCard && workspace ? (
        <FinanceSettingsCard
          workspace={workspace}
          onUpdated={async () => {
            await refreshWorkspaceContext();
            await loadFinanceData();
          }}
        />
      ) : null}

      <View style={styles.metricsGrid}>
        <MetricCard
          title="Total em aberto"
          cents={metrics.openPrincipalCents}
          iconName="wallet-outline"
          tone="primary"
        />
        <MetricCard
          title={`Vencido (${metrics.overdueCount})`}
          cents={metrics.overduePrincipalCents}
          iconName="alert-circle-outline"
          tone={metrics.overduePrincipalCents > 0 ? 'error' : 'default'}
        />
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard
          title={`Vence hoje (${metrics.dueTodayCount})`}
          cents={metrics.dueTodayPrincipalCents}
          iconName="today-outline"
          tone={metrics.dueTodayPrincipalCents > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          title="Recebido no mês"
          cents={metrics.receivedMonthCents}
          iconName="checkmark-done-circle-outline"
          tone="primary"
        />
      </View>

      <View style={styles.controlsSection}>
        <SearchField
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por nome do cliente ou observação..."
        />

        <FilterChips
          options={FILTER_OPTIONS}
          selectedKey={filterMode}
          onSelect={setFilterMode}
        />
      </View>

      {isLoading ? (
        <LoadingState message="Carregando contas a receber..." />
      ) : filteredInstallments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            iconName="cash-outline"
            title="Nenhuma parcela encontrada"
            description={
              installments.length === 0
                ? 'Registre vendas a prazo ou parceladas para acompanhar vencimentos, pagamentos parciais e recebimentos.'
                : 'Nenhuma parcela corresponde ao filtro ou busca selecionada.'
            }
            actionLabel={installments.length === 0 ? 'Nova venda' : undefined}
            onActionPress={
              installments.length === 0
                ? () => router.push('/sales/new')
                : undefined
            }
          />
        </View>
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>
            Parcelas ({filteredInstallments.length})
          </Text>
          {filteredInstallments.map((item) => {
            const meta = getInstallmentDisplayMeta(item, todayISO);
            const isOpen =
              item.status !== 'paid' && item.remaining_principal_cents > 0;
            const latePreview =
              meta.state === 'overdue'
                ? calculateSuggestedLateCharges({
                    remainingPrincipalCents: item.remaining_principal_cents,
                    dueDateISO: item.due_date,
                    referenceDateISO: todayISO,
                    settings: financeSettings,
                  })
                : null;

            return (
              <View key={item.id} style={styles.installmentCard}>
                <View style={styles.cardHeader}>
                  <Pressable
                    onPress={() => router.push(`/sales/${item.sale_id}`)}
                    accessibilityRole="button"
                    style={styles.cardHeaderInfo}
                  >
                    <Text style={styles.customerName} numberOfLines={1}>
                      {item.customer_name_snapshot || 'Cliente avulso'}
                    </Text>
                    <Text style={styles.installmentSubtitle}>
                      {item.installment_number === 0
                        ? 'Entrada'
                        : `Parcela ${item.installment_number}/${item.total_installments}`}{' '}
                      • Vencimento {formatDateBR(item.due_date)}
                    </Text>
                  </Pressable>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </View>

                <View style={styles.amountsRow}>
                  <View>
                    <Text style={styles.amountCaption}>Valor da parcela</Text>
                    <Text style={styles.amountOriginal}>
                      {formatCentsToBRL(item.principal_cents)}
                    </Text>
                  </View>

                  {item.paid_total_cents > 0 || item.paid_principal_cents > 0 ? (
                    <View>
                      <Text style={styles.amountCaption}>Já recebido</Text>
                      <Text style={styles.amountPaid}>
                        {formatCentsToBRL(
                          item.paid_total_cents || item.paid_principal_cents,
                        )}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.amountRight}>
                    <Text style={styles.amountCaption}>
                      {isOpen ? 'Restante' : 'Situação'}
                    </Text>
                    <Text
                      style={[
                        styles.amountRemaining,
                        meta.state === 'overdue' ? styles.amountOverdue : null,
                      ]}
                    >
                      {isOpen
                        ? formatCentsToBRL(item.remaining_principal_cents)
                        : 'Quitada'}
                    </Text>
                  </View>
                </View>

                {item.accrued_fine_cents + item.accrued_interest_cents > 0 ? (
                  <View style={styles.paidChargesBanner}>
                    <Ionicons
                      name="trending-up-outline"
                      size={15}
                      color={colors.primaryDark}
                    />
                    <Text style={styles.paidChargesText}>
                      Inclui{' '}
                      <Text style={styles.paidChargesStrong}>
                        +{' '}
                        {formatCentsToBRL(
                          item.accrued_fine_cents + item.accrued_interest_cents,
                        )}
                      </Text>{' '}
                      de juros/multa recebidos
                    </Text>
                  </View>
                ) : null}

                {latePreview &&
                (latePreview.suggestedFineCents > 0 ||
                  latePreview.suggestedInterestCents > 0) ? (
                  <View style={styles.lateSuggestionBanner}>
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={colors.warning}
                    />
                    <Text style={styles.lateSuggestionText}>
                      Sugestão c/ encargos ({latePreview.daysOverdue}d atraso):{' '}
                      <Text style={styles.lateSuggestionStrong}>
                        {formatCentsToBRL(latePreview.suggestedTotalCents)}
                      </Text>{' '}
                      (editável no recebimento)
                    </Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <Pressable
                    onPress={() => router.push(`/sales/${item.sale_id}`)}
                    accessibilityRole="button"
                    style={styles.saleLinkButton}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={styles.saleLinkText}>Ver venda</Text>
                  </Pressable>

                  {isOpen ? (
                    <Pressable
                      onPress={() => setSelectedInstallment(item)}
                      accessibilityRole="button"
                      style={styles.receiveActionBtn}
                    >
                      <Ionicons
                        name="cash-outline"
                        size={16}
                        color={colors.surface}
                      />
                      <Text style={styles.receiveActionBtnText}>Receber</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {recentPayments.length > 0 ? (
        <View style={styles.recentPaymentsCard}>
          <Text style={styles.sectionTitle}>
            Últimos recebimentos ({recentPayments.length})
          </Text>
          {recentPayments.map((payment) => (
            <Pressable
              key={payment.id}
              onPress={() => router.push(`/sales/${payment.sale_id}`)}
              accessibilityRole="button"
              style={styles.paymentRow}
            >
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentCustomer} numberOfLines={1}>
                  {PAYMENT_METHOD_LABELS[payment.payment_method]} •{' '}
                  {formatDateBR(payment.paid_at)}
                </Text>
                {payment.notes ? (
                  <Text style={styles.paymentMeta} numberOfLines={1}>
                    {payment.notes}
                  </Text>
                ) : null}
                {payment.fine_cents > 0 || payment.interest_cents > 0 ? (
                  <Text style={styles.paymentChargesNote}>
                    Inclui multa ({formatCentsToBRL(payment.fine_cents)}) +
                    juros ({formatCentsToBRL(payment.interest_cents)})
                  </Text>
                ) : null}
              </View>
              <Text style={styles.paymentAmount}>
                + {formatCentsToBRL(payment.amount_cents)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {workspaceId && selectedInstallment ? (
        <ReceivePaymentModal
          visible={Boolean(selectedInstallment)}
          workspaceId={workspaceId}
          installments={[selectedInstallment]}
          financeSettings={financeSettings}
          onClose={() => setSelectedInstallment(null)}
          onSuccess={() => {
            setSelectedInstallment(null);
            void loadFinanceData();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    marginBottom: spacing.md,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  controlsSection: {
    marginTop: spacing.xs,
  },
  emptyContainer: {
    marginBottom: spacing.lg,
  },
  listContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  installmentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  customerName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  installmentSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  amountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  amountCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  amountOriginal: {
    ...typography.body,
    color: colors.text,
  },
  amountPaid: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  amountRight: {
    alignItems: 'flex-end',
  },
  amountRemaining: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  amountOverdue: {
    color: colors.error,
  },
  paidChargesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.control,
  },
  paidChargesText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  paidChargesStrong: {
    fontWeight: '700',
    color: colors.primaryDark,
  },
  lateSuggestionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.control,
  },
  lateSuggestionText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  lateSuggestionStrong: {
    fontWeight: '700',
    color: colors.warning,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  saleLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  saleLinkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  receiveActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  receiveActionBtnText: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: '700',
  },
  recentPaymentsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paymentInfo: {
    flex: 1,
    gap: 2,
  },
  paymentCustomer: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  paymentMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  paymentChargesNote: {
    ...typography.caption,
    color: colors.warning,
  },
  paymentAmount: {
    ...typography.bodyStrong,
    color: colors.success,
  },
});
