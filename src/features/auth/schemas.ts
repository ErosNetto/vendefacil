import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe seu e-mail.')
    .email('Informe um endereço de e-mail válido.')
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(6, 'A senha deve ter pelo menos 6 caracteres.')
    .max(128, 'A senha é longa demais.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Informe seu nome completo (mínimo de 2 caracteres).')
      .max(120, 'O nome deve ter no máximo 120 caracteres.'),
    email: z
      .string()
      .trim()
      .min(1, 'Informe seu e-mail.')
      .email('Informe um endereço de e-mail válido.')
      .transform((val) => val.toLowerCase()),
    password: z
      .string()
      .min(8, 'Crie uma senha com pelo menos 8 caracteres.')
      .max(128, 'A senha deve ter no máximo 128 caracteres.'),
    confirmPassword: z.string().min(1, 'Confirme sua senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas informadas não coincidem.',
    path: ['confirmPassword'],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Traduz erros do Supabase Auth para mensagens amigáveis em português brasileiro,
 * sem expor detalhes internos ou dados sensíveis nos logs.
 */
export function mapAuthErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Ocorreu um erro inesperado ao comunicar com o servidor. Tente novamente.';
  }

  const rawMessage =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';

  if (rawMessage.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos. Verifique os dados informados.';
  }
  if (rawMessage.includes('email not confirmed')) {
    return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.';
  }
  if (rawMessage.includes('user already registered')) {
    return 'Já existe uma conta cadastrada com este e-mail.';
  }
  if (rawMessage.includes('password should be at least')) {
    return 'A senha informada não atende aos requisitos mínimos de segurança.';
  }
  if (rawMessage.includes('rate limit') || rawMessage.includes('too many requests')) {
    return 'Muitas tentativas em sequência. Aguarde alguns instantes antes de tentar novamente.';
  }
  if (rawMessage.includes('network') || rawMessage.includes('fetch')) {
    return 'Sem conexão com o servidor. Verifique sua internet e a configuração do Supabase.';
  }

  return 'Não foi possível concluir a autenticação. Verifique seus dados e tente novamente.';
}
