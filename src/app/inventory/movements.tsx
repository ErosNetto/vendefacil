import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  Screen,
  SearchField,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  isIncomingMovement,
  STOCK_MOVEMENT_META,
} from '@/features/inventory/schemas';
import {
  listWorkspaceStockMovements,
  mapInventoryServiceError,
  type MovementHistoryFilter,
  type StockMovementWithProduct,
} from '@/features/inventory/services';
import { formatDateTimeBR } from '@/utils/formatters';

const FILTER_OPTIONS: { key: MovementHistoryFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'in', label: 'Entradas' },
  { key: 'out', label: 'Saídas' },
  { key: 'adjustments', label: 'Ajustes' },
];

export default function InventoryMovementsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    productId?: string;
    productName?: string;
  }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [movements, setMovements] = useState<StockMovementWithProduct[]>([]);
  const [filter, setFilter] = useState<MovementHistoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProductId, setActiveProductId] = useState<string | undefined>(
    params.productId,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMovements = useCallback(async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await listWorkspaceStockMovements({
        workspaceId,
        productId: activeProductId,
        filter,
      });
      setMovements(list);
    } catch (error) {
      setErrorMessage(mapInventoryServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [activeProductId, filter, workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadMovements();
    }, [loadMovements]),
  );

  const filteredMovements = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return movements;
    }

    return movements.filter(
      (item) =>
        item.productName.toLowerCase().includes(query) ||
        (item.productSku && item.productSku.toLowerCase().includes(query)) ||
        (item.reason && item.reason.toLowerCase().includes(query)),
    );
  }, [movements, searchQuery]);

  return (
    <Screen>
      <AppHeader
        title="Movimentações"
        subtitle={
          activeProductId && params.productName
            ? `Histórico: ${params.productName}`
            : 'Histórico imutável de entradas e saídas'
        }
        showBack
        rightSlot={
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/inventory/adjust',
                params: activeProductId ? { productId: activeProductId } : {},
              })
            }
            style={styles.headerActionButton}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.headerActionText}>Movimentar</Text>
          </Pressable>
        }
      />

      {activeProductId ? (
        <View style={styles.productFilterBanner}>
          <View style={styles.productFilterInfo}>
            <Ionicons
              name="funnel-outline"
              size={16}
              color={colors.primaryDark}
            />
            <Text style={styles.productFilterText} numberOfLines={1}>
              Produto:{' '}
              {params.productName ?? movements[0]?.productName ?? 'Selecionado'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveProductId(undefined)}
            style={styles.clearFilterBadge}
          >
            <Text style={styles.clearFilterText}>Ver todos</Text>
          </Pressable>
        </View>
      ) : null}

      <SearchField
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Buscar por produto, SKU ou motivo..."
      />

      <FilterChips
        options={FILTER_OPTIONS}
        selectedKey={filter}
        onSelect={setFilter}
      />

      {isLoading ? (
        <LoadingState message="Carregando histórico de movimentações..." />
      ) : errorMessage ? (
        <ErrorState
          title="Não foi possível carregar as movimentações"
          message={errorMessage}
          onRetry={() => {
            void loadMovements();
          }}
        />
      ) : filteredMovements.length === 0 ? (
        <EmptyState
          iconName="swap-vertical-outline"
          title="Nenhuma movimentação encontrada"
          description="Registre uma entrada de mercadoria ou ajuste de estoque para iniciar o histórico auditável."
          actionLabel="Registrar movimentação"
          onActionPress={() =>
            router.push({
              pathname: '/inventory/adjust',
              params: activeProductId ? { productId: activeProductId } : {},
            })
          }
        />
      ) : (
        <View style={styles.listContainer}>
          {filteredMovements.map((movement) => {
            const meta = STOCK_MOVEMENT_META[movement.movement_type];
            const incoming = isIncomingMovement(movement.movement_type);
            const formattedDelta =
              movement.quantity_delta > 0
                ? `+${movement.quantity_delta}`
                : `${movement.quantity_delta}`;

            return (
              <Pressable
                key={movement.id}
                accessibilityRole="button"
                onPress={() => router.push(`/products/${movement.product_id}`)}
                style={styles.movementCard}
              >
                <View style={styles.movementMainRow}>
                  <View
                    style={[
                      styles.iconCircle,
                      incoming ? styles.iconCircleIn : styles.iconCircleOut,
                    ]}
                  >
                    <Ionicons
                      name={
                        incoming
                          ? 'arrow-down-outline'
                          : 'arrow-up-outline'
                      }
                      size={20}
                      color={incoming ? colors.success : colors.error}
                    />
                  </View>

                  <View style={styles.movementTitleWrap}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {movement.productName}
                    </Text>
                    <Text style={styles.movementTypeLabel}>{meta.label}</Text>
                    <Text style={styles.dateText}>
                      {formatDateTimeBR(movement.created_at)}
                    </Text>
                  </View>

                  <View style={styles.rightColumn}>
                    <View
                      style={[
                        styles.deltaBadge,
                        incoming ? styles.deltaBadgeIn : styles.deltaBadgeOut,
                      ]}
                    >
                      <Text
                        style={[
                          styles.deltaText,
                          { color: incoming ? colors.success : colors.error },
                        ]}
                      >
                        {formattedDelta} un.
                      </Text>
                    </View>

                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceCaption}>
                        {movement.previous_stock_qty}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={12}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.balanceStrong}>
                        {movement.resulting_stock_qty} un.
                      </Text>
                    </View>
                  </View>
                </View>

                {movement.reason ? (
                  <View style={styles.reasonBox}>
                    <Ionicons
                      name="document-text-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.reasonText}>{movement.reason}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  headerActionText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.white,
  },
  productFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  productFilterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  productFilterText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
    flex: 1,
  },
  clearFilterBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearFilterText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  listContainer: {
    gap: spacing.md,
  },
  movementCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  movementMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconCircleIn: {
    backgroundColor: colors.successSoft,
  },
  iconCircleOut: {
    backgroundColor: colors.errorSoft,
  },
  movementTitleWrap: {
    flex: 1,
    gap: 2,
  },
  productName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  movementTypeLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  dateText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rightColumn: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  deltaBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  deltaBadgeIn: {
    backgroundColor: colors.successSoft,
  },
  deltaBadgeOut: {
    backgroundColor: colors.errorSoft,
  },
  deltaText: {
    ...typography.bodyStrong,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  balanceStrong: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  reasonText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
