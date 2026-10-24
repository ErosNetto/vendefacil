import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
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
  ListFooterLoader,
  LoadingState,
  MoneyText,
  Screen,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  CALENDAR_FILTER_OPTIONS,
  groupInstallmentsForCalendar,
  type CalendarFilterKey,
} from '@/features/dashboard/schemas';
import { fetchCalendarInstallments } from '@/features/dashboard/services';
import { ReceivePaymentModal } from '@/features/finance/ReceivePaymentModal';
import {
  calculateSuggestedLateCharges,
  getInstallmentDisplayMeta,
  getTodayISODate,
  getWorkspaceFinanceSettings,
  type WorkspaceFinanceSettings,
} from '@/features/finance/schemas';
import { supabase } from '@/lib/supabase';
import type { CustomerRow, InstallmentRow } from '@/types/database';
import { formatCentsToBRL, formatDateBR } from '@/utils/formatters';

interface CalendarCardItemProps {
  item: InstallmentRow;
  todayISO: string;
  customerPhone?: string | null;
  financeSettings: WorkspaceFinanceSettings;
  onPressSale: (saleId: string) => void;
  onPressReceive: (item: InstallmentRow) => void;
  onPressWhatsApp: (phone: string, customerName: string, amountCents: number, dueDate: string) => void;
}

