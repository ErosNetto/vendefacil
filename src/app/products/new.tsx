import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import {
  AppHeader,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import { uploadProductImageToPrivateBucket } from '@/features/products/imageService';
import {
  ProductForm,
  type ProductFormSubmitPayload,
} from '@/features/products/ProductForm';
import {
  createWorkspaceProduct,
  listWorkspaceCategories,
  mapProductServiceError,
} from '@/features/products/services';
import type { CategoryRow } from '@/types/database';

export default function NewProductScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const loadCategories = useCallback(async () => {
    if (!workspaceId) {
      setIsLoadingCategories(false);
      return;
    }
    try {
      const rows = await listWorkspaceCategories(workspaceId);
      setCategories(rows);
    } catch {
      // Caso categorias falhem por migração pendente, o submit do form exibirá o erro claro
    } finally {
      setIsLoadingCategories(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  if (!workspaceId) {
    return (
      <Screen>
        <ErrorState
          title="Espaço de trabalho não selecionado"
          message="Selecione um espaço de trabalho antes de cadastrar produtos."
        />
      </Screen>
    );
  }

  async function handleCreateProduct({
    values,
    preparedImage,
  }: ProductFormSubmitPayload): Promise<void> {
    if (!workspaceId) {
      return;
    }

    try {
      const created = await createWorkspaceProduct(workspaceId, values);
      if (preparedImage) {
        await uploadProductImageToPrivateBucket(
          workspaceId,
          created.id,
          preparedImage,
          null,
        );
      }
      router.replace(`/products/${created.id}`);
    } catch (error) {
      throw new Error(mapProductServiceError(error), { cause: error });
    }
  }

  return (
    <Screen keyboardAvoiding>
      <AppHeader
        title="Novo produto"
        subtitle="Cadastre preço, custo, categoria e foto privada."
        showBack
      />
      {isLoadingCategories ? (
        <LoadingState message="Preparando formulário..." />
      ) : (
        <ProductForm
          workspaceId={workspaceId}
          categories={categories}
          onCategoryCreated={(cat) =>
            setCategories((prev) =>
              [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
          submitLabel="Salvar produto"
          onSubmit={handleCreateProduct}
          onCancel={() => router.back()}
        />
      )}
    </Screen>
  );
}
