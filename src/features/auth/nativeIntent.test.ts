import { describe, expect, it } from 'vitest';

import { redirectSystemPath } from '@/app/+native-intent';

describe('redirectSystemPath', () => {
  it('normaliza URLs com múltiplos slashes e converte hash em query parameters', async () => {
    const input = '///reset-password#access_token=token123&refresh_token=refresh456&type=recovery';
    const output = await redirectSystemPath({ path: input, initial: false });

    expect(output).toBe('/reset-password?access_token=token123&refresh_token=refresh456&type=recovery');
  });

  it('remove prefixo de esquema vendefacil:// se presente', async () => {
    const input = 'vendefacil:///reset-password#access_token=abc';
    const output = await redirectSystemPath({ path: input, initial: false });

    expect(output).toBe('/reset-password?access_token=abc');
  });

  it('mantém rotas normais sem hash inalteradas', async () => {
    const input = '/customers/123';
    const output = await redirectSystemPath({ path: input, initial: false });

    expect(output).toBe('/customers/123');
  });
});
