import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
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
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    if (!isNavigationReady || isLoadingSession || isLoadingWorkspaces) {
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
    isNavigationReady,
    router,
    segments,
    session,
  ]);

  const showLoadingOverlay =
    !isNavigationReady || isLoadingSession || (Boolean(session) && isLoadingWorkspaces);

  return (
    <View style={styles.rootContainer}>
      {children}
      {showLoadingOverlay ? (
        <View style={styles.splashOverlay}>
          <LoadingState message="Verificando sua sessão segura..." />
        </View>
      ) : null}
    </View>
  );
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
            <Stack.Screen name="customers/index" />
            <Stack.Screen name="customers/new" />
            <Stack.Screen name="customers/[id]/index" />
            <Stack.Screen name="customers/[id]/edit" />
            <Stack.Screen name="products/index" />
            <Stack.Screen name="settings" />
          </Stack>
        </NavigationGuard>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  splashOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
    zIndex: 10,
  },
});
