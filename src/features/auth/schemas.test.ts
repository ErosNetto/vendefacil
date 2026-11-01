import { describe, expect, it } from 'vitest';

import {
  forgotPasswordSchema,
  loginSchema,
  mapAuthErrorMessage,
  resetPasswordSchema,
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

describe('forgotPasswordSchema & resetPasswordSchema', () => {
  it('valida e normaliza e-mail no esqueci minha senha', () => {
    const valid = forgotPasswordSchema.safeParse({
      email: '  Usuario@Loja.Com  ',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe('usuario@loja.com');
    }

    const invalid = forgotPasswordSchema.safeParse({ email: 'sem-arroba' });
    expect(invalid.success).toBe(false);
  });

  it('exige senha com no mínimo 8 caracteres e confirmação idêntica', () => {
    const short = resetPasswordSchema.safeParse({
      password: '12345',
      confirmPassword: '12345',
    });
    expect(short.success).toBe(false);

    const mismatch = resetPasswordSchema.safeParse({
      password: 'minhaNovaSenha123',
      confirmPassword: 'outraSenhaDiferente',
    });
    expect(mismatch.success).toBe(false);

    const valid = resetPasswordSchema.safeParse({
      password: 'minhaNovaSenha123',
      confirmPassword: 'minhaNovaSenha123',
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
    expect(
      mapAuthErrorMessage(new Error('Token has expired or is invalid')),
    ).toContain('link de recuperação expirou');
  });
});
