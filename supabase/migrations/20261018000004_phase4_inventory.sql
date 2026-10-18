-- =============================================================================
-- VendeFácil — Migração Fase 4: Estoque e Movimentações (stock_movements + RPC)
-- =============================================================================
-- Requisitos atendidos:
-- RF-030: entradas, saídas, ajustes, danos, devoluções e estornos.
-- RF-031: saldo e histórico de movimentos append-only.
-- RF-032: alerta de saldo menor/igual ao mínimo.
-- RF-034: impedir saldo negativo por padrão.
-- RF-035: retry não duplica movimentos (idempotência via idempotency_key).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tipo enumerado de movimentação de estoque
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'stock_movement_type') then
    create type public.stock_movement_type as enum (
      'entry',
      'sale_out',
      'adjustment_in',
      'adjustment_out',
      'damage',
      'return_in',
      'reversal'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tabela append-only: stock_movements
-- -----------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null,
  movement_type public.stock_movement_type not null,
  quantity_delta numeric(12, 3) not null check (quantity_delta <> 0),
  previous_stock_qty numeric(12, 3) not null check (previous_stock_qty >= 0),
  resulting_stock_qty numeric(12, 3) not null check (resulting_stock_qty >= 0),
  reason text check (reason is null or char_length(trim(reason)) <= 300),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 6 and 120),
  reference_type text check (reference_type is null or char_length(trim(reference_type)) <= 60),
  reference_id uuid,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint stock_movements_product_workspace_fkey
    foreign key (product_id, workspace_id)
    references public.products (id, workspace_id)
    on delete restrict,
  constraint stock_movements_workspace_idempotency_unique
    unique (workspace_id, idempotency_key),
  constraint stock_movements_direction_check check (
    (
      movement_type in ('entry', 'adjustment_in', 'return_in', 'reversal')
      and quantity_delta > 0
    )
    or (
      movement_type in ('sale_out', 'adjustment_out', 'damage')
      and quantity_delta < 0
    )
  ),
  constraint stock_movements_math_check check (
    resulting_stock_qty = previous_stock_qty + quantity_delta
  )
);

create index if not exists idx_stock_movements_workspace_created
  on public.stock_movements (workspace_id, created_at desc);

create index if not exists idx_stock_movements_workspace_product_created
  on public.stock_movements (workspace_id, product_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. RLS estrito e proteção append-only
-- -----------------------------------------------------------------------------
alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;

-- Somente leitura para membros ativos do workspace.
-- Inserção direta bloqueada: todo movimento passa por RPC transacional (`adjust_stock` ou `confirm_sale`).
-- UPDATE e DELETE bloqueados para garantir histórico imutável (append-only).
drop policy if exists stock_movements_select_member on public.stock_movements;
create policy stock_movements_select_member
  on public.stock_movements
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- 4. RPC Transacional e Idempotente: adjust_stock
-- -----------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_workspace_id uuid,
  p_product_id uuid,
  p_movement_type public.stock_movement_type,
  p_quantity numeric,
  p_reason text default null,
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
  v_clean_reason text;
  v_existing public.stock_movements%rowtype;
  v_product public.products%rowtype;
  v_delta numeric(12, 3);
  v_previous_qty numeric(12, 3);
  v_resulting_qty numeric(12, 3);
  v_movement public.stock_movements%rowtype;
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

  -- Proteção contra retry / duplo toque (RF-035):
  -- Se esta chave já foi processada neste workspace, retorna o movimento original sem duplicar.
  select *
  into v_existing
  from public.stock_movements sm
  where sm.workspace_id = p_workspace_id
    and sm.idempotency_key = v_clean_key;

  if found then
    return jsonb_build_object(
      'movement_id', v_existing.id,
      'workspace_id', v_existing.workspace_id,
      'product_id', v_existing.product_id,
      'movement_type', v_existing.movement_type,
      'quantity_delta', v_existing.quantity_delta,
      'previous_stock_qty', v_existing.previous_stock_qty,
      'resulting_stock_qty', v_existing.resulting_stock_qty,
      'reason', v_existing.reason,
      'created_at', v_existing.created_at,
      'idempotent_replay', true
    );
  end if;

  if p_movement_type not in (
    'entry'::public.stock_movement_type,
    'adjustment_in'::public.stock_movement_type,
    'adjustment_out'::public.stock_movement_type,
    'damage'::public.stock_movement_type,
    'return_in'::public.stock_movement_type
  ) then
    raise exception 'Tipo de movimentação inválido para ajuste manual de estoque.'
      using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 999999 then
    raise exception 'A quantidade movimentada deve ser maior que zero.'
      using errcode = '22023';
  end if;

  v_clean_reason := nullif(trim(coalesce(p_reason, '')), '');
  if p_movement_type in (
    'adjustment_in'::public.stock_movement_type,
    'adjustment_out'::public.stock_movement_type,
    'damage'::public.stock_movement_type
  ) and (v_clean_reason is null or char_length(v_clean_reason) < 3) then
    raise exception 'Informe um motivo válido (mínimo de 3 caracteres) para ajustes ou avarias.'
      using errcode = '22023';
  end if;

  -- Bloqueia a linha do produto para evitar condição de corrida
  select *
  into v_product
  from public.products p
  where p.id = p_product_id
    and p.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Produto não encontrado neste espaço de trabalho.'
      using errcode = 'P0002';
  end if;

  if p_movement_type in (
    'entry'::public.stock_movement_type,
    'adjustment_in'::public.stock_movement_type,
    'return_in'::public.stock_movement_type
  ) then
    v_delta := round(p_quantity, 3);
  else
    v_delta := -round(p_quantity, 3);
  end if;

  v_previous_qty := v_product.current_stock_qty;
  v_resulting_qty := v_previous_qty + v_delta;

  -- Impede saldo negativo por padrão (RF-034)
  if v_resulting_qty < 0 then
    raise exception 'Saldo de estoque insuficiente para esta saída (disponível: %, solicitado: %).',
      v_previous_qty, round(p_quantity, 3)
      using errcode = '22023';
  end if;

  update public.products
  set current_stock_qty = v_resulting_qty
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
    created_by
  )
  values (
    p_workspace_id,
    v_product.id,
    p_movement_type,
    v_delta,
    v_previous_qty,
    v_resulting_qty,
    v_clean_reason,
    v_clean_key,
    'manual_adjustment',
    v_user_id
  )
  returning * into v_movement;

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
    'stock.adjusted',
    'stock_movement',
    v_movement.id,
    jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'movement_type', p_movement_type,
      'quantity_delta', v_delta,
      'previous_stock_qty', v_previous_qty,
      'resulting_stock_qty', v_resulting_qty
    )
  );

  return jsonb_build_object(
    'movement_id', v_movement.id,
    'workspace_id', v_movement.workspace_id,
    'product_id', v_movement.product_id,
    'movement_type', v_movement.movement_type,
    'quantity_delta', v_movement.quantity_delta,
    'previous_stock_qty', v_movement.previous_stock_qty,
    'resulting_stock_qty', v_movement.resulting_stock_qty,
    'reason', v_movement.reason,
    'created_at', v_movement.created_at,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.adjust_stock(
  uuid,
  uuid,
  public.stock_movement_type,
  numeric,
  text,
  text
) from public;

grant execute on function public.adjust_stock(
  uuid,
  uuid,
  public.stock_movement_type,
  numeric,
  text,
  text
) to authenticated;

commit;
