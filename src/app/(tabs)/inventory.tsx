import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
  PrimaryButton,
  Screen,
  SearchField,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  calculateInventoryOverviewMetrics,
  getProductStockHealth,
} from '@/features/inventory/schemas';
import { getSignedProductImageUrl } from '@/features/products/imageService';
import {
  listWorkspaceProducts,
  mapProductServiceError,
} from '@/features/products/services';
import type { ProductRow } from '@/types/database';
import { useDebounce } from '@/hooks';
import { formatCentsToBRL } from '@/utils/formatters';

type StockFilterKey = 'all' | 'attention' | 'low' | 'out' | 'healthy';

const FILTER_OPTIONS: { key: StockFilterKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'attention', label: 'Atenção' },
  { key: 'low', label: 'Estoque baixo' },
  { key: 'out', label: 'Sem estoque' },
  { key: 'healthy', label: 'Normal' },
];

interface InventoryProductCardProps {
  product: ProductRow;
  onPressDetail: () => void;
  onPressAdjust: () => void;
  onPressHistory: () => void;
}

const InventoryProductCard = memo(function InventoryProductCard({
  product,
  onPressDetail,
  onPressAdjust,
  onPressHistory,
}: InventoryProductCardProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!product.primary_image_path) {
      setSignedUrl(null);
      return;
    }

    void getSignedProductImageUrl(product.primary_image_path).then((url) => {
      if (active) {
        setSignedUrl(url);
      }
    });

    return () => {
      active = false;
    };
  }, [product.primary_image_path]);

  const health = getProductStockHealth(product);
  const currentQty = Number(product.current_stock_qty ?? 0);
  const minQty = Number(product.min_stock_qty ?? 0);

  return (
    <View style={styles.stockCard}>
      <Pressable
        accessibilityRole="button"
        onPress={onPressDetail}
        style={styles.stockCardHeader}
      >
        <View style={styles.thumbnailBox}>
          {signedUrl ? (
            <Image
              source={{ uri: signedUrl }}
              style={styles.thumbnailImage}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Ionicons
              name="pricetag-outline"
              size={22}
              color={colors.primary}
            />
          )}
        </View>

        <View style={styles.stockCardInfo}>
          <Text style={styles.productName} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.productMeta} numberOfLines={1}>
            {[
              product.brand,
              product.sku ? `SKU: ${product.sku}` : null,
              `Mín.: ${minQty} un.`,
            ]
              .filter(Boolean)
              .join(' • ')}
          </Text>
          <Text style={styles.productPriceText}>
            Venda: {formatCentsToBRL(product.price_cents)}
          </Text>
        </View>

        <StatusBadge
          label={
            health === 'out'
              ? 'Sem estoque (0)'
              : health === 'low'
                ? `Abaixo do mín. (${currentQty} un.)`
                : health === 'at_minimum'
                  ? `No limite (${currentQty} un.)`
                  : `${currentQty} un.`
          }
          tone={
            health === 'out' || health === 'low'
              ? 'error'
              : health === 'at_minimum'
                ? 'warning'
                : 'success'
          }
        />
      </Pressable>

      <View style={styles.cardFooter}>
        <Pressable
          accessibilityRole="button"
          onPress={onPressAdjust}
          style={styles.cardActionButtonPrimary}
        >
          <Ionicons
            name="add-circle-outline"
            size={17}
            color={colors.primaryDark}
          />
          <Text style={styles.cardActionPrimaryText}>Entrada / Ajuste</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onPressHistory}
          style={styles.cardActionButtonSecondary}
        >
          <Ionicons
            name="time-outline"
            size={17}
            color={colors.textSecondary}
          />
          <Text style={styles.cardActionSecondaryText}>Histórico</Text>
        </Pressable>
      </View>
    </View>
  );
});

