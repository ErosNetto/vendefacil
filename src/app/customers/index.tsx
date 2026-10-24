import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import {
  AppHeader,
  CustomerRow,
  EmptyState,
  ErrorState,
  FilterChips,
  ListCounterBanner,
  ListFooterLoader,
  LoadingState,
  PrimaryButton,
  Screen,
  SearchField,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import type { CustomerStatusFilter } from '@/features/customers/schemas';
import {
  getWorkspaceCustomerCounts,
  listWorkspaceCustomersPaginated,
  mapCustomerServiceError,
} from '@/features/customers/services';
import { useDebounce, usePaginatedList } from '@/hooks';
import type { CustomerRow as CustomerRecord } from '@/types/database';

export default function CustomersListScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] =
    useState<CustomerStatusFilter>('active');

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
      return listWorkspaceCustomersPaginated({
        workspaceId,
        search: debouncedSearch,
        status: statusFilter,
        page,
        pageSize,
      });
    },
    [workspaceId, debouncedSearch, statusFilter],
  );

  const {
    items: customers,
    totalCount,
    displayedCount,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    errorMessage,
    refresh,
    loadMore,
  } = usePaginatedList<CustomerRecord>({
    fetchPage,
    pageSize: 20,
    dependencies: [workspaceId, debouncedSearch, statusFilter],
    enabled: Boolean(workspaceId),
  });

  // Atualiza contadores globais para os FilterChips
  const loadCounts = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const summary = await getWorkspaceCustomerCounts(workspaceId);
      setCounts(summary);
    } catch {
      // Falha silenciosa nos contadores não bloqueia a lista
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadCounts();
    }, [loadCounts]),
  );

  const filterOptions = useMemo(
    () =>
      [
        { key: 'active', label: 'Ativos', count: counts.active },
        { key: 'archived', label: 'Arquivados', count: counts.archived },
        { key: 'all', label: 'Todos', count: counts.all },
      ] as const,
    [counts.active, counts.all, counts.archived],
  );

  const isFiltered = Boolean(debouncedSearch.trim()) || statusFilter !== 'all';

  const handlePressCustomer = useCallback(
    (customerId: string) => {
      router.push(`/customers/${customerId}`);
    },
    [router],
  );

  const keyExtractor = useCallback((item: CustomerRecord) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: CustomerRecord }) => (
      <CustomerRow
        customer={item}
        onPress={() => handlePressCustomer(item.id)}
      />
    ),
    [handlePressCustomer],
  );

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Clientes"
        subtitle={activeWorkspace?.workspace.name ?? 'Carteira de clientes'}
        showBack
        rightSlot={
          <PrimaryButton
            label="Novo"
            iconName="person-add-outline"
            onPress={() => router.push('/customers/new')}
          />
        }
      />

      <SearchField
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Buscar por nome, telefone ou e-mail..."
        accessibilityLabel="Buscar cliente"
      />

      <FilterChips
        options={filterOptions}
        selectedKey={statusFilter}
        onSelect={setStatusFilter}
      />

      {isLoading ? (
        <LoadingState message="Carregando carteira de clientes..." />
      ) : errorMessage ? (
        <ErrorState
          title="Erro ao carregar clientes"
          message={mapCustomerServiceError(errorMessage)}
          onRetry={() => {
            void refresh();
          }}
        />
      ) : customers.length === 0 ? (
        <EmptyState
          iconName="people-outline"
          title={
            debouncedSearch.trim()
              ? 'Nenhum cliente encontrado para a busca'
              : statusFilter === 'archived'
                ? 'Nenhum cliente arquivado'
                : 'Sua carteira de clientes está vazia'
          }
          description={
            debouncedSearch.trim()
              ? 'Tente outro termo de pesquisa ou altere o filtro de status acima.'
              : statusFilter === 'archived'
                ? 'Clientes arquivados aparecem aqui com todo o histórico preservado.'
                : 'Cadastre seus clientes para acompanhar compras, parcelas e recebimentos.'
          }
          actionLabel={
            debouncedSearch.trim()
              ? 'Limpar busca'
              : statusFilter === 'active'
                ? 'Cadastrar primeiro cliente'
                : undefined
          }
          onActionPress={
            debouncedSearch.trim()
              ? () => setSearchQuery('')
              : statusFilter === 'active'
                ? () => router.push('/customers/new')
                : undefined
          }
        />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <ListCounterBanner
              totalCount={totalCount}
              displayedCount={displayedCount}
              nounSingular="cliente"
              nounPlural="clientes"
              isFiltered={isFiltered}
            />
          }
          ListFooterComponent={
            <ListFooterLoader
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              itemCount={customers.length}
              nounSingular="cliente"
              nounPlural="clientes"
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
                void loadCounts();
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
