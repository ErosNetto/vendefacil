import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  PrimaryButton,
  Screen,
  SearchField,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  calculateStockPreview,
  createStockIdempotencyKey,
  MANUAL_STOCK_MOVEMENT_TYPES,
  type ManualStockMovementType,
  normalizeStockAdjustmentPayload,
  parsePositiveQuantityInput,
  STOCK_MOVEMENT_META,
  stockAdjustmentFormSchema,
} from '@/features/inventory/schemas';
import {
  adjustWorkspaceProductStock,
  mapInventoryServiceError,
} from '@/features/inventory/services';
import { getSignedProductImageUrl } from '@/features/products/imageService';
import {
  listWorkspaceProducts,
  mapProductServiceError,
} from '@/features/products/services';
import type { ProductRow } from '@/types/database';

export default function InventoryAdjustScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    productId?: string;
    movementType?: string;
  }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState<string>(
    params.productId ?? '',
  );
  const [selectedProductImageUrl, setSelectedProductImageUrl] = useState<
    string | null
  >(null);
  const [productSearch, setProductSearch] = useState('');
  const [isSelectingProduct, setIsSelectingProduct] = useState(
    !params.productId,
  );

  const initialMovementType: ManualStockMovementType =
    params.movementType &&
    MANUAL_STOCK_MOVEMENT_TYPES.includes(
      params.movementType as ManualStockMovementType,
    )
      ? (params.movementType as ManualStockMovementType)
      : 'entry';

  const [movementType, setMovementType] =
    useState<ManualStockMovementType>(initialMovementType);
  const [quantityInput, setQuantityInput] = useState('');
  const [reason, setReason] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    productId?: string;
    quantityInput?: string;
    reason?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mantém a mesma chave de idempotência para proteger contra retry / duplo toque (RF-035)
  // e regenera quando o produto, tipo ou quantidade mudam.
  const idempotencyKeyRef = useRef<string>(
    createStockIdempotencyKey(params.productId ?? 'init'),
  );

  const loadProducts = useCallback(async () => {
    if (!workspaceId) {
      setIsLoadingProducts(false);
      return;
    }

    setIsLoadingProducts(true);
    setLoadError(null);
    try {
      const allProducts = await listWorkspaceProducts(workspaceId);
      const list = allProducts.filter((item) => !item.is_archived);
      setProducts(list);
      if (params.productId) {
        const found = list.find((p) => p.id === params.productId);
        if (found) {
          setSelectedProductId(found.id);
          setIsSelectingProduct(false);
        }
      }
    } catch (error) {
      setLoadError(mapProductServiceError(error));
    } finally {
      setIsLoadingProducts(false);
    }
  }, [params.productId, workspaceId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // Regenera a chave de idempotência sempre que os parâmetros da intenção mudam
  useEffect(() => {
    idempotencyKeyRef.current = createStockIdempotencyKey(
      selectedProductId || 'prod',
    );
  }, [selectedProductId, movementType, quantityInput, reason]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  useEffect(() => {
    let active = true;
    if (!selectedProduct?.primary_image_path) {
      setSelectedProductImageUrl(null);
      return;
    }

    void getSignedProductImageUrl(selectedProduct.primary_image_path).then(
      (url) => {
        if (active) {
          setSelectedProductImageUrl(url);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [selectedProduct?.primary_image_path]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) {
      return products.slice(0, 15);
    }
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.sku && p.sku.toLowerCase().includes(query)) ||
          (p.brand && p.brand.toLowerCase().includes(query)),
      )
      .slice(0, 15);
  }, [productSearch, products]);

  const currentStockQty = Number(selectedProduct?.current_stock_qty ?? 0);
  const parsedQty = parsePositiveQuantityInput(quantityInput) ?? 0;
  const preview = calculateStockPreview(
    currentStockQty,
    movementType,
    parsedQty,
  );
  const movementMeta = STOCK_MOVEMENT_META[movementType];

  async function handleSubmit(): Promise<void> {
    if (!workspaceId || isSubmitting) {
      return;
    }

    setSubmitError(null);
    setFieldErrors({});

    const parsed = stockAdjustmentFormSchema.safeParse({
      productId: selectedProductId,
      movementType,
      quantityInput,
      reason,
      currentStockQty,
    });

    if (!parsed.success) {
      const nextErrors: {
        productId?: string;
        quantityInput?: string;
        reason?: string;
      } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          (key === 'productId' ||
            key === 'quantityInput' ||
            key === 'reason') &&
          !nextErrors[key]
        ) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const normalized = normalizeStockAdjustmentPayload(parsed.data);
      await adjustWorkspaceProductStock({
        workspaceId,
        productId: normalized.productId,
        movementType: normalized.movementType,
        quantity: normalized.quantity,
        reason: normalized.reason,
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/inventory');
      }
    } catch (error) {
      setSubmitError(mapInventoryServiceError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingProducts) {
    return (
      <Screen>
        <LoadingState message="Carregando produtos para movimentação..." />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <AppHeader title="Movimentar estoque" showBack />
        <ErrorState
          title="Erro ao carregar produtos"
          message={loadError}
          onRetry={() => {
            void loadProducts();
          }}
        />
      </Screen>
    );
  }

  if (products.length === 0) {
    return (
      <Screen>
        <AppHeader title="Movimentar estoque" showBack />
        <EmptyState
          iconName="pricetag-outline"
          title="Nenhum produto ativo"
          description="Cadastre pelo menos um produto ativo no catálogo antes de registrar entradas ou ajustes de estoque."
          actionLabel="Cadastrar produto"
          onActionPress={() => router.replace('/products/new')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader
        title="Movimentar estoque"
        subtitle="Entrada, ajuste ou perda auditável"
        showBack
      />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>1. Produto</Text>

        {selectedProduct && !isSelectingProduct ? (
          <View style={styles.selectedProductBox}>
            <View style={styles.selectedProductThumb}>
              {selectedProductImageUrl ? (
                <Image
                  source={{ uri: selectedProductImageUrl }}
                  style={styles.selectedProductImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <Ionicons
                  name="pricetag-outline"
                  size={20}
                  color={colors.primary}
                />
              )}
            </View>
            <View style={styles.selectedProductInfo}>
              <Text style={styles.selectedProductName} numberOfLines={1}>
                {selectedProduct.name}
              </Text>
              <Text style={styles.selectedProductMeta}>
                Saldo atual: {currentStockQty} un. • Mínimo:{' '}
                {Number(selectedProduct.min_stock_qty ?? 0)} un.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsSelectingProduct(true)}
              style={styles.changeProductButton}
            >
              <Text style={styles.changeProductText}>Trocar</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.selectorContainer}>
            <SearchField
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Buscar produto por nome ou SKU..."
            />
            <View style={styles.productList}>
              {filteredProducts.map((item) => {
                const isSelected = item.id === selectedProductId;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedProductId(item.id);
                      setIsSelectingProduct(false);
                      setFieldErrors((prev) => ({
                        ...prev,
                        productId: undefined,
                      }));
                    }}
                    style={[
                      styles.productOption,
                      isSelected ? styles.productOptionSelected : null,
                    ]}
                  >
                    <View style={styles.productOptionMain}>
                      <Text style={styles.productOptionName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.sku ? (
                        <Text style={styles.productOptionSku}>
                          SKU: {item.sku}
                        </Text>
                      ) : null}
                    </View>
                    <StatusBadge
                      label={`${Number(item.current_stock_qty ?? 0)} un.`}
                      tone={
                        Number(item.current_stock_qty ?? 0) <= 0
                          ? 'error'
                          : 'neutral'
                      }
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {fieldErrors.productId ? (
          <Text style={styles.errorText}>{fieldErrors.productId}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>2. Tipo de movimentação</Text>

        <View style={styles.typeGrid}>
          {MANUAL_STOCK_MOVEMENT_TYPES.map((typeKey) => {
            const meta = STOCK_MOVEMENT_META[typeKey];
            const isSelected = movementType === typeKey;
            return (
              <Pressable
                key={typeKey}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  setMovementType(typeKey);
                  setFieldErrors((prev) => ({ ...prev, reason: undefined }));
                }}
                style={[
                  styles.typeChip,
                  isSelected ? styles.typeChipActive : null,
                ]}
              >
                <Ionicons
                  name={
                    meta.direction === 'in'
                      ? 'arrow-down-circle-outline'
                      : 'arrow-up-circle-outline'
                  }
                  size={17}
                  color={isSelected ? colors.white : colors.primaryDark}
                />
                <Text
                  style={[
                    styles.typeChipText,
                    isSelected ? styles.typeChipTextActive : null,
                  ]}
                >
                  {meta.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.helperBanner}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={colors.primaryDark}
          />
          <Text style={styles.helperBannerText}>{movementMeta.helperText}</Text>
        </View>

        <FormField
          label="Quantidade movimentada *"
          placeholder="Ex.: 5"
          keyboardType="decimal-pad"
          value={quantityInput}
          onChangeText={(val) => {
            setQuantityInput(val);
            setFieldErrors((prev) => ({ ...prev, quantityInput: undefined }));
          }}
          errorMessage={fieldErrors.quantityInput}
        />

        <FormField
          label={
            movementMeta.requiresReason
              ? 'Motivo / Justificativa *'
              : 'Observação / Fornecedor (opcional)'
          }
          placeholder={
            movementMeta.requiresReason
              ? 'Ex.: Contagem física mensal ou embalagem danificada'
              : 'Ex.: Nota fiscal 1042 - Fornecedor Central'
          }
          value={reason}
          onChangeText={(val) => {
            setReason(val);
            setFieldErrors((prev) => ({ ...prev, reason: undefined }));
          }}
          errorMessage={fieldErrors.reason}
        />

        {selectedProduct ? (
          <View
            style={[
              styles.previewBox,
              preview.wouldGoNegative ? styles.previewBoxError : null,
            ]}
          >
            <View style={styles.previewColumn}>
              <Text style={styles.previewLabel}>Saldo atual</Text>
              <Text style={styles.previewValue}>{currentStockQty} un.</Text>
            </View>
            <Ionicons
              name="arrow-forward-outline"
              size={18}
              color={colors.textSecondary}
            />
            <View style={styles.previewColumn}>
              <Text style={styles.previewLabel}>Movimento</Text>
              <Text
                style={[
                  styles.previewValue,
                  {
                    color:
                      preview.delta >= 0 ? colors.success : colors.error,
                  },
                ]}
              >
                {preview.delta > 0 ? `+${preview.delta}` : preview.delta} un.
              </Text>
            </View>
            <Ionicons
              name="arrow-forward-outline"
              size={18}
              color={colors.textSecondary}
            />
            <View style={styles.previewColumn}>
              <Text style={styles.previewLabel}>Novo saldo</Text>
              <Text
                style={[
                  styles.previewValue,
                  preview.wouldGoNegative ? { color: colors.error } : null,
                ]}
              >
                {preview.resultingStock} un.
              </Text>
            </View>
          </View>
        ) : null}

        {submitError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        <View style={styles.actionsColumn}>
          <PrimaryButton
            label="Confirmar movimentação"
            iconName="checkmark-circle-outline"
            loading={isSubmitting}
            onPress={() => {
              void handleSubmit();
            }}
          />
          <SecondaryButton
            label="Cancelar"
            onPress={() => router.back()}
            disabled={isSubmitting}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
  selectedProductBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.md,
  },
  selectedProductThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  selectedProductImage: {
    width: '100%',
    height: '100%',
  },
  selectedProductInfo: {
    flex: 1,
    gap: 2,
  },
  selectedProductName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  selectedProductMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  changeProductButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeProductText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  selectorContainer: {
    gap: spacing.xs,
  },
  productList: {
    gap: spacing.xs,
  },
  productOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  productOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  productOptionMain: {
    flex: 1,
    gap: 2,
  },
  productOptionName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  productOptionSku: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  typeChipTextActive: {
    color: colors.white,
  },
  helperBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  helperBannerText: {
    ...typography.caption,
    color: colors.primaryDark,
    flex: 1,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  previewBoxError: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
  },
  previewColumn: {
    alignItems: 'center',
    gap: 4,
  },
  previewLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewValue: {
    ...typography.section,
    color: colors.text,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.control,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
    marginBottom: spacing.lg,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.error,
  },
  actionsColumn: {
    gap: spacing.sm,
  },
});
