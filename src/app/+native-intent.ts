/**
 * Garante que a resolução da URL inicial de deep linking no Android (Expo Router + React 19 Fabric)
 * ocorra após o commit da montagem inicial do NavigationContainer, evitando o aviso:
 * "Can't perform a React state update on a component that hasn't mounted yet".
 *
 * Também normaliza URLs com múltiplos slashes (ex: vendefacil:///reset-password)
 * e converte o fragmento hash (#access_token=...) em query parameters (?access_token=...)
 * para que o Expo Router consiga casar com a rota /reset-password e repassar os tokens.
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

  // Remove qualquer prefixo de esquema se presente (ex: vendefacil://)
  let clean = path.replace(/^[a-zA-Z0-9_-]+:\/+/i, '/');

  // Normaliza múltiplos slashes no início (ex: ///reset-password -> /reset-password)
  clean = clean.replace(/^\/+/, '/');

  // Converte hash fragment (#access_token=...) em search params (?access_token=...)
  if (clean.includes('#')) {
    const hashIndex = clean.indexOf('#');
    const route = clean.slice(0, hashIndex);
    const hashParams = clean.slice(hashIndex + 1);
    const separator = route.includes('?') ? '&' : '?';
    clean = `${route}${separator}${hashParams}`;
  }

  return clean;
}
