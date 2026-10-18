-- =============================================================================
-- VendeFácil — Migração Fase 5: Vendas, Itens de Venda e RPCs Transacionais
-- =============================================================================
-- Requisitos atendidos:
-- RF-033: confirmar venda e baixar estoque atomicamente.
-- RF-040: venda com vários produtos e cliente opcional.
-- RF-041: snapshot de nome/SKU/preço/custo nos itens vendidos.
-- RF-042: subtotal/desconto/total validados no banco.
-- RF-043: rascunho e confirmação.
-- RF-044: cancelamento confirmado gera estorno auditável no estoque e audit_logs.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Garantir constraint UNIQUE (id, workspace_id) em customers para FK composta
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_id_workspace_unique'
  ) then
    alter table public.customers
      add constraint customers_id_workspace_unique unique (id, workspace_id);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tipo enumerado de status da venda
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum (
      'draft',
      'confirmed',
      'cancelled'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Tabela: sales (Cabeçalho da Venda)
-- -----------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid,
  customer_name_snapshot text,
  status public.sale_status not null default 'draft',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (
    discount_cents >= 0 and discount_cents <= subtotal_cents
  ),
  total_cents integer not null default 0 check (
    total_cents >= 0 and total_cents = subtotal_cents - discount_cents
  ),
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  estimated_profit_cents integer not null default 0,
  item_count integer not null default 0 check (item_count > 0),
  notes text check (notes is null or char_length(trim(notes)) <= 500),
  cancellation_reason text check (
    cancellation_reason is null or char_length(trim(cancellation_reason)) <= 300
  ),
  idempotency_key text not null check (
    char_length(trim(idempotency_key)) between 6 and 120
  ),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_id_workspace_unique unique (id, workspace_id),
  constraint sales_workspace_idempotency_unique unique (workspace_id, idempotency_key),
  constraint sales_customer_workspace_fkey
    foreign key (customer_id, workspace_id)
    references public.customers (id, workspace_id)
    on delete restrict,
  constraint sales_cancelled_reason_check check (
    status <> 'cancelled'
    or (cancellation_reason is not null and char_length(trim(cancellation_reason)) >= 3)
  )
);

create index if not exists idx_sales_workspace_created
  on public.sales (workspace_id, created_at desc);

create index if not exists idx_sales_workspace_status_created
  on public.sales (workspace_id, status, created_at desc);

create index if not exists idx_sales_workspace_customer
  on public.sales (workspace_id, customer_id, created_at desc);

drop trigger if exists trg_sales_set_updated_at on public.sales;
create trigger trg_sales_set_updated_at
  before update on public.sales
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Tabela: sale_items (Itens da Venda com Snapshots Imutáveis — RF-041)
-- -----------------------------------------------------------------------------
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sale_id uuid not null,
  product_id uuid not null,
  product_name_snapshot text not null check (
    char_length(trim(product_name_snapshot)) between 1 and 140
  ),
  sku_snapshot text,
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 999999),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  line_cost_cents integer not null default 0 check (line_cost_cents >= 0),
  created_at timestamptz not null default now(),
  constraint sale_items_sale_workspace_fkey
    foreign key (sale_id, workspace_id)
    references public.sales (id, workspace_id)
    on delete cascade,
  constraint sale_items_product_workspace_fkey
    foreign key (product_id, workspace_id)
    references public.products (id, workspace_id)
    on delete restrict
);

create index if not exists idx_sale_items_workspace_sale
  on public.sale_items (workspace_id, sale_id);

create index if not exists idx_sale_items_workspace_product
  on public.sale_items (workspace_id, product_id);

-- -----------------------------------------------------------------------------
-- 5. RLS estrito nas tabelas sales e sale_items
-- -----------------------------------------------------------------------------
alter table public.sales enable row level security;
alter table public.sales force row level security;

alter table public.sale_items enable row level security;
alter table public.sale_items force row level security;

