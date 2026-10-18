import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  FormField,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  getSignedProductImageUrl,
  pickAndOptimizeProductImage,
  type PreparedProductImage,
} from '@/features/products/imageService';
import {
  calculateProfitMarginPercent,
  productFormSchema,
  type ProductFormInput,
} from '@/features/products/schemas';
import {
  createWorkspaceCategory,
  mapProductServiceError,
} from '@/features/products/services';
import type { CategoryRow } from '@/types/database';
import { parseBRLInputToCents } from '@/utils/formatters';

export interface ProductFormSubmitPayload {
  values: ProductFormInput;
  preparedImage: PreparedProductImage | null;
  removeExistingImage: boolean;
}

export interface ProductFormProps {
  workspaceId: string;
  categories: CategoryRow[];
  onCategoryCreated: (category: CategoryRow) => void;
  initialValues?: Partial<ProductFormInput>;
  existingImagePath?: string | null;
  submitLabel: string;
  onSubmit: (payload: ProductFormSubmitPayload) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({
  workspaceId,
  categories,
  onCategoryCreated,
  initialValues,
  existingImagePath = null,
  submitLabel,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [categoryId, setCategoryId] = useState<string>(
    initialValues?.categoryId ?? '',
  );
  const [brand, setBrand] = useState(initialValues?.brand ?? '');
  const [priceInput, setPriceInput] = useState(initialValues?.priceInput ?? '');
  const [costInput, setCostInput] = useState(initialValues?.costInput ?? '');
  const [minStockInput, setMinStockInput] = useState(
    initialValues?.minStockInput ?? '0',
  );
  const [sku, setSku] = useState(initialValues?.sku ?? '');
  const [barcode, setBarcode] = useState(initialValues?.barcode ?? '');
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );

  const [existingSignedUrl, setExistingSignedUrl] = useState<string | null>(
    null,
  );
  const [preparedImage, setPreparedImage] =
    useState<PreparedProductImage | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);

  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    priceInput?: string;
    costInput?: string;
    minStockInput?: string;
    brand?: string;
    sku?: string;
    barcode?: string;
    description?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!existingImagePath || removeExistingImage) {
      setExistingSignedUrl(null);
      return;
    }

    getSignedProductImageUrl(existingImagePath)
      .then((url) => {
        if (isMounted) {
          setExistingSignedUrl(url);
        }
      })
      .catch(() => {
        if (isMounted) {
          setExistingSignedUrl(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [existingImagePath, removeExistingImage]);

  const marginPercent = useMemo(() => {
    const priceCents = parseBRLInputToCents(priceInput);
    const costCents = parseBRLInputToCents(costInput) ?? 0;
    if (priceCents === null || priceCents <= 0) {
      return null;
    }
    return calculateProfitMarginPercent(priceCents, costCents);
  }, [costInput, priceInput]);

  async function handlePickImage(source: 'camera' | 'library'): Promise<void> {
    if (isPickingImage || isSubmitting) {
      return;
    }
    setSubmitError(null);
    setIsPickingImage(true);
    try {
      const picked = await pickAndOptimizeProductImage(source);
      if (picked) {
        setPreparedImage(picked);
        setRemoveExistingImage(false);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível selecionar ou otimizar a imagem.';
      setSubmitError(message);
    } finally {
      setIsPickingImage(false);
    }
  }

  function handleClearImage(): void {
    setPreparedImage(null);
    if (existingImagePath) {
      setRemoveExistingImage(true);
    }
  }

  async function handleCreateCategory(): Promise<void> {
    if (isCreatingCategory) {
      return;
    }
    setNewCategoryError(null);

    const trimmed = newCategoryName.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      setNewCategoryError('Informe um nome entre 2 e 60 caracteres.');
      return;
    }

    setIsCreatingCategory(true);
    try {
      const created = await createWorkspaceCategory(workspaceId, trimmed);
      onCategoryCreated(created);
      setCategoryId(created.id);
      setNewCategoryName('');
      setNewCategoryModalOpen(false);
    } catch (error) {
      setNewCategoryError(mapProductServiceError(error));
    } finally {
      setIsCreatingCategory(false);
    }
  }

  async function handleFormSubmit(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});
    setSubmitError(null);

    const candidate: ProductFormInput = {
      name,
      categoryId: categoryId || undefined,
      brand,
      sku,
      barcode,
      costInput,
      priceInput,
      minStockInput,
      description,
    };

    const parsed = productFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: issues.name?.[0],
        priceInput: issues.priceInput?.[0],
        costInput: issues.costInput?.[0],
        minStockInput: issues.minStockInput?.[0],
        brand: issues.brand?.[0],
        sku: issues.sku?.[0],
        barcode: issues.barcode?.[0],
        description: issues.description?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        values: candidate,
        preparedImage,
        removeExistingImage,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o produto.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const activePreviewUri = preparedImage?.localUri ?? existingSignedUrl;

  return (
    <View style={styles.card}>
      {submitError ? (
        <View style={styles.errorAlert} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorAlertText}>{submitError}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Foto do produto (Bucket Privado)</Text>
      <View style={styles.imagePickerCard}>
        <View style={styles.imagePreviewBox}>
          {activePreviewUri ? (
            <Image
              source={{ uri: activePreviewUri }}
              style={styles.imagePreview}
              contentFit="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="camera-outline" size={32} color={colors.primary} />
              <Text style={styles.imagePlaceholderText}>Sem foto</Text>
            </View>
          )}
        </View>

        <View style={styles.imageButtonsCol}>
          <SecondaryButton
            label="Câmera"
            iconName="camera-outline"
            loading={isPickingImage}
            disabled={isSubmitting}
            onPress={() => {
              void handlePickImage('camera');
            }}
          />
          <SecondaryButton
            label="Galeria"
            iconName="images-outline"
            loading={isPickingImage}
            disabled={isSubmitting}
            onPress={() => {
              void handlePickImage('library');
            }}
          />
          {activePreviewUri ? (
            <Pressable
              onPress={handleClearImage}
              accessibilityRole="button"
              accessibilityLabel="Remover foto selecionada"
              style={styles.removeImageBtn}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.removeImageText}>Remover foto</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FormField
        label="Nome do produto *"
        placeholder="Ex.: Egeo Dolce Desodorante Colônia 90ml"
        leftIcon="pricetag-outline"
        value={name}
        onChangeText={setName}
        errorMessage={fieldErrors.name}
        editable={!isSubmitting}
      />

      <View style={styles.categorySection}>
        <View style={styles.categoryHeaderRow}>
          <Text style={styles.sectionLabel}>Categoria</Text>
          <Pressable
            onPress={() => {
              setNewCategoryError(null);
              setNewCategoryModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Criar nova categoria"
            style={styles.newCategoryLink}
          >
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={styles.newCategoryLinkText}>Nova categoria</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryChipsRow}
        >
          <Pressable
            onPress={() => setCategoryId('')}
            accessibilityRole="button"
            accessibilityState={{ selected: categoryId === '' }}
            style={[
              styles.categoryChip,
              categoryId === ''
                ? styles.categoryChipSelected
                : styles.categoryChipUnselected,
            ]}
          >
            <Text
              style={[
                styles.categoryChipText,
                categoryId === ''
                  ? styles.categoryChipTextSelected
                  : styles.categoryChipTextUnselected,
              ]}
            >
              Sem categoria
            </Text>
          </Pressable>

          {categories.map((cat) => {
            const isSelected = categoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setCategoryId(cat.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.categoryChip,
                  isSelected
                    ? styles.categoryChipSelected
                    : styles.categoryChipUnselected,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected
                      ? styles.categoryChipTextSelected
                      : styles.categoryChipTextUnselected,
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FormField
        label="Marca (opcional)"
        placeholder="Ex.: O Boticário, Natura, Eudora..."
        leftIcon="ribbon-outline"
        value={brand}
        onChangeText={setBrand}
        errorMessage={fieldErrors.brand}
        editable={!isSubmitting}
      />

      <FormField
        label="Preço de venda (R$) *"
        placeholder="Ex.: 129,90"
        keyboardType="decimal-pad"
        leftIcon="cash-outline"
        value={priceInput}
        onChangeText={setPriceInput}
        errorMessage={fieldErrors.priceInput}
        helperText="Salvo em centavos exatos no banco."
        editable={!isSubmitting}
      />

      <FormField
        label="Custo unitário de compra (R$) (opcional)"
        placeholder="Ex.: 70,00"
        keyboardType="decimal-pad"
        leftIcon="wallet-outline"
        value={costInput}
        onChangeText={setCostInput}
        errorMessage={fieldErrors.costInput}
        editable={!isSubmitting}
      />

      {marginPercent !== null ? (
        <View style={styles.marginRow}>
          <StatusBadge
            label={`Margem bruta estimada: ${String(marginPercent).replace('.', ',')}%`}
            tone={marginPercent >= 0 ? 'success' : 'warning'}
          />
        </View>
      ) : null}

      <FormField
        label="Alerta de estoque mínimo (opcional)"
        placeholder="Ex.: 2"
        keyboardType="numeric"
        leftIcon="alert-circle-outline"
        value={minStockInput}
        onChangeText={setMinStockInput}
        errorMessage={fieldErrors.minStockInput}
        helperText="Você receberá alerta quando o saldo ficar menor ou igual a este valor."
        editable={!isSubmitting}
      />

      <FormField
        label="Código / SKU (opcional)"
        placeholder="Ex.: 123456"
        autoCapitalize="characters"
        leftIcon="apps-outline"
        value={sku}
        onChangeText={setSku}
        errorMessage={fieldErrors.sku}
        editable={!isSubmitting}
      />

      <FormField
        label="Código de barras / EAN (opcional)"
        placeholder="Ex.: 7891024123456"
        keyboardType="numeric"
        leftIcon="barcode-outline"
        value={barcode}
        onChangeText={setBarcode}
        errorMessage={fieldErrors.barcode}
        editable={!isSubmitting}
      />

      <FormField
        label="Descrição / Notas (opcional)"
        placeholder="Volume, fragrância, detalhes do kit..."
        leftIcon="document-text-outline"
        multiline
        numberOfLines={3}
        value={description}
        onChangeText={setDescription}
        errorMessage={fieldErrors.description}
        editable={!isSubmitting}
        style={styles.multilineInput}
      />

      <View style={styles.actionsColumn}>
        <PrimaryButton
          label={submitLabel}
          onPress={() => {
            void handleFormSubmit();
          }}
          loading={isSubmitting}
          iconName="checkmark-circle-outline"
        />

        <SecondaryButton
          label="Cancelar"
          onPress={onCancel}
          disabled={isSubmitting}
        />
      </View>

      <Modal
        visible={newCategoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNewCategoryModalOpen(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nova categoria</Text>
            <FormField
              label="Nome da categoria"
              placeholder="Ex.: Perfumes, Cremes, Maquiagem..."
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              errorMessage={newCategoryError}
              editable={!isCreatingCategory}
            />
            <View style={styles.actionsColumn}>
              <PrimaryButton
                label="Criar categoria"
                loading={isCreatingCategory}
                onPress={() => {
                  void handleCreateCategory();
                }}
              />
              <SecondaryButton
                label="Cancelar"
                disabled={isCreatingCategory}
                onPress={() => setNewCategoryModalOpen(false)}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorSoft,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.control,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorAlertText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
  sectionLabel: {
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  imagePickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  imagePreviewBox: {
    width: 104,
    height: 104,
    borderRadius: radius.controlLg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  imagePlaceholderText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  imageButtonsCol: {
    flex: 1,
    gap: spacing.sm,
  },
  removeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  removeImageText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
  },
  categorySection: {
    marginBottom: spacing.lg,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  newCategoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newCategoryLinkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  categoryScroll: {
    flexGrow: 0,
  },
  categoryChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryChip: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  categoryChipText: {
    ...typography.caption,
    fontWeight: '600',
  },
  categoryChipTextSelected: {
    color: colors.white,
  },
  categoryChipTextUnselected: {
    color: colors.textSecondary,
  },
  marginRow: {
    marginBottom: spacing.lg,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  actionsColumn: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 33, 29, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
  },
  modalTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
});
