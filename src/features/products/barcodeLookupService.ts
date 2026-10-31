import {
  BARCODE_LOOKUP_PROVIDERS,
  extractProductMetadataFromOpenFacts,
  type OpenFactsProductPayload,
  sanitizeBarcodeDigits,
} from '@/features/products/schemas';
import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type { ProductRow } from '@/types/database';

export interface BarcodeLookupResult {
  barcode: string;
  found: boolean;
  source: 'workspace_catalog' | 'external' | 'not_found';
  providerLabel: string | null;
  existingWorkspaceProduct: ProductRow | null;
  name: string | null;
  brand: string | null;
  description: string | null;
  SuggestedCategoryTerms: string[];
}

export interface LookupBarcodeOptions {
  workspaceId?: string | null;
  includeFoodDatabase?: boolean;
  timeoutMs?: number;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VendeFacilApp/1.0 (https://vendefacil.app)',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function findWorkspaceProductByBarcode(
  workspaceId: string,
  barcode: string,
): Promise<ProductRow | null> {
  const cleaned = sanitizeBarcodeDigits(barcode);
  if (!cleaned || !supabaseEnvStatus.isConfigured) {
    return null;
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('barcode', cleaned)
    .order('is_archived', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ProductRow;
}

interface UpcItemDbPayload {
  items?: {
    title?: string;
    brand?: string;
    description?: string;
    category?: string;
    size?: string;
  }[];
}

function extractProductMetadataFromUpcItemDb(
  payload: UpcItemDbPayload | null | undefined,
): {
  name: string | null;
  brand: string | null;
  description: string | null;
  categoryTerms: string[];
} | null {
  const first = payload?.items?.[0];
  if (!first) {
    return null;
  }

  const rawTitle = (first.title ?? '').trim();
  const rawBrand = (first.brand ?? '').trim();
  if (!rawTitle && !rawBrand) {
    return null;
  }

  const rawDesc = (first.description ?? '').trim();
  const rawSize = (first.size ?? '').trim();
  const descParts: string[] = [];
  if (rawDesc && rawDesc.toLowerCase() !== rawTitle.toLowerCase()) {
    descParts.push(rawDesc);
  }
  if (rawSize) {
    descParts.push(`Tamanho/Volume: ${rawSize}`);
  }

  const categoryTerms = first.category
    ? first.category
        .split('>')
        .map((c) => c.trim())
        .filter((c) => c.length >= 2)
    : [];

  return {
    name: rawTitle ? rawTitle.slice(0, 120) : null,
    brand: rawBrand ? rawBrand.slice(0, 80) : null,
    description: descParts.length > 0 ? descParts.join(' • ').slice(0, 480) : null,
    categoryTerms,
  };
}

export async function lookupProductByBarcode(
  rawBarcode: string,
  options?: LookupBarcodeOptions,
): Promise<BarcodeLookupResult> {
  const barcode = sanitizeBarcodeDigits(rawBarcode);
  if (!barcode) {
    return {
      barcode: '',
      found: false,
      source: 'not_found',
      providerLabel: null,
      existingWorkspaceProduct: null,
      name: null,
      brand: null,
      description: null,
      SuggestedCategoryTerms: [],
    };
  }

  // 1. Verifica primeiro se já existe no catálogo da própria loja
  if (options?.workspaceId) {
    try {
      const existing = await findWorkspaceProductByBarcode(
        options.workspaceId,
        barcode,
      );
      if (existing) {
        return {
          barcode,
          found: true,
          source: 'workspace_catalog',
          providerLabel: 'Seu catálogo VendeFácil',
          existingWorkspaceProduct: existing,
          name: existing.name,
          brand: existing.brand,
          description: existing.description,
          SuggestedCategoryTerms: [],
        };
      }
    } catch {
      // Prossegue para busca externa caso falhe a consulta local
    }
  }

  // 2. Consulta bases públicas habilitadas em cascata
  const timeoutMs = options?.timeoutMs ?? 4500;
  const activeProviders = BARCODE_LOOKUP_PROVIDERS.filter(
    (provider) => provider.enabledByDefault,
  );

  const fieldsParam =
    'fields=product_name,product_name_pt,generic_name,generic_name_pt,brands,quantity,categories,packaging';

  for (const provider of activeProviders) {
    try {
      if (provider.id === 'upcitemdb') {
        const url = `${provider.baseUrl}?upc=${encodeURIComponent(barcode)}`;
        const response = await fetchWithTimeout(url, timeoutMs);
        if (!response.ok) {
          continue;
        }
        const json = (await response.json()) as UpcItemDbPayload;
        const extracted = extractProductMetadataFromUpcItemDb(json);
        if (extracted) {
          return {
            barcode,
            found: true,
            source: 'external',
            providerLabel: provider.label,
            existingWorkspaceProduct: null,
            name: extracted.name,
            brand: extracted.brand,
            description: extracted.description,
            SuggestedCategoryTerms: extracted.categoryTerms,
          };
        }
        continue;
      }

      const url = `${provider.baseUrl}/${encodeURIComponent(barcode)}.json?${fieldsParam}`;
      const response = await fetchWithTimeout(url, timeoutMs);
      if (!response.ok) {
        continue;
      }

      const json = (await response.json()) as OpenFactsProductPayload;
      const extracted = extractProductMetadataFromOpenFacts(json);
      if (extracted) {
        return {
          barcode,
          found: true,
          source: 'external',
          providerLabel: provider.label,
          existingWorkspaceProduct: null,
          name: extracted.name,
          brand: extracted.brand,
          description: extracted.description,
          SuggestedCategoryTerms: extracted.categoryTerms,
        };
      }
    } catch {
      // Ignora timeout ou erro de rede de um provedor específico e tenta o próximo
    }
  }

  return {
    barcode,
    found: false,
    source: 'not_found',
    providerLabel: null,
    existingWorkspaceProduct: null,
    name: null,
    brand: null,
    description: null,
    SuggestedCategoryTerms: [],
  };
}
