/**
 * No Android com React 19 (Fabric), o useLinking.native.js do expo-router
 * chama setLastUnhandledLink dentro de url.then() durante a renderização inicial
 * antes da montagem do NavigationContainer quando getInitialURL retorna uma string.
 * Como o roteamento inicial do VendeFácil é controlado pelo NavigationGuard
 * (sessão + workspace em src/app/_layout.tsx), retornar null no cold start
 * (initial = true) evita a chamada prematura de setLastUnhandledLink na linha 127
 * de useLinking.native.js e deixa o useThenable resolver dentro do useEffect.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  if (initial) {
    return null;
  }
  return path;
}
