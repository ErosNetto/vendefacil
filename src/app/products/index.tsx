import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  PrimaryButton,
  ProductCard,
  Screen,
  SearchField,
} from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  filterProducts,
  type ProductStatusFilter,
} from '@/features/products/schemas';
import {
  listWorkspaceCategories,
  listWorkspaceProducts,
  mapProductServiceError,
} from '@/features/products/services';
import type { CategoryRow, ProductRow } from '@/types/database';

export default function ProductsCatalogScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [statusFilter, setStatusFilter] =
    useState<ProductStatusFilter>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!workspaceId) {
      setProducts([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [productRows, categoryRows] = await Promise.all([
        listWorkspaceProducts(workspaceId),
        listWorkspaceCategories(workspaceId),
      ]);
      setProducts(productRows);
      setCategories(categoryRows);
    } catch (error) {
      setErrorMessage(mapProductServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadCatalog();
    }, [loadCatalog]),
  );

  const categoryNameById = useMemo(
    () => new Map<string, string>(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const statusCounts = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const item of products) {
      if (item.is_archived) {
        archived += 1;
      } else {
        active += 1;
      }
    }
    return { active, archived, all: products.length };
  }, [products]);

  const statusOptions = useMemo(
    () =>
      [
        { key: 'active', label: 'Ativos', count: statusCounts.active },
        { key: 'archived', label: 'Arquivados', count: statusCounts.archived },
        { key: 'all', label: 'Todos', count: statusCounts.all },
      ] as const,
    [statusCounts.active, statusCounts.all, statusCounts.archived],
  );

  const categoryOptions = useMemo(
    () => [
      { key: 'all', label: 'Todas categorias' },
      ...categories.map((cat) => ({ key: cat.id, label: cat.name })),
    ],
    [categories],
  );

  const filteredProducts = useMemo(
    () =>
      filterProducts(
        products,
        searchQuery,
        selectedCategoryId,
        statusFilter,
      ),
    [products, searchQuery, selectedCategoryId, statusFilter],
  );

  return (
    <Screen>
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
          message={errorMessage}
          onRetry={() => {
            void loadCatalog();
          }}
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          iconName="pricetag-outline"
          title={
            searchQuery.trim() || selectedCategoryId !== 'all'
              ? 'Nenhum produto encontrado para o filtro atual'
              : statusFilter === 'archived'
                ? 'Nenhum produto arquivado'
                : 'Seu catálogo de produtos está vazio'
          }
          description={
            searchQuery.trim() || selectedCategoryId !== 'all'
              ? 'Limpe a busca ou selecione "Todas categorias" para ver todos os itens.'
              : 'Cadastre seus produtos com fotos, preços e categorias para agilizar suas vendas.'
          }
          actionLabel={
            searchQuery.trim() || selectedCategoryId !== 'all'
              ? 'Limpar filtros'
              : statusFilter === 'active'
                ? 'Cadastrar primeiro produto'
                : undefined
          }
          onActionPress={
            searchQuery.trim() || selectedCategoryId !== 'all'
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
        <View style={styles.listColumn}>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={
                product.category_id
                  ? categoryNameById.get(product.category_id)
                  : null
              }
              onPress={() => router.push(`/products/${product.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listColumn: {
    gap: spacing.md,
  },
});
