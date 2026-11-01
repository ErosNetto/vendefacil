import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  MoneyText,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { getProductStockHealth } from '@/features/inventory/schemas';
import {
  listWorkspaceStockMovements,
  type StockMovementWithProduct,
} from '@/features/inventory/services';
import { getSignedProductImageUrl } from '@/features/products/imageService';
import { calculateProfitMarginPercent } from '@/features/products/schemas';
import {
  getWorkspaceProductById,
  listWorkspaceCategories,
  mapProductServiceError,
  setWorkspaceProductArchived,
} from '@/features/products/services';
import type { ProductRow } from '@/types/database';
import { formatCentsToBRL, formatDateBR } from '@/utils/formatters';

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [categoryName, setCategoryName] = useState<string>('Sem categoria');
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null);
  const [recentEntries, setRecentEntries] = useState<
    StockMovementWithProduct[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const { showToast } = useToast();

  const loadProduct = useCallback(async () => {
    if (!workspaceId || !id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [record, categories, movements] = await Promise.all([
        getWorkspaceProductById(workspaceId, id),
        listWorkspaceCategories(workspaceId),
        listWorkspaceStockMovements({
          workspaceId,
          productId: id,
          filter: 'in',
          limit: 10,
        }).catch(() => [] as StockMovementWithProduct[]),
      ]);

      if (!record) {
        setErrorMessage('Produto não encontrado neste espaço de trabalho.');
        return;
      }

      setProduct(record);
      setRecentEntries(
        movements.filter((m) => m.movement_type === 'entry').slice(0, 5),
      );
      const foundCategory = categories.find((c) => c.id === record.category_id);
      setCategoryName(foundCategory?.name ?? 'Sem categoria');

      if (record.primary_image_path) {
        const signed = await getSignedProductImageUrl(record.primary_image_path);
        setSignedImageUrl(signed);
      } else {
        setSignedImageUrl(null);
      }
    } catch (error) {
      setErrorMessage(mapProductServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [id, workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadProduct();
    }, [loadProduct]),
  );

  async function handleToggleArchive(): Promise<void> {
    if (!workspaceId || !product || isArchiving) {
      return;
    }

    setIsArchiving(true);
    try {
      const updated = await setWorkspaceProductArchived(
        workspaceId,
        product.id,
        !product.is_archived,
      );
      setProduct(updated);
      setConfirmArchiveOpen(false);
      showToast({
        tone: updated.is_archived ? 'warning' : 'success',
        title: updated.is_archived
          ? 'Produto arquivado'
          : 'Produto reativado!',
        message: updated.is_archived
          ? `"${updated.name}" foi ocultado de novas vendas.`
          : `"${updated.name}" voltou a ficar disponível para vendas.`,
      });
    } catch (error) {
      setConfirmArchiveOpen(false);
      showToast({
        tone: 'error',
        title: 'Erro ao atualizar produto',
        message: mapProductServiceError(error),
      });
    } finally {
      setIsArchiving(false);
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Carregando detalhes do produto..." />
      </Screen>
    );
  }

  if (errorMessage || !product) {
    return (
      <Screen>
        <AppHeader title="Produto" showBack />
        <ErrorState
          title="Não foi possível abrir o produto"
          message={errorMessage ?? 'Produto não localizado.'}
          onRetry={() => {
            void loadProduct();
          }}
        />
      </Screen>
    );
  }

  const marginPercent = calculateProfitMarginPercent(
    product.price_cents,
    product.cost_cents,
  );
  const currentStock = Number(product.current_stock_qty ?? 0);
  const minStock = Number(product.min_stock_qty ?? 0);
  const stockHealth = getProductStockHealth(product);

  return (
    <Screen>
      <AppHeader
        title="Detalhe do produto"
        subtitle={categoryName}
        showBack
      />

      <View style={styles.detailCard}>
        <View style={styles.heroImageContainer}>
          {signedImageUrl ? (
            <Image
              source={{ uri: signedImageUrl }}
              style={styles.heroImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons
                name="pricetag-outline"
                size={48}
                color={colors.primary}
              />
              <Text style={styles.heroPlaceholderText}>
                Sem foto cadastrada
              </Text>
            </View>
          )}
        </View>

        <View style={styles.badgeRow}>
          {stockHealth === 'archived' ? (
            <StatusBadge label="Produto arquivado" tone="warning" />
          ) : stockHealth === 'out' ? (
            <StatusBadge label="Sem estoque" tone="error" />
          ) : stockHealth === 'low' ? (
            <StatusBadge label="Estoque abaixo do mínimo" tone="error" />
          ) : stockHealth === 'at_minimum' ? (
            <StatusBadge label="Estoque no limite mínimo" tone="warning" />
          ) : (
            <StatusBadge label="Produto ativo" tone="success" />
          )}
          <StatusBadge label={`Estoque: ${currentStock}`} tone="neutral" />
        </View>

        <Text style={styles.productName}>{product.name}</Text>
        {product.brand ? (
          <Text style={styles.brandText}>{product.brand}</Text>
        ) : null}

        <View style={styles.priceBox}>
          <View>
            <Text style={styles.priceCaption}>Preço de venda</Text>
            <MoneyText cents={product.price_cents} size="lg" tone="primary" />
          </View>
          <View style={styles.costRight}>
            <Text style={styles.priceCaption}>
              Custo: {formatCentsToBRL(product.cost_cents)}
            </Text>
            {marginPercent !== null ? (
              <Text style={styles.marginText}>
                Margem: {String(marginPercent).replace('.', ',')}%
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Categoria</Text>
          <Text style={styles.metaValue}>{categoryName}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>SKU / Código</Text>
          <Text style={styles.metaValue}>{product.sku ?? 'Não informado'}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Código de barras</Text>
          <Text style={styles.metaValue}>
            {product.barcode ?? 'Não informado'}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Estoque mínimo</Text>
          <Text style={styles.metaValue}>{minStock} un.</Text>
        </View>

        {product.description ? (
          <View style={styles.descriptionBox}>
            <Text style={styles.metaLabel}>Descrição</Text>
            <Text style={styles.descriptionText}>{product.description}</Text>
          </View>
        ) : null}

        {recentEntries.length > 0 ? (
          <View style={styles.batchHistorySection}>
            <View style={styles.batchHistoryHeaderRow}>
              <Text style={styles.batchHistoryTitle}>
                Últimas remessas de entrada
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/inventory/adjust',
                    params: { productId: product.id, movementType: 'entry' },
                  })
                }
              >
                <Text style={styles.batchHistoryActionText}>
                  + Nova entrada
                </Text>
              </Pressable>
            </View>
            {recentEntries.map((entry) => (
              <View key={entry.id} style={styles.batchHistoryItem}>
                <View style={styles.batchHistoryTopRow}>
                  <Text style={styles.batchHistoryDate}>
                    {formatDateBR(entry.created_at)}
                  </Text>
                  <Text style={styles.batchHistoryQty}>
                    +{entry.quantity_delta} un.
                  </Text>
                </View>
                {entry.unit_cost_cents != null ||
                entry.unit_price_cents != null ? (
                  <Text style={styles.batchHistoryPricing}>
                    {entry.unit_cost_cents != null
                      ? `Custo: ${formatCentsToBRL(entry.unit_cost_cents)}/un. (Lote: ${formatCentsToBRL(
                          Math.round(
                            entry.quantity_delta * entry.unit_cost_cents,
                          ),
                        )})`
                      : ''}
                    {entry.unit_cost_cents != null &&
                    entry.unit_price_cents != null
                      ? ' • '
                      : ''}
                    {entry.unit_price_cents != null
                      ? `Venda: ${formatCentsToBRL(entry.unit_price_cents)}`
                      : ''}
                  </Text>
                ) : null}
                {entry.reason ? (
                  <Text style={styles.batchHistoryReason} numberOfLines={1}>
                    {entry.reason}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actionsColumn}>
          {!product.is_archived ? (
            <>
              <PrimaryButton
                label="Vender este produto"
                iconName="cart-outline"
                onPress={() =>
                  router.push({
                    pathname: '/sales/new',
                    params: { productId: product.id },
                  })
                }
              />
              <SecondaryButton
                label="Movimentar estoque"
                iconName="swap-vertical-outline"
                onPress={() =>
                  router.push({
                    pathname: '/inventory/adjust',
                    params: { productId: product.id },
                  })
                }
              />
            </>
          ) : null}
          <SecondaryButton
            label="Histórico de estoque"
            iconName="time-outline"
            onPress={() =>
              router.push({
                pathname: '/inventory/movements',
                params: {
                  productId: product.id,
                  productName: product.name,
                },
              })
            }
          />
          <SecondaryButton
            label="Editar produto"
            iconName="create-outline"
            onPress={() => router.push(`/products/${product.id}/edit`)}
          />
          <SecondaryButton
            label={
              product.is_archived ? 'Restaurar produto' : 'Arquivar produto'
            }
            iconName={
              product.is_archived
                ? 'refresh-circle-outline'
                : 'archive-outline'
            }
            onPress={() => setConfirmArchiveOpen(true)}
          />
        </View>
      </View>

      <ConfirmDialog
        visible={confirmArchiveOpen}
        title={
          product.is_archived ? 'Restaurar produto?' : 'Arquivar produto?'
        }
        description={
          product.is_archived
            ? `O produto "${product.name}" voltará a aparecer no catálogo ativo.`
            : `O produto "${product.name}" ficará oculto em novas vendas, mas todo o histórico de vendas e movimentações de estoque será preservado.`
        }
        confirmLabel={
          product.is_archived ? 'Sim, restaurar' : 'Sim, arquivar'
        }
        loading={isArchiving}
        onConfirm={() => {
          void handleToggleArchive();
        }}
        onCancel={() => setConfirmArchiveOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  heroImageContainer: {
    width: '100%',
    height: 240,
    borderRadius: radius.card,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  heroPlaceholderText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  productName: {
    ...typography.sectionLg,
    color: colors.text,
  },
  brandText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.controlLg,
    padding: spacing.lg,
  },
  priceCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  costRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  marginText: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metaLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  metaValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  descriptionBox: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  descriptionText: {
    ...typography.body,
    color: colors.text,
  },
  batchHistorySection: {
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  batchHistoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  batchHistoryTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  batchHistoryActionText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  batchHistoryItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  batchHistoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batchHistoryDate: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  batchHistoryQty: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.success,
  },
  batchHistoryPricing: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  batchHistoryReason: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionsColumn: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
});
