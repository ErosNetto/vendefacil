-- =============================================================================
-- VendeFácil — Migração 11: Preço/Custo por Entrada de Estoque e Preço Negociado na Venda
-- =============================================================================
-- 1. Adiciona unit_cost_cents e unit_price_cents em public.stock_movements
--    para registrar quanto foi pago e qual preço de venda foi definido em cada lote/entrada.
-- 2. Atualiza public.adjust_stock para aceitar p_unit_cost_cents e p_unit_price_cents,
--    atualizando atomicamente o produto e gravando no histórico de movimentações.
-- 3. Atualiza public.create_or_confirm_sale e public.update_draft_sale para aceitar
--    unit_price_cents opcional por item no array JSONB p_items (preço negociado na venda).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Novas colunas em public.stock_movements
-- -----------------------------------------------------------------------------
alter table public.stock_movements
  add column if not exists unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  add column if not exists unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0);

-- -----------------------------------------------------------------------------
-- 2. Atualizar RPC public.adjust_stock com suporte a custo e preço na entrada
-- -----------------------------------------------------------------------------
drop function if exists public.adjust_stock(
  uuid,
  uuid,
  public.stock_movement_type,
  numeric,
  text,
  text
);

create or replace function public.adjust_stock(
  p_workspace_id uuid,
  p_product_id uuid,
  p_movement_type public.stock_movement_type,
  p_quantity numeric,
  p_reason text default null,
  p_idempotency_key text default null,
  p_unit_cost_cents integer default null,
  p_unit_price_cents integer default null
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
  v_new_cost_cents integer;
  v_new_price_cents integer;
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
      'unit_cost_cents', v_existing.unit_cost_cents,
      'unit_price_cents', v_existing.unit_price_cents,
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

  if p_unit_cost_cents is not null and p_unit_cost_cents < 0 then
    raise exception 'O custo unitário não pode ser negativo.'
      using errcode = '22023';
  end if;

  if p_unit_price_cents is not null and p_unit_price_cents < 0 then
    raise exception 'O preço de venda não pode ser negativo.'
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

  if v_resulting_qty < 0 then
    raise exception 'Saldo de estoque insuficiente para esta saída (disponível: %, solicitado: %).',
      v_previous_qty, round(p_quantity, 3)
      using errcode = '22023';
  end if;

  v_new_cost_cents := case
    when p_movement_type = 'entry' and p_unit_cost_cents is not null then p_unit_cost_cents
    else v_product.cost_cents
  end;

  v_new_price_cents := case
    when p_movement_type = 'entry' and p_unit_price_cents is not null then p_unit_price_cents
    else v_product.price_cents
  end;

  update public.products
  set
    current_stock_qty = v_resulting_qty,
    cost_cents = v_new_cost_cents,
    price_cents = v_new_price_cents,
    updated_at = now()
  where id = v_product.id
    and workspace_id = p_workspace_id;

  insert into public.stock_movements (
    workspace_id,
    product_id,
    movement_type,
    quantity_delta,
    previous_stock_qty,
    resulting_stock_qty,
    unit_cost_cents,
    unit_price_cents,
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
    case when p_movement_type = 'entry' then v_new_cost_cents else v_product.cost_cents end,
    case when p_movement_type = 'entry' then v_new_price_cents else v_product.price_cents end,
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
      'resulting_stock_qty', v_resulting_qty,
      'previous_cost_cents', v_product.cost_cents,
      'new_cost_cents', v_new_cost_cents,
      'previous_price_cents', v_product.price_cents,
      'new_price_cents', v_new_price_cents
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
    'unit_cost_cents', v_movement.unit_cost_cents,
    'unit_price_cents', v_movement.unit_price_cents,
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
  text,
  integer,
  integer
) from public;

grant execute on function public.adjust_stock(
  uuid,
  uuid,
  public.stock_movement_type,
  numeric,
  text,
  text,
  integer,
  integer
) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Atualizar create_or_confirm_sale para suportar unit_price_cents opcional por item
-- -----------------------------------------------------------------------------
create or replace function public.create_or_confirm_sale(
  p_workspace_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount_cents integer default 0,
  p_notes text default null,
  p_confirm_immediately boolean default true,
  p_idempotency_key text default null,
  p_payment_mode public.sale_payment_mode default 'cash',
  p_payment_method public.payment_method default 'pix',
  p_down_payment_cents integer default 0,
  p_installment_count integer default 1,
  p_first_due_date date default null,
  p_sale_date date default null
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
  v_effective_price integer;
  v_line_total integer;
  v_line_cost integer;
  v_prev_stock numeric(12, 3);
  v_new_stock numeric(12, 3);
  v_item_index integer := 0;
  v_pay_mode public.sale_payment_mode := coalesce(p_payment_mode, 'cash');
  v_pay_method public.payment_method := coalesce(p_payment_method, 'pix');
  v_down_cents integer := coalesce(p_down_payment_cents, 0);
  v_inst_count integer := coalesce(p_installment_count, 1);
  v_sale_date date := coalesce(p_sale_date, current_date);
  v_first_due date := p_first_due_date;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado a este espaço de trabalho.' using errcode = '42501';
  end if;

  if v_sale_date > current_date then
    raise exception 'A data da venda não pode ser no futuro. Para encomendas ou agendamentos, salve como rascunho.'
      using errcode = '22023';
  end if;

  v_clean_key := trim(coalesce(p_idempotency_key, ''));
  if char_length(v_clean_key) < 6 or char_length(v_clean_key) > 120 then
    raise exception 'Chave de idempotência inválida (deve ter entre 6 e 120 caracteres).'
      using errcode = '22023';
  end if;

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
      'sale_date', v_existing_sale.sale_date,
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

  if p_customer_id is not null then
    select *
    into v_customer
    from public.customers c
    where c.id = p_customer_id
      and c.workspace_id = p_workspace_id;

    if not found then
      raise exception 'Cliente selecionado não existe ou não pertence a este espaço.'
        using errcode = 'P0002';
    end if;

    if v_customer.is_archived then
      raise exception 'Não é possível vincular um cliente arquivado à venda.'
        using errcode = '22023';
    end if;

    v_customer_name := v_customer.full_name;
  end if;

  v_clean_notes := nullif(trim(coalesce(p_notes, '')), '');
  if v_clean_notes is not null and char_length(v_clean_notes) > 500 then
    raise exception 'As observações da venda devem ter no máximo 500 caracteres.'
      using errcode = '22023';
  end if;

  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty,
      max(
        case
          when (elem ? 'unit_price_cents') and (elem ->> 'unit_price_cents') is not null
          then (elem ->> 'unit_price_cents')::integer
          else null
        end
      ) as custom_unit_price_cents
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'product_id')::uuid
    order by (elem ->> 'product_id')::uuid
  loop
    if v_item.product_id is null then
      raise exception 'Identificador de produto inválido nos itens da venda.'
        using errcode = '22023';
    end if;

    if v_item.total_qty is null or v_item.total_qty <= 0 then
      raise exception 'A quantidade de cada produto deve ser maior que zero.'
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

    v_effective_price := coalesce(v_item.custom_unit_price_cents, v_product.price_cents);
    if v_effective_price < 0 then
      raise exception 'O preço unitário do produto "%" não pode ser negativo.', v_product.name
        using errcode = '22023';
    end if;

    v_line_total := round(v_item.total_qty * v_effective_price)::integer;
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

  if v_pay_mode = 'cash' then
    v_down_cents := 0;
    v_inst_count := 1;
    v_first_due := null;
  else
    if v_down_cents < 0 or v_down_cents >= v_total_cents then
      raise exception 'O valor de entrada deve ser menor que o total da venda na modalidade parcelada.'
        using errcode = '22023';
    end if;
    if v_inst_count < 1 or v_inst_count > 36 then
      raise exception 'O número de parcelas deve estar entre 1 e 36.'
        using errcode = '22023';
    end if;
    if (v_total_cents - v_down_cents) < v_inst_count then
      raise exception 'O saldo a parcelar é insuficiente para o número de parcelas escolhido.'
        using errcode = '22023';
    end if;
    v_first_due := coalesce(v_first_due, (v_sale_date + interval '30 days')::date);
  end if;

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
    payment_mode,
    payment_method,
    down_payment_cents,
    installment_count,
    first_due_date,
    sale_date,
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
    v_pay_mode,
    v_pay_method,
    v_down_cents,
    v_inst_count,
    v_first_due,
    v_sale_date,
    case when p_confirm_immediately then now() else null end,
    v_user_id
  )
  returning * into v_sale;

  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty,
      max(
        case
          when (elem ? 'unit_price_cents') and (elem ->> 'unit_price_cents') is not null
          then (elem ->> 'unit_price_cents')::integer
          else null
        end
      ) as custom_unit_price_cents
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
    v_effective_price := coalesce(v_item.custom_unit_price_cents, v_product.price_cents);
    v_line_total := round(v_qty * v_effective_price)::integer;
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
      v_effective_price,
      v_product.cost_cents,
      v_line_total,
      v_line_cost
    );

    if p_confirm_immediately then
      v_prev_stock := v_product.current_stock_qty;
      v_new_stock := v_prev_stock - v_qty;

      update public.products
      set
        current_stock_qty = v_new_stock,
        updated_at = now()
      where id = v_product.id
        and workspace_id = p_workspace_id;

      insert into public.stock_movements (
        workspace_id,
        product_id,
        movement_type,
        quantity_delta,
        previous_stock_qty,
        resulting_stock_qty,
        unit_cost_cents,
        unit_price_cents,
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
        v_product.cost_cents,
        v_effective_price,
        coalesce('Venda confirmada' || case when v_customer_name is not null then ' - ' || v_customer_name else '' end, 'Venda confirmada'),
        left(v_clean_key, 95) || '_item_' || v_item_index::text,
        'sale',
        v_sale.id,
        v_user_id
      );
    end if;
  end loop;

  if p_confirm_immediately then
    perform public.generate_sale_installments_internal(v_sale, v_user_id);
  end if;

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
      'sale_date', v_sale.sale_date,
      'payment_mode', v_sale.payment_mode,
      'installment_count', v_sale.installment_count
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
    'sale_date', v_sale.sale_date,
    'created_at', v_sale.created_at,
    'idempotent_replay', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Atualizar update_draft_sale para suportar unit_price_cents opcional por item
