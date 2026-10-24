import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FilterChips,
  ListCounterBanner,
  ListFooterLoader,
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
import { SALE_STATUS_META } from '@/features/sales/schemas';
import {
  getWorkspaceSalesSummary,
  listWorkspaceSalesPaginated,
  mapSaleServiceError,
  type SaleFilterKey,
} from '@/features/sales/services';
import { useDebounce, usePaginatedList } from '@/hooks';
import type { SaleRow } from '@/types/database';
import { formatCentsToBRL, formatDateTimeBR } from '@/utils/formatters';

interface SaleCardItemProps {
  sale: SaleRow;
  onPress: () => void;
}

const SaleCardItem = memo(function SaleCardItem({
  sale,
  onPress,
}: SaleCardItemProps) {
  const statusMeta = SALE_STATUS_META[sale.status];
  const itemCountText =
    sale.item_count === 1 ? '1 item' : `${sale.item_count} itens`;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
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
            {sale.customer_name_snapshot ?? 'Venda avulsa (Balcão)'}
          </Text>
          <Text style={styles.saleMetaText}>
            {formatDateTimeBR(sale.created_at)} • {itemCountText}
          </Text>
        </View>

        <View style={styles.saleRightCol}>
          <MoneyText
            cents={sale.total_cents}
            size="md"
            tone={sale.status === 'cancelled' ? 'error' : 'primary'}
          />
          <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
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
});

export default function SalesTabScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<SaleFilterKey>('all');

  const [summary, setSummary] = useState<{
    totalCount: number;
    confirmedCount: number;
    draftCount: number;
    cancelledCount: number;
    totalGrossCents: number;
  }>({
    totalCount: 0,
    confirmedCount: 0,
    draftCount: 0,
    cancelledCount: 0,
    totalGrossCents: 0,
  });

  const fetchPage = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      if (!workspaceId) {
        return { items: [], totalCount: 0 };
      }
      return listWorkspaceSalesPaginated({
        workspaceId,
        statusFilter,
        search: debouncedSearch,
        page,
        pageSize,
      });
    },
    [workspaceId, statusFilter, debouncedSearch],
  );

  const {
    items: sales,
    totalCount,
    displayedCount,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    errorMessage,
    refresh,
    loadMore,
  } = usePaginatedList<SaleRow>({
    fetchPage,
    pageSize: 20,
    dependencies: [workspaceId, statusFilter, debouncedSearch],
    enabled: Boolean(workspaceId),
  });

  const loadSummary = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await getWorkspaceSalesSummary(workspaceId);
      setSummary(data);
    } catch {
      // Não bloqueia
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadSummary();
    }, [loadSummary]),
  );

  const filterOptionsWithCount = useMemo(() => {
    return [
      { key: 'all' as const, label: 'Todas', count: summary.totalCount },
      {
        key: 'confirmed' as const,
        label: 'Confirmadas',
        count: summary.confirmedCount,
      },
      {
        key: 'draft' as const,
        label: 'Rascunhos',
        count: summary.draftCount,
      },
      {
        key: 'cancelled' as const,
        label: 'Canceladas',
        count: summary.cancelledCount,
      },
    ];
  }, [summary]);

  const isFiltered = Boolean(debouncedSearch.trim()) || statusFilter !== 'all';

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.metricsRow}>
          <MetricCard
            title="Total vendido"
            cents={summary.totalGrossCents}
            subtitle={
              summary.confirmedCount === 1
                ? '1 venda confirmada'
                : `${summary.confirmedCount} vendas confirmadas`
            }
            iconName="cart-outline"
            tone="primary"
          />
          <MetricCard
            title="Rascunhos"
            cents={0}
            subtitle={
              summary.draftCount > 0
                ? `${summary.draftCount} aguardando confirmação`
                : 'Nenhum rascunho pendente'
            }
            iconName="document-text-outline"
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
          placeholder="Buscar por cliente ou observação..."
        />

        <FilterChips
          options={filterOptionsWithCount}
          selectedKey={statusFilter}
          onSelect={setStatusFilter}
        />

        {sales.length > 0 ? (
          <ListCounterBanner
            totalCount={totalCount}
            displayedCount={displayedCount}
            nounSingular="venda"
            nounPlural="vendas"
            isFiltered={isFiltered}
          />
        ) : null}
      </>
    ),
    [
      summary,
      router,
      searchQuery,
      filterOptionsWithCount,
      statusFilter,
      sales.length,
      totalCount,
      displayedCount,
      isFiltered,
    ],
  );

  const handlePressSale = useCallback(
    (saleId: string) => {
      router.push(`/sales/${saleId}`);
    },
    [router],
  );

  const keyExtractor = useCallback((item: SaleRow) => item.id, []);

  const renderItem = useCallback(
    ({ item: sale }: { item: SaleRow }) => (
      <SaleCardItem sale={sale} onPress={() => handlePressSale(sale.id)} />
    ),
    [handlePressSale],
  );

  return (
    <Screen scroll={false}>
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
          message={mapSaleServiceError(errorMessage)}
          onRetry={() => {
            void refresh();
          }}
        />
      ) : sales.length === 0 ? (
        <EmptyState
          iconName="cart-outline"
          title={
            debouncedSearch.trim() || statusFilter !== 'all'
              ? 'Nenhuma venda neste filtro'
              : 'Nenhuma venda registrada'
          }
          description={
            debouncedSearch.trim() || statusFilter !== 'all'
              ? 'Altere a busca ou selecione outro status para visualizar suas vendas.'
              : 'Inicie sua primeira venda selecionando produtos do catálogo, aplicando desconto opcional e baixando o estoque automaticamente.'
          }
          actionLabel={
            debouncedSearch.trim() || statusFilter !== 'all'
              ? 'Mostrar todas'
              : 'Registrar primeira venda'
          }
          onActionPress={
            debouncedSearch.trim() || statusFilter !== 'all'
              ? () => {
                  setStatusFilter('all');
                  setSearchQuery('');
                }
              : () => router.push('/sales/new')
          }
        />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          ListFooterComponent={
            <ListFooterLoader
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              itemCount={sales.length}
              nounSingular="venda"
              nounPlural="vendas"
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
                void refresh();
                void loadSummary();
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
  saleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  saleCardPressed: {
    opacity: 0.85,
    backgroundColor: colors.primarySoft,
  },
  saleCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  saleIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saleInfoCol: {
    flex: 1,
    gap: 2,
  },
  customerName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  saleMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  saleRightCol: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  saleFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  discountBadgeText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },
  notesText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'right',
  },
  cardSeparator: {
    height: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
});
