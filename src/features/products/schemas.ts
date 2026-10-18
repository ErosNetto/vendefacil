import { z } from 'zod';

import type { ProductRow } from '@/types/database';
import { parseBRLInputToCents } from '@/utils/formatters';

export const PRODUCT_IMAGES_BUCKET = 'product-images' as const;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type ProductStatusFilter = 'active' | 'archived' | 'all';

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Converte uma string Base64 (com ou sem cabeçalho data URI) diretamente em Uint8Array
 * binário puro. Evita o bug de fetch('file://...').arrayBuffer() no React Native Android,
 * que enviava bytes vazios ou corrompidos para o Supabase Storage.
 */
export function base64ToUint8Array(base64Input: string): Uint8Array {
  const withoutPrefix = base64Input
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/[\r\n\s]/g, '');

  if (!withoutPrefix) {
    return new Uint8Array(0);
  }

  const padding = withoutPrefix.endsWith('==')
    ? 2
    : withoutPrefix.endsWith('=')
      ? 1
      : 0;
  const byteLength = Math.floor((withoutPrefix.length * 3) / 4) - padding;
  if (byteLength <= 0) {
    return new Uint8Array(0);
  }

  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let i = 0; i < withoutPrefix.length; i += 4) {
    const c1 = BASE64_CHARS.indexOf(withoutPrefix[i] ?? 'A');
    const c2 = BASE64_CHARS.indexOf(withoutPrefix[i + 1] ?? 'A');
    const c3 =
      withoutPrefix[i + 2] === '='
        ? 0
        : BASE64_CHARS.indexOf(withoutPrefix[i + 2] ?? 'A');
    const c4 =
      withoutPrefix[i + 3] === '='
        ? 0
        : BASE64_CHARS.indexOf(withoutPrefix[i + 3] ?? 'A');

    const triplet =
      ((Math.max(0, c1) & 0x3f) << 18) |
      ((Math.max(0, c2) & 0x3f) << 12) |
      ((Math.max(0, c3) & 0x3f) << 6) |
      (Math.max(0, c4) & 0x3f);

    if (byteIndex < byteLength) {
      bytes[byteIndex] = (triplet >> 16) & 0xff;
      byteIndex += 1;
    }
    if (byteIndex < byteLength) {
      bytes[byteIndex] = (triplet >> 8) & 0xff;
      byteIndex += 1;
    }
    if (byteIndex < byteLength) {
      bytes[byteIndex] = triplet & 0xff;
      byteIndex += 1;
    }
  }

  return bytes;
}

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome da categoria deve ter pelo menos 2 caracteres.')
    .max(60, 'O nome da categoria deve ter no máximo 60 caracteres.'),
});

export type CategoryFormInput = z.input<typeof categoryFormSchema>;

export const productFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome do produto (mínimo de 2 caracteres).')
    .max(120, 'O nome do produto deve ter no máximo 120 caracteres.'),
  categoryId: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  brand: z
    .string()
    .trim()
    .max(80, 'A marca deve ter no máximo 80 caracteres.')
    .transform((val) => (val ? val : null)),
  sku: z
    .string()
    .trim()
    .max(60, 'O código/SKU deve ter no máximo 60 caracteres.')
    .transform((val) => (val ? val : null)),
  barcode: z
    .string()
    .trim()
    .max(60, 'O código de barras deve ter no máximo 60 caracteres.')
    .transform((val) => (val ? val : null)),
  costInput: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val) return true;
        const cents = parseBRLInputToCents(val);
        return cents !== null && cents >= 0;
      },
      { message: 'Informe um custo válido (ex.: 70,00).' },
    )
    .transform((val) => {
      if (!val) return 0;
      return parseBRLInputToCents(val) ?? 0;
    }),
  priceInput: z
    .string()
    .trim()
    .min(1, 'Informe o preço de venda do produto.')
    .refine(
      (val) => {
        const cents = parseBRLInputToCents(val);
        return cents !== null && cents >= 0;
      },
      { message: 'Informe um preço de venda válido (ex.: 129,90).' },
    )
    .transform((val) => parseBRLInputToCents(val) ?? 0),
  minStockInput: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val) return true;
        const normalized = val.replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999999;
      },
      { message: 'Informe um estoque mínimo válido (0 ou maior).' },
    )
    .transform((val) => {
      if (!val) return 0;
      return Number(val.replace(',', '.'));
    }),
  description: z
    .string()
    .trim()
    .max(1000, 'A descrição deve ter no máximo 1000 caracteres.')
    .transform((val) => (val ? val : null)),
});

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValidated = z.output<typeof productFormSchema>;

