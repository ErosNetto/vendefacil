import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FilterChips,
  ListCounterBanner,
  ListFooterLoader,
  LoadingState,
  PrimaryButton,
  ProductCard,
  Screen,
  SearchField,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import type { ProductStatusFilter } from '@/features/products/schemas';
import {
  getWorkspaceProductCounts,
  listWorkspaceCategories,
  listWorkspaceProductsPaginated,
  mapProductServiceError,
} from '@/features/products/services';
import { useDebounce, usePaginatedList } from '@/hooks';
import type { CategoryRow, ProductRow } from '@/types/database';

export default function ProductsCatalogScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [statusFilter, setStatusFilter] =
    useState<ProductStatusFilter>('active');

  const [counts, setCounts] = useState<{
    active: number;
    archived: number;
    all: number;
  }>({
    active: 0,
    archived: 0,
    all: 0,
  });

  const fetchPage = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      if (!workspaceId) {
        return { items: [], totalCount: 0 };
      }
      return listWorkspaceProductsPaginated({
        workspaceId,
        search: debouncedSearch,
        status: statusFilter,
        categoryId: selectedCategoryId === 'all' ? undefined : selectedCategoryId,
        page,
        pageSize,
      });
    },
    [workspaceId, debouncedSearch, statusFilter, selectedCategoryId],
  );

  const {
    items: products,
    totalCount,
    displayedCount,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    errorMessage,
    refresh,
    loadMore,
  } = usePaginatedList<ProductRow>({
    fetchPage,
    pageSize: 20,
    dependencies: [
      workspaceId,
      debouncedSearch,
      statusFilter,
      selectedCategoryId,
    ],
    enabled: Boolean(workspaceId),
  });

  const loadAuxiliaryData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [categoryRows, summary] = await Promise.all([
        listWorkspaceCategories(workspaceId),
        getWorkspaceProductCounts(workspaceId),
      ]);
      setCategories(categoryRows);
      setCounts(summary);
    } catch {
      // Falha não-crítica
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadAuxiliaryData();
    }, [loadAuxiliaryData]),
  );

  const categoryNameById = useMemo(
    () => new Map<string, string>(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const statusOptions = useMemo(
    () =>
      [
        { key: 'active', label: 'Ativos', count: counts.active },
        { key: 'archived', label: 'Arquivados', count: counts.archived },
        { key: 'all', label: 'Todos', count: counts.all },
      ] as const,
    [counts.active, counts.all, counts.archived],
  );

  const categoryOptions = useMemo(
    () => [
      { key: 'all', label: 'Todas categorias' },
      ...categories.map((cat) => ({ key: cat.id, label: cat.name })),
    ],
    [categories],
  );

  const isFiltered =
    Boolean(debouncedSearch.trim()) ||
    selectedCategoryId !== 'all' ||
    statusFilter !== 'all';

  const handlePressProduct = useCallback(
    (productId: string) => {
      router.push(`/products/${productId}`);
    },
    [router],
  );

  const keyExtractor = useCallback((item: ProductRow) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: ProductRow }) => (
      <ProductCard
        product={item}
        categoryName={
          item.category_id ? categoryNameById.get(item.category_id) : null
        }
        onPress={() => handlePressProduct(item.id)}
      />
    ),
    [categoryNameById, handlePressProduct],
  );

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Produtos"
        subtitle={activeWorkspace?.workspace.name ?? 'Catálogo'}
        showBack
        rightSlot={
          <PrimaryButton
            label="Novo"
            iconName="add-circle-outline"
            onPress={() => router.push('/products/new')}
          />
        }
      />

      <SearchField
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Buscar por nome, marca, SKU ou código..."
        accessibilityLabel="Buscar produto"
      />

      {categories.length > 0 ? (
        <FilterChips
          options={categoryOptions}
          selectedKey={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      ) : null}

      <FilterChips
        options={statusOptions}
        selectedKey={statusFilter}
        onSelect={setStatusFilter}
      />

      {isLoading ? (
        <LoadingState message="Carregando catálogo de produtos..." />
      ) : errorMessage ? (
        <ErrorState
          title="Erro ao carregar produtos"
          message={mapProductServiceError(errorMessage)}
          onRetry={() => {
            void refresh();
          }}
        />
      ) : products.length === 0 ? (
        <EmptyState
          iconName="pricetag-outline"
          title={
            debouncedSearch.trim() || selectedCategoryId !== 'all'
              ? 'Nenhum produto encontrado para o filtro atual'
              : statusFilter === 'archived'
                ? 'Nenhum produto arquivado'
                : 'Seu catálogo de produtos está vazio'
          }
          description={
            debouncedSearch.trim() || selectedCategoryId !== 'all'
              ? 'Limpe a busca ou selecione "Todas categorias" para ver todos os itens.'
              : 'Cadastre seus produtos com fotos, preços e categorias para agilizar suas vendas.'
          }
          actionLabel={
            debouncedSearch.trim() || selectedCategoryId !== 'all'
              ? 'Limpar filtros'
              : statusFilter === 'active'
                ? 'Cadastrar primeiro produto'
                : undefined
          }
          onActionPress={
            debouncedSearch.trim() || selectedCategoryId !== 'all'
              ? () => {
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                }
              : statusFilter === 'active'
                ? () => router.push('/products/new')
                : undefined
          }
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <ListCounterBanner
              totalCount={totalCount}
              displayedCount={displayedCount}
              nounSingular="produto"
              nounPlural="produtos"
              isFiltered={isFiltered}
            />
          }
          ListFooterComponent={
            <ListFooterLoader
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              itemCount={products.length}
              nounSingular="produto"
              nounPlural="produtos"
              onPressLoadMore={loadMore}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void refresh();
                void loadAuxiliaryData();
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
  listContent: {
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },
});
