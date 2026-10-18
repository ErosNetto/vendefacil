import { AppHeader, EmptyState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';

export default function CalendarTabScreen() {
  const { activeWorkspace } = useSession();

  return (
    <Screen>
      <AppHeader
        title="Agenda e Vencimentos"
        subtitle={activeWorkspace?.workspace.name ?? 'Espaço de trabalho'}
      />
      <EmptyState
        iconName="calendar-outline"
        title="Nenhum vencimento agendado"
        description="As parcelas com vencimento, cobranças do dia e recebimentos aparecerão no calendário assim que vendas parceladas forem registradas."
      />
    </Screen>
  );
}
