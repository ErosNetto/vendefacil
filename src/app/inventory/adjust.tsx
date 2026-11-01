import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  BarcodeScannerModal,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  PrimaryButton,
  ProductPickerModal,
  Screen,
  SecondaryButton,
  ToastOverlay,
  useToast,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  calculateStockPreview,
  calculateWeightedAverageCostCents,
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
import {
  formatCentsToBRL,
  maskBRLCurrencyInput,
  parseBRLInputToCents,
} from '@/utils/formatters';

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
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const { toast, showToast, hideToast } = useToast();

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
  const [unitCostInput, setUnitCostInput] = useState('');
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [batchTypedCostCents, setBatchTypedCostCents] = useState<number | null>(
    null,
  );

  const [fieldErrors, setFieldErrors] = useState<{
    productId?: string;
    quantityInput?: string;
    reason?: string;
    unitCostInput?: string;
    unitPriceInput?: string;
  }>({});
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
  }, [
    selectedProductId,
    movementType,
    quantityInput,
    reason,
    unitCostInput,
    unitPriceInput,
  ]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  useEffect(() => {
    if (!selectedProduct) {
      setUnitCostInput('');
      setUnitPriceInput('');
      setBatchTypedCostCents(null);
      return;
    }

    const currentCost = selectedProduct.cost_cents ?? 0;
    const currentPrice = selectedProduct.price_cents ?? 0;
    setUnitCostInput(maskBRLCurrencyInput(String(currentCost)));
    setUnitPriceInput(maskBRLCurrencyInput(String(currentPrice)));
    setBatchTypedCostCents(currentCost);
  }, [selectedProduct]);

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

  function handleBarcodeScannedInAdjust(rawCode: string): void {
    setScannerModalOpen(false);
    const cleaned = rawCode.trim();
    if (!cleaned) {
      return;
    }

    const found = products.find(
      (p) =>
        (p.barcode && p.barcode.trim() === cleaned) ||
        (p.sku && p.sku.trim().toLowerCase() === cleaned.toLowerCase()),
    );

    if (!found) {
      showToast({
        tone: 'warning',
        title: 'Produto não encontrado',
        message: `Nenhum produto ativo com o código "${cleaned}" no seu catálogo.`,
      });
      return;
    }

    setSelectedProductId(found.id);
    setProductPickerOpen(false);
    setFieldErrors((prev) => ({ ...prev, productId: undefined }));
    showToast({
      tone: 'success',
      title: 'Produto selecionado!',
      message: `${found.name} (Saldo atual: ${Number(found.current_stock_qty ?? 0)} un.)`,
    });
  }

  const currentStockQty = Number(selectedProduct?.current_stock_qty ?? 0);
  const parsedQty = parsePositiveQuantityInput(quantityInput) ?? 0;
  const preview = calculateStockPreview(
    currentStockQty,
    movementType,
    parsedQty,
  );
  const movementMeta = STOCK_MOVEMENT_META[movementType];

  const currentCatalogCostCents = selectedProduct?.cost_cents ?? 0;
  const currentCatalogPriceCents = selectedProduct?.price_cents ?? 0;
  const parsedUnitCostCents =
    parseBRLInputToCents(unitCostInput) ?? currentCatalogCostCents;
  const parsedUnitPriceCents =
    parseBRLInputToCents(unitPriceInput) ?? currentCatalogPriceCents;

  const effectiveBatchCostCents = batchTypedCostCents ?? parsedUnitCostCents;
  const weightedAverageCostCents = useMemo(() => {
    if (!selectedProduct || movementType !== 'entry' || parsedQty <= 0) {
      return null;
    }
    if (
      currentStockQty <= 0 ||
      effectiveBatchCostCents === currentCatalogCostCents
    ) {
      return null;
    }
    return calculateWeightedAverageCostCents({
      currentStockQty,
      currentCostCents: currentCatalogCostCents,
      entryQuantity: parsedQty,
      entryCostCents: effectiveBatchCostCents,
    });
  }, [
    currentCatalogCostCents,
    currentStockQty,
    effectiveBatchCostCents,
    movementType,
    parsedQty,
    selectedProduct,
  ]);

  const batchTotalInvestmentCents = Math.round(
    parsedQty * Math.max(0, effectiveBatchCostCents),
  );
  const unitProfitCents = parsedUnitPriceCents - parsedUnitCostCents;
  const marginPercent =
    parsedUnitPriceCents > 0
      ? Math.round((unitProfitCents / parsedUnitPriceCents) * 100)
      : 0;

  async function handleSubmit(): Promise<void> {
    if (!workspaceId || isSubmitting) {
      return;
    }

    setFieldErrors({});

    const parsed = stockAdjustmentFormSchema.safeParse({
      productId: selectedProductId,
      movementType,
      quantityInput,
      reason,
      currentStockQty,
      unitCostInput: movementType === 'entry' ? unitCostInput : '',
      unitPriceInput: movementType === 'entry' ? unitPriceInput : '',
    });

    if (!parsed.success) {
      const nextErrors: {
        productId?: string;
        quantityInput?: string;
        reason?: string;
        unitCostInput?: string;
        unitPriceInput?: string;
      } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          (key === 'productId' ||
            key === 'quantityInput' ||
            key === 'reason' ||
            key === 'unitCostInput' ||
            key === 'unitPriceInput') &&
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
        unitCostCents: normalized.unitCostCents,
        unitPriceCents: normalized.unitPriceCents,
      });

      showToast({
        tone: 'success',
        title: 'Estoque atualizado!',
        message: `${selectedProduct?.name ?? 'Produto'}: ${movementMeta.label.toLowerCase()} de ${normalized.quantity} un. registrada.`,
      });

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/inventory');
      }
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'Erro ao movimentar estoque',
        message: mapInventoryServiceError(error),
      });
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
    <>
      <Screen>
        <AppHeader
          title="Movimentar estoque"
          subtitle="Entrada, ajuste ou perda auditável"
          showBack
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Produto</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setScannerModalOpen(true)}
            style={styles.barcodeScanActionBar}
          >
            <View style={styles.barcodeScanActionIconWrap}>
              <Ionicons
                name="barcode-outline"
                size={18}
                color={colors.primaryDark}
              />
            </View>
            <View style={styles.barcodeScanActionTextCol}>
              <Text style={styles.barcodeScanActionTitle}>
                Escanear código de barras
              </Text>
              <Text style={styles.barcodeScanActionSub}>
                Aponte a câmera para selecionar o produto da remessa
              </Text>
            </View>
            <Ionicons
              name="scan-outline"
              size={18}
              color={colors.primaryDark}
            />
          </Pressable>

        {selectedProduct ? (
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
              <Text style={styles.selectedProductPricingMeta}>
                Custo atual: {formatCentsToBRL(currentCatalogCostCents)} •
                Venda atual: {formatCentsToBRL(currentCatalogPriceCents)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setProductPickerOpen(true)}
              style={styles.changeProductButton}
            >
              <Text style={styles.changeProductText}>Trocar</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.emptyProductBox}>
            <Ionicons
              name="pricetag-outline"
              size={28}
              color={colors.primary}
            />
            <Text style={styles.emptyProductTitle}>
              Nenhum produto selecionado
            </Text>
            <Text style={styles.emptyProductSub}>
              Escolha um item do catálogo ou bipe o código de barras acima.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setProductPickerOpen(true)}
              style={styles.selectProductPillBtn}
            >
              <Ionicons name="search" size={15} color={colors.white} />
              <Text style={styles.selectProductPillBtnText}>
                Selecionar produto do catálogo
              </Text>
            </Pressable>
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

        {movementType === 'entry' && selectedProduct ? (
          <View style={styles.batchPricingCard}>
            <View style={styles.batchPricingHeader}>
              <Ionicons
                name="cash-outline"
                size={18}
                color={colors.primaryDark}
              />
              <View style={styles.batchPricingHeaderTextWrap}>
                <Text style={styles.batchPricingTitle}>
                  Valores desta remessa (Custo e Venda)
                </Text>
                <Text style={styles.batchPricingSubtitle}>
                  Atualiza o catálogo para as próximas vendas sem alterar o
                  histórico das vendas passadas.
                </Text>
              </View>
            </View>

            <View style={styles.batchPricingInputsRow}>
              <View style={styles.batchPricingInputCol}>
                <FormField
                  label="Custo pago / un. (R$)"
                  placeholder="0,00"
                  keyboardType="numeric"
                  value={unitCostInput}
                  onChangeText={(val) => {
                    const masked = maskBRLCurrencyInput(val);
                    setUnitCostInput(masked);
                    setBatchTypedCostCents(parseBRLInputToCents(masked));
                    setFieldErrors((prev) => ({
                      ...prev,
                      unitCostInput: undefined,
                    }));
                  }}
                  errorMessage={fieldErrors.unitCostInput}
                />
              </View>

              <View style={styles.batchPricingInputCol}>
                <FormField
                  label="Novo preço venda (R$)"
                  placeholder="0,00"
                  keyboardType="numeric"
                  value={unitPriceInput}
                  onChangeText={(val) => {
                    const masked = maskBRLCurrencyInput(val);
                    setUnitPriceInput(masked);
                    setFieldErrors((prev) => ({
                      ...prev,
                      unitPriceInput: undefined,
                    }));
                  }}
                  errorMessage={fieldErrors.unitPriceInput}
                />
              </View>
            </View>

            {weightedAverageCostCents !== null ? (
              parsedUnitCostCents !== weightedAverageCostCents ? (
                <View style={styles.weightedAvgBanner}>
                  <View style={styles.weightedAvgTextCol}>
                    <Text style={styles.weightedAvgTitle}>
                      💡 Sugestão de custo médio ponderado
                    </Text>
                    <Text style={styles.weightedAvgDescription}>
                      Estoque anterior: {currentStockQty} un. a{' '}
                      {formatCentsToBRL(currentCatalogCostCents)} + Novo lote:{' '}
                      {parsedQty} un. a{' '}
                      {formatCentsToBRL(effectiveBatchCostCents)} ={' '}
                      <Text style={styles.weightedAvgHighlight}>
                        {formatCentsToBRL(weightedAverageCostCents)}/un.
                      </Text>
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setUnitCostInput(
                        maskBRLCurrencyInput(String(weightedAverageCostCents)),
                      );
                      setFieldErrors((prev) => ({
                        ...prev,
                        unitCostInput: undefined,
                      }));
                    }}
                    style={styles.weightedAvgActionBtn}
                  >
                    <Ionicons
                      name="calculator-outline"
                      size={14}
                      color={colors.primaryDark}
                    />
                    <Text style={styles.weightedAvgActionText}>
                      Aplicar custo médio (
                      {formatCentsToBRL(weightedAverageCostCents)})
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.weightedAvgAppliedBanner}>
                  <Text style={styles.weightedAvgAppliedText}>
                    ✓ Custo médio ponderado (
                    {formatCentsToBRL(weightedAverageCostCents)}/un.) aplicado
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setUnitCostInput(
                        maskBRLCurrencyInput(String(effectiveBatchCostCents)),
                      );
                    }}
                  >
                    <Text style={styles.weightedAvgUndoText}>
                      Usar custo do lote (
                      {formatCentsToBRL(effectiveBatchCostCents)})
                    </Text>
                  </Pressable>
                </View>
              )
            ) : null}

            <View style={styles.batchMetricsRow}>
              <View style={styles.batchMetricItem}>
                <Text style={styles.batchMetricLabel}>
                  Total pago nesta compra
                </Text>
                <Text style={styles.batchMetricValue}>
                  {parsedQty > 0
                    ? formatCentsToBRL(batchTotalInvestmentCents)
                    : 'R$ 0,00'}
                </Text>
              </View>
              <View style={styles.batchMetricDivider} />
              <View style={styles.batchMetricItem}>
                <Text style={styles.batchMetricLabel}>
                  Lucro estimado / un.
                </Text>
                <Text
                  style={[
                    styles.batchMetricValue,
                    {
                      color:
                        unitProfitCents >= 0 ? colors.success : colors.error,
                    },
                  ]}
                >
                  {formatCentsToBRL(unitProfitCents)} ({marginPercent}%)
                </Text>
              </View>
            </View>
          </View>
        ) : null}

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

      <BarcodeScannerModal
        visible={scannerModalOpen}
        title="Selecionar produto por código"
        subtitle="Aponte a câmera para o código de barras do produto para selecioná-lo"
        onScanned={handleBarcodeScannedInAdjust}
        onClose={() => setScannerModalOpen(false)}
      />

      <ProductPickerModal
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        products={products}
        mode="single"
        selectedProductId={selectedProductId}
        onSelectProduct={(product) => {
          setSelectedProductId(product.id);
          setFieldErrors((prev) => ({
            ...prev,
            productId: undefined,
          }));
        }}
        onOpenScanner={() => setScannerModalOpen(true)}
      />
      </Screen>
      <ToastOverlay toast={toast} onDismiss={hideToast} />
    </>
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
  barcodeScanActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  barcodeScanActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  barcodeScanActionTextCol: {
    flex: 1,
    gap: 1,
  },
  barcodeScanActionTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  barcodeScanActionSub: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
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
  selectedProductPricingMeta: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  batchPricingCard: {
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  batchPricingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  batchPricingHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  batchPricingTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  batchPricingSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  batchPricingInputsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  batchPricingInputCol: {
    flex: 1,
  },
  weightedAvgBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.sm,
  },
  weightedAvgTextCol: {
    gap: 2,
  },
  weightedAvgTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  weightedAvgDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  weightedAvgHighlight: {
    fontWeight: '700',
    color: colors.primaryDark,
  },
  weightedAvgActionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  weightedAvgActionText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  weightedAvgAppliedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
    backgroundColor: colors.successSoft,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  weightedAvgAppliedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success,
  },
  weightedAvgUndoText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
    textDecorationLine: 'underline',
  },
  batchMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  batchMetricItem: {
    flex: 1,
    gap: 2,
  },
  batchMetricDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  batchMetricLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  batchMetricValue: {
    ...typography.bodyStrong,
    color: colors.text,
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
  emptyProductBox: {
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  emptyProductTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    marginTop: spacing.xs,
  },
  emptyProductSub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  selectProductPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  selectProductPillBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
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
  actionsColumn: {
    gap: spacing.sm,
  },
});
