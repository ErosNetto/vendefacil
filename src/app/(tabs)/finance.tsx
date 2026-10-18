import { AppHeader, EmptyState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';

export default function FinanceTabScreen() {
  const { activeWorkspace } = useSession();

  return (
    <Screen>
      <AppHeader
        title="Financeiro"
        subtitle={activeWorkspace?.workspace.name ?? 'Espaço de trabalho'}
      />
      <EmptyState
        iconName="wallet-outline"
        title="Nenhuma movimentação financeira"
        description="Contas a receber, pagamentos parciais, alocações de parcelas, despesas e relatórios serão exibidos aqui nas Fases 6 e 8."
      />
    </Screen>
  );
}
