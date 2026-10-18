import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/ui';
import { colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/features/auth/SessionProvider';

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const {
    session,
    activeWorkspace,
    isLoadingSession,
    isLoadingWorkspaces,
  } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoadingSession || isLoadingWorkspaces) {
      return;
    }

    const firstSegment = segments[0];
    const inAuthGroup = firstSegment === '(auth)';
    const inOnboardingGroup = firstSegment === '(onboarding)';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (!activeWorkspace) {
      if (!inOnboardingGroup) {
        router.replace('/(onboarding)/create-workspace');
      }
      return;
    }

    if (inAuthGroup || inOnboardingGroup || !firstSegment) {
      router.replace('/(tabs)');
    }
  }, [
    activeWorkspace,
    isLoadingSession,
    isLoadingWorkspaces,
    router,
    segments,
    session,
  ]);

  if (isLoadingSession || (session && isLoadingWorkspaces)) {
    return (
      <View style={styles.splashContainer}>
        <LoadingState message="Verificando sua sessão segura..." />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <NavigationGuard>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="customers/index"
              options={{
                headerShown: true,
                title: 'Clientes',
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
              }}
            />
            <Stack.Screen
              name="products/index"
              options={{
                headerShown: true,
                title: 'Catálogo de Produtos',
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                headerShown: true,
                title: 'Configurações e Conta',
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
              }}
            />
          </Stack>
        </NavigationGuard>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