-- Leitura permitida apenas para membros ativos do workspace.
-- Escrita direta bloqueada: criação, confirmação e cancelamento passam pelas RPCs
-- transacionais (`create_or_confirm_sale`, `confirm_draft_sale`, `cancel_sale`).
drop policy if exists sales_select_member on public.sales;
create policy sales_select_member
  on public.sales
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists sale_items_select_member on public.sale_items;
create policy sale_items_select_member
  on public.sale_items
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- 6. RPC Transacional e Idempotente: create_or_confirm_sale (RF-033, RF-040..043)
-- -----------------------------------------------------------------------------
-- Recebe:
--   p_workspace_id uuid
--   p_customer_id uuid (opcional)
--   p_items jsonb: array de objetos [{"product_id": "...", "quantity": 2}]
--   p_discount_cents integer (default 0)
--   p_notes text (default null)
--   p_confirm_immediately boolean (default true: 'confirmed', false: 'draft')
--   p_idempotency_key text
create or replace function public.create_or_confirm_sale(
  p_workspace_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount_cents integer default 0,
  p_notes text default null,
  p_confirm_immediately boolean default true,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_clean_key text;
  v_clean_notes text;
  v_existing_sale public.sales%rowtype;
  v_customer public.customers%rowtype;
  v_customer_name text := null;
  v_discount integer := coalesce(p_discount_cents, 0);
  v_subtotal_cents integer := 0;
  v_estimated_cost_cents integer := 0;
  v_total_cents integer := 0;
  v_estimated_profit_cents integer := 0;
  v_item_count integer := 0;
  v_status public.sale_status;
  v_sale public.sales%rowtype;
  v_item record;
  v_product public.products%rowtype;
  v_qty numeric(12, 3);
  v_line_total integer;
  v_line_cost integer;
  v_prev_stock numeric(12, 3);
  v_new_stock numeric(12, 3);
  v_item_index integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado a este espaço de trabalho.' using errcode = '42501';
  end if;

  v_clean_key := trim(coalesce(p_idempotency_key, ''));
  if char_length(v_clean_key) < 6 or char_length(v_clean_key) > 120 then
    raise exception 'Chave de idempotência inválida (deve ter entre 6 e 120 caracteres).'
      using errcode = '22023';
  end if;

  -- Proteção contra retry / duplo clique: retorna venda existente se já processada
  select *
  into v_existing_sale
  from public.sales s
  where s.workspace_id = p_workspace_id
    and s.idempotency_key = v_clean_key;

  if found then
    return jsonb_build_object(
      'sale_id', v_existing_sale.id,
      'workspace_id', v_existing_sale.workspace_id,
      'status', v_existing_sale.status,
      'subtotal_cents', v_existing_sale.subtotal_cents,
      'discount_cents', v_existing_sale.discount_cents,
      'total_cents', v_existing_sale.total_cents,
      'estimated_profit_cents', v_existing_sale.estimated_profit_cents,
      'item_count', v_existing_sale.item_count,
      'created_at', v_existing_sale.created_at,
      'idempotent_replay', true
    );
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um produto válido na venda.'
      using errcode = '22023';
  end if;

  if v_discount < 0 then
    raise exception 'O desconto não pode ser negativo.'
      using errcode = '22023';
  end if;

  -- Valida cliente opcional dentro do mesmo workspace
  if p_customer_id is not null then
    select *
    into v_customer
    from public.customers c
    where c.id = p_customer_id
      and c.workspace_id = p_workspace_id;

    if not found then
      raise exception 'Cliente não encontrado neste espaço de trabalho.'
        using errcode = 'P0002';
    end if;

    v_customer_name := v_customer.full_name;
  end if;

  v_clean_notes := nullif(trim(coalesce(p_notes, '')), '');
  if v_clean_notes is not null and char_length(v_clean_notes) > 500 then
    raise exception 'A observação da venda deve ter no máximo 500 caracteres.'
      using errcode = '22023';
  end if;

  -- Consolida itens repetidos por product_id e ordena para travar em ordem determinística (evita deadlocks)
  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'product_id')::uuid
    order by (elem ->> 'product_id')::uuid
  loop
    if v_item.product_id is null or v_item.total_qty is null or v_item.total_qty <= 0 or v_item.total_qty > 999999 then
      raise exception 'Quantidade inválida para um dos produtos da venda.'
        using errcode = '22023';
    end if;

    select *
    into v_product
    from public.products p
    where p.id = v_item.product_id
      and p.workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception 'Produto não encontrado neste espaço de trabalho.'
        using errcode = 'P0002';
    end if;

    if v_product.is_archived then
      raise exception 'O produto "%" está arquivado e não pode ser vendido.', v_product.name
        using errcode = '22023';
    end if;

    if p_confirm_immediately and v_product.current_stock_qty < v_item.total_qty then
      raise exception 'Estoque insuficiente para "%" (disponível: % un., solicitado: % un.).',
        v_product.name, v_product.current_stock_qty, v_item.total_qty
        using errcode = '22023';
    end if;

    v_line_total := round(v_item.total_qty * v_product.price_cents)::integer;
    v_line_cost := round(v_item.total_qty * v_product.cost_cents)::integer;

    v_subtotal_cents := v_subtotal_cents + v_line_total;
    v_estimated_cost_cents := v_estimated_cost_cents + v_line_cost;
    v_item_count := v_item_count + 1;
  end loop;

  if v_discount > v_subtotal_cents then
    raise exception 'O desconto (%) não pode ser maior que o subtotal da venda (%).',
      v_discount, v_subtotal_cents
      using errcode = '22023';
  end if;

  v_total_cents := v_subtotal_cents - v_discount;
  v_estimated_profit_cents := v_total_cents - v_estimated_cost_cents;
  v_status := case
    when p_confirm_immediately then 'confirmed'::public.sale_status
    else 'draft'::public.sale_status
  end;

  insert into public.sales (
    workspace_id,
    customer_id,
    customer_name_snapshot,
    status,
    subtotal_cents,
    discount_cents,
    total_cents,
    estimated_cost_cents,
    estimated_profit_cents,
    item_count,
    notes,
    idempotency_key,
    confirmed_at,
    created_by
  )
  values (
    p_workspace_id,
    p_customer_id,
    v_customer_name,
    v_status,
    v_subtotal_cents,
    v_discount,
    v_total_cents,
    v_estimated_cost_cents,
    v_estimated_profit_cents,
    v_item_count,
    v_clean_notes,
    v_clean_key,
    case when p_confirm_immediately then now() else null end,
    v_user_id
  )
  returning * into v_sale;

  -- Insere itens com snapshots e, se confirmado, baixa o estoque e grava stock_movements
  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'product_id')::uuid
    order by (elem ->> 'product_id')::uuid
  loop
    v_item_index := v_item_index + 1;

    select *
    into v_product
    from public.products p
    where p.id = v_item.product_id
      and p.workspace_id = p_workspace_id;

    v_qty := v_item.total_qty;
    v_line_total := round(v_qty * v_product.price_cents)::integer;
    v_line_cost := round(v_qty * v_product.cost_cents)::integer;

    insert into public.sale_items (
      workspace_id,
      sale_id,
      product_id,
      product_name_snapshot,
      sku_snapshot,
      quantity,
      unit_price_cents,
      unit_cost_cents,
      line_total_cents,
      line_cost_cents
    )
    values (
      p_workspace_id,
      v_sale.id,
      v_product.id,
      v_product.name,
      v_product.sku,
      v_qty,
      v_product.price_cents,
      v_product.cost_cents,
      v_line_total,
      v_line_cost
    );

    if p_confirm_immediately then
      v_prev_stock := v_product.current_stock_qty;
      v_new_stock := v_prev_stock - v_qty;

      update public.products
      set current_stock_qty = v_new_stock
      where id = v_product.id
        and workspace_id = p_workspace_id;

      insert into public.stock_movements (
        workspace_id,
        product_id,
        movement_type,
        quantity_delta,
        previous_stock_qty,
        resulting_stock_qty,
        reason,
        idempotency_key,
        reference_type,
        reference_id,
        created_by
      )
      values (
        p_workspace_id,
        v_product.id,
        'sale_out',
        -v_qty,
        v_prev_stock,
        v_new_stock,
        coalesce('Venda confirmada' || case when v_customer_name is not null then ' - ' || v_customer_name else '' end, 'Venda confirmada'),
        left(v_clean_key, 95) || '_item_' || v_item_index::text,
        'sale',
        v_sale.id,
        v_user_id
      );
    end if;
  end loop;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_workspace_id,
    v_user_id,
    case when p_confirm_immediately then 'sale.confirmed' else 'sale.draft_created' end,
    'sale',
    v_sale.id,
    jsonb_build_object(
      'status', v_sale.status,
      'subtotal_cents', v_sale.subtotal_cents,
      'discount_cents', v_sale.discount_cents,
      'total_cents', v_sale.total_cents,
      'item_count', v_sale.item_count,
      'has_customer', p_customer_id is not null
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'workspace_id', v_sale.workspace_id,
    'status', v_sale.status,
    'subtotal_cents', v_sale.subtotal_cents,
    'discount_cents', v_sale.discount_cents,
    'total_cents', v_sale.total_cents,
    'estimated_profit_cents', v_sale.estimated_profit_cents,
    'item_count', v_sale.item_count,
    'created_at', v_sale.created_at,
    'idempotent_replay', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC Transacional: confirm_draft_sale (Confirma um rascunho existente)
-- -----------------------------------------------------------------------------
create or replace function public.confirm_draft_sale(
  p_workspace_id uuid,
  p_sale_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_product public.products%rowtype;
  v_prev_stock numeric(12, 3);
  v_new_stock numeric(12, 3);
  v_item_index integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado a este espaço de trabalho.' using errcode = '42501';
  end if;

  select *
  into v_sale
  from public.sales s
  where s.id = p_sale_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Venda não encontrada neste espaço de trabalho.'
      using errcode = 'P0002';
  end if;

  -- Idempotência: se já está confirmada, retorna sem duplicar baixa de estoque
  if v_sale.status = 'confirmed' then
    return jsonb_build_object(
      'sale_id', v_sale.id,
      'status', v_sale.status,
      'confirmed_at', v_sale.confirmed_at,
      'idempotent_replay', true
    );
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'Não é possível confirmar uma venda que já foi cancelada.'
      using errcode = '22023';
  end if;

  for v_item in
    select *
    from public.sale_items si
    where si.sale_id = v_sale.id
      and si.workspace_id = p_workspace_id
    order by si.product_id
  loop
    v_item_index := v_item_index + 1;

    select *
    into v_product
    from public.products p
    where p.id = v_item.product_id
      and p.workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception 'Produto "%" não encontrado.', v_item.product_name_snapshot
        using errcode = 'P0002';
    end if;

    if v_product.current_stock_qty < v_item.quantity then
      raise exception 'Estoque insuficiente para "%" (disponível: % un., solicitado: % un.).',
        v_product.name, v_product.current_stock_qty, v_item.quantity
        using errcode = '22023';
    end if;

    v_prev_stock := v_product.current_stock_qty;
    v_new_stock := v_prev_stock - v_item.quantity;

    update public.products
    set current_stock_qty = v_new_stock
    where id = v_product.id
      and workspace_id = p_workspace_id;

    insert into public.stock_movements (
      workspace_id,
      product_id,
      movement_type,
      quantity_delta,
      previous_stock_qty,
      resulting_stock_qty,
      reason,
      idempotency_key,
      reference_type,
      reference_id,
      created_by
    )
    values (
      p_workspace_id,
      v_product.id,
      'sale_out',
      -v_item.quantity,
      v_prev_stock,
      v_new_stock,
      coalesce('Confirmação de rascunho' || case when v_sale.customer_name_snapshot is not null then ' - ' || v_sale.customer_name_snapshot else '' end, 'Confirmação de rascunho'),
      'confirm_' || replace(v_sale.id::text, '-', '') || '_' || v_item_index::text,
      'sale',
      v_sale.id,
      v_user_id
    );
  end loop;

  update public.sales
  set
    status = 'confirmed',
    confirmed_at = now()
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_workspace_id,
    v_user_id,
    'sale.draft_confirmed',
    'sale',
    v_sale.id,
    jsonb_build_object(
      'total_cents', v_sale.total_cents,
      'item_count', v_sale.item_count
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'status', v_sale.status,
    'confirmed_at', v_sale.confirmed_at,
    'idempotent_replay', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC Transacional e Auditável: cancel_sale (RF-044)
-- -----------------------------------------------------------------------------
create or replace function public.cancel_sale(
  p_workspace_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_clean_reason text;
  v_sale public.sales%rowtype;
  v_previous_status public.sale_status;
  v_item public.sale_items%rowtype;
  v_product public.products%rowtype;
  v_prev_stock numeric(12, 3);
  v_new_stock numeric(12, 3);
  v_item_index integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado a este espaço de trabalho.' using errcode = '42501';
  end if;

  v_clean_reason := trim(coalesce(p_reason, ''));
  if char_length(v_clean_reason) < 3 or char_length(v_clean_reason) > 300 then
    raise exception 'Informe um motivo válido (entre 3 e 300 caracteres) para cancelar a venda.'
      using errcode = '22023';
  end if;

  select *
  into v_sale
  from public.sales s
  where s.id = p_sale_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Venda não encontrada neste espaço de trabalho.'
      using errcode = 'P0002';
  end if;

  -- Idempotência: se já está cancelada, retorna sem duplicar estorno de estoque
  if v_sale.status = 'cancelled' then
    return jsonb_build_object(
      'sale_id', v_sale.id,
      'status', v_sale.status,
      'cancelled_at', v_sale.cancelled_at,
      'idempotent_replay', true
    );
  end if;

  v_previous_status := v_sale.status;

  -- Se a venda estava confirmada, estorna cada item de volta ao estoque (movement_type = 'reversal')
  if v_previous_status = 'confirmed' then
    for v_item in
      select *
      from public.sale_items si
      where si.sale_id = v_sale.id
        and si.workspace_id = p_workspace_id
      order by si.product_id
    loop
      v_item_index := v_item_index + 1;

      select *
      into v_product
      from public.products p
      where p.id = v_item.product_id
        and p.workspace_id = p_workspace_id
      for update;

      if found then
        v_prev_stock := v_product.current_stock_qty;
        v_new_stock := v_prev_stock + v_item.quantity;

        update public.products
        set current_stock_qty = v_new_stock
        where id = v_product.id
          and workspace_id = p_workspace_id;

        insert into public.stock_movements (
          workspace_id,
          product_id,
          movement_type,
          quantity_delta,
          previous_stock_qty,
          resulting_stock_qty,
          reason,
          idempotency_key,
          reference_type,
          reference_id,
          created_by
        )
        values (
          p_workspace_id,
          v_product.id,
          'reversal',
          v_item.quantity,
          v_prev_stock,
          v_new_stock,
          'Estorno de cancelamento de venda: ' || left(v_clean_reason, 240),
          'cancel_' || replace(v_sale.id::text, '-', '') || '_' || v_item_index::text,
          'sale_cancellation',
          v_sale.id,
          v_user_id
        );
      end if;
    end loop;
  end if;

  update public.sales
  set
    status = 'cancelled',
    cancellation_reason = v_clean_reason,
    cancelled_at = now()
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_workspace_id,
    v_user_id,
    'sale.cancelled',
    'sale',
    v_sale.id,
    jsonb_build_object(
      'previous_status', v_previous_status,
      'total_cents', v_sale.total_cents,
      'stock_reversed', v_previous_status = 'confirmed'
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'status', v_sale.status,
    'cancelled_at', v_sale.cancelled_at,
    'idempotent_replay', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC Transacional: update_draft_sale (Edita um rascunho existente)
-- -----------------------------------------------------------------------------
create or replace function public.update_draft_sale(
  p_workspace_id uuid,
  p_sale_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount_cents integer default 0,
  p_notes text default null,
  p_confirm_immediately boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_sale public.sales%rowtype;
  v_customer public.customers%rowtype;
  v_customer_name text := null;
  v_clean_notes text;
  v_discount integer := coalesce(p_discount_cents, 0);
  v_subtotal_cents integer := 0;
  v_estimated_cost_cents integer := 0;
  v_total_cents integer := 0;
  v_estimated_profit_cents integer := 0;
  v_item_count integer := 0;
  v_status public.sale_status;
  v_item record;
  v_product public.products%rowtype;
  v_qty numeric(12, 3);
  v_line_total integer;
  v_line_cost integer;
  v_prev_stock numeric(12, 3);
  v_new_stock numeric(12, 3);
  v_item_index integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado a este espaço de trabalho.' using errcode = '42501';
  end if;

  select *
  into v_sale
  from public.sales s
  where s.id = p_sale_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Venda não encontrada neste espaço de trabalho.'
      using errcode = 'P0002';
  end if;

  if v_sale.status = 'confirmed' and p_confirm_immediately then
    return jsonb_build_object(
      'sale_id', v_sale.id,
      'workspace_id', v_sale.workspace_id,
      'status', v_sale.status,
      'subtotal_cents', v_sale.subtotal_cents,
      'discount_cents', v_sale.discount_cents,
      'total_cents', v_sale.total_cents,
      'estimated_profit_cents', v_sale.estimated_profit_cents,
      'item_count', v_sale.item_count,
      'created_at', v_sale.created_at,
      'idempotent_replay', true
    );
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Apenas vendas em rascunho podem ser editadas.'
      using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um produto válido na venda.'
      using errcode = '22023';
  end if;

  if v_discount < 0 then
    raise exception 'O desconto não pode ser negativo.'
      using errcode = '22023';
  end if;

  if p_customer_id is not null then
    select *
    into v_customer
    from public.customers c
    where c.id = p_customer_id
      and c.workspace_id = p_workspace_id;

    if not found then
      raise exception 'Cliente não encontrado neste espaço de trabalho.'
        using errcode = 'P0002';
    end if;

    v_customer_name := v_customer.full_name;
  end if;

  v_clean_notes := nullif(trim(coalesce(p_notes, '')), '');
  if v_clean_notes is not null and char_length(v_clean_notes) > 500 then
    raise exception 'A observação da venda deve ter no máximo 500 caracteres.'
      using errcode = '22023';
  end if;

  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'product_id')::uuid
    order by (elem ->> 'product_id')::uuid
  loop
    if v_item.product_id is null or v_item.total_qty is null or v_item.total_qty <= 0 or v_item.total_qty > 999999 then
      raise exception 'Quantidade inválida para um dos produtos da venda.'
        using errcode = '22023';
    end if;

    select *
    into v_product
    from public.products p
    where p.id = v_item.product_id
      and p.workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception 'Produto não encontrado neste espaço de trabalho.'
        using errcode = 'P0002';
    end if;

    if v_product.is_archived then
      raise exception 'O produto "%" está arquivado e não pode ser vendido.', v_product.name
        using errcode = '22023';
    end if;

    if p_confirm_immediately and v_product.current_stock_qty < v_item.total_qty then
      raise exception 'Estoque insuficiente para "%" (disponível: % un., solicitado: % un.).',
        v_product.name, v_product.current_stock_qty, v_item.total_qty
        using errcode = '22023';
    end if;

    v_line_total := round(v_item.total_qty * v_product.price_cents)::integer;
    v_line_cost := round(v_item.total_qty * v_product.cost_cents)::integer;

    v_subtotal_cents := v_subtotal_cents + v_line_total;
    v_estimated_cost_cents := v_estimated_cost_cents + v_line_cost;
    v_item_count := v_item_count + 1;
  end loop;

  if v_discount > v_subtotal_cents then
    raise exception 'O desconto (%) não pode ser maior que o subtotal da venda (%).',
      v_discount, v_subtotal_cents
      using errcode = '22023';
  end if;

  v_total_cents := v_subtotal_cents - v_discount;
  v_estimated_profit_cents := v_total_cents - v_estimated_cost_cents;
  v_status := case
    when p_confirm_immediately then 'confirmed'::public.sale_status
    else 'draft'::public.sale_status
  end;

  delete from public.sale_items
  where sale_id = v_sale.id
    and workspace_id = p_workspace_id;

  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'product_id')::uuid
    order by (elem ->> 'product_id')::uuid
  loop
    v_item_index := v_item_index + 1;

    select *
    into v_product
    from public.products p
    where p.id = v_item.product_id
      and p.workspace_id = p_workspace_id;

    v_qty := v_item.total_qty;
    v_line_total := round(v_qty * v_product.price_cents)::integer;
    v_line_cost := round(v_qty * v_product.cost_cents)::integer;

    insert into public.sale_items (
      workspace_id,
      sale_id,
      product_id,
      product_name_snapshot,
      sku_snapshot,
      quantity,
      unit_price_cents,
      unit_cost_cents,
      line_total_cents,
      line_cost_cents
    )
    values (
      p_workspace_id,
      v_sale.id,
      v_product.id,
      v_product.name,
      v_product.sku,
      v_qty,
      v_product.price_cents,
      v_product.cost_cents,
      v_line_total,
      v_line_cost
    );

    if p_confirm_immediately then
      v_prev_stock := v_product.current_stock_qty;
      v_new_stock := v_prev_stock - v_qty;

      update public.products
      set current_stock_qty = v_new_stock
      where id = v_product.id
        and workspace_id = p_workspace_id;

      insert into public.stock_movements (
        workspace_id,
        product_id,
        movement_type,
        quantity_delta,
        previous_stock_qty,
        resulting_stock_qty,
        reason,
        idempotency_key,
        reference_type,
        reference_id,
        created_by
      )
      values (
        p_workspace_id,
        v_product.id,
        'sale_out',
        -v_qty,
        v_prev_stock,
        v_new_stock,
        coalesce('Confirmação de rascunho' || case when v_customer_name is not null then ' - ' || v_customer_name else '' end, 'Confirmação de rascunho'),
        'confirm_' || replace(v_sale.id::text, '-', '') || '_' || v_item_index::text,
        'sale',
        v_sale.id,
        v_user_id
      );
    end if;
  end loop;

  update public.sales
  set
    customer_id = p_customer_id,
    customer_name_snapshot = v_customer_name,
    status = v_status,
    subtotal_cents = v_subtotal_cents,
    discount_cents = v_discount,
    total_cents = v_total_cents,
    estimated_cost_cents = v_estimated_cost_cents,
    estimated_profit_cents = v_estimated_profit_cents,
    item_count = v_item_count,
    notes = v_clean_notes,
    confirmed_at = case when p_confirm_immediately then now() else null end
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_workspace_id,
    v_user_id,
    case when p_confirm_immediately then 'sale.draft_confirmed' else 'sale.draft_updated' end,
    'sale',
    v_sale.id,
    jsonb_build_object(
      'status', v_sale.status,
      'subtotal_cents', v_sale.subtotal_cents,
      'discount_cents', v_sale.discount_cents,
      'total_cents', v_sale.total_cents,
      'item_count', v_sale.item_count
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'workspace_id', v_sale.workspace_id,
    'status', v_sale.status,
    'subtotal_cents', v_sale.subtotal_cents,
    'discount_cents', v_sale.discount_cents,
    'total_cents', v_sale.total_cents,
    'estimated_profit_cents', v_sale.estimated_profit_cents,
    'item_count', v_sale.item_count,
    'created_at', v_sale.created_at,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.create_or_confirm_sale(
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean,
  text
) from public;

grant execute on function public.create_or_confirm_sale(
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean,
  text
) to authenticated;

revoke all on function public.confirm_draft_sale(uuid, uuid) from public;
grant execute on function public.confirm_draft_sale(uuid, uuid) to authenticated;

revoke all on function public.cancel_sale(uuid, uuid, text) from public;
grant execute on function public.cancel_sale(uuid, uuid, text) to authenticated;

revoke all on function public.update_draft_sale(
  uuid,
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean
) from public;

grant execute on function public.update_draft_sale(
  uuid,
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean
) to authenticated;

commit;
