import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import {
  AppHeader,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import {
  removeProductPrimaryImage,
  uploadProductImageToPrivateBucket,
} from '@/features/products/imageService';
import {
  ProductForm,
  type ProductFormSubmitPayload,
} from '@/features/products/ProductForm';
import {
  getWorkspaceProductById,
  listWorkspaceCategories,
  mapProductServiceError,
  updateWorkspaceProduct,
} from '@/features/products/services';
import type { CategoryRow, ProductRow } from '@/types/database';

function centsToInputString(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export default function EditProductScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!workspaceId || !id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [productRecord, categoryRows] = await Promise.all([
        getWorkspaceProductById(workspaceId, id),
        listWorkspaceCategories(workspaceId),
      ]);

      if (!productRecord) {
        setErrorMessage('Produto não encontrado neste espaço de trabalho.');
      } else {
        setProduct(productRecord);
        setCategories(categoryRows);
      }
    } catch (error) {
      setErrorMessage(mapProductServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [id, workspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleUpdateProduct({
    values,
    preparedImage,
    removeExistingImage,
  }: ProductFormSubmitPayload): Promise<void> {
    if (!workspaceId || !product) {
      return;
    }

    try {
      await updateWorkspaceProduct(workspaceId, product.id, values);

      if (preparedImage) {
        await uploadProductImageToPrivateBucket(
          workspaceId,
          product.id,
          preparedImage,
          product.primary_image_path,
        );
      } else if (removeExistingImage && product.primary_image_path) {
        await removeProductPrimaryImage(
          workspaceId,
          product.id,
          product.primary_image_path,
        );
      }

      router.back();
    } catch (error) {
      throw new Error(mapProductServiceError(error), { cause: error });
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Carregando dados do produto..." />
      </Screen>
    );
  }

  if (errorMessage || !product || !workspaceId) {
    return (
      <Screen>
        <AppHeader title="Editar produto" showBack />
        <ErrorState
          title="Erro ao carregar produto"
          message={errorMessage ?? 'Produto não localizado.'}
          onRetry={() => {
            void loadData();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding>
      <AppHeader
        title="Editar produto"
        subtitle={product.name}
        showBack
      />
      <ProductForm
        workspaceId={workspaceId}
        categories={categories}
        onCategoryCreated={(cat) =>
          setCategories((prev) =>
            [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
        initialValues={{
          name: product.name,
          categoryId: product.category_id ?? '',
          brand: product.brand ?? '',
          sku: product.sku ?? '',
          barcode: product.barcode ?? '',
          costInput: centsToInputString(product.cost_cents),
          priceInput: centsToInputString(product.price_cents),
          minStockInput: String(product.min_stock_qty ?? 0),
          description: product.description ?? '',
        }}
        existingImagePath={product.primary_image_path}
        submitLabel="Salvar alterações"
        onSubmit={handleUpdateProduct}
        onCancel={() => router.back()}
      />
    </Screen>
  );
}
