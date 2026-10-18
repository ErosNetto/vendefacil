const PLACEHOLDER_URLS = new Set([
  '',
  'https://seu-projeto.supabase.co',
  'https://example.supabase.co',
]);

const PLACEHOLDER_KEYS = new Set([
  '',
  'sua-chave-anon-publica-aqui',
  'your-anon-key',
]);

/**
 * Normaliza a URL do Supabase removendo aspas acidentais, barras no final
 * ou sufixos como `/rest/v1` caso o usuário tenha copiado a URL do endpoint REST.
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/+(rest|auth|storage)\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

/**
 * Inspeciona um token JWT (caso a chave esteja em formato JWT) ou string de chave
 * para impedir que uma chave `service_role` seja usada acidentalmente no cliente mobile.
 */
export function isForbiddenServiceRoleKey(key: string): boolean {
  const trimmed = key.trim().replace(/^['"]+|['"]+$/g, '');
  if (!trimmed) {
    return false;
  }

  if (trimmed.toLowerCase().includes('service_role')) {
    return true;
  }

  const parts = trimmed.split('.');
  if (parts.length !== 3 || !parts[1]) {
    return false;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    if (typeof globalThis.atob === 'function') {
      const decoded = globalThis.atob(padded);
      return (
        decoded.includes('"role":"service_role"') ||
        decoded.includes('"role": "service_role"')
      );
    }
  } catch {
    return false;
  }

  return false;
}

export interface SupabaseEnvCheck {
  isConfigured: boolean;
  hasForbiddenKey: boolean;
  normalizedUrl: string;
  normalizedAnonKey: string;
  reason: string | null;
}

export function validateSupabaseEnv(url: string, anonKey: string): SupabaseEnvCheck {
  const cleanUrl = normalizeSupabaseUrl(url);
  const cleanKey = anonKey.trim().replace(/^['"]+|['"]+$/g, '');

  if (isForbiddenServiceRoleKey(cleanKey)) {
    return {
      isConfigured: false,
      hasForbiddenKey: true,
      normalizedUrl: cleanUrl,
      normalizedAnonKey: cleanKey,
      reason:
        'ERRO CRÍTICO DE SEGURANÇA: Uma chave service_role foi detectada em EXPO_PUBLIC_SUPABASE_ANON_KEY. Substitua imediatamente pela chave pública anon/publishable.',
    };
  }

  if (
    PLACEHOLDER_URLS.has(cleanUrl) ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleanUrl)
  ) {
    return {
      isConfigured: false,
      hasForbiddenKey: false,
      normalizedUrl: cleanUrl,
      normalizedAnonKey: cleanKey,
      reason:
        'A variável EXPO_PUBLIC_SUPABASE_URL ainda não foi configurada com a URL real do seu projeto Supabase.',
    };
  }

  if (PLACEHOLDER_KEYS.has(cleanKey) || cleanKey.length < 20) {
    return {
      isConfigured: false,
      hasForbiddenKey: false,
      normalizedUrl: cleanUrl,
      normalizedAnonKey: cleanKey,
      reason:
        'A variável EXPO_PUBLIC_SUPABASE_ANON_KEY ainda não foi configurada com a chave pública (anon/publishable) do seu projeto Supabase.',
    };
  }

  return {
    isConfigured: true,
    hasForbiddenKey: false,
    normalizedUrl: cleanUrl,
    normalizedAnonKey: cleanKey,
    reason: null,
  };
}
