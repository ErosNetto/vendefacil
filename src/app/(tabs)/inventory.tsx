import { useRouter } from 'expo-router';

import { AppHeader, EmptyState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';

export default function InventoryTabScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();

  return (
    <Screen>
      <AppHeader
        title="Estoque"
        subtitle={activeWorkspace?.workspace.name ?? 'Espaço de trabalho'}
      />
      <EmptyState
        iconName="cube-outline"
        title="Sem movimentações de estoque"
        description="O controle de entradas, saídas, ajustes, alertas de estoque mínimo e histórico auditável será habilitado na Fase 4, integrado ao catálogo de produtos."
        actionLabel="Abrir catálogo de produtos"
        onActionPress={() => router.push('/products')}
      />
    </Screen>
  );
}
