-- =============================================================================
-- VendeFácil — Migração: Suporte a Venda com Data Retroativa (sale_date)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Adicionar coluna sale_date na tabela sales
-- -----------------------------------------------------------------------------
alter table public.sales
  add column if not exists sale_date date not null default current_date;

-- Preenche registros existentes com base em created_at caso necessário
update public.sales
set sale_date = (created_at at time zone 'America/Sao_Paulo')::date
where sale_date is null;

-- Índice para consultas ordenadas por data da venda no workspace
create index if not exists idx_sales_workspace_sale_date
  on public.sales (workspace_id, sale_date desc, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Atualizar internal de parcelamento para respeitar a data da venda
-- -----------------------------------------------------------------------------
create or replace function public.generate_sale_installments_internal(
  p_sale public.sales,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_installment public.installments%rowtype;
  v_payment public.payments%rowtype;
  v_count integer;
  v_first_due date;
  v_base_amount integer;
  v_remainder integer;
  v_parcel_amount integer;
  v_due_date date;
  v_sale_date date;
  v_paid_timestamp timestamptz;
begin
  v_sale_date := coalesce(p_sale.sale_date, p_sale.confirmed_at::date, current_date);
  -- Combina a data da venda retroativa com a hora de confirmação/agora para manter timestamp válido
  v_paid_timestamp := (v_sale_date::text || ' ' || to_char(coalesce(p_sale.confirmed_at, now()), 'HH24:MI:SSOF'))::timestamptz;

  -- Caso 1: Venda À Vista (Cash)
  if p_sale.payment_mode = 'cash' then
    insert into public.installments (
      workspace_id,
      sale_id,
      customer_id,
      customer_name_snapshot,
      installment_number,
      total_installments,
      due_date,
      principal_cents,
      paid_principal_cents,
      accrued_fine_cents,
      accrued_interest_cents,
      paid_total_cents,
      remaining_principal_cents,
      status,
      paid_at,
      notes
    )
    values (
      p_sale.workspace_id,
      p_sale.id,
      p_sale.customer_id,
      p_sale.customer_name_snapshot,
      1,
      1,
      v_sale_date,
      p_sale.total_cents,
      p_sale.total_cents,
      0,
      0,
      p_sale.total_cents,
      0,
      'paid',
      v_paid_timestamp,
      'Pagamento à vista no ato da venda'
    )
    returning * into v_installment;

    insert into public.payments (
      workspace_id,
      sale_id,
      customer_id,
      payment_method,
      amount_cents,
      principal_allocated_cents,
      fine_cents,
      interest_cents,
      paid_at,
      notes,
      idempotency_key,
      created_by
    )
    values (
      p_sale.workspace_id,
      p_sale.id,
      p_sale.customer_id,
      p_sale.payment_method,
      p_sale.total_cents,
      p_sale.total_cents,
      0,
      0,
      v_paid_timestamp,
      'Recebimento à vista da venda',
      'sale_cash_' || replace(p_sale.id::text, '-', ''),
      p_actor_user_id
    )
    returning * into v_payment;

    insert into public.payment_allocations (
      workspace_id,
      payment_id,
      installment_id,
      principal_allocated_cents,
      fine_allocated_cents,
      interest_allocated_cents,
      total_allocated_cents
    )
    values (
      p_sale.workspace_id,
      v_payment.id,
      v_installment.id,
      p_sale.total_cents,
      0,
      0,
      p_sale.total_cents
    );

    return;
  end if;

  -- Caso 2: Venda Parcelada / A Prazo (Fiado)
  v_count := greatest(coalesce(p_sale.installment_count, 1), 1);
  v_first_due := coalesce(p_sale.first_due_date, (v_sale_date + interval '30 days')::date);

  -- Se houver entrada parcial > 0, registra a entrada como parcela 0 já paga
  if p_sale.down_payment_cents > 0 then
    insert into public.installments (
      workspace_id,
      sale_id,
      customer_id,
      customer_name_snapshot,
      installment_number,
      total_installments,
      due_date,
      principal_cents,
      paid_principal_cents,
      accrued_fine_cents,
      accrued_interest_cents,
      paid_total_cents,
      remaining_principal_cents,
      status,
      paid_at,
      notes
    )
    values (
      p_sale.workspace_id,
      p_sale.id,
      p_sale.customer_id,
      p_sale.customer_name_snapshot,
      0,
      v_count,
      v_sale_date,
      p_sale.down_payment_cents,
      p_sale.down_payment_cents,
      0,
      0,
      p_sale.down_payment_cents,
      0,
      'paid',
      v_paid_timestamp,
      'Entrada recebida no ato da venda'
    )
    returning * into v_installment;

    insert into public.payments (
      workspace_id,
      sale_id,
      customer_id,
      payment_method,
      amount_cents,
      principal_allocated_cents,
      fine_cents,
      interest_cents,
      paid_at,
      notes,
      idempotency_key,
      created_by
    )
    values (
      p_sale.workspace_id,
      p_sale.id,
      p_sale.customer_id,
      p_sale.payment_method,
      p_sale.down_payment_cents,
      p_sale.down_payment_cents,
      0,
      0,
      v_paid_timestamp,
      'Entrada da venda parcelada',
      'sale_down_' || replace(p_sale.id::text, '-', ''),
      p_actor_user_id
    )
    returning * into v_payment;

    insert into public.payment_allocations (
      workspace_id,
      payment_id,
      installment_id,
      principal_allocated_cents,
      fine_allocated_cents,
      interest_allocated_cents,
      total_allocated_cents
    )
    values (
      p_sale.workspace_id,
      v_payment.id,
      v_installment.id,
      p_sale.down_payment_cents,
      0,
      0,
      p_sale.down_payment_cents
    );
  end if;

  v_base_amount := (p_sale.total_cents - coalesce(p_sale.down_payment_cents, 0)) / v_count;
  v_remainder := mod(p_sale.total_cents - coalesce(p_sale.down_payment_cents, 0), v_count);

  for i in 1..v_count loop
    if i <= v_remainder then
      v_parcel_amount := v_base_amount + 1;
    else
      v_parcel_amount := v_base_amount;
    end if;

    v_due_date := (v_first_due + ((i - 1) * interval '1 month'))::date;

    insert into public.installments (
      workspace_id,
      sale_id,
      customer_id,
      customer_name_snapshot,
      installment_number,
      total_installments,
      due_date,
      principal_cents,
      paid_principal_cents,
      accrued_fine_cents,
      accrued_interest_cents,
      paid_total_cents,
      remaining_principal_cents,
      status
    )
    values (
      p_sale.workspace_id,
      p_sale.id,
      p_sale.customer_id,
      p_sale.customer_name_snapshot,
      i,
      v_count,
      v_due_date,
      v_parcel_amount,
      0,
      0,
      0,
      0,
      v_parcel_amount,
      'pending'
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Atualizar create_or_confirm_sale com parâmetro p_sale_date
-- -----------------------------------------------------------------------------
drop function if exists public.create_or_confirm_sale(
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean,
  text,
  public.sale_payment_mode,
  public.payment_method,
  integer,
  integer,
  date
);

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

  -- Validação de segurança: Não permitir vendas com data futura
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
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty
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
-- 4. Atualizar update_draft_sale com parâmetro p_sale_date
-- -----------------------------------------------------------------------------
drop function if exists public.update_draft_sale(
  uuid,
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean,
  public.sale_payment_mode,
  public.payment_method,
  integer,
  integer,
  date
);

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
      round(sum((elem ->> 'quantity')::numeric), 3) as total_qty
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

    v_line_total := round(v_item.total_qty * v_product.price_cents)::integer;
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
