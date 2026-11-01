import {
  BARCODE_LOOKUP_PROVIDERS,
  type BarcodeProviderConfig,
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

const EXTERNAL_BARCODE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const externalBarcodeCache = new Map<
  string,
  { result: BarcodeLookupResult; expiresAt: number }
>();

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onParentAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

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
    if (parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
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

const OPEN_FACTS_FIELDS_PARAM =
  'fields=product_name,product_name_pt,generic_name,generic_name_pt,brands,quantity,categories,packaging';

async function queryExternalProvider(
  provider: BarcodeProviderConfig,
  barcode: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<BarcodeLookupResult | null> {
  try {
    if (provider.id === 'upcitemdb') {
      const url = `${provider.baseUrl}?upc=${encodeURIComponent(barcode)}`;
      const response = await fetchWithTimeout(url, timeoutMs, signal);
      if (!response.ok) {
        return null;
      }
      const json = (await response.json()) as UpcItemDbPayload;
      const extracted = extractProductMetadataFromUpcItemDb(json);
      if (!extracted) {
        return null;
      }
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

    const url = `${provider.baseUrl}/${encodeURIComponent(barcode)}.json?${OPEN_FACTS_FIELDS_PARAM}`;
    const response = await fetchWithTimeout(url, timeoutMs, signal);
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as OpenFactsProductPayload;
    const extracted = extractProductMetadataFromOpenFacts(json);
    if (!extracted) {
      return null;
    }

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
  } catch {
    return null;
  }
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

  // 2. Verifica cache em memória de buscas externas recentes
  const cachedExternal = externalBarcodeCache.get(barcode);
  const now = Date.now();
  if (cachedExternal && cachedExternal.expiresAt > now) {
    return cachedExternal.result;
  }

  // 3. Dispara consultas nas bases públicas habilitadas em paralelo,
  // mantendo a ordem de prioridade (Beauty -> Food -> Products -> UPCitemdb)
  const timeoutMs = options?.timeoutMs ?? 4000;
  const activeProviders = BARCODE_LOOKUP_PROVIDERS.filter(
    (provider) => provider.enabledByDefault,
  );

  const batchAbortController = new AbortController();
  try {
    const parallelQueries = activeProviders.map((provider) =>
      queryExternalProvider(
        provider,
        barcode,
        timeoutMs,
        batchAbortController.signal,
      ),
    );

    for (const queryPromise of parallelQueries) {
      const hit = await queryPromise;
      if (hit) {
        batchAbortController.abort();
        externalBarcodeCache.set(barcode, {
          result: hit,
          expiresAt: Date.now() + EXTERNAL_BARCODE_CACHE_TTL_MS,
        });
        return hit;
      }
    }
  } finally {
    batchAbortController.abort();
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
