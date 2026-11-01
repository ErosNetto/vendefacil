import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PrimaryButton } from '@/components/ui/Buttons';
import { SearchField } from '@/components/ui/SearchAndFilters';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { ProductRow } from '@/types/database';
import { formatCentsToBRL } from '@/utils/formatters';

export interface CartItemLike {
  productId: string;
  quantity: number;
}

export interface ProductPickerModalProps {
  visible: boolean;
  onClose: () => void;
  products: ProductRow[];
  mode?: 'cart' | 'single';
  // Props do modo Carrinho
  cartItems?: CartItemLike[];
  onAddOrIncrementCart?: (product: ProductRow) => void;
  onDecrementCart?: (productId: string) => void;
  // Props do modo Seleção Única
  selectedProductId?: string | null;
  onSelectProduct?: (product: ProductRow) => void;
  // Ação opcional para disparar a câmera de código de barras
  onOpenScanner?: () => void;
  title?: string;
}

export function ProductPickerModal({
  visible,
  onClose,
  products,
  mode = 'cart',
  cartItems = [],
  onAddOrIncrementCart,
  onDecrementCart,
  selectedProductId,
  onSelectProduct,
  onOpenScanner,
  title,
}: ProductPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const cartMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cartItems) {
      map.set(item.productId, item.quantity);
    }
    return map;
  }, [cartItems]);

  const totalCartUnits = useMemo(() => {
    return cartItems.reduce((acc, curr) => acc + curr.quantity, 0);
  }, [cartItems]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return products;
    }
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)),
    );
  }, [products, searchQuery]);

  const modalTitle =
    title ?? (mode === 'cart' ? 'Adicionar produtos' : 'Selecionar produto');

  const modalSubtitle =
    mode === 'cart'
      ? `${totalCartUnits} un. no carrinho • ${filteredProducts.length} itens encontrados`
      : `${filteredProducts.length} produtos disponíveis`;

  function handleSelectSingle(product: ProductRow): void {
    if (onSelectProduct) {
      onSelectProduct(product);
    }
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel="Fechar modal"
        />

        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerTitleCol}>
              <Text style={styles.sheetTitle}>{modalTitle}</Text>
              <Text style={styles.sheetSubtitle}>{modalSubtitle}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Barra de Busca + Ação de Scanner */}
          <View style={styles.searchBarRow}>
            <View style={styles.searchWrap}>
              <SearchField
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar por nome, marca, SKU ou código..."
                accessibilityLabel="Buscar produto no modal"
              />
            </View>

            {onOpenScanner ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Escanear código de barras"
                onPress={() => {
                  onClose();
                  onOpenScanner();
                }}
                style={styles.scannerIconBtn}
              >
                <Ionicons
                  name="barcode-outline"
                  size={20}
                  color={colors.primaryDark}
                />
              </Pressable>
            ) : null}
          </View>

          {/* Lista de Produtos */}
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const stockQty = Number(item.current_stock_qty ?? 0);
              const inCartQty = cartMap.get(item.id) ?? 0;
              const isSelected = item.id === selectedProductId;

              if (mode === 'single') {
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Selecionar ${item.name}`}
                    onPress={() => handleSelectSingle(item)}
                    style={[
                      styles.productCard,
                      isSelected ? styles.productCardSelected : null,
                    ]}
                  >
                    <View style={styles.productIconCircle}>
                      <Ionicons
                        name="pricetag-outline"
                        size={20}
                        color={colors.primary}
                      />
                    </View>

                    <View style={styles.productInfoCol}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.productMeta} numberOfLines={1}>
                        {formatCentsToBRL(item.price_cents)} • Saldo: {stockQty} un.
                        {item.sku ? ` • SKU: ${item.sku}` : ''}
                      </Text>
                    </View>

                    {isSelected ? (
                      <View style={styles.checkBadge}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.white}
                        />
                      </View>
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textSecondary}
                      />
                    )}
                  </Pressable>
                );
              }

              // Mode: Cart (Multi-seleção com Stepper inline)
              return (
                <View
                  style={[
                    styles.productCard,
                    inCartQty > 0 ? styles.productCardInCart : null,
                  ]}
                >
                  <View style={styles.productIconCircle}>
                    <Ionicons
                      name="pricetag-outline"
                      size={20}
                      color={colors.primary}
                    />
                  </View>

                  <View style={styles.productInfoCol}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.productPriceText}>
                      {formatCentsToBRL(item.price_cents)}
                    </Text>
                    <View style={styles.badgesRow}>
                      <StatusBadge
                        label={`Estoque: ${stockQty} un.`}
                        tone={stockQty <= 0 ? 'error' : 'neutral'}
                      />
                      {item.sku ? (
                        <Text style={styles.skuText} numberOfLines={1}>
                          SKU: {item.sku}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Ação direita: Stepper se já estiver no carrinho, ou botão Adicionar */}
                  <View style={styles.cartActionsWrap}>
                    {inCartQty > 0 ? (
                      <View style={styles.stepperBox}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Diminuir quantidade de ${item.name}`}
                          onPress={() => onDecrementCart?.(item.id)}
                          style={styles.stepperBtn}
                        >
                          <Ionicons
                            name={inCartQty <= 1 ? 'trash-outline' : 'remove'}
                            size={16}
                            color={inCartQty <= 1 ? colors.error : colors.text}
                          />
                        </Pressable>

                        <Text style={styles.stepperQtyText}>{inCartQty}</Text>

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Aumentar quantidade de ${item.name}`}
                          onPress={() => onAddOrIncrementCart?.(item)}
                          style={styles.stepperBtn}
                        >
                          <Ionicons
                            name="add"
                            size={16}
                            color={colors.primary}
                          />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Adicionar ${item.name} ao carrinho`}
                        onPress={() => onAddOrIncrementCart?.(item)}
                        style={styles.addButton}
                      >
                        <Ionicons
                          name="add"
                          size={16}
                          color={colors.primaryDark}
                        />
                        <Text style={styles.addButtonText}>Adicionar</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="pricetag-outline"
                  size={36}
                  color={colors.textSecondary}
                />
                <Text style={styles.emptyTitle}>Nenhum produto encontrado</Text>
                <Text style={styles.emptySub}>
                  Verifique o nome, SKU ou código de barras pesquisado.
                </Text>
              </View>
            }
          />

          {/* Rodapé no Modo Carrinho: Concluir e ver resumo */}
          {mode === 'cart' ? (
            <View style={styles.sheetFooter}>
              <PrimaryButton
                label={
                  totalCartUnits > 0
                    ? `Concluir (${totalCartUnits} un. no carrinho)`
                    : 'Concluir'
                }
                iconName="checkmark"
                onPress={onClose}
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '88%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitleCol: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    ...typography.section,
    color: colors.text,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
  },
  scannerIconBtn: {
    minHeight: 48,
    width: 48,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  productCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  productCardInCart: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  productIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.card,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfoCol: {
    flex: 1,
    gap: 2,
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  productPriceText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  productMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  skuText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  cartActionsWrap: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: spacing.xs,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQtyText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primaryDark,
    minWidth: 20,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  addButtonText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
  },
  emptySub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheetFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
});
