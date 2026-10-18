import { Redirect } from 'expo-router';

import { LoadingState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';

export default function IndexScreen() {
  const { session, activeWorkspace, isLoadingSession, isLoadingWorkspaces } =
    useSession();

  if (isLoadingSession || isLoadingWorkspaces) {
    return (
      <Screen scroll={false}>
        <LoadingState message="Iniciando o VendeFácil..." />
      </Screen>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!activeWorkspace) {
    return <Redirect href="/(onboarding)/create-workspace" />;
  }

  return <Redirect href="/(tabs)" />;
}
