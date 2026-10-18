import { describe, expect, it } from 'vitest';

import {
  base64ToUint8Array,
  buildProductImageStoragePath,
  calculateProfitMarginPercent,
  categoryFormSchema,
  filterProducts,
  productFormSchema,
  validateProductImageCandidate,
} from '@/features/products/schemas';
import type { ProductRow } from '@/types/database';

const SAMPLE_PRODUCTS: ProductRow[] = [
  {
    id: '00000000-0000-4000-8000-000000000010',
    workspace_id: '00000000-0000-4000-8000-000000000001',
    category_id: 'cat-perfumes',
    name: 'Egeo Dolce',
    brand: 'O Boticário',
    sku: '123456',
    barcode: '7891024123456',
    cost_cents: 7000,
    price_cents: 12990,
    min_stock_qty: 2,
    current_stock_qty: 15,
    description: 'Perfume feminino 90ml',
    primary_image_path: null,
    is_archived: false,
    archived_at: null,
    created_by: 'u1',
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    workspace_id: '00000000-0000-4000-8000-000000000001',
    category_id: 'cat-cremes',
    name: 'Natura Tododia Hidratante',
    brand: 'Natura',
    sku: 'NAT-400',
    barcode: null,
    cost_cents: 3200,
    price_cents: 5490,
    min_stock_qty: 3,
    current_stock_qty: 8,
    description: null,
    primary_image_path: null,
    is_archived: true,
    archived_at: '2026-10-18T11:00:00Z',
    created_by: 'u1',
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T11:00:00Z',
  },
];

describe('categoryFormSchema & productFormSchema', () => {
  it('valida categoria e converte preços/custos BRL para centavos inteiros', () => {
    expect(categoryFormSchema.safeParse({ name: '  Perfumes  ' }).success).toBe(
      true,
    );

    const parsed = productFormSchema.safeParse({
      name: '  Egeo Dolce 90ml  ',
      categoryId: 'cat-perfumes',
      brand: 'O Boticário',
      sku: '123456',
      barcode: '',
      costInput: '70,00',
      priceInput: '129,90',
      minStockInput: '2',
      description: 'Colônia desodorante',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Egeo Dolce 90ml');
      expect(parsed.data.costInput).toBe(7000);
      expect(parsed.data.priceInput).toBe(12990);
      expect(parsed.data.minStockInput).toBe(2);
      expect(parsed.data.barcode).toBeNull();
    }
  });

  it('rejeita produto sem preço ou com nome inválido', () => {
    const invalid = productFormSchema.safeParse({
      name: 'A',
      brand: '',
      sku: '',
      barcode: '',
      costInput: '-10',
      priceInput: '',
      minStockInput: '-1',
      description: '',
    });
    expect(invalid.success).toBe(false);
  });
});

describe('calculateProfitMarginPercent', () => {
  it('calcula margem bruta percentual com precisão', () => {
    expect(calculateProfitMarginPercent(10000, 6000)).toBe(40);
    expect(calculateProfitMarginPercent(12990, 7000)).toBe(46.1);
    expect(calculateProfitMarginPercent(0, 5000)).toBeNull();
  });
});

describe('base64ToUint8Array, buildProductImageStoragePath & validateProductImageCandidate', () => {
  it('decodifica string base64 para bytes binários exatos (JPEG header FF D8 FF E0)', () => {
    const jpegHeaderBase64 = '/9j/4AAQ'; // [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]
    const bytes = base64ToUint8Array(jpegHeaderBase64);
    expect(Array.from(bytes)).toEqual([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  });

  it('gera storage_path relativo seguro sem http://', () => {
    const path = buildProductImageStoragePath(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000010',
      'jpg',
    );
    expect(path).toMatch(
      /^00000000-0000-4000-8000-000000000001\/00000000-0000-4000-8000-000000000010\/[a-z0-9-]+\.jpg$/,
    );
  });

  it('valida MIME types permitidos e rejeita arquivos maiores que 5 MB', () => {
    expect(validateProductImageCandidate('image/webp', 150_000).valid).toBe(
      true,
    );
    expect(validateProductImageCandidate('image/jpg', 250_000).valid).toBe(
      true,
    );
    expect(
      validateProductImageCandidate('application/pdf', 100_000).valid,
    ).toBe(false);
    expect(
      validateProductImageCandidate('image/jpeg', 6 * 1024 * 1024).valid,
    ).toBe(false);
  });
});

describe('filterProducts', () => {
  it('filtra por status, categoria e termo de busca (nome, marca ou SKU)', () => {
    expect(
      filterProducts(SAMPLE_PRODUCTS, '', 'all', 'active').map((p) => p.name),
    ).toEqual(['Egeo Dolce']);

    expect(
      filterProducts(SAMPLE_PRODUCTS, 'boticario', 'all', 'all').map(
        (p) => p.name,
      ),
    ).toEqual(['Egeo Dolce']);

    expect(
      filterProducts(SAMPLE_PRODUCTS, '', 'cat-cremes', 'all').map(
        (p) => p.name,
      ),
    ).toEqual(['Natura Tododia Hidratante']);
  });
});