/**
 * Calcula a margem bruta percentual sobre o preço de venda:
 * ((preço - custo) / preço) * 100, com 1 casa decimal.
 */
export function calculateProfitMarginPercent(
  priceCents: number,
  costCents: number,
): number | null {
  if (!Number.isFinite(priceCents) || !Number.isFinite(costCents) || priceCents <= 0) {
    return null;
  }
  const margin = ((priceCents - costCents) / priceCents) * 100;
  return Math.round(margin * 10) / 10;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gera um `storage_path` relativo seguro no padrão `<workspace_uuid>/<product_uuid>/<arquivo>.<ext>`
 * sem URL pública fixa (RF-023 e docs/06-seguranca-supabase.md).
 */
export function buildProductImageStoragePath(
  workspaceId: string,
  productId: string,
  extension: 'webp' | 'jpg' | 'png' = 'jpg',
): string {
  const cleanWorkspaceId = workspaceId.trim().toLowerCase();
  const cleanProductId = productId.trim().toLowerCase();

  if (!UUID_REGEX.test(cleanWorkspaceId) || !UUID_REGEX.test(cleanProductId)) {
    throw new Error('Identificadores inválidos para geração do caminho de imagem.');
  }

  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${cleanWorkspaceId}/${cleanProductId}/${timestamp}-${randomPart}.${extension}`;
}

export interface ImageValidationResult {
  valid: boolean;
  errorMessage: string | null;
  normalizedMimeType: AllowedImageMimeType | null;
}

/**
 * Valida MIME type e tamanho máximo (5 MB) de uma imagem antes do upload (RF-024).
 */
export function validateProductImageCandidate(
  mimeType: string | null | undefined,
  fileSizeBytes: number | null | undefined,
): ImageValidationResult {
  const cleanMime = (mimeType ?? '').trim().toLowerCase();
  const normalizedMime: AllowedImageMimeType | null =
    cleanMime === 'image/jpg'
      ? 'image/jpeg'
      : ALLOWED_IMAGE_MIME_TYPES.includes(cleanMime as AllowedImageMimeType)
        ? (cleanMime as AllowedImageMimeType)
        : null;

  if (!normalizedMime) {
    return {
      valid: false,
      errorMessage: 'Formato de imagem não suportado. Use fotos JPG, PNG ou WebP.',
      normalizedMimeType: null,
    };
  }

  if (
    typeof fileSizeBytes === 'number' &&
    (fileSizeBytes <= 0 || fileSizeBytes > MAX_PRODUCT_IMAGE_BYTES)
  ) {
    return {
      valid: false,
      errorMessage: 'A imagem excede o limite máximo de 5 MB.',
      normalizedMimeType: null,
    };
  }

  return {
    valid: true,
    errorMessage: null,
    normalizedMimeType: normalizedMime,
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterProducts(
  products: readonly ProductRow[],
  searchQuery: string,
  categoryIdFilter: string,
  statusFilter: ProductStatusFilter,
): ProductRow[] {
  const normalizedQuery = normalizeSearchText(searchQuery);

  return products.filter((product) => {
    if (statusFilter === 'active' && product.is_archived) {
      return false;
    }
    if (statusFilter === 'archived' && !product.is_archived) {
      return false;
    }
    if (
      categoryIdFilter !== 'all' &&
      product.category_id !== categoryIdFilter
    ) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const nameMatch = normalizeSearchText(product.name).includes(
      normalizedQuery,
    );
    const brandMatch = product.brand
      ? normalizeSearchText(product.brand).includes(normalizedQuery)
      : false;
    const skuMatch = product.sku
      ? normalizeSearchText(product.sku).includes(normalizedQuery)
      : false;
    const barcodeMatch = product.barcode
      ? normalizeSearchText(product.barcode).includes(normalizedQuery)
      : false;

    return nameMatch || brandMatch || skuMatch || barcodeMatch;
  });
}
