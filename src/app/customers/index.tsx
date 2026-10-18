import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  CustomerRow,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  PrimaryButton,
  Screen,
  SearchField,
} from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  filterCustomers,
  type CustomerStatusFilter,
} from '@/features/customers/schemas';
import {
  listWorkspaceCustomers,
  mapCustomerServiceError,
} from '@/features/customers/services';
import type { CustomerRow as CustomerRecord } from '@/types/database';

export default function CustomersListScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<CustomerStatusFilter>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    if (!workspaceId) {
      setCustomers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const rows = await listWorkspaceCustomers(workspaceId);
      setCustomers(rows);
    } catch (error) {
      setErrorMessage(mapCustomerServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomers();
    }, [loadCustomers]),
  );

  const counts = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const item of customers) {
      if (item.is_archived) {
        archived += 1;
      } else {
        active += 1;
      }
    }
    return { active, archived, all: customers.length };
  }, [customers]);

  const filteredCustomers = useMemo(
    () => filterCustomers(customers, searchQuery, statusFilter),
    [customers, searchQuery, statusFilter],
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

  return (
    <Screen>
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
          message={errorMessage}
          onRetry={() => {
            void loadCustomers();
          }}
        />
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          iconName="people-outline"
          title={
            searchQuery.trim()
              ? 'Nenhum cliente encontrado para a busca'
              : statusFilter === 'archived'
                ? 'Nenhum cliente arquivado'
                : 'Sua carteira de clientes está vazia'
          }
          description={
            searchQuery.trim()
              ? 'Tente outro termo de pesquisa ou altere o filtro de status acima.'
              : statusFilter === 'archived'
                ? 'Clientes arquivados aparecem aqui com todo o histórico preservado.'
                : 'Cadastre seus clientes para acompanhar compras, parcelas e recebimentos.'
          }
          actionLabel={
            searchQuery.trim()
              ? 'Limpar busca'
              : statusFilter === 'active'
                ? 'Cadastrar primeiro cliente'
                : undefined
          }
          onActionPress={
            searchQuery.trim()
              ? () => setSearchQuery('')
              : statusFilter === 'active'
                ? () => router.push('/customers/new')
                : undefined
          }
        />
      ) : (
        <View style={styles.listColumn}>
          {filteredCustomers.map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              onPress={() => router.push(`/customers/${customer.id}`)}
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
