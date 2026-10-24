import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppHeader,
  ErrorState,
  LoadingState,
  PeriodSegmentedControl,
  PrimaryButton,
  Screen,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, touchTarget, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  buildFinancialReportCSV,
  type FinancialReportOverview,
} from '@/features/expenses/schemas';
import { fetchWorkspaceFinancialReport } from '@/features/expenses/services';
import type {
  ExpenseCategoryRow,
  ExpenseRow,
  PaymentRow,
  SaleRow,
} from '@/types/database';
import { formatCentsToBRL } from '@/utils/formatters';

type ReportPeriodKey = 'current_month' | 'last_month' | '30d' | 'current_year';

const REPORT_PERIOD_OPTIONS: { key: ReportPeriodKey; label: string }[] = [
  { key: 'current_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês ant.' },
  { key: '30d', label: '30 dias' },
  { key: 'current_year', label: 'Este ano' },
];

function getReportDateRange(periodKey: ReportPeriodKey): {
  startDateISO: string;
  endDateISO: string;
  label: string;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 a 11

  if (periodKey === 'current_month') {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    return {
      startDateISO: start.toISOString().slice(0, 10),
      endDateISO: end.toISOString().slice(0, 10),
      label: `Mês Atual (${String(month + 1).padStart(2, '0')}/${year})`,
    };
  }

  if (periodKey === 'last_month') {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return {
      startDateISO: start.toISOString().slice(0, 10),
      endDateISO: end.toISOString().slice(0, 10),
      label: `Mês Anterior (${String(start.getUTCMonth() + 1).padStart(2, '0')}/${start.getUTCFullYear()})`,
    };
  }

  if (periodKey === '30d') {
    const end = now;
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return {
      startDateISO: start.toISOString().slice(0, 10),
      endDateISO: end.toISOString().slice(0, 10),
      label: 'Últimos 30 Dias',
    };
  }

  // current_year
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  return {
    startDateISO: start.toISOString().slice(0, 10),
    endDateISO: end.toISOString().slice(0, 10),
    label: `Ano de ${year}`,
  };
}

