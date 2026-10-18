import { useRouter } from 'expo-router';

import { AppHeader, ErrorState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import { CustomerForm } from '@/features/customers/CustomerForm';
import type { CustomerFormInput } from '@/features/customers/schemas';
import {
  createWorkspaceCustomer,
  mapCustomerServiceError,
} from '@/features/customers/services';

export default function NewCustomerScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  if (!workspaceId) {
    return (
      <Screen>
        <ErrorState
          title="Espaço de trabalho não selecionado"
          message="Selecione ou crie um espaço de trabalho antes de cadastrar clientes."
        />
      </Screen>
    );
  }

  async function handleCreate(values: CustomerFormInput): Promise<void> {
    if (!workspaceId) {
      return;
    }
    try {
      const created = await createWorkspaceCustomer(workspaceId, values);
      router.replace(`/customers/${created.id}`);
    } catch (error) {
      throw new Error(mapCustomerServiceError(error), { cause: error });
    }
  }

  return (
    <Screen keyboardAvoiding>
      <AppHeader
        title="Novo cliente"
        subtitle="Preencha os dados para acompanhar vendas e parcelas."
        showBack
      />
      <CustomerForm
        submitLabel="Salvar cliente"
        onSubmit={handleCreate}
        onCancel={() => router.back()}
      />
    </Screen>
  );
}
