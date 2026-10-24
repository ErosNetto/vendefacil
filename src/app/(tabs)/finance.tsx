import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FilterChips,
  ListCounterBanner,
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
  type WorkspaceFinanceSettings,
} from '@/features/finance/schemas';
import {
  getWorkspaceReceivablesOverview,
  type ReceivableFilterKey,
} from '@/features/finance/services';
import type { InstallmentRow, PaymentRow } from '@/types/database';
import { useDebounce } from '@/hooks';
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

interface InstallmentCardItemProps {
  item: InstallmentRow;
  todayISO: string;
  financeSettings: WorkspaceFinanceSettings;
  onPressSale: (saleId: string) => void;
  onPressReceive: (item: InstallmentRow) => void;
}

const InstallmentCardItem = memo(function InstallmentCardItem({
  item,
  todayISO,
  financeSettings,
  onPressSale,
  onPressReceive,
}: InstallmentCardItemProps) {
  const meta = getInstallmentDisplayMeta(item, todayISO);
  const isOpen = item.status !== 'paid' && item.remaining_principal_cents > 0;
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
    <View style={styles.installmentCard}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={() => onPressSale(item.sale_id)}
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
          <Ionicons name="time-outline" size={16} color={colors.warning} />
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
          onPress={() => onPressSale(item.sale_id)}
          accessibilityRole="button"
          style={styles.saleLinkButton}
        >
          <Ionicons name="receipt-outline" size={16} color={colors.primary} />
          <Text style={styles.saleLinkText}>Ver venda</Text>
        </Pressable>

        {isOpen ? (
          <Pressable
            onPress={() => onPressReceive(item)}
            accessibilityRole="button"
            style={styles.receiveActionBtn}
          >
            <Ionicons name="cash-outline" size={16} color={colors.surface} />
            <Text style={styles.receiveActionBtnText}>Receber</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

interface PaymentRowItemProps {
  payment: PaymentRow;
  isLast: boolean;
  onPress: (saleId: string) => void;
}

const PaymentRowItem = memo(function PaymentRowItem({
  payment,
  isLast,
  onPress,
}: PaymentRowItemProps) {
  return (
    <Pressable
      onPress={() => {
        if (payment.sale_id) {
          onPress(payment.sale_id);
        }
      }}
      disabled={!payment.sale_id}
      accessibilityRole="button"
      style={[styles.paymentRow, isLast ? styles.paymentRowLast : null]}
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
  );
});

export default function FinanceTabScreen() {
  const router = useRouter();
  const { activeWorkspace, refreshWorkspaceContext } = useSession();
  const workspaceId = activeWorkspace?.workspace.id;
  const workspace = activeWorkspace?.workspace;
  const financeSettings = useMemo(
    () => getWorkspaceFinanceSettings(workspace),
    [workspace],
  );

  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [filterMode, setFilterMode] =
    useState<ReceivableFilterKey>('all_open');
  const [showRulesCard, setShowRulesCard] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedInstallment, setSelectedInstallment] =
    useState<InstallmentRow | null>(null);

  const loadFinanceData = useCallback(async (isPullRefresh: boolean = false) => {
    if (!workspaceId) {
      setInstallments([]);
      setRecentPayments([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (isPullRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
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
      setIsRefreshing(false);
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
    const normalizedQuery = debouncedSearch.trim().toLowerCase();

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
  }, [installments, debouncedSearch, filterMode, todayISO]);

  const PAGE_SIZE = 10;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPaymentsExpanded, setIsPaymentsExpanded] = useState(false);

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [debouncedSearch, filterMode]);

  const displayedInstallments = useMemo(() => {
    return filteredInstallments.slice(0, displayLimit);
  }, [filteredInstallments, displayLimit]);

  const hasMore = displayLimit < filteredInstallments.length;

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      setIsLoadingMore(true);
      setTimeout(() => {
        setDisplayLimit((prev) => prev + PAGE_SIZE);
        setIsLoadingMore(false);
      }, 250);
    }
  }, [hasMore, isLoadingMore]);

  const displayedPayments = useMemo(() => {
    return isPaymentsExpanded
      ? recentPayments
      : recentPayments.slice(0, 5);
  }, [recentPayments, isPaymentsExpanded]);

  const isFiltered =
    Boolean(searchQuery.trim()) || filterMode !== 'all_open';

  const handlePressSale = useCallback(
    (saleId: string) => {
      router.push(`/sales/${saleId}`);
    },
    [router],
  );

  const handlePressReceive = useCallback((item: InstallmentRow) => {
    setSelectedInstallment(item);
  }, []);

  const keyExtractor = useCallback((item: InstallmentRow) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: InstallmentRow }) => (
      <InstallmentCardItem
        item={item}
        todayISO={todayISO}
        financeSettings={financeSettings}
        onPressSale={handlePressSale}
        onPressReceive={handlePressReceive}
      />
    ),
    [todayISO, financeSettings, handlePressSale, handlePressReceive],
  );

  const listHeader = useMemo(
    () => (
      <>
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

        {filteredInstallments.length > 0 ? (
          <ListCounterBanner
            totalCount={filteredInstallments.length}
            displayedCount={displayedInstallments.length}
            nounSingular="parcela"
            nounPlural="parcelas"
            isFiltered={isFiltered}
          />
        ) : null}
      </>
    ),
    [
      errorMessage,
      loadFinanceData,
      showRulesCard,
      workspace,
      refreshWorkspaceContext,
      metrics,
      searchQuery,
      filterMode,
      filteredInstallments.length,
      displayedInstallments.length,
      isFiltered,
    ],
  );

  const listFooter = useMemo(
    () => (
      <>
        {hasMore ? (
          <View style={styles.loadMoreWrap}>
            <Pressable
              accessibilityRole="button"
              onPress={loadMore}
              style={styles.loadMoreButton}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="arrow-down-circle-outline"
                  size={16}
                  color={colors.primary}
                />
              )}
              <Text style={styles.loadMoreText}>
                {isLoadingMore
                  ? 'Carregando mais parcelas...'
                  : `Carregar mais parcelas (${displayedInstallments.length} de ${filteredInstallments.length})`}
              </Text>
            </Pressable>
          </View>
        ) : displayedInstallments.length > 0 ? (
          <View style={styles.installmentsEndDivider}>
            <View style={styles.endDividerLine} />
            <Text style={styles.endDividerText}>
              Fim das parcelas • {displayedInstallments.length}{' '}
              {displayedInstallments.length === 1 ? 'parcela' : 'parcelas'}
            </Text>
            <View style={styles.endDividerLine} />
          </View>
        ) : null}

        {recentPayments.length > 0 ? (
          <View style={styles.recentPaymentsCard}>
            <View style={styles.recentPaymentsHeader}>
              <View style={styles.recentPaymentsTitleRow}>
                <Ionicons
                  name="checkmark-done-circle-outline"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Últimos recebimentos</Text>
              </View>
              <View style={styles.recentBadge}>
                <Text style={styles.recentBadgeText}>
                  {recentPayments.length === 1
                    ? '1 recebimento'
                    : `${recentPayments.length} recebimentos`}
                </Text>
              </View>
            </View>

            {displayedPayments.map((payment, index) => (
              <PaymentRowItem
                key={payment.id}
                payment={payment}
                isLast={index === displayedPayments.length - 1}
                onPress={handlePressSale}
              />
            ))}

            {recentPayments.length > 5 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsPaymentsExpanded((prev) => !prev)}
                style={styles.paymentsFooterToggle}
              >
                <Text style={styles.paymentsFooterToggleText}>
                  {isPaymentsExpanded
                    ? 'Recolher recebimentos'
                    : `Ver mais recebimentos (mostrando ${displayedPayments.length} de ${recentPayments.length})`}
                </Text>
                <Ionicons
                  name={
                    isPaymentsExpanded
                      ? 'chevron-up-outline'
                      : 'chevron-down-outline'
                  }
                  size={16}
                  color={colors.primary}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </>
    ),
    [
      hasMore,
      loadMore,
      isLoadingMore,
      displayedInstallments.length,
      filteredInstallments.length,
      recentPayments.length,
      displayedPayments,
      handlePressSale,
      isPaymentsExpanded,
    ],
  );

  return (
    <Screen scroll={false}>
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

      {isLoading ? (
        <LoadingState message="Carregando contas a receber..." />
      ) : (
        <FlatList
          data={displayedInstallments}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          ListEmptyComponent={
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
          }
          ListFooterComponent={listFooter}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void loadFinanceData(true);
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

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
  loadMoreWrap: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  installmentsEndDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  endDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  endDividerText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  recentPaymentsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  recentPaymentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
  recentPaymentsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  recentBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  recentBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
    fontSize: 11,
  },
  paymentsFooterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  paymentsFooterToggleText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
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
  paymentRowLast: {
    borderBottomWidth: 0,
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
  cardSeparator: {
    height: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
});