export default function FinancialReportsScreen() {
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;
  const workspaceName = activeWorkspace?.workspace.name ?? 'Meu Negócio';

  const [period, setPeriod] = useState<ReportPeriodKey>('current_month');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [data, setData] = useState<{
    report: FinancialReportOverview;
    sales: SaleRow[];
    payments: PaymentRow[];
    expenses: ExpenseRow[];
    categories: ExpenseCategoryRow[];
  } | null>(null);

  const activeRange = useMemo(() => getReportDateRange(period), [period]);

  const loadReport = useCallback(
    async (isPullRefresh: boolean = false) => {
      if (!workspaceId) return;

      if (isPullRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const res = await fetchWorkspaceFinancialReport({
          workspaceId,
          startDateISO: activeRange.startDateISO,
          endDateISO: activeRange.endDateISO,
        });
        setData(res);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o relatório.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [workspaceId, activeRange],
  );

  useFocusEffect(
    useCallback(() => {
      void loadReport();
    }, [loadReport]),
  );

  const handleExportCSV = useCallback(async () => {
    if (!data) return;

    try {
      const categoryMap = new Map<string, string>();
      for (const c of data.categories) {
        categoryMap.set(c.id, c.name);
      }

      const csvContent = buildFinancialReportCSV({
        workspaceName,
        periodLabel: activeRange.label,
        report: data.report,
        sales: data.sales,
        expenses: data.expenses,
        categoryNameById: categoryMap,
      });

      await Share.share({
        title: `Relatorio_Financeiro_${workspaceName.replace(/\s+/g, '_')}.csv`,
        message: csvContent,
      });
    } catch (error) {
      Alert.alert(
        'Exportação',
        error instanceof Error
          ? error.message
          : 'Não foi possível exportar o arquivo CSV.',
      );
    }
  }, [data, workspaceName, activeRange]);

  const report = data?.report;

  return (
    <Screen scroll={false}>
      <AppHeader
        title="DRE e Relatórios"
        subtitle={workspaceName}
        rightSlot={
          <Pressable
            accessibilityRole="button"
            onPress={handleExportCSV}
            disabled={!data || isLoading}
            style={styles.exportHeaderBtn}
          >
            <Ionicons name="share-outline" size={18} color={colors.primary} />
            <Text style={styles.exportHeaderBtnText}>Exportar</Text>
          </Pressable>
        }
      />

      {isLoading ? (
        <LoadingState message="Consolidando DRE e fluxo financeiro..." />
      ) : errorMessage ? (
        <ErrorState
          title="Erro ao consolidar relatório"
          message={errorMessage}
          onRetry={() => {
            void loadReport();
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
                void loadReport(true);
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {/* Seletor de Período do Relatório */}
          <PeriodSegmentedControl
            options={REPORT_PERIOD_OPTIONS}
            selectedKey={period}
            onSelect={(key) => setPeriod(key as ReportPeriodKey)}
            style={styles.periodControlWrap}
          />

          {report ? (
            <>
              {/* DRE — Demonstrativo de Resultado */}
              <View style={styles.cardSection}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleCol}>
                    <Text style={styles.cardTitle}>DRE — Lucro Real</Text>
                    <Text style={styles.cardSubtitle}>
                      Regime de competência ({activeRange.label})
                    </Text>
                  </View>
                  <StatusBadge
                    label={
                      report.netProfitCents >= 0
                        ? `Lucro Líquido ${report.netMarginPercent}%`
                        : `Prejuízo ${report.netMarginPercent}%`
                    }
                    tone={report.netProfitCents >= 0 ? 'success' : 'error'}
                  />
                </View>

                {/* Linha 1: Receita Bruta */}
                <View style={styles.dreRow}>
                  <View style={styles.dreLabelCol}>
                    <Text style={styles.dreLabel}>Receita de Vendas (+)</Text>
                    <Text style={styles.dreSublabel}>
                      {report.salesCount} vendas confirmadas
                    </Text>
                  </View>
                  <Text style={styles.drePositive}>
                    + {formatCentsToBRL(report.grossRevenueCents)}
                  </Text>
                </View>

                {/* Linha 2: CMV */}
                <View style={styles.dreRow}>
                  <View style={styles.dreLabelCol}>
                    <Text style={styles.dreLabel}>Custo Mercadorias - CMV (-)</Text>
                    <Text style={styles.dreSublabel}>Custo real dos itens vendidos</Text>
                  </View>
                  <Text style={styles.dreNegative}>
                    - {formatCentsToBRL(report.cogsCents)}
                  </Text>
                </View>

                {/* Linha 3: Lucro Bruto */}
                <View style={[styles.dreRow, styles.dreSubtotalRow]}>
                  <View style={styles.dreLabelCol}>
                    <Text style={styles.dreSubtotalLabel}>Lucro Bruto (=)</Text>
                    <Text style={styles.dreSublabel}>
                      Margem bruta: {report.grossMarginPercent}%
                    </Text>
                  </View>
                  <Text style={styles.dreSubtotalAmount}>
                    {formatCentsToBRL(report.grossProfitCents)}
                  </Text>
                </View>

                {/* Linha 4: Despesas Operacionais */}
                <View style={styles.dreRow}>
                  <View style={styles.dreLabelCol}>
                    <Text style={styles.dreLabel}>Despesas Operacionais (-)</Text>
                    <Text style={styles.dreSublabel}>
                      {report.expensesCount} despesas da loja pagas
                    </Text>
                  </View>
                  <Text style={styles.dreNegative}>
                    - {formatCentsToBRL(report.totalExpensesCents)}
                  </Text>
                </View>

                {/* Linha 5: Lucro Líquido Final */}
                <View style={[styles.dreRow, styles.dreTotalRow]}>
                  <View style={styles.dreLabelCol}>
                    <Text style={styles.dreTotalLabel}>LUCRO LÍQUIDO REAL (=)</Text>
                    <Text style={styles.dreSublabel}>
                      O que realmente sobrou no seu bolso
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.dreTotalAmount,
                      report.netProfitCents < 0 ? styles.amountNegative : null,
                    ]}
                  >
                    {formatCentsToBRL(report.netProfitCents)}
                  </Text>
                </View>
              </View>

              {/* FLUXO DE CAIXA REAL */}
              <View style={styles.cardSection}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleCol}>
                    <Text style={styles.cardTitle}>Fluxo de Caixa Real</Text>
                    <Text style={styles.cardSubtitle}>
                      Dinheiro que efetivamente entrou e saiu da conta
                    </Text>
                  </View>
                  <Ionicons name="wallet-outline" size={20} color={colors.primary} />
                </View>

                <View style={styles.dreRow}>
                  <Text style={styles.dreLabel}>Entradas no Caixa (Recebimentos)</Text>
                  <Text style={styles.drePositive}>
                    + {formatCentsToBRL(report.totalCashInCents)}
                  </Text>
                </View>

                <View style={styles.dreRow}>
                  <Text style={styles.dreLabel}>Saídas no Caixa (Despesas Pagas)</Text>
                  <Text style={styles.dreNegative}>
                    - {formatCentsToBRL(report.totalCashOutCents)}
                  </Text>
                </View>

                <View style={[styles.dreRow, styles.dreTotalRow]}>
                  <Text style={styles.dreTotalLabel}>SALDO OPERACIONAL DE CAIXA (=)</Text>
                  <Text
                    style={[
                      styles.dreTotalAmount,
                      report.netCashFlowCents < 0 ? styles.amountNegative : null,
                    ]}
                  >
                    {formatCentsToBRL(report.netCashFlowCents)}
                  </Text>
                </View>
              </View>

              {/* DESPESAS POR CATEGORIA */}
              {report.categoryBreakdown.length > 0 ? (
                <View style={styles.cardSection}>
                  <Text style={styles.cardTitle}>Despesas por Categoria</Text>
                  <Text style={styles.cardSubtitle}>
                    Onde o dinheiro do negócio está sendo gasto
                  </Text>

                  <View style={styles.categoriesList}>
                    {report.categoryBreakdown.map((item) => (
                      <View key={item.categoryName} style={styles.categoryItem}>
                        <View style={styles.categoryHeader}>
                          <Text style={styles.categoryName}>{item.categoryName}</Text>
                          <Text style={styles.categoryAmount}>
                            {formatCentsToBRL(item.totalCents)} ({item.percentage}%)
                          </Text>
                        </View>
                        <View style={styles.progressBarWrap}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${Math.min(100, item.percentage)}%` },
                            ]}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Botão de Exportação CSV */}
              <View style={styles.exportSection}>
                <PrimaryButton
                  label="Compartilhar Relatório em CSV / Excel"
                  iconName="share-social-outline"
                  onPress={handleExportCSV}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  exportHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    minHeight: touchTarget.minHeight,
  },
  exportHeaderBtnText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  periodControlWrap: {
    marginBottom: spacing.xs,
  },
  cardSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardTitleCol: {
    flex: 1,
  },
  cardTitle: {
    ...typography.section,
    color: colors.text,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  dreLabelCol: {
    flex: 1,
  },
  dreLabel: {
    ...typography.body,
    color: colors.text,
  },
  dreSublabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  drePositive: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  dreNegative: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  dreSubtotalRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.control,
  },
  dreSubtotalLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  dreSubtotalAmount: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.primaryDark,
  },
  dreTotalRow: {
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  dreTotalLabel: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    fontWeight: '800',
  },
  dreTotalAmount: {
    ...typography.sectionLg,
    color: colors.primary,
    fontWeight: '800',
  },
  amountNegative: {
    color: colors.error,
  },
  categoriesList: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  categoryItem: {
    gap: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryName: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  categoryAmount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressBarWrap: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  exportSection: {
    marginTop: spacing.xs,
  },
});
