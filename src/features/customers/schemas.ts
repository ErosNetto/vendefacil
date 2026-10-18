import { z } from 'zod';

import type { CustomerRow } from '@/types/database';

export type CustomerStatusFilter = 'active' | 'archived' | 'all';

/**
 * Formata números de telefone brasileiros (10 ou 11 dígitos) no padrão
 * `(DD) 99999-9999` ou `(DD) 9999-9999`. Caso não seja um número BR padrão,
 * preserva o texto limpo.
 */
export function formatPhoneBR(raw: string | null | undefined): string {
  if (!raw) {
    return '';
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length > 0 && digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length > 2 && digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length > 6 && digits.length < 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

export const customerFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Informe o nome do cliente (mínimo de 2 caracteres).')
    .max(120, 'O nome deve ter no máximo 120 caracteres.'),
  phone: z
    .string()
    .trim()
    .max(30, 'O telefone deve ter no máximo 30 caracteres.')
    .refine(
      (val) => {
        if (!val) return true;
        const digits = val.replace(/\D/g, '');
        return digits.length >= 8 && digits.length <= 15;
      },
      { message: 'Informe um telefone válido com DDD (ex.: (11) 98765-4321).' },
    )
    .transform((val) => (val ? formatPhoneBR(val) : null)),
  email: z
    .string()
    .trim()
    .max(160, 'O e-mail deve ter no máximo 160 caracteres.')
    .refine(
      (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      { message: 'Informe um endereço de e-mail válido ou deixe em branco.' },
    )
    .transform((val) => (val ? val.toLowerCase() : null)),
  address: z
    .string()
    .trim()
    .max(300, 'O endereço deve ter no máximo 300 caracteres.')
    .transform((val) => (val ? val : null)),
  notes: z
    .string()
    .trim()
    .max(1000, 'As observações devem ter no máximo 1000 caracteres.')
    .transform((val) => (val ? val : null)),
});

export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormValidated = z.output<typeof customerFormSchema>;

/**
 * Extrai até 2 iniciais maiúsculas do nome do cliente (ex.: "Ana Souza" -> "AS").
 */
export function getCustomerInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'CL';
  }
  if (parts.length === 1) {
    return (parts[0] ?? 'CL').slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0] ?? 'C';
  const last = parts[parts.length - 1]?.[0] ?? 'L';
  return `${first}${last}`.toUpperCase();
}

/**
 * Filtra clientes por status (ativos, arquivados ou todos) e termo de busca
 * (nome, telefone ou e-mail, ignorando acentos e maiúsculas/minúsculas).
 */
function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterCustomers(
  customers: readonly CustomerRow[],
  searchQuery: string,
  statusFilter: CustomerStatusFilter,
): CustomerRow[] {
  const normalizedQuery = normalizeSearchText(searchQuery);
  const queryDigits = searchQuery.replace(/\D/g, '');

  return customers.filter((customer) => {
    if (statusFilter === 'active' && customer.is_archived) {
      return false;
    }
    if (statusFilter === 'archived' && !customer.is_archived) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const nameMatch = normalizeSearchText(customer.full_name).includes(
      normalizedQuery,
    );
    const emailMatch = customer.email
      ? normalizeSearchText(customer.email).includes(normalizedQuery)
      : false;
    const phoneTextMatch = customer.phone
      ? normalizeSearchText(customer.phone).includes(normalizedQuery)
      : false;
    const phoneDigitsMatch =
      queryDigits.length >= 2 && customer.phone
        ? customer.phone.replace(/\D/g, '').includes(queryDigits)
        : false;

    return nameMatch || emailMatch || phoneTextMatch || phoneDigitsMatch;
  });
}
