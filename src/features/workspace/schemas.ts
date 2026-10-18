import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome do negócio deve ter pelo menos 2 caracteres.')
    .max(80, 'O nome do negócio deve ter no máximo 80 caracteres.'),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export function getRoleLabelPtBR(role: 'owner' | 'admin' | 'seller'): string {
  switch (role) {
    case 'owner':
      return 'Proprietário(a)';
    case 'admin':
      return 'Administrador(a)';
    case 'seller':
      return 'Vendedor(a)';
  }
}
