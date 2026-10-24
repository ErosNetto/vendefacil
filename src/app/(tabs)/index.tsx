import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppHeader,
  ErrorState,
  LoadingState,
  MetricCard,
  MoneyText,
  PeriodSegmentedControl,
  Screen,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, touchTarget, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  calculateDashboardMetrics,
  DASHBOARD_PERIOD_OPTIONS,
  groupInstallmentsForCalendar,
  type DashboardPeriodKey,
} from '@/features/dashboard/schemas';
import {
  fetchDashboardRawData,
  type DashboardRawData,
} from '@/features/dashboard/services';
import { ReceivePaymentModal } from '@/features/finance/ReceivePaymentModal';
import {
  getInstallmentDisplayMeta,
  getTodayISODate,
  getWorkspaceFinanceSettings,
} from '@/features/finance/schemas';
import { SALE_STATUS_META } from '@/features/sales/schemas';
import type { InstallmentRow } from '@/types/database';
import { formatDateTimeBR } from '@/utils/formatters';

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, session, activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;
  const workspace = activeWorkspace?.workspace;

  const [period, setPeriod] = useState<DashboardPeriodKey>('month');
  const [data, setData] = useState<DashboardRawData | null>(null);
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

  const greetingName =
    profile?.full_name ||
    session?.user.user_metadata?.full_name ||
    'Vendedor(a)';

  const workspaceName = activeWorkspace?.workspace.name ?? 'Meu Espaço';

  const loadData = useCallback(
    async (isPullRefresh: boolean = false) => {
      if (!workspaceId) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (isPullRefresh) {
        setIsRefreshing(true);
      } else if (!data) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const raw = await fetchDashboardRawData(workspaceId);
        setData(raw);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os dados do painel.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [workspaceId, data],
  );

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const metrics = useMemo(() => {
    if (!data) {
      return null;
    }
    return calculateDashboardMetrics({
      sales: data.sales,
      payments: data.payments,
      installments: data.installments,
      products: data.products,
      period,
      todayISO,
    });
  }, [data, period, todayISO]);

  // Vencimentos prioritários na home: atrasadas ou que vencem hoje/nos próximos 7 dias (máximo 5)
  const priorityInstallments = useMemo(() => {
    if (!data) {
      return [];
    }
    const overdue = groupInstallmentsForCalendar({
      installments: data.installments,
      filter: 'overdue',
      todayISO,
    });
    const upcomingWeek = groupInstallmentsForCalendar({
      installments: data.installments,
      filter: 'week',
      todayISO,
    });

    const combined = [...overdue, ...upcomingWeek];
    const seen = new Set<string>();
    const unique: InstallmentRow[] = [];
    for (const item of combined) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
      if (unique.length >= 5) {
        break;
      }
    }
    return unique;
  }, [data, todayISO]);

  // Vendas confirmadas recentes para exibição (as 5 mais recentes)
  const recentConfirmedSales = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.sales
      .filter((s) => s.status === 'confirmed')
      .slice(0, 5);
  }, [data]);

  return (
    <Screen scroll={false}>
      <AppHeader
        title={`Olá, ${greetingName}!`}
        subtitle={workspaceName}
        rightSlot={
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Abrir configurações e conta"
            style={styles.settingsButton}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        }
      />

      {isLoading ? (
        <LoadingState message="Atualizando painel de vendas e caixa..." />
      ) : errorMessage ? (
        <ErrorState
          title="Erro ao carregar painel"
          message={errorMessage}
          onRetry={() => {
            void loadData();
          }}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void loadData(true);
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {/* Seletor de Período 100% de Largura com 4 itens de mesmo tamanho */}
          <PeriodSegmentedControl
            options={DASHBOARD_PERIOD_OPTIONS}
            selectedKey={period}
            onSelect={setPeriod}
            style={styles.periodControlWrap}
          />

          {/* Alertas Operacionais (Estoque e Rascunhos) */}
          {metrics && (metrics.outOfStockCount > 0 || metrics.lowStockCount > 0) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/inventory')}
              style={styles.alertBanner}
            >
              <View style={styles.alertIconBox}>
                <Ionicons name="warning-outline" size={20} color={colors.warning} />
              </View>
              <View style={styles.alertTextCol}>
                <Text style={styles.alertTitle}>Estoque em atenção</Text>
                <Text style={styles.alertDescription}>
                  {metrics.outOfStockCount > 0
                    ? `${metrics.outOfStockCount} produto(s) zerado(s) `
                    : ''}
                  {metrics.lowStockCount > 0
                    ? `• ${metrics.lowStockCount} produto(s) abaixo do mínimo`
                    : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}

          {metrics && metrics.draftSalesCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/sales',
                  params: { status: 'draft' },
                })
              }
              style={styles.infoBanner}
            >
              <View style={styles.infoIconBox}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.alertTextCol}>
                <Text style={styles.infoTitle}>Rascunhos pendentes</Text>
                <Text style={styles.alertDescription}>
                  {metrics.draftSalesCount === 1
                    ? '1 venda em rascunho aguarda confirmação.'
                    : `${metrics.draftSalesCount} vendas em rascunho aguardam confirmação.`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}

          {/* Cards de Métricas Principais (todos reagem ao filtro de período) */}
          {metrics ? (
            <View style={styles.metricsGrid}>
              <MetricCard
                title="Vendido no período"
                cents={metrics.totalSoldCents}
                subtitle={
                  metrics.salesCount === 1
                    ? '1 venda confirmada'
                    : `${metrics.salesCount} vendas confirmadas`
                }
                tone="primary"
                iconName="trending-up-outline"
              />
              <MetricCard
                title="Recebido no caixa"
                cents={metrics.totalReceivedCents}
                subtitle={
                  metrics.paymentsCount === 1
                    ? '1 pagamento recebido'
                    : `${metrics.paymentsCount} pagamentos recebidos`
                }
                tone="primary"
                iconName="cash-outline"
              />
              <MetricCard
                title={metrics.toReceiveTitle}
                cents={metrics.totalToReceiveCents}
                subtitle={metrics.toReceiveSubtitle}
                tone={metrics.totalToReceiveCents > 0 ? 'warning' : 'default'}
                iconName="time-outline"
              />
              <MetricCard
                title={metrics.overdueTitle}
                cents={metrics.totalOverdueCents}
                subtitle={metrics.overdueSubtitle}
                tone={metrics.totalOverdueCents > 0 ? 'error' : 'default'}
                iconName="alert-circle-outline"
              />
            </View>
          ) : null}

          {/* Ações Rápidas */}
          <Text style={styles.sectionTitle}>Ações rápidas</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/sales/new')}
              style={[styles.quickActionCard, styles.quickActionCardHighlight]}
            >
              <View style={[styles.quickActionIconBox, styles.quickActionIconBoxHighlight]}>
                <Ionicons name="cart" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickActionTitle}>Nova venda</Text>
              <Text style={styles.quickActionSubtitle}>Registrar saída</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/customers/new')}
              style={styles.quickActionCard}
            >
              <View style={styles.quickActionIconBox}>
                <Ionicons name="person-add-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickActionTitle}>Novo cliente</Text>
              <Text style={styles.quickActionSubtitle}>Cadastrar ficha</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/products/new')}
              style={styles.quickActionCard}
            >
              <View style={styles.quickActionIconBox}>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickActionTitle}>Novo produto</Text>
              <Text style={styles.quickActionSubtitle}>Com fotos e preço</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/inventory/adjust')}
              style={styles.quickActionCard}
            >
              <View style={styles.quickActionIconBox}>
                <Ionicons name="swap-vertical-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickActionTitle}>Ajustar estoque</Text>
              <Text style={styles.quickActionSubtitle}>Entrada ou saída</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/expenses')}
              style={styles.quickActionCard}
            >
              <View style={styles.quickActionIconBox}>
                <Ionicons name="receipt-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickActionTitle}>Despesas</Text>
              <Text style={styles.quickActionSubtitle}>Contas da loja</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/reports')}
              style={styles.quickActionCard}
            >
              <View style={styles.quickActionIconBox}>
                <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickActionTitle}>DRE e Lucro</Text>
              <Text style={styles.quickActionSubtitle}>Demonstrativo</Text>
            </Pressable>
          </View>

          {/* Agenda de Vencimentos & Cobrança Rápida */}
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleCol}>
              <Text style={styles.sectionTitle}>Vencimentos e cobranças</Text>
              <Text style={styles.sectionSubtitle}>
                Exibindo até 5 cobranças prioritárias
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/calendar')}
              style={styles.seeAllButton}
            >
              <Text style={styles.seeAllButtonText}>Ver agenda</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
          </View>

          {priorityInstallments.length === 0 ? (
            <View style={styles.emptyAgendaCard}>
              <Ionicons
                name="checkmark-circle-outline"
                size={28}
                color={colors.success}
              />
              <View style={styles.emptyAgendaTextCol}>
                <Text style={styles.emptyAgendaTitle}>Tudo em dia!</Text>
                <Text style={styles.emptyAgendaSubtitle}>
                  Nenhuma parcela vencida ou com vencimento nos próximos 7 dias.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.installmentsList}>
              {priorityInstallments.map((item) => {
                const meta = getInstallmentDisplayMeta(item, todayISO);
                return (
                  <View key={item.id} style={styles.installmentCard}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/sales/${item.sale_id}`)}
                      style={styles.installmentCardLeft}
                    >
                      <View style={styles.customerNameRow}>
                        <Text style={styles.installmentCustomer} numberOfLines={1}>
                          {item.customer_name_snapshot || 'Cliente avulso'}
                        </Text>
                        <Ionicons
                          name="open-outline"
                          size={14}
                          color={colors.primary}
                        />
                      </View>
                      <Text style={styles.installmentMeta}>
                        Parcela {item.installment_number}/{item.total_installments} •
                        Vence {item.due_date}
                      </Text>
                      <View style={styles.installmentBadgeWrap}>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </View>
                    </Pressable>

                    <View style={styles.installmentCardRight}>
                      <MoneyText cents={item.remaining_principal_cents} size="md" />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setSelectedInstallment(item)}
                        style={styles.receiveBtn}
                      >
                        <Ionicons name="cash-outline" size={14} color={colors.surface} />
                        <Text style={styles.receiveBtnText}>Receber</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Vendas Recentes */}
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleCol}>
              <Text style={styles.sectionTitle}>Vendas recentes</Text>
              <Text style={styles.sectionSubtitle}>
                Exibindo as 5 últimas saídas confirmadas
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/sales')}
              style={styles.seeAllButton}
            >
              <Text style={styles.seeAllButtonText}>Ver todas</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
          </View>

          {recentConfirmedSales.length === 0 ? (
            <View style={styles.emptySalesCard}>
              <Ionicons name="cart-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.emptySalesText}>
                Nenhuma venda confirmada registrada ainda.
              </Text>
            </View>
          ) : (
            <View style={styles.recentSalesList}>
              {recentConfirmedSales.map((sale) => {
                const statusMeta = SALE_STATUS_META[sale.status];
                return (
                  <Pressable
                    key={sale.id}
                    onPress={() => router.push(`/sales/${sale.id}`)}
                    accessibilityRole="button"
                    style={styles.recentSaleRow}
                  >
                    <View style={styles.recentSaleIconBox}>
                      <Ionicons
                        name="bag-check-outline"
                        size={20}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.recentSaleInfo}>
                      <Text style={styles.recentSaleCustomer} numberOfLines={1}>
                        {sale.customer_name_snapshot || 'Venda avulsa (Balcão)'}
                      </Text>
                      <Text style={styles.recentSaleDate}>
                        {formatDateTimeBR(sale.created_at)} •{' '}
                        {sale.item_count === 1 ? '1 item' : `${sale.item_count} itens`}
                      </Text>
                    </View>
                    <View style={styles.recentSaleRight}>
                      <MoneyText cents={sale.total_cents} size="sm" />
                      <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal de recebimento com 1 toque da Home */}
      {workspaceId && selectedInstallment ? (
        <ReceivePaymentModal
          visible={Boolean(selectedInstallment)}
          workspaceId={workspaceId}
          installments={[selectedInstallment]}
          financeSettings={financeSettings}
          onClose={() => setSelectedInstallment(null)}
          onSuccess={() => {
            setSelectedInstallment(null);
            void loadData();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  settingsButton: {
    minWidth: touchTarget.minWidth,
    minHeight: touchTarget.minHeight,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodControlWrap: {
    marginBottom: spacing.md,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningSoft ?? '#FEF9C3',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  alertIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTextCol: {
    flex: 1,
  },
  alertTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  alertDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionHeaderTitleCol: {
    flex: 1,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  seeAllButtonText: {
    ...typography.bodyStrong,
    fontSize: 14,
    color: colors.primary,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  quickActionCard: {
    width: '47.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  quickActionCardHighlight: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  quickActionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  quickActionIconBoxHighlight: {
    backgroundColor: colors.primarySoft,
  },
  quickActionTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  quickActionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyAgendaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  emptyAgendaTextCol: {
    flex: 1,
  },
  emptyAgendaTitle: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  emptyAgendaSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  installmentsList: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  installmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  installmentCardLeft: {
    flex: 1,
    gap: 2,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  installmentCustomer: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  installmentMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  installmentBadgeWrap: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  installmentCardRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  receiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
  },
  receiveBtnText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
  emptySalesCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  emptySalesText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  recentSalesList: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  recentSaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  recentSaleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentSaleInfo: {
    flex: 1,
  },
  recentSaleCustomer: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  recentSaleDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  recentSaleRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
});
