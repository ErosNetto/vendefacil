import { describe, expect, it } from 'vitest';

import {
  customerFormSchema,
  filterCustomers,
  formatPhoneBR,
  getCustomerInitials,
} from '@/features/customers/schemas';
import type { CustomerRow } from '@/types/database';

const SAMPLE_CUSTOMERS: CustomerRow[] = [
  {
    id: 'c1',
    workspace_id: 'w1',
    full_name: 'Ana Souza',
    phone: '(11) 98765-4321',
    email: 'ana@exemplo.com.br',
    address: 'Rua das Flores, 100',
    notes: 'Prefere entregas à tarde',
    is_archived: false,
    archived_at: null,
    created_by: 'u1',
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
  },
  {
    id: 'c2',
    workspace_id: 'w1',
    full_name: 'Beatriz Lima',
    phone: '(21) 99888-7766',
    email: null,
    address: null,
    notes: null,
    is_archived: true,
    archived_at: '2026-10-18T11:00:00Z',
    created_by: 'u1',
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T11:00:00Z',
  },
];

describe('customerFormSchema', () => {
  it('valida cliente apenas com nome obrigatório e converte opcionais vazios em null', () => {
    const parsed = customerFormSchema.safeParse({
      fullName: '  Carlos Mendes  ',
      phone: '',
      email: '',
      address: '',
      notes: '',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fullName).toBe('Carlos Mendes');
      expect(parsed.data.phone).toBeNull();
      expect(parsed.data.email).toBeNull();
      expect(parsed.data.address).toBeNull();
      expect(parsed.data.notes).toBeNull();
    }
  });

  it('formata telefone brasileiro com 11 dígitos e normaliza e-mail para minúsculas', () => {
    const parsed = customerFormSchema.safeParse({
      fullName: 'Fernanda Costa',
      phone: '11987654321',
      email: 'Fernanda.Costa@Email.COM',
      address: 'Av. Paulista, 1000',
      notes: 'Cliente VIP',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe('(11) 98765-4321');
      expect(parsed.data.email).toBe('fernanda.costa@email.com');
    }
  });

  it('rejeita nome curto, telefone inválido ou e-mail malformado', () => {
    const invalid = customerFormSchema.safeParse({
      fullName: 'A',
      phone: '123',
      email: 'email-invalido',
      address: '',
      notes: '',
    });

    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const errors = invalid.error.flatten().fieldErrors;
      expect(errors.fullName?.length).toBeGreaterThan(0);
      expect(errors.phone?.length).toBeGreaterThan(0);
      expect(errors.email?.length).toBeGreaterThan(0);
    }
  });
});

describe('formatPhoneBR & getCustomerInitials', () => {
  it('formata telefones de 10 e 11 dígitos', () => {
    expect(formatPhoneBR('11987654321')).toBe('(11) 98765-4321');
    expect(formatPhoneBR('1134567890')).toBe('(11) 3456-7890');
  });

  it('extrai iniciais do nome corretamente', () => {
    expect(getCustomerInitials('Ana Souza')).toBe('AS');
    expect(getCustomerInitials('Maria')).toBe('MA');
  });
});

describe('filterCustomers', () => {
  it('filtra por status (active, archived, all) e busca por nome ou dígitos do telefone', () => {
    const activeOnly = filterCustomers(SAMPLE_CUSTOMERS, '', 'active');
    expect(activeOnly.map((c) => c.id)).toEqual(['c1']);

    const archivedOnly = filterCustomers(SAMPLE_CUSTOMERS, '', 'archived');
    expect(archivedOnly.map((c) => c.id)).toEqual(['c2']);

    const byPhoneDigits = filterCustomers(SAMPLE_CUSTOMERS, '99888', 'all');
    expect(byPhoneDigits.map((c) => c.id)).toEqual(['c2']);
  });
});
