/**
 * Garante que a resolução da URL inicial de deep linking no Android (Expo Router + React 19 Fabric)
 * ocorra após o commit da montagem inicial do NavigationContainer, evitando o aviso:
 * "Can't perform a React state update on a component that hasn't mounted yet".
 */
export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  if (initial) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  return path;
}
