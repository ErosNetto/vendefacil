import { describe, expect, it } from 'vitest';

import {
  distributeCentsAcrossInstallments,
  formatCentsToBRL,
  formatDateBR,
  maskBRLCurrencyInput,
  maskDateBR,
  maskPhoneBR,
  parseBRLInputToCents,
} from '@/utils/formatters';

describe('formatCentsToBRL', () => {
  it('formata centavos inteiros em moeda BRL', () => {
    expect(formatCentsToBRL(0)).toMatch(/R\$\s*0,00/);
    expect(formatCentsToBRL(12990)).toMatch(/R\$\s*129,90/);
    expect(formatCentsToBRL(245000)).toMatch(/R\$\s*2\.450,00/);
  });

  it('trata valores não finitos retornando R$ 0,00', () => {
    expect(formatCentsToBRL(Number.NaN)).toMatch(/R\$\s*0,00/);
    expect(formatCentsToBRL(Number.POSITIVE_INFINITY)).toMatch(/R\$\s*0,00/);
  });
});

describe('parseBRLInputToCents', () => {
  it('converte entradas em formato brasileiro para centavos inteiros', () => {
    expect(parseBRLInputToCents('129,90')).toBe(12990);
    expect(parseBRLInputToCents('R$ 1.250,50')).toBe(125050);
    expect(parseBRLInputToCents('88,9')).toBe(8890);
    expect(parseBRLInputToCents('54')).toBe(5400);
  });

  it('retorna null para textos inválidos', () => {
    expect(parseBRLInputToCents('')).toBeNull();
    expect(parseBRLInputToCents('abc')).toBeNull();
    expect(parseBRLInputToCents('12,345')).toBeNull();
  });
});

describe('formatDateBR', () => {
  it('formata datas YYYY-MM-DD sem deslocar fuso horário', () => {
    expect(formatDateBR('2026-10-17')).toBe('17/10/2026');
    expect(formatDateBR('2026-01-05')).toBe('05/01/2026');
  });

  it('retorna marcador seguro para datas inválidas', () => {
    expect(formatDateBR('data-invalida')).toBe('--/--/----');
  });
});

describe('distributeCentsAcrossInstallments', () => {
  it('distribui centavos exatos sem perder nem criar centavos (ex.: R$ 100,00 em 3x)', () => {
    const parts = distributeCentsAcrossInstallments(10000, 3);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((acc, item) => acc + item, 0)).toBe(10000);
  });

  it('rejeita parâmetros inválidos', () => {
    expect(() => distributeCentsAcrossInstallments(-100, 2)).toThrow();
    expect(() => distributeCentsAcrossInstallments(1000, 0)).toThrow();
  });
});

describe('maskPhoneBR', () => {
  it('aplica máscara de celular e telefone fixo', () => {
    expect(maskPhoneBR('')).toBe('');
    expect(maskPhoneBR('11')).toBe('(11');
    expect(maskPhoneBR('119999')).toBe('(11) 9999');
    expect(maskPhoneBR('1199999')).toBe('(11) 9999-9');
    expect(maskPhoneBR('1133334444')).toBe('(11) 3333-4444');
    expect(maskPhoneBR('11988887777')).toBe('(11) 98888-7777');
  });
});

describe('maskDateBR', () => {
  it('aplica máscara de data DD/MM/YYYY progressivamente', () => {
    expect(maskDateBR('')).toBe('');
    expect(maskDateBR('18')).toBe('18');
    expect(maskDateBR('1810')).toBe('18/10');
    expect(maskDateBR('18102026')).toBe('18/10/2026');
  });
});

describe('maskBRLCurrencyInput', () => {
  it('formata valores de moeda conforme dígitos são digitados', () => {
    expect(maskBRLCurrencyInput('')).toBe('');
    expect(maskBRLCurrencyInput('0')).toBe('0,00');
    expect(maskBRLCurrencyInput('5')).toBe('0,05');
    expect(maskBRLCurrencyInput('50')).toBe('0,50');
    expect(maskBRLCurrencyInput('500')).toBe('5,00');
    expect(maskBRLCurrencyInput('150000')).toBe('1.500,00');
  });
});

