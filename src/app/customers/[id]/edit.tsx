import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import {
  AppHeader,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import { CustomerForm } from '@/features/customers/CustomerForm';
import type { CustomerFormInput } from '@/features/customers/schemas';
import {
  getWorkspaceCustomerById,
  mapCustomerServiceError,
  updateWorkspaceCustomer,
} from '@/features/customers/services';
import type { CustomerRow } from '@/types/database';

export default function EditCustomerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCustomer = useCallback(async () => {
    if (!workspaceId || !id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const record = await getWorkspaceCustomerById(workspaceId, id);
      if (!record) {
        setErrorMessage('Cliente não encontrado neste espaço de trabalho.');
      } else {
        setCustomer(record);
      }
    } catch (error) {
      setErrorMessage(mapCustomerServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [id, workspaceId]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  async function handleUpdate(values: CustomerFormInput): Promise<void> {
    if (!workspaceId || !customer) {
      return;
    }

    try {
      await updateWorkspaceCustomer(workspaceId, customer.id, values);
      router.back();
    } catch (error) {
      throw new Error(mapCustomerServiceError(error), { cause: error });
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Carregando dados para edição..." />
      </Screen>
    );
  }

  if (errorMessage || !customer) {
    return (
      <Screen>
        <ErrorState
          title="Erro ao carregar cliente"
          message={errorMessage ?? 'Cliente não localizado.'}
          onRetry={() => {
            void loadCustomer();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding>
      <AppHeader
        title="Editar cliente"
        subtitle={customer.full_name}
        showBack
      />
      <CustomerForm
        initialValues={{
          fullName: customer.full_name,
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          address: customer.address ?? '',
          notes: customer.notes ?? '',
        }}
        submitLabel="Salvar alterações"
        onSubmit={handleUpdate}
        onCancel={() => router.back()}
      />
    </Screen>
  );
}
