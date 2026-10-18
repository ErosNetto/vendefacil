-- =============================================================================
-- VendeFácil — Migração Fase 3: Categorias, Produtos, Imagens e Storage Privado
-- =============================================================================
-- Requisitos atendidos:
-- RF-020: CRUD de produto e categoria por workspace.
-- RF-021: nome, marca, SKU/barcode opcional, custo (centavos), preço (centavos),
--         mínimo de estoque, saldo de estoque atual e descrição.
-- RF-022 / RF-023 / RF-024: bucket privado `product-images`, validação de MIME
--         e tamanho (máx. 5 MB), banco armazena apenas `storage_path` relativo
--         no formato `<workspace_uuid>/<product_uuid>/<arquivo>`.
-- Integridade: Foreign Keys compostas impedindo associação de produto com
--              categoria de outro workspace ou imagem com produto de outro workspace.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tabela: categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  is_archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_id_workspace_unique unique (id, workspace_id),
  constraint categories_workspace_name_unique unique (workspace_id, name)
);

create index if not exists idx_categories_workspace_archived_name
  on public.categories (workspace_id, is_archived, name);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Tabela: products
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 120),
  brand text check (brand is null or char_length(trim(brand)) <= 80),
  sku text check (sku is null or char_length(trim(sku)) <= 60),
  barcode text check (barcode is null or char_length(trim(barcode)) <= 60),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  price_cents integer not null check (price_cents >= 0),
  min_stock_qty numeric(12, 3) not null default 0 check (min_stock_qty >= 0),
  current_stock_qty numeric(12, 3) not null default 0 check (current_stock_qty >= 0),
  description text check (description is null or char_length(trim(description)) <= 1000),
  primary_image_path text check (
    primary_image_path is null
    or (
      char_length(trim(primary_image_path)) between 10 and 300
      and primary_image_path not like 'http%'
      and primary_image_path not like '%..%'
    )
  ),
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_id_workspace_unique unique (id, workspace_id),
  constraint products_category_workspace_fkey
    foreign key (category_id, workspace_id)
    references public.categories (id, workspace_id)
    match simple
    on delete restrict
);

create index if not exists idx_products_workspace_archived_name
  on public.products (workspace_id, is_archived, name);

create index if not exists idx_products_workspace_category
  on public.products (workspace_id, category_id);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Tabela: product_images
-- -----------------------------------------------------------------------------
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null,
  storage_path text not null check (
    char_length(trim(storage_path)) between 10 and 300
    and storage_path not like 'http%'
    and storage_path not like '%..%'
  ),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes integer not null check (file_size_bytes between 1 and 5242880),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint product_images_storage_path_unique unique (storage_path),
  constraint product_images_product_workspace_fkey
    foreign key (product_id, workspace_id)
    references public.products (id, workspace_id)
    on delete cascade,
  constraint product_images_path_prefix_check check (
    storage_path like (workspace_id::text || '/' || product_id::text || '/%')
  )
);

create index if not exists idx_product_images_workspace_product
  on public.product_images (workspace_id, product_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. RLS nas tabelas categories, products e product_images
-- -----------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.categories force row level security;

alter table public.products enable row level security;
alter table public.products force row level security;

alter table public.product_images enable row level security;
alter table public.product_images force row level security;

-- Policies: categories
drop policy if exists categories_select_member on public.categories;
create policy categories_select_member
  on public.categories
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists categories_insert_member on public.categories;
create policy categories_insert_member
  on public.categories
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists categories_update_member on public.categories;
create policy categories_update_member
  on public.categories
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Policies: products
drop policy if exists products_select_member on public.products;
create policy products_select_member
  on public.products
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists products_insert_member on public.products;
create policy products_insert_member
  on public.products
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists products_update_member on public.products;
create policy products_update_member
  on public.products
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Policies: product_images
drop policy if exists product_images_select_member on public.product_images;
create policy product_images_select_member
  on public.product_images
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists product_images_insert_member on public.product_images;
create policy product_images_insert_member
  on public.product_images
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists product_images_delete_member on public.product_images;
create policy product_images_delete_member
  on public.product_images
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- 5. Bucket Privado no Supabase Storage (`product-images`) e Políticas RLS
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Função segura para validar se o objeto `<workspace_uuid>/<product_uuid>/<arquivo>`
-- pertence a um workspace do qual o usuário autenticado é membro ativo e se o produto
-- pertence ao mesmo workspace.
create or replace function public.can_access_product_image_object(
  p_bucket_id text,
  p_object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_parts text[];
  v_workspace_id uuid;
  v_product_id uuid;
  v_filename text;
begin
  if p_bucket_id is distinct from 'product-images' then
    return false;
  end if;

  if p_object_name is null or p_object_name like '%..%' then
    return false;
  end if;

  v_parts := string_to_array(p_object_name, '/');
  if coalesce(array_length(v_parts, 1), 0) <> 3 then
    return false;
  end if;

  begin
    v_workspace_id := v_parts[1]::uuid;
    v_product_id := v_parts[2]::uuid;
  exception
    when others then
      return false;
  end;

  v_filename := trim(coalesce(v_parts[3], ''));
  if v_filename = '' or v_filename !~* '^[a-z0-9._-]+\.(webp|jpg|jpeg|png)$' then
    return false;
  end if;

  if not public.is_workspace_member(v_workspace_id) then
    return false;
  end if;

  return exists (
    select 1
    from public.products p
    where p.id = v_product_id
      and p.workspace_id = v_workspace_id
  );
end;
$$;

revoke all on function public.can_access_product_image_object(text, text) from public;
grant execute on function public.can_access_product_image_object(text, text) to authenticated;

drop policy if exists product_images_storage_select on storage.objects;
create policy product_images_storage_select
  on storage.objects
  for select
  to authenticated
  using (public.can_access_product_image_object(bucket_id, name));

drop policy if exists product_images_storage_insert on storage.objects;
create policy product_images_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (public.can_access_product_image_object(bucket_id, name));

drop policy if exists product_images_storage_update on storage.objects;
create policy product_images_storage_update
  on storage.objects
  for update
  to authenticated
  using (public.can_access_product_image_object(bucket_id, name))
  with check (public.can_access_product_image_object(bucket_id, name));

drop policy if exists product_images_storage_delete on storage.objects;
create policy product_images_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (public.can_access_product_image_object(bucket_id, name));

commit;
