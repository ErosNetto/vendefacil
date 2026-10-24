import {
  categoryFormSchema,
  productFormSchema,
  type ProductFormInput,
} from '@/features/products/schemas';
import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type { CategoryRow, ProductRow } from '@/types/database';

function ensureConfigured(): void {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error(
      supabaseEnvStatus.reason ??
        'Configure o arquivo .env com as credenciais públicas do Supabase.',
    );
  }
}

export function mapProductServiceError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Não foi possível concluir a operação no catálogo. Tente novamente.';
  }

  const raw =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

  if (raw.includes('relation') && (raw.includes('products') || raw.includes('categories'))) {
    return 'As tabelas de produtos/categorias ainda não existem no Supabase. Execute a migração SQL da Fase 3 no SQL Editor.';
  }
  if (raw.includes('categories_workspace_name_unique')) {
    return 'Já existe uma categoria com este nome neste espaço de trabalho.';
  }
  if (raw.includes('row-level security') || raw.includes('42501')) {
    return 'Você não tem permissão para alterar produtos ou categorias deste espaço de trabalho.';
  }
  if (raw.includes('Storage') || raw.includes('Permissão')) {
    return raw;
  }

  return 'Não foi possível salvar os dados do produto. Verifique sua conexão e tente novamente.';
}

export async function listWorkspaceCategories(
  workspaceId: string,
): Promise<CategoryRow[]> {
  ensureConfigured();

  const { data, error } = await supabase
    .from('categories')
    .select('id, workspace_id, name, is_archived, created_by, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('is_archived', false)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createWorkspaceCategory(
  workspaceId: string,
  name: string,
): Promise<CategoryRow> {
  ensureConfigured();

  const validated = categoryFormSchema.parse({ name });

  const { data, error } = await supabase
    .from('categories')
    .insert({
      workspace_id: workspaceId,
      name: validated.name,
      is_archived: false,
    })
    .select('id, workspace_id, name, is_archived, created_by, created_at, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listWorkspaceProducts(
  workspaceId: string,
): Promise<ProductRow[]> {
  ensureConfigured();

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, workspace_id, category_id, name, brand, sku, barcode, cost_cents, price_cents, min_stock_qty, current_stock_qty, description, primary_image_path, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export interface ListWorkspaceProductsPaginatedOptions {
  workspaceId: string;
  search?: string;
  status?: 'active' | 'archived' | 'all';
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedProductsResult {
  items: ProductRow[];
  totalCount: number;
}

export async function listWorkspaceProductsPaginated({
  workspaceId,
  search,
  status = 'active',
  categoryId,
  page = 1,
  pageSize = 20,
}: ListWorkspaceProductsPaginatedOptions): Promise<PaginatedProductsResult> {
  ensureConfigured();

  let query = supabase
    .from('products')
    .select(
      'id, workspace_id, category_id, name, brand, sku, barcode, cost_cents, price_cents, min_stock_qty, current_stock_qty, description, primary_image_path, is_archived, archived_at, created_by, created_at, updated_at',
      { count: 'exact' },
    )
    .eq('workspace_id', workspaceId);

  if (status === 'active') {
    query = query.eq('is_archived', false);
  } else if (status === 'archived') {
    query = query.eq('is_archived', true);
  }

  if (categoryId && categoryId !== 'all') {
    query = query.eq('category_id', categoryId);
  }

  const trimmed = search?.trim();
  if (trimmed) {
    const s = `%${trimmed}%`;
    query = query.or(`name.ilike.${s},sku.ilike.${s},brand.ilike.${s},barcode.ilike.${s}`);
  }

  const offset = Math.max(0, (page - 1) * pageSize);
  query = query
    .order('name', { ascending: true })
    .range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  return {
    items: data ?? [],
    totalCount: count ?? (data?.length ?? 0),
  };
}

export async function getWorkspaceProductCounts(
  workspaceId: string,
): Promise<{ active: number; archived: number; all: number }> {
  ensureConfigured();

  const [activeRes, archivedRes] = await Promise.all([
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_archived', true),
  ]);

  const active = activeRes.count ?? 0;
  const archived = archivedRes.count ?? 0;

  return {
    active,
    archived,
    all: active + archived,
  };
}

export async function getWorkspaceProductById(
  workspaceId: string,
  productId: string,
): Promise<ProductRow | null> {
  ensureConfigured();

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, workspace_id, category_id, name, brand, sku, barcode, cost_cents, price_cents, min_stock_qty, current_stock_qty, description, primary_image_path, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function createWorkspaceProduct(
  workspaceId: string,
  input: ProductFormInput,
): Promise<ProductRow> {
  ensureConfigured();

  const validated = productFormSchema.parse(input);

  const { data, error } = await supabase
    .from('products')
    .insert({
      workspace_id: workspaceId,
      category_id: validated.categoryId,
      name: validated.name,
      brand: validated.brand,
      sku: validated.sku,
      barcode: validated.barcode,
      cost_cents: validated.costInput,
      price_cents: validated.priceInput,
      min_stock_qty: validated.minStockInput,
      current_stock_qty: 0,
      description: validated.description,
      is_archived: false,
      archived_at: null,
    })
    .select(
      'id, workspace_id, category_id, name, brand, sku, barcode, cost_cents, price_cents, min_stock_qty, current_stock_qty, description, primary_image_path, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateWorkspaceProduct(
  workspaceId: string,
  productId: string,
  input: ProductFormInput,
): Promise<ProductRow> {
  ensureConfigured();

  const validated = productFormSchema.parse(input);

  const { data, error } = await supabase
    .from('products')
    .update({
      category_id: validated.categoryId,
      name: validated.name,
      brand: validated.brand,
      sku: validated.sku,
      barcode: validated.barcode,
      cost_cents: validated.costInput,
      price_cents: validated.priceInput,
      min_stock_qty: validated.minStockInput,
      description: validated.description,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', productId)
    .select(
      'id, workspace_id, category_id, name, brand, sku, barcode, cost_cents, price_cents, min_stock_qty, current_stock_qty, description, primary_image_path, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function setWorkspaceProductArchived(
  workspaceId: string,
  productId: string,
  isArchived: boolean,
): Promise<ProductRow> {
  ensureConfigured();

  const { data, error } = await supabase
    .from('products')
    .update({
      is_archived: isArchived,
      archived_at: isArchived ? new Date().toISOString() : null,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', productId)
    .select(
      'id, workspace_id, category_id, name, brand, sku, barcode, cost_cents, price_cents, min_stock_qty, current_stock_qty, description, primary_image_path, is_archived, archived_at, created_by, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}
