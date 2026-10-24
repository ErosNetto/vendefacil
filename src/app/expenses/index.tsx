import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterChips,
  ListCounterBanner,
  ListFooterLoader,
  LoadingState,
  MoneyText,
  Screen,
  SearchField,
} from '@/components/ui';
import { colors, radius, spacing, touchTarget, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  cancelWorkspaceExpense,
  listWorkspaceExpenseCategories,
  listWorkspaceExpensesPaginated,
} from '@/features/expenses/services';
import { PAYMENT_METHOD_OPTIONS } from '@/features/finance/schemas';
import { useDebounce, usePaginatedList } from '@/hooks';
import type { ExpenseCategoryRow, ExpenseRow } from '@/types/database';
import { formatDateBR } from '@/utils/formatters';

interface ExpenseCardItemProps {
  item: ExpenseRow;
  categoryName: string;
  onPressEdit: (expense: ExpenseRow) => void;
  onPressCancel: (expense: ExpenseRow) => void;
}

const ExpenseCardItem = memo(function ExpenseCardItem({
  item,
  categoryName,
  onPressEdit,
  onPressCancel,
}: ExpenseCardItemProps) {
  const methodMeta = PAYMENT_METHOD_OPTIONS.find(
    (m) => m.value === item.payment_method,
  );

  return (
    <View style={styles.card}>
      {/* 1. Barra superior: Categoria e Meio de Pagamento */}
      <View style={styles.cardTopRow}>
        <View style={styles.categoryBadge}>
          <Ionicons name="pricetag-outline" size={13} color={colors.primaryDark} />
          <Text style={styles.categoryBadgeText} numberOfLines={1}>
            {categoryName}
          </Text>
        </View>

        <View style={styles.paymentMethodBadge}>
          <Ionicons name="wallet-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.paymentMethodBadgeText}>
            {methodMeta?.label ?? item.payment_method}
          </Text>
        </View>
      </View>

      {/* 2. Corpo do card: Descrição, Data e Valor */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar despesa ${item.description}`}
        onPress={() => onPressEdit(item)}
        style={styles.cardBody}
      >
        <View style={styles.cardMainRow}>
          <View style={styles.cardDescCol}>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {item.description}
            </Text>
            <View style={styles.dateRow}>
              <Ionicons
                name="calendar-outline"
                size={13}
                color={colors.textSecondary}
              />
              <Text style={styles.cardDateText}>
                Pago em {formatDateBR(item.expense_date)}
              </Text>
            </View>
          </View>

          <View style={styles.amountCol}>
            <Text style={styles.amountCaption}>Valor da saída</Text>
            <View style={styles.amountValueRow}>
              <Text style={styles.minusSign}>-</Text>
              <MoneyText cents={item.amount_cents} size="lg" tone="error" />
            </View>
          </View>
        </View>

        {item.notes ? (
          <View style={styles.cardNotesBox}>
            <Ionicons
              name="document-text-outline"
              size={14}
              color={colors.textSecondary}
            />
            <Text style={styles.cardNotesText} numberOfLines={2}>
              {item.notes}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* 3. Rodapé com Botões de Ação destacados */}
      <View style={styles.cardFooterRow}>
        <Text style={styles.cardHintText}>Toque no card para editar</Text>

        <View style={styles.actionButtonsGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Editar despesa ${item.description}`}
            onPress={() => onPressEdit(item)}
            style={styles.editButton}
          >
            <Ionicons name="pencil-outline" size={14} color={colors.primary} />
            <Text style={styles.editButtonText}>Editar</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Excluir despesa ${item.description}`}
            onPress={() => onPressCancel(item)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={14} color={colors.error} />
            <Text style={styles.deleteButtonText}>Excluir</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

export default function ExpensesListScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [expenseToCancel, setExpenseToCancel] = useState<ExpenseRow | null>(
    null,
  );
  const [isCancelling, setIsCancelling] = useState(false);

  const loadCategories = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const list = await listWorkspaceExpenseCategories(workspaceId);
      setCategories(list);
    } catch {
      // Ignora falha de categorias
    }
  }, [workspaceId]);

  const fetchPage = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      if (!workspaceId) {
        return { items: [], totalCount: 0 };
      }
      return listWorkspaceExpensesPaginated({
        workspaceId,
        categoryId: selectedCategoryId,
        search: debouncedSearch,
        page,
        pageSize,
      });
    },
    [workspaceId, selectedCategoryId, debouncedSearch],
  );

  const {
    items: expenses,
    totalCount,
    displayedCount,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    errorMessage,
    refresh,
    loadMore,
  } = usePaginatedList<ExpenseRow>({
    fetchPage,
    pageSize: 20,
    dependencies: [workspaceId, selectedCategoryId, debouncedSearch],
    enabled: Boolean(workspaceId),
  });

  const isFirstFocusRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      void loadCategories();
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      void refresh();
    }, [loadCategories, refresh]),
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  const categoryChips = useMemo(() => {
    return [
      { key: 'all', label: 'Todas categorias' },
      ...categories.map((cat) => ({ key: cat.id, label: cat.name })),
    ];
  }, [categories]);

  const handleConfirmCancel = useCallback(async () => {
    if (!workspaceId || !expenseToCancel || isCancelling) return;
    try {
      setIsCancelling(true);
      await cancelWorkspaceExpense({
        expenseId: expenseToCancel.id,
        workspaceId,
      });
      setExpenseToCancel(null);
      void refresh();
    } catch {
      // Falha tratada
    } finally {
      setIsCancelling(false);
    }
  }, [workspaceId, expenseToCancel, isCancelling, refresh]);

  const keyExtractor = useCallback((item: ExpenseRow) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: ExpenseRow }) => (
      <ExpenseCardItem
        item={item}
        categoryName={
          item.category_id
            ? categoryNameById.get(item.category_id) || 'Outros'
            : 'Outros'
        }
        onPressEdit={(exp) =>
          router.push({
            pathname: '/expenses/[id]/edit',
            params: { id: exp.id },
          })
        }
        onPressCancel={setExpenseToCancel}
      />
    ),
    [categoryNameById, router],
  );

  const isFiltered =
    Boolean(debouncedSearch.trim()) || selectedCategoryId !== 'all';

  const listHeader = useMemo(
    () => (
      <>
        <SearchField
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar despesa por descrição..."
        />

        <View style={styles.filterWrap}>
          <FilterChips
            options={categoryChips}
            selectedKey={selectedCategoryId}
            onSelect={setSelectedCategoryId}
          />
        </View>

        {expenses.length > 0 ? (
          <ListCounterBanner
            totalCount={totalCount}
            displayedCount={displayedCount}
            nounSingular="despesa"
            nounPlural="despesas"
            isFiltered={isFiltered}
          />
        ) : null}
      </>
    ),
    [
      searchQuery,
      categoryChips,
      selectedCategoryId,
      expenses.length,
      totalCount,
      displayedCount,
      isFiltered,
    ],
  );

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Despesas do negócio"
        subtitle={activeWorkspace?.workspace.name ?? 'Controle de saídas'}
        rightSlot={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/expenses/new')}
            style={styles.newButton}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.newButtonText}>Nova despesa</Text>
          </Pressable>
        }
      />

      {isLoading ? (
        <LoadingState message="Carregando despesas da loja..." />
      ) : errorMessage ? (
        <ErrorState
          title="Erro ao carregar despesas"
          message={errorMessage}
          onRetry={() => {
            void refresh();
          }}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          iconName="receipt-outline"
          title={
            isFiltered
              ? 'Nenhuma despesa para o filtro atual'
              : 'Nenhuma despesa registrada'
          }
          description={
            isFiltered
              ? 'Tente limpar a busca ou selecionar outra categoria.'
              : 'Cadastre suas contas de luz, aluguel, fornecedores e embalagens para calcular seu lucro líquido real.'
          }
          actionLabel={isFiltered ? 'Limpar filtros' : 'Cadastrar primeira despesa'}
          onActionPress={
            isFiltered
              ? () => {
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                }
              : () => router.push('/expenses/new')
          }
        />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={
            <ListFooterLoader
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              itemCount={expenses.length}
              nounSingular="despesa"
              nounPlural="despesas"
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
                void loadCategories();
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Confirmação de cancelamento */}
      {expenseToCancel ? (
        <ConfirmDialog
          visible={Boolean(expenseToCancel)}
          title="Cancelar despesa?"
          description={`Tem certeza que deseja cancelar a despesa "${expenseToCancel.description}"? O registro será arquivado para auditoria contábil.`}
          confirmLabel={isCancelling ? 'Cancelando...' : 'Sim, cancelar'}
          onConfirm={handleConfirmCancel}
          onCancel={() => setExpenseToCancel(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    minHeight: touchTarget.minHeight,
  },
  newButtonText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
  filterWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.control,
    maxWidth: '65%',
  },
  categoryBadgeText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  paymentMethodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentMethodBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  cardBody: {
    gap: spacing.sm,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardDescCol: {
    flex: 1,
    gap: 4,
  },
  cardDescription: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.text,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDateText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amountCaption: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
  amountValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  minusSign: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.error,
  },
  cardNotesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardNotesText: {
    ...typography.caption,
    flex: 1,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
  },
  cardHintText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
  actionButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  editButtonText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.errorSoft,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  deleteButtonText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
});