-- -----------------------------------------------------------------------------
create or replace function public.update_draft_sale(
  p_workspace_id uuid,
  p_sale_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount_cents integer default 0,
  p_notes text default null,
  p_confirm_immediately boolean default false,
  p_payment_mode public.sale_payment_mode default 'cash',
  p_payment_method public.payment_method default 'pix',
  p_down_payment_cents integer default 0,
  p_installment_count integer default 1,
  p_first_due_date date default null,
  p_sale_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_existing_sale public.sales%rowtype;
  v_customer public.customers%rowtype;
  v_customer_name text := null;
  v_discount integer := coalesce(p_discount_cents, 0);
  v_subtotal_cents integer := 0;
  v_estimated_cost_cents integer := 0;
  v_total_cents integer := 0;
  v_estimated_profit_cents integer := 0;
  v_item_count integer := 0;
  v_item record;
  v_product public.products%rowtype;
  v_qty numeric(12, 3);
  v_effective_price integer;
  v_line_total integer;
  v_line_cost integer;
  v_prev_stock numeric(12, 3);
  v_new_stock numeric(12, 3);
  v_item_index integer := 0;
  v_sale public.sales%rowtype;
  v_pay_mode public.sale_payment_mode := coalesce(p_payment_mode, 'cash');
  v_pay_method public.payment_method := coalesce(p_payment_method, 'pix');
  v_down_cents integer := coalesce(p_down_payment_cents, 0);
  v_inst_count integer := coalesce(p_installment_count, 1);
  v_sale_date date;
  v_first_due date := p_first_due_date;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado a este espaço de trabalho.' using errcode = '42501';
  end if;

  select *
  into v_existing_sale
  from public.sales s
  where s.id = p_sale_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Venda em rascunho não encontrada.' using errcode = 'P0002';
  end if;

  if v_existing_sale.status <> 'draft' then
    raise exception 'Apenas vendas em rascunho podem ser alteradas.' using errcode = '22023';
  end if;

  v_sale_date := coalesce(p_sale_date, v_existing_sale.sale_date, current_date);
  if v_sale_date > current_date then
    raise exception 'A data da venda não pode ser no futuro. Para encomendas ou agendamentos, salve como rascunho.'
      using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um produto válido na venda.' using errcode = '22023';
  end if;

  if v_discount < 0 then
    raise exception 'O desconto não pode ser negativo.' using errcode = '22023';
  end if;

  if p_customer_id is not null then
    select *
    into v_customer
    from public.customers c
    where c.id = p_customer_id
      and c.workspace_id = p_workspace_id;

    if not found then
      raise exception 'Cliente selecionado não existe ou não pertence a este espaço.' using errcode = 'P0002';
    end if;

    if v_customer.is_archived then
      raise exception 'Não é possível vincular um cliente arquivado à venda.' using errcode = '22023';
    end if;

    v_customer_name := v_customer.full_name;
  end if;

  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty,
      max(
        case
          when (elem ? 'unit_price_cents') and (elem ->> 'unit_price_cents') is not null
          then (elem ->> 'unit_price_cents')::integer
          else null
        end
      ) as custom_unit_price_cents
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'product_id')::uuid
    order by (elem ->> 'product_id')::uuid
  loop
    if v_item.product_id is null or v_item.total_qty is null or v_item.total_qty <= 0 then
      raise exception 'Itens da venda inválidos.' using errcode = '22023';
    end if;

    select *
    into v_product
    from public.products p
    where p.id = v_item.product_id
      and p.workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception 'Produto não encontrado neste espaço de trabalho.' using errcode = 'P0002';
    end if;

    if v_product.is_archived then
      raise exception 'O produto "%" está arquivado e não pode ser vendido.', v_product.name using errcode = '22023';
    end if;

    if p_confirm_immediately and v_product.current_stock_qty < v_item.total_qty then
      raise exception 'Estoque insuficiente para "%" (disponível: % un., solicitado: % un.).',
        v_product.name, v_product.current_stock_qty, v_item.total_qty using errcode = '22023';
    end if;

    v_effective_price := coalesce(v_item.custom_unit_price_cents, v_product.price_cents);
    if v_effective_price < 0 then
      raise exception 'O preço unitário do produto "%" não pode ser negativo.', v_product.name
        using errcode = '22023';
    end if;

    v_line_total := round(v_item.total_qty * v_effective_price)::integer;
    v_line_cost := round(v_item.total_qty * v_product.cost_cents)::integer;

    v_subtotal_cents := v_subtotal_cents + v_line_total;
    v_estimated_cost_cents := v_estimated_cost_cents + v_line_cost;
    v_item_count := v_item_count + 1;
  end loop;

  if v_discount > v_subtotal_cents then
    raise exception 'O desconto (%) não pode ser maior que o subtotal da venda (%).',
      v_discount, v_subtotal_cents using errcode = '22023';
  end if;

  v_total_cents := v_subtotal_cents - v_discount;
  v_estimated_profit_cents := v_total_cents - v_estimated_cost_cents;

  if v_pay_mode = 'cash' then
    v_down_cents := 0;
    v_inst_count := 1;
    v_first_due := null;
  else
    if v_down_cents < 0 or v_down_cents >= v_total_cents then
      raise exception 'O valor de entrada deve ser menor que o total da venda na modalidade parcelada.' using errcode = '22023';
    end if;
    if v_inst_count < 1 or v_inst_count > 36 then
      raise exception 'O número de parcelas deve estar entre 1 e 36.' using errcode = '22023';
    end if;
    if (v_total_cents - v_down_cents) < v_inst_count then
      raise exception 'O saldo a parcelar é insuficiente para o número de parcelas escolhido.' using errcode = '22023';
    end if;
    v_first_due := coalesce(v_first_due, (v_sale_date + interval '30 days')::date);
  end if;

  delete from public.sale_items
  where sale_id = v_existing_sale.id
    and workspace_id = p_workspace_id;

  update public.sales
  set
    customer_id = p_customer_id,
    customer_name_snapshot = v_customer_name,
    status = case when p_confirm_immediately then 'confirmed'::public.sale_status else 'draft'::public.sale_status end,
    subtotal_cents = v_subtotal_cents,
    discount_cents = v_discount,
    total_cents = v_total_cents,
    estimated_cost_cents = v_estimated_cost_cents,
    estimated_profit_cents = v_estimated_profit_cents,
    item_count = v_item_count,
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    payment_mode = v_pay_mode,
    payment_method = v_pay_method,
    down_payment_cents = v_down_cents,
    installment_count = v_inst_count,
    first_due_date = v_first_due,
    sale_date = v_sale_date,
    confirmed_at = case when p_confirm_immediately then now() else null end,
    updated_at = now()
  where id = v_existing_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  for v_item in
    select
      (elem ->> 'product_id')::uuid as product_id,
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty,
      max(
        case
          when (elem ? 'unit_price_cents') and (elem ->> 'unit_price_cents') is not null
          then (elem ->> 'unit_price_cents')::integer
          else null
        end
      ) as custom_unit_price_cents
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
    v_effective_price := coalesce(v_item.custom_unit_price_cents, v_product.price_cents);
    v_line_total := round(v_qty * v_effective_price)::integer;
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
      v_effective_price,
      v_product.cost_cents,
      v_line_total,
      v_line_cost
    );

    if p_confirm_immediately then
      v_prev_stock := v_product.current_stock_qty;
      v_new_stock := v_prev_stock - v_qty;

      update public.products
      set
        current_stock_qty = v_new_stock,
        updated_at = now()
      where id = v_product.id
        and workspace_id = p_workspace_id;

      insert into public.stock_movements (
        workspace_id,
        product_id,
        movement_type,
        quantity_delta,
        previous_stock_qty,
        resulting_stock_qty,
        unit_cost_cents,
        unit_price_cents,
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
        v_product.cost_cents,
        v_effective_price,
        coalesce('Confirmação de rascunho' || case when v_customer_name is not null then ' - ' || v_customer_name else '' end, 'Confirmação de rascunho'),
        'draft_confirm_' || replace(v_sale.id::text, '-', '') || '_' || v_item_index::text,
        'sale',
        v_sale.id,
        v_user_id
      );
    end if;
  end loop;

  if p_confirm_immediately then
    perform public.generate_sale_installments_internal(v_sale, v_user_id);
  end if;

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
    case when p_confirm_immediately then 'sale.confirmed' else 'sale.draft_updated' end,
    'sale',
    v_sale.id,
    jsonb_build_object(
      'status', v_sale.status,
      'total_cents', v_sale.total_cents,
      'sale_date', v_sale.sale_date,
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
    'sale_date', v_sale.sale_date,
    'created_at', v_sale.created_at,
    'idempotent_replay', false
  );
end;
$$;

commit;
