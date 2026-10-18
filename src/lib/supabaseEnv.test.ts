import { describe, expect, it } from 'vitest';

import {
  isForbiddenServiceRoleKey,
  validateSupabaseEnv,
} from '@/lib/supabaseEnv';

describe('isForbiddenServiceRoleKey & validateSupabaseEnv', () => {
  it('bloqueia chaves com role service_role explícita ou em payload JWT', () => {
    const fakeHeader = globalThis.btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const fakeServicePayload = globalThis.btoa(
      JSON.stringify({ role: 'service_role', iss: 'supabase' }),
    );
    const fakeServiceJwt = `${fakeHeader}.${fakeServicePayload}.assinatura`;

    expect(isForbiddenServiceRoleKey(fakeServiceJwt)).toBe(true);

    const check = validateSupabaseEnv(
      'https://abcxyz.supabase.co',
      fakeServiceJwt,
    );
    expect(check.isConfigured).toBe(false);
    expect(check.hasForbiddenKey).toBe(true);
  });

  it('aceita URL válida e chave pública anon/publishable válida', () => {
    const fakeHeader = globalThis.btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const fakeAnonPayload = globalThis.btoa(
      JSON.stringify({ role: 'anon', iss: 'supabase' }),
    );
    const fakeAnonJwt = `${fakeHeader}.${fakeAnonPayload}.assinatura`;

    const check = validateSupabaseEnv('https://abcxyz.supabase.co', fakeAnonJwt);
    expect(check.isConfigured).toBe(true);
    expect(check.hasForbiddenKey).toBe(false);
    expect(check.reason).toBeNull();
  });

  it('identifica quando placeholders de .env.example ainda estão ativos', () => {
    const check = validateSupabaseEnv(
      'https://seu-projeto.supabase.co',
      'sua-chave-anon-publica-aqui',
    );
    expect(check.isConfigured).toBe(false);
    expect(check.hasForbiddenKey).toBe(false);
  });
});
