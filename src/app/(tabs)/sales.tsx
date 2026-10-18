import { useRouter } from 'expo-router';

import { AppHeader, EmptyState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';

export default function SalesTabScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();

  return (
    <Screen>
      <AppHeader
        title="Vendas"
        subtitle={activeWorkspace?.workspace.name ?? 'Espaço de trabalho'}
      />
      <EmptyState
        iconName="cart-outline"
        title="Nenhuma venda registrada"
        description="O fluxo de vendas com múltiplos itens, snapshots de preço/custo e baixa transacional de estoque será disponibilizado na Fase 5, após o cadastro de clientes, catálogo e estoque."
        actionLabel="Ver clientes"
        onActionPress={() => router.push('/customers')}
      />
    </Screen>
  );
}
