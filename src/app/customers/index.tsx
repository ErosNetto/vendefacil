import { EmptyState, Screen } from '@/components/ui';

export default function CustomersScreen() {
  return (
    <Screen>
      <EmptyState
        iconName="people-outline"
        title="Sua carteira de clientes está vazia"
        description="O módulo completo de Clientes (cadastro, busca, filtro, arquivamento e histórico financeiro) será implementado na Fase 2 do plano."
      />
    </Screen>
  );
}
