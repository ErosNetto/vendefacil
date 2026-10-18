import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  MoneyText,
  PrimaryButton,
  Screen,
  SearchField,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { getCustomerInitials } from '@/features/customers/schemas';
import { listWorkspaceCustomers } from '@/features/customers/services';
import { listWorkspaceProducts } from '@/features/products/services';
import {
  addOrIncrementCartItem,
  calculateCartTotals,
  createSaleIdempotencyKey,
  parseDiscountBRLInput,
  type SaleCartItem,
  updateCartItemQuantity,
  validateSaleSubmission,
} from '@/features/sales/schemas';
import {
  createOrConfirmWorkspaceSale,
  getWorkspaceSaleDetail,
  mapSaleServiceError,
  updateWorkspaceDraftSale,
} from '@/features/sales/services';
import type { CustomerRow, ProductRow } from '@/types/database';
import { formatCentsToBRL } from '@/utils/formatters';

export default function NewSaleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    customerId?: string;
    productId?: string;
    draftSaleId?: string;
  }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;
  const isEditingDraft = Boolean(params.draftSaleId);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    params.customerId ?? null,
  );
  const [isPickingCustomer, setIsPickingCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const [cart, setCart] = useState<SaleCartItem[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(
    !params.productId && !params.draftSaleId,
  );
  const [productSearch, setProductSearch] = useState('');

  const [discountInput, setDiscountInput] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const idempotencyKeyRef = useRef<string>(createSaleIdempotencyKey());
  const draftHydratedRef = useRef<boolean>(false);

  const loadInitialData = useCallback(async () => {
    if (!workspaceId) {
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    setLoadError(null);
    try {
      const [allProducts, allCustomers, draftDetail] = await Promise.all([
        listWorkspaceProducts(workspaceId),
        listWorkspaceCustomers(workspaceId),
        params.draftSaleId
          ? getWorkspaceSaleDetail(workspaceId, params.draftSaleId)
          : Promise.resolve(null),
      ]);

      const activeProducts = allProducts.filter((item) => !item.is_archived);
      const activeCustomers = allCustomers.filter((item) => !item.is_archived);

      setProducts(activeProducts);
      setCustomers(activeCustomers);

      if (params.draftSaleId) {
        if (!draftDetail) {
          setLoadError('Rascunho não encontrado neste espaço de trabalho.');
          return;
        }
        if (draftDetail.sale.status !== 'draft') {
          setLoadError('Apenas vendas em rascunho podem ser editadas.');
          return;
        }

        if (!draftHydratedRef.current) {
          draftHydratedRef.current = true;
          setSelectedCustomerId(draftDetail.sale.customer_id);
          setDiscountInput(
            draftDetail.sale.discount_cents > 0
              ? (draftDetail.sale.discount_cents / 100)
                  .toFixed(2)
                  .replace('.', ',')
              : '',
          );
          setNotes(draftDetail.sale.notes ?? '');

          const hydratedCart: SaleCartItem[] = draftDetail.items.map((item) => {
            const catalogProduct = activeProducts.find(
              (p) => p.id === item.product_id,
            );
            return {
              productId: item.product_id,
              productName: catalogProduct?.name ?? item.product_name_snapshot,
              sku: catalogProduct?.sku ?? item.sku_snapshot,
              primaryImagePath: catalogProduct?.primary_image_path ?? null,
              unitPriceCents:
                catalogProduct?.price_cents ?? item.unit_price_cents,
              unitCostCents: catalogProduct?.cost_cents ?? item.unit_cost_cents,
              availableStockQty: Number(
                catalogProduct?.current_stock_qty ?? 0,
              ),
              quantity: Number(item.quantity),
            };
          });

          setCart(hydratedCart);
          setIsAddingProduct(false);
        }
        return;
      }

      if (params.customerId) {
        const foundCustomer = activeCustomers.find(
          (c) => c.id === params.customerId,
        );
        if (foundCustomer) {
          setSelectedCustomerId(foundCustomer.id);
        }
      }

      if (params.productId) {
        const foundProduct = activeProducts.find(
          (p) => p.id === params.productId,
        );
        if (foundProduct) {
          setCart((prev) =>
            prev.length === 0
              ? addOrIncrementCartItem([], foundProduct, 1)
              : prev,
          );
          setIsAddingProduct(false);
        }
      }
    } catch (error) {
      setLoadError(mapSaleServiceError(error));
    } finally {
      setIsLoadingData(false);
    }
  }, [params.customerId, params.draftSaleId, params.productId, workspaceId]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Regenera chave de idempotência quando a intenção de venda muda
  useEffect(() => {
    idempotencyKeyRef.current = createSaleIdempotencyKey();
  }, [cart, selectedCustomerId, discountInput, notes]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) {
      return customers.slice(0, 10);
    }
    return customers
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  }, [customerSearch, customers]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) {
      return products.slice(0, 12);
    }
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [productSearch, products]);

  const discountCents = parseDiscountBRLInput(discountInput) ?? 0;
  const totals = useMemo(
    () => calculateCartTotals(cart, discountCents),
    [cart, discountCents],
  );

  async function handleSubmit(confirmImmediately: boolean): Promise<void> {
    if (!workspaceId || isSubmitting) {
      return;
    }

    setSubmitError(null);

    const validation = validateSaleSubmission({
      items: cart,
      discountInput,
      notes,
      confirmImmediately,
    });

    if (!validation.success || !validation.payload) {
      setSubmitError(
        validation.errorMessage ?? 'Revise os dados da venda antes de salvar.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = params.draftSaleId
        ? await updateWorkspaceDraftSale({
            workspaceId,
            saleId: params.draftSaleId,
            customerId: selectedCustomerId,
            items: validation.payload.items,
            discountCents: validation.payload.discountCents,
            notes: validation.payload.notes,
            confirmImmediately: validation.payload.confirmImmediately,
          })
        : await createOrConfirmWorkspaceSale({
            workspaceId,
            customerId: selectedCustomerId,
            items: validation.payload.items,
            discountCents: validation.payload.discountCents,
            notes: validation.payload.notes,
            confirmImmediately: validation.payload.confirmImmediately,
            idempotencyKey: idempotencyKeyRef.current,
          });

      router.replace(`/sales/${result.sale_id}`);
    } catch (error) {
      setSubmitError(mapSaleServiceError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingData) {
    return (
      <Screen>
        <LoadingState
          message={
            isEditingDraft
              ? 'Carregando rascunho da venda...'
              : 'Preparando ponto de venda...'
          }
        />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <AppHeader
          title={isEditingDraft ? 'Editar rascunho' : 'Nova venda'}
          showBack
        />
        <ErrorState
          title="Erro ao carregar venda"
          message={loadError}
          onRetry={() => {
            void loadInitialData();
          }}
        />
      </Screen>
    );
  }

  if (products.length === 0) {
    return (
      <Screen>
        <AppHeader
          title={isEditingDraft ? 'Editar rascunho' : 'Nova venda'}
          showBack
        />
        <EmptyState
          iconName="pricetag-outline"
          title="Nenhum produto ativo no catálogo"
          description="Cadastre pelo menos um produto ativo antes de iniciar uma venda."
          actionLabel="Cadastrar produto"
          onActionPress={() => router.replace('/products/new')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader
        title={isEditingDraft ? 'Editar rascunho' : 'Nova venda'}
        subtitle={
          isEditingDraft
            ? 'Altere cliente, itens ou desconto antes de confirmar'
            : 'Carrinho multi-itens com baixa de estoque'
        }
        showBack
      />

      {/* 1. Cliente (Opcional — RF-040) */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>1. Cliente (opcional)</Text>
          {selectedCustomer && !isPickingCustomer ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedCustomerId(null)}
            >
              <Text style={styles.linkActionText}>Remover vínculo</Text>
            </Pressable>
          ) : null}
        </View>

        {selectedCustomer && !isPickingCustomer ? (
          <View style={styles.selectedCustomerBox}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerAvatarText}>
                {getCustomerInitials(selectedCustomer.full_name)}
              </Text>
            </View>
            <View style={styles.customerInfoCol}>
              <Text style={styles.customerNameText} numberOfLines={1}>
                {selectedCustomer.full_name}
              </Text>
              <Text style={styles.customerPhoneText}>
                {selectedCustomer.phone ?? 'Sem telefone cadastrado'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsPickingCustomer(true)}
              style={styles.pillButton}
            >
              <Text style={styles.pillButtonText}>Trocar</Text>
            </Pressable>
          </View>
        ) : !isPickingCustomer ? (
          <View style={styles.walkInBox}>
            <View style={styles.walkInInfo}>
              <Ionicons
                name="person-outline"
                size={20}
                color={colors.primaryDark}
              />
              <Text style={styles.walkInText}>
                Venda avulsa (Balcão — sem cliente vinculado)
              </Text>
            </View>
            {customers.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsPickingCustomer(true)}
                style={styles.pillButton}
              >
                <Text style={styles.pillButtonText}>Vincular cliente</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.pickerBox}>
            <SearchField
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Buscar cliente por nome ou telefone..."
            />
            <View style={styles.optionList}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedCustomerId(null);
                  setIsPickingCustomer(false);
                }}
                style={styles.optionItem}
              >
                <Text style={styles.optionItemTitle}>
                  Venda avulsa (sem cliente)
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
              {filteredCustomers.map((cust) => (
                <Pressable
                  key={cust.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedCustomerId(cust.id);
                    setIsPickingCustomer(false);
                  }}
                  style={styles.optionItem}
                >
                  <View style={styles.optionTextCol}>
                    <Text style={styles.optionItemTitle} numberOfLines={1}>
                      {cust.full_name}
                    </Text>
                    {cust.phone ? (
                      <Text style={styles.optionItemSub}>{cust.phone}</Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color={colors.primary}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 2. Itens do Carrinho (RF-040 / RF-041) */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            2. Produtos ({cart.length})
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsAddingProduct((prev) => !prev)}
            style={styles.pillButton}
          >
            <Text style={styles.pillButtonText}>
              {isAddingProduct ? 'Fechar catálogo' : '+ Adicionar produto'}
            </Text>
          </Pressable>
        </View>

        {cart.length > 0 ? (
          <View style={styles.cartList}>
            {cart.map((item) => {
              const lineTotalCents = Math.round(
                item.quantity * item.unitPriceCents,
              );
              const isOverflow = item.quantity > item.availableStockQty;

              return (
                <View
                  key={item.productId}
                  style={[
                    styles.cartItemCard,
                    isOverflow ? styles.cartItemOverflow : null,
                  ]}
                >
                  <View style={styles.cartItemTop}>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.productName}
                      </Text>
                      <Text style={styles.cartItemMeta}>
                        {formatCentsToBRL(item.unitPriceCents)} / un. • Disp.:{' '}
                        {item.availableStockQty} un.
                      </Text>
                    </View>
                    <MoneyText
                      cents={lineTotalCents}
                      size="sm"
                      tone="primary"
                    />
                  </View>

                  <View style={styles.cartItemControlsRow}>
                    {isOverflow ? (
                      <StatusBadge
                        label={`Acima do estoque (${item.availableStockQty} disp.)`}
                        tone="error"
                      />
                    ) : (
                      <Text style={styles.cartItemSubText}>
                        Subtotal do item
                      </Text>
                    )}

                    <View style={styles.stepperRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Diminuir quantidade"
                        onPress={() =>
                          setCart((prev) =>
                            updateCartItemQuantity(
                              prev,
                              item.productId,
                              item.quantity - 1,
                            ),
                          )
                        }
                        style={styles.stepperButton}
                      >
                        <Ionicons
                          name={
                            item.quantity <= 1 ? 'trash-outline' : 'remove'
                          }
                          size={18}
                          color={
                            item.quantity <= 1 ? colors.error : colors.text
                          }
                        />
                      </Pressable>

                      <Text style={styles.stepperQtyText}>
                        {item.quantity}
                      </Text>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Aumentar quantidade"
                        onPress={() =>
                          setCart((prev) =>
                            updateCartItemQuantity(
                              prev,
                              item.productId,
                              item.quantity + 1,
                            ),
                          )
                        }
                        style={styles.stepperButton}
                      >
                        <Ionicons name="add" size={18} color={colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCartNotice}>
            <Ionicons
              name="cart-outline"
              size={22}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyCartText}>
              Toque nos produtos abaixo para adicioná-los ao carrinho.
            </Text>
          </View>
        )}

        {isAddingProduct ? (
          <View style={styles.catalogPickerWrap}>
            <SearchField
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Buscar produto para adicionar..."
            />
            <View style={styles.optionList}>
              {filteredProducts.map((product) => {
                const inCart = cart.find((c) => c.productId === product.id);
                const stockQty = Number(product.current_stock_qty ?? 0);

                return (
                  <Pressable
                    key={product.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setCart((prev) =>
                        addOrIncrementCartItem(prev, product, 1),
                      );
                      setSubmitError(null);
                    }}
                    style={[
                      styles.optionItem,
                      inCart ? styles.optionItemSelected : null,
                    ]}
                  >
                    <View style={styles.optionTextCol}>
                      <Text style={styles.optionItemTitle} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={styles.optionItemSub}>
                        {formatCentsToBRL(product.price_cents)} • Estoque:{' '}
                        {stockQty} un.
                      </Text>
                    </View>

                    <View style={styles.addProductRight}>
                      {inCart ? (
                        <StatusBadge
                          label={`No carrinho: ${inCart.quantity}`}
                          tone="success"
                        />
                      ) : null}
                      <Ionicons
                        name="add-circle"
                        size={24}
                        color={colors.primary}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>

      {/* 3. Desconto, Observação e Fechamento (RF-042 / RF-043) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>3. Resumo e fechamento</Text>

        <FormField
          label="Desconto em R$ (opcional)"
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={discountInput}
          onChangeText={(val) => {
            setDiscountInput(val);
            setSubmitError(null);
          }}
        />

        <FormField
          label="Observação da venda (opcional)"
          placeholder="Ex.: Entrega combinada para sexta-feira"
          value={notes}
          onChangeText={(val) => {
            setNotes(val);
            setSubmitError(null);
          }}
        />

        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Subtotal ({totals.totalUnits} un.)
            </Text>
            <Text style={styles.summaryValue}>
              {formatCentsToBRL(totals.subtotalCents)}
            </Text>
          </View>

          {totals.discountCents > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Desconto</Text>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                - {formatCentsToBRL(totals.discountCents)}
              </Text>
            </View>
          ) : null}

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>Total da venda</Text>
            <MoneyText cents={totals.totalCents} size="lg" tone="primary" />
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryCaption}>Lucro estimado na venda</Text>
            <Text style={styles.summaryProfitText}>
              {formatCentsToBRL(totals.estimatedProfitCents)}
            </Text>
          </View>
        </View>

        {submitError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        <View style={styles.actionsColumn}>
          <PrimaryButton
            label="Finalizar e confirmar venda"
            iconName="checkmark-circle-outline"
            loading={isSubmitting}
            onPress={() => {
              void handleSubmit(true);
            }}
          />
          <SecondaryButton
            label={
              isEditingDraft
                ? 'Salvar alterações no rascunho'
                : 'Salvar como rascunho'
            }
            iconName="document-text-outline"
            disabled={isSubmitting}
            onPress={() => {
              void handleSubmit(false);
            }}
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  linkActionText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.error,
  },
  selectedCustomerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.md,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  customerInfoCol: {
    flex: 1,
    gap: 2,
  },
  customerNameText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  customerPhoneText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  walkInBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  walkInInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  walkInText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  pillButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pillButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  pickerBox: {
    gap: spacing.xs,
  },
  optionList: {
    gap: spacing.xs,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  optionItemSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  optionTextCol: {
    flex: 1,
    gap: 2,
  },
  optionItemTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  optionItemSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  addProductRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cartList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cartItemCard: {
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cartItemOverflow: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  cartItemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cartItemInfo: {
    flex: 1,
    gap: 2,
  },
  cartItemName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  cartItemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cartItemControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cartItemSubText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQtyText: {
    ...typography.bodyStrong,
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  emptyCartNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.control,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  emptyCartText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  catalogPickerWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  summaryBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  summaryTotalLabel: {
    ...typography.section,
    color: colors.text,
  },
  summaryCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryProfitText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
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