const CalendarCardItem = memo(function CalendarCardItem({
  item,
  todayISO,
  customerPhone,
  financeSettings,
  onPressSale,
  onPressReceive,
  onPressWhatsApp,
}: CalendarCardItemProps) {
  const meta = getInstallmentDisplayMeta(item, todayISO);
  const isOverdue = meta.state === 'overdue';

  const latePreview = isOverdue
    ? calculateSuggestedLateCharges({
        remainingPrincipalCents: item.remaining_principal_cents,
        dueDateISO: item.due_date,
        referenceDateISO: todayISO,
        settings: financeSettings,
      })
    : null;

  const customerName = item.customer_name_snapshot || 'Cliente avulso';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={() => onPressSale(item.sale_id)}
          accessibilityRole="button"
          style={styles.cardHeaderLeft}
        >
          <Text style={styles.customerName} numberOfLines={1}>
            {customerName}
          </Text>
          <Text style={styles.installmentSubtitle}>
            Parcela {item.installment_number}/{item.total_installments} • Vencimento{' '}
            {formatDateBR(item.due_date)}
          </Text>
        </Pressable>
        <StatusBadge label={meta.label} tone={meta.tone} />
      </View>

      <View style={styles.cardAmountsRow}>
        <View>
          <Text style={styles.amountCaption}>Valor da parcela</Text>
          <Text style={styles.amountOriginal}>
            {formatCentsToBRL(item.principal_cents)}
          </Text>
        </View>

        {item.paid_principal_cents > 0 ? (
          <View>
            <Text style={styles.amountCaption}>Já recebido</Text>
            <Text style={styles.amountPaid}>
              {formatCentsToBRL(item.paid_principal_cents)}
            </Text>
          </View>
        ) : null}

        <View style={styles.amountRightCol}>
          <Text style={styles.amountCaption}>Saldo a receber</Text>
          <MoneyText cents={item.remaining_principal_cents} size="md" />
        </View>
      </View>

      {latePreview && latePreview.daysOverdue > 0 ? (
        <View style={styles.lateBanner}>
          <Ionicons name="time-outline" size={15} color={colors.error} />
          <Text style={styles.lateBannerText}>
            {latePreview.daysOverdue} dias de atraso • Sugerido c/ juros/multa:{' '}
            <Text style={styles.lateBannerStrong}>
              {formatCentsToBRL(latePreview.suggestedTotalCents)}
            </Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.cardActionsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onPressSale(item.sale_id)}
          style={styles.viewSaleButton}
        >
          <Ionicons name="receipt-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.viewSaleButtonText}>Ver venda</Text>
        </Pressable>

        <View style={styles.cardActionsRight}>
          {customerPhone ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                onPressWhatsApp(
                  customerPhone,
                  customerName,
                  item.remaining_principal_cents,
                  item.due_date,
                )
              }
              style={styles.whatsAppButton}
            >
              <Ionicons name="logo-whatsapp" size={15} color={colors.primary} />
              <Text style={styles.whatsAppButtonText}>Lembrar</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => onPressReceive(item)}
            style={styles.receiveButton}
          >
            <Ionicons name="cash-outline" size={15} color={colors.surface} />
            <Text style={styles.receiveButtonText}>Receber</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

export default function CalendarTabScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;
  const workspace = activeWorkspace?.workspace;

  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [customerPhoneMap, setCustomerPhoneMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [filter, setFilter] = useState<CalendarFilterKey>('today');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedInstallment, setSelectedInstallment] =
    useState<InstallmentRow | null>(null);

  const todayISO = useMemo(() => getTodayISODate(), []);
  const financeSettings = useMemo(
    () => getWorkspaceFinanceSettings(workspace),
    [workspace],
  );

  const loadCalendarData = useCallback(
    async (isPullRefresh: boolean = false) => {
      if (!workspaceId) {
        setInstallments([]);
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
        const [instList, customersRes] = await Promise.all([
          fetchCalendarInstallments(workspaceId),
          supabase
            .from('customers')
            .select('id, phone')
            .eq('workspace_id', workspaceId),
        ]);

        setInstallments(instList);

        const phoneMap = new Map<string, string>();
        if (customersRes.data) {
          for (const c of customersRes.data as Pick<CustomerRow, 'id' | 'phone'>[]) {
            if (c.phone) {
              phoneMap.set(c.id, c.phone);
            }
          }
        }
        setCustomerPhoneMap(phoneMap);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os vencimentos da agenda.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [workspaceId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadCalendarData();
    }, [loadCalendarData]),
  );

  const PAGE_SIZE = 15;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [filter]);

  const filteredInstallments = useMemo(() => {
    return groupInstallmentsForCalendar({
      installments,
      filter,
      todayISO,
    });
  }, [installments, filter, todayISO]);

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

  const summary = useMemo(() => {
    let totalCents = 0;
    for (const inst of filteredInstallments) {
      totalCents += inst.remaining_principal_cents;
    }
    return {
      count: filteredInstallments.length,
      totalCents,
    };
  }, [filteredInstallments]);

  const handlePressSale = useCallback(
    (saleId: string) => {
      router.push(`/sales/${saleId}`);
    },
    [router],
  );

  const handlePressReceive = useCallback((item: InstallmentRow) => {
    setSelectedInstallment(item);
  }, []);

  const handlePressWhatsApp = useCallback(
    (
      phone: string,
      customerName: string,
      amountCents: number,
      dueDate: string,
    ) => {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedAmount = formatCentsToBRL(amountCents);
      const formattedDate = formatDateBR(dueDate);
      const message = `Olá ${customerName}! Tudo bem? Passando para lembrar da sua parcela no valor de ${formattedAmount} com vencimento em ${formattedDate}. Qualquer dúvida estamos à disposição!`;
      const url = `whatsapp://send?phone=55${cleanPhone}&text=${encodeURIComponent(
        message,
      )}`;

      Linking.canOpenURL(url)
        .then((supported) => {
          if (supported) {
            return Linking.openURL(url);
          }
          // Fallback para web whatsapp
          return Linking.openURL(
            `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`,
          );
        })
        .catch(() => {
          // Ignorar se falhar
        });
    },
    [],
  );

  const keyExtractor = useCallback((item: InstallmentRow) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: InstallmentRow }) => (
      <CalendarCardItem
        item={item}
        todayISO={todayISO}
        customerPhone={item.customer_id ? customerPhoneMap.get(item.customer_id) : null}
        financeSettings={financeSettings}
        onPressSale={handlePressSale}
        onPressReceive={handlePressReceive}
        onPressWhatsApp={handlePressWhatsApp}
      />
    ),
    [
      todayISO,
      customerPhoneMap,
      financeSettings,
      handlePressSale,
      handlePressReceive,
      handlePressWhatsApp,
    ],
  );

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.filterWrap}>
          <FilterChips
            options={CALENDAR_FILTER_OPTIONS}
            selectedKey={filter}
            onSelect={setFilter}
          />
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTextCol}>
            <Text style={styles.summaryTitle}>
              {filter === 'today'
                ? 'Vencendo Hoje'
                : filter === 'tomorrow'
                  ? 'Vencendo Amanhã'
                  : filter === 'week'
                    ? 'Próximos 7 Dias'
                    : filter === 'overdue'
                      ? 'Parcelas Atrasadas'
                      : 'Vencimentos do Mês'}
            </Text>
            <Text style={styles.summaryCount}>
              {summary.count === 1
                ? '1 parcela agendada'
                : `${summary.count} parcelas agendadas`}
            </Text>
          </View>
          <View style={styles.summaryAmountCol}>
            <Text style={styles.summaryAmountLabel}>Total previsto</Text>
            <MoneyText cents={summary.totalCents} size="lg" />
          </View>
        </View>

        {filteredInstallments.length > 0 ? (
          <ListCounterBanner
            totalCount={filteredInstallments.length}
            displayedCount={displayedInstallments.length}
            nounSingular="parcela"
            nounPlural="parcelas"
          />
        ) : null}
      </>
    ),
    [filter, summary, filteredInstallments.length, displayedInstallments.length],
  );

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Agenda e Vencimentos"
        subtitle={activeWorkspace?.workspace.name ?? 'Acompanhe datas e cobranças'}
      />

      {isLoading ? (
        <LoadingState message="Carregando agenda de cobranças e vencimentos..." />
      ) : errorMessage ? (
        <ErrorState
          title="Erro ao carregar agenda"
          message={errorMessage}
          onRetry={() => {
            void loadCalendarData();
          }}
        />
      ) : (
        <FlatList
          data={displayedInstallments}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <EmptyState
                iconName="calendar-outline"
                title={
                  filter === 'today'
                    ? 'Nenhum vencimento para hoje'
                    : filter === 'tomorrow'
                      ? 'Nenhum vencimento para amanhã'
                      : filter === 'overdue'
                        ? 'Nenhuma parcela em atraso!'
                        : 'Nenhum vencimento agendado'
                }
                description={
                  filter === 'overdue'
                    ? 'Parabéns! Sua carteira de clientes está 100% em dia.'
                    : 'Não há parcelas pendentes para o período selecionado.'
                }
              />
            </View>
          }
          ListFooterComponent={
            <ListFooterLoader
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              itemCount={displayedInstallments.length}
              nounSingular="parcela"
              nounPlural="parcelas"
              onPressLoadMore={loadMore}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void loadCalendarData(true);
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
          title="Receber parcela agendada"
          onClose={() => setSelectedInstallment(null)}
          onSuccess={() => {
            setSelectedInstallment(null);
            void loadCalendarData();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterWrap: {
    marginBottom: spacing.md,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryTextCol: {
    flex: 1,
  },
  summaryTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  summaryCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryAmountCol: {
    alignItems: 'flex-end',
  },
  summaryAmountLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.sm,
  },
  emptyContainer: {
    marginTop: spacing.xl,
  },
  card: {
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
  cardHeaderLeft: {
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
  cardAmountsRow: {
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
  amountRightCol: {
    alignItems: 'flex-end',
  },
  lateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
  },
  lateBannerText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
  lateBannerStrong: {
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  viewSaleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewSaleButtonText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  cardActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  whatsAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
  },
  whatsAppButtonText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  receiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
  },
  receiveButtonText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
});
