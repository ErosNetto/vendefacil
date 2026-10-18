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
  MoneyText,
  PrimaryButton,
  Screen,
  SearchField,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  calculateSalesOverviewMetrics,
  SALE_STATUS_META,
} from '@/features/sales/schemas';
import {
  listWorkspaceSales,
  mapSaleServiceError,
  type SaleFilterKey,
} from '@/features/sales/services';
import type { SaleRow } from '@/types/database';
import { formatCentsToBRL, formatDateTimeBR } from '@/utils/formatters';

const FILTER_OPTIONS: { key: SaleFilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'draft', label: 'Rascunhos' },
  { key: 'cancelled', label: 'Canceladas' },
];

export default function SalesTabScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SaleFilterKey>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSales = useCallback(async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await listWorkspaceSales({ workspaceId });
      setSales(list);
    } catch (error) {
      setErrorMessage(mapSaleServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadSales();
    }, [loadSales]),
  );

  const metrics = useMemo(
    () => calculateSalesOverviewMetrics(sales),
    [sales],
  );

  const filteredSales = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sales.filter((sale) => {
      if (statusFilter !== 'all' && sale.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const customerName = (
        sale.customer_name_snapshot ?? 'Venda avulsa'
      ).toLowerCase();
      const notes = (sale.notes ?? '').toLowerCase();
      const shortCode = sale.id.slice(0, 8).toLowerCase();

      return (
        customerName.includes(query) ||
        notes.includes(query) ||
        shortCode.includes(query)
      );
    });
  }, [sales, searchQuery, statusFilter]);

  const confirmedCountLabel =
    metrics.confirmedCount === 1
      ? '1 venda confirmada'
      : `${metrics.confirmedCount} vendas confirmadas`;

  return (
    <Screen>
      <AppHeader
        title="Vendas"
        subtitle={activeWorkspace?.workspace.name ?? 'Espaço de trabalho'}
        rightSlot={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sales/new')}
            style={styles.newSaleHeaderButton}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.newSaleHeaderText}>Nova venda</Text>
          </Pressable>
        }
      />

      {isLoading ? (
        <LoadingState message="Carregando histórico de vendas..." />
      ) : errorMessage ? (
        <ErrorState
          title="Não foi possível carregar as vendas"
          message={errorMessage}
          onRetry={() => {
            void loadSales();
          }}
        />
      ) : sales.length === 0 ? (
        <EmptyState
          iconName="cart-outline"
          title="Nenhuma venda registrada"
          description="Inicie sua primeira venda selecionando produtos do catálogo, aplicando desconto opcional e baixando o estoque automaticamente."
          actionLabel="Registrar primeira venda"
          onActionPress={() => router.push('/sales/new')}
        />
      ) : (
        <>
          <View style={styles.metricsRow}>
            <MetricCard
              title="Total vendido"
              cents={metrics.confirmedRevenueCents}
              subtitle={confirmedCountLabel}
              iconName="cart-outline"
              tone="primary"
            />
            <MetricCard
              title="Lucro estimado"
              cents={metrics.confirmedProfitCents}
              subtitle={
                metrics.draftCount > 0
                  ? `${metrics.draftCount} rascunho(s): ${formatCentsToBRL(metrics.draftTotalCents)}`
                  : 'Sobre vendas confirmadas'
              }
              iconName="trending-up-outline"
              tone="default"
            />
          </View>

          <View style={styles.quickActionsRow}>
            <View style={styles.quickActionCol}>
              <PrimaryButton
                label="Nova venda"
                iconName="add-circle-outline"
                onPress={() => router.push('/sales/new')}
              />
            </View>
            <View style={styles.quickActionCol}>
              <SecondaryButton
                label="Clientes"
                iconName="people-outline"
                onPress={() => router.push('/customers')}
              />
            </View>
          </View>

          <SearchField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por cliente, observação ou código..."
          />

          <FilterChips
            options={FILTER_OPTIONS}
            selectedKey={statusFilter}
            onSelect={setStatusFilter}
          />

          {filteredSales.length === 0 ? (
            <EmptyState
              iconName="search-outline"
              title="Nenhuma venda neste filtro"
              description="Altere a busca ou selecione outro status para visualizar suas vendas."
              actionLabel="Mostrar todas"
              onActionPress={() => {
                setStatusFilter('all');
                setSearchQuery('');
              }}
            />
          ) : (
            <View style={styles.listContainer}>
              {filteredSales.map((sale) => {
                const statusMeta = SALE_STATUS_META[sale.status];
                const itemCountText =
                  sale.item_count === 1
                    ? '1 item'
                    : `${sale.item_count} itens`;

                return (
                  <Pressable
                    key={sale.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/sales/${sale.id}`)}
                    style={({ pressed }) => [
                      styles.saleCard,
                      pressed ? styles.saleCardPressed : null,
                    ]}
                  >
                    <View style={styles.saleCardTop}>
                      <View style={styles.saleIconBox}>
                        <Ionicons
                          name={
                            sale.status === 'confirmed'
                              ? 'bag-check-outline'
                              : sale.status === 'draft'
                                ? 'document-text-outline'
                                : 'close-circle-outline'
                          }
                          size={22}
                          color={
                            sale.status === 'confirmed'
                              ? colors.primary
                              : sale.status === 'draft'
                                ? colors.warning
                                : colors.error
                          }
                        />
                      </View>

                      <View style={styles.saleInfoCol}>
                        <Text style={styles.customerName} numberOfLines={1}>
                          {sale.customer_name_snapshot ??
                            'Venda avulsa (Balcão)'}
                        </Text>
                        <Text style={styles.saleMetaText}>
                          {formatDateTimeBR(sale.created_at)} • {itemCountText}
                        </Text>
                      </View>

                      <View style={styles.saleRightCol}>
                        <MoneyText
                          cents={sale.total_cents}
                          size="md"
                          tone={
                            sale.status === 'cancelled' ? 'error' : 'primary'
                          }
                        />
                        <StatusBadge
                          label={statusMeta.label}
                          tone={statusMeta.tone}
                        />
                      </View>
                    </View>

                    {sale.discount_cents > 0 || sale.notes ? (
                      <View style={styles.saleFooter}>
                        {sale.discount_cents > 0 ? (
                          <Text style={styles.discountBadgeText}>
                            Desconto: -{formatCentsToBRL(sale.discount_cents)}
                          </Text>
                        ) : null}
                        {sale.notes ? (
                          <Text style={styles.notesText} numberOfLines={1}>
                            {sale.notes}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newSaleHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  newSaleHeaderText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.white,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  quickActionCol: {
    flex: 1,
  },
  listContainer: {
    gap: spacing.md,
  },
  saleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  saleCardPressed: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  saleCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  saleIconBox: {
    width: 46,
    height: 46,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  saleInfoCol: {
    flex: 1,
    gap: 2,
  },
  customerName: {
    ...typography.bodyStrong,
    fontSize: 15,
    color: colors.text,
  },
  saleMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  saleRightCol: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  saleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  discountBadgeText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.warning,
  },
  notesText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'right',
  },
});