export default function InventoryTabScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [stockFilter, setStockFilter] = useState<StockFilterKey>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInventory = useCallback(async (isPullRefresh: boolean = false) => {
    if (!workspaceId) {
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
      const allProducts = await listWorkspaceProducts(workspaceId);
      setProducts(allProducts.filter((item) => !item.is_archived));
    } catch (error) {
      setErrorMessage(mapProductServiceError(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadInventory();
    }, [loadInventory]),
  );

  const metrics = useMemo(
    () => calculateInventoryOverviewMetrics(products),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    return products.filter((item) => {
      const health = getProductStockHealth(item);
      if (
        stockFilter === 'attention' &&
        health !== 'at_minimum' &&
        health !== 'low' &&
        health !== 'out'
      ) {
        return false;
      }
      if (stockFilter === 'low' && health !== 'low') {
        return false;
      }
      if (stockFilter === 'out' && health !== 'out') {
        return false;
      }
      if (stockFilter === 'healthy' && health !== 'healthy') {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(query) ||
        (item.sku && item.sku.toLowerCase().includes(query)) ||
        (item.brand && item.brand.toLowerCase().includes(query))
      );
    });
  }, [products, debouncedSearch, stockFilter]);

  const PAGE_SIZE = 20;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [debouncedSearch, stockFilter]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, displayLimit);
  }, [filteredProducts, displayLimit]);

  const hasMore = displayLimit < filteredProducts.length;

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      setIsLoadingMore(true);
      setTimeout(() => {
        setDisplayLimit((prev) => prev + PAGE_SIZE);
        setIsLoadingMore(false);
      }, 300);
    }
  }, [hasMore, isLoadingMore]);

  const productCountLabel =
    metrics.totalActiveProducts === 1
      ? '1 produto ativo'
      : `${metrics.totalActiveProducts} produtos ativos`;

  const isFiltered = Boolean(searchQuery.trim()) || stockFilter !== 'all';

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.metricsRow}>
          <MetricCard
            title="Valor em estoque"
            cents={metrics.totalRetailCents}
            subtitle={`${metrics.totalUnits} un. • ${productCountLabel}`}
            iconName="pricetag-outline"
            tone="primary"
          />
          <MetricCard
            title="Custo investido"
            cents={metrics.totalCostCents}
            subtitle={`Lucro pot.: ${formatCentsToBRL(
              Math.max(0, metrics.totalRetailCents - metrics.totalCostCents),
            )}`}
            iconName="cube-outline"
            tone="default"
          />
        </View>

        {metrics.attentionCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setStockFilter((prev) =>
                prev === 'attention' ? 'all' : 'attention',
              )
            }
            style={styles.alertBanner}
          >
            <View style={styles.alertIconWrap}>
              <Ionicons
                name="warning-outline"
                size={20}
                color={colors.warning}
              />
            </View>
            <View style={styles.alertTextWrap}>
              <Text style={styles.alertTitle}>
                {metrics.attentionCount}{' '}
                {metrics.attentionCount === 1
                  ? 'produto em atenção para reposição'
                  : 'produtos em atenção para reposição'}
              </Text>
              <Text style={styles.alertDescription}>
                {metrics.outOfStockCount} zerado(s) • {metrics.lowStockCount}{' '}
                abaixo do mín. • {metrics.atMinimumCount} no limite
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}

        <View style={styles.quickActionsRow}>
          <View style={styles.quickActionCol}>
            <PrimaryButton
              label="Movimentar"
              iconName="add-circle-outline"
              onPress={() => router.push('/inventory/adjust')}
            />
          </View>
          <View style={styles.quickActionCol}>
            <SecondaryButton
              label="Catálogo"
              iconName="pricetags-outline"
              onPress={() => router.push('/products')}
            />
          </View>
        </View>

        <SearchField
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar produto por nome, marca ou SKU..."
        />

        <FilterChips
          options={FILTER_OPTIONS}
          selectedKey={stockFilter}
          onSelect={setStockFilter}
        />

        {filteredProducts.length > 0 ? (
          <ListCounterBanner
            totalCount={filteredProducts.length}
            displayedCount={displayedProducts.length}
            nounSingular="produto"
            nounPlural="produtos"
            isFiltered={isFiltered}
          />
        ) : null}
      </>
    ),
    [
      metrics,
      productCountLabel,
      router,
      searchQuery,
      stockFilter,
      filteredProducts.length,
      displayedProducts.length,
      isFiltered,
    ],
  );

  const handlePressDetail = useCallback(
    (productId: string) => {
      router.push(`/products/${productId}`);
    },
    [router],
  );

  const handlePressAdjust = useCallback(
    (productId: string) => {
      router.push({
        pathname: '/inventory/adjust',
        params: {
          productId,
          movementType: 'entry',
        },
      });
    },
    [router],
  );

  const handlePressHistory = useCallback(
    (productId: string, productName: string) => {
      router.push({
        pathname: '/inventory/movements',
        params: {
          productId,
          productName,
        },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ProductRow }) => (
      <InventoryProductCard
        product={item}
        onPressDetail={() => handlePressDetail(item.id)}
        onPressAdjust={() => handlePressAdjust(item.id)}
        onPressHistory={() => handlePressHistory(item.id, item.name)}
      />
    ),
    [handlePressDetail, handlePressAdjust, handlePressHistory],
  );

  const keyExtractor = useCallback((item: ProductRow) => item.id, []);

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Estoque"
        subtitle={activeWorkspace?.workspace.name ?? 'Espaço de trabalho'}
        rightSlot={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/inventory/movements')}
            style={styles.historyHeaderButton}
          >
            <Ionicons
              name="swap-vertical-outline"
              size={18}
              color={colors.primaryDark}
            />
            <Text style={styles.historyHeaderText}>Histórico</Text>
          </Pressable>
        }
      />

      {isLoading ? (
        <LoadingState message="Carregando posição de estoque..." />
      ) : errorMessage ? (
        <ErrorState
          title="Não foi possível carregar o estoque"
          message={errorMessage}
          onRetry={() => {
            void loadInventory();
          }}
        />
      ) : products.length === 0 ? (
        <EmptyState
          iconName="cube-outline"
          title="Nenhum produto cadastrado"
          description="Cadastre seus produtos no catálogo para acompanhar saldos, alertas de estoque mínimo e histórico auditável de entradas e saídas."
          actionLabel="Cadastrar primeiro produto"
          onActionPress={() => router.push('/products/new')}
        />
      ) : (
        <FlatList
          data={displayedProducts}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          ListEmptyComponent={
            <EmptyState
              iconName="checkmark-circle-outline"
              title="Nenhum produto neste filtro"
              description="Altere a busca ou selecione outro filtro para visualizar seus itens de estoque."
              actionLabel="Mostrar todos"
              onActionPress={() => {
                setStockFilter('all');
                setSearchQuery('');
              }}
            />
          }
          ListFooterComponent={
            <ListFooterLoader
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              itemCount={displayedProducts.length}
              nounSingular="produto"
              nounPlural="produtos"
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
                void loadInventory(true);
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
  historyHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  historyHeaderText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTextWrap: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  alertDescription: {
    ...typography.caption,
    color: colors.textSecondary,
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
  stockCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  stockCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumbnailBox: {
    width: 52,
    height: 52,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  stockCardInfo: {
    flex: 1,
    gap: 2,
  },
  productName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  productMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  productPriceText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  cardActionButtonPrimary: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
  },
  cardActionPrimaryText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  cardActionButtonSecondary: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActionSecondaryText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  cardSeparator: {
    height: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
});
