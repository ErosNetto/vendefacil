import { describe, expect, it } from 'vitest';

import {
  loginSchema,
  mapAuthErrorMessage,
  signUpSchema,
} from '@/features/auth/schemas';
import {
  createWorkspaceSchema,
  getRoleLabelPtBR,
} from '@/features/workspace/schemas';

describe('loginSchema', () => {
  it('valida e normaliza e-mail para minúsculas', () => {
    const parsed = loginSchema.safeParse({
      email: '  Maria.Vendas@Exemplo.com.BR ',
      password: 'senhaSegura123',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('maria.vendas@exemplo.com.br');
    }
  });

  it('rejeita e-mail inválido ou senha curta', () => {
    const parsed = loginSchema.safeParse({
      email: 'email-invalido',
      password: '123',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('exige confirmação de senha idêntica', () => {
    const mismatch = signUpSchema.safeParse({
      fullName: 'Maria Oliveira',
      email: 'maria@exemplo.com.br',
      password: 'senhaForte123',
      confirmPassword: 'outraSenha123',
    });
    expect(mismatch.success).toBe(false);

    const valid = signUpSchema.safeParse({
      fullName: 'Maria Oliveira',
      email: 'maria@exemplo.com.br',
      password: 'senhaForte123',
      confirmPassword: 'senhaForte123',
    });
    expect(valid.success).toBe(true);
  });
});

describe('createWorkspaceSchema & getRoleLabelPtBR', () => {
  it('valida nome do workspace entre 2 e 80 caracteres', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(
      createWorkspaceSchema.safeParse({ name: '  Studio Maria Cosméticos  ' })
        .success,
    ).toBe(true);
  });

  it('retorna rótulos de papel em português brasileiro', () => {
    expect(getRoleLabelPtBR('owner')).toBe('Proprietário(a)');
    expect(getRoleLabelPtBR('admin')).toBe('Administrador(a)');
    expect(getRoleLabelPtBR('seller')).toBe('Vendedor(a)');
  });
});

describe('mapAuthErrorMessage', () => {
  it('traduz mensagens do Supabase Auth para português', () => {
    expect(
      mapAuthErrorMessage(new Error('Invalid login credentials')),
    ).toContain('E-mail ou senha incorretos');
    expect(
      mapAuthErrorMessage(new Error('User already registered')),
    ).toContain('Já existe uma conta cadastrada');
  });
});
