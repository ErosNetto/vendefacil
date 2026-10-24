-- =============================================================================
-- VendeFácil — Fase 6: Financeiro, Parcelas, Contas a Receber e Regras de Juros/Multa
-- =============================================================================
-- Objetivo:
-- 1. Adicionar configuração de multa, juros de mora ao mês e dias de carência em
--    public.workspaces (padrão configurável pelo usuário: 2% multa, 1% a.m., 0 dias).
-- 2. Criar enums e tabelas public.installments, public.payments e
--    public.payment_allocations com RLS estrito por workspace e FKs compostas.
-- 3. Evoluir public.sales e as RPCs de vendas para suportar pagamento à vista
--    ou parcelado/a prazo com entrada opcional e divisão exata de centavos.
-- 4. Implementar RPCs transacionais e idempotentes:
--    - public.update_workspace_finance_settings(...)
--    - public.record_installment_payment(...) (suporta baixa total/parcial,
--      alocação em múltiplas parcelas e juros/multa editáveis na hora).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Enums Financeiros
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_method'
      and n.nspname = 'public'
  ) then
    create type public.payment_method as enum (
      'pix',
      'cash',
      'credit_card',
      'debit_card',
      'bank_transfer',
      'other'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'installment_status'
      and n.nspname = 'public'
  ) then
    create type public.installment_status as enum (
      'pending',
      'partial',
      'paid',
      'cancelled'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'sale_payment_mode'
      and n.nspname = 'public'
  ) then
    create type public.sale_payment_mode as enum (
      'cash',
      'installments'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Configurações Padrão de Juros e Multa em public.workspaces (RF-056)
-- -----------------------------------------------------------------------------
alter table public.workspaces
  add column if not exists late_fee_enabled boolean not null default true,
  add column if not exists default_fine_percent numeric(6, 2) not null default 2.00
    check (default_fine_percent >= 0 and default_fine_percent <= 100),
  add column if not exists default_monthly_interest_percent numeric(6, 2) not null default 1.00
    check (default_monthly_interest_percent >= 0 and default_monthly_interest_percent <= 100),
  add column if not exists grace_period_days integer not null default 0
    check (grace_period_days >= 0 and grace_period_days <= 365);

-- -----------------------------------------------------------------------------
-- 3. Colunas de Condição de Pagamento em public.sales (RF-050)
-- -----------------------------------------------------------------------------
alter table public.sales
  add column if not exists payment_mode public.sale_payment_mode not null default 'cash',
  add column if not exists payment_method public.payment_method not null default 'pix',
  add column if not exists down_payment_cents integer not null default 0
    check (down_payment_cents >= 0),
  add column if not exists installment_count integer not null default 1
    check (installment_count >= 1 and installment_count <= 36),
  add column if not exists first_due_date date null;

-- -----------------------------------------------------------------------------
-- 4. Tabela: public.installments (Parcelas / Contas a Receber — RF-051, RF-054)
-- -----------------------------------------------------------------------------
create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sale_id uuid not null,
  customer_id uuid null,
  customer_name_snapshot text null,
  installment_number integer not null check (installment_number >= 0 and installment_number <= 36),
  total_installments integer not null check (total_installments >= 1 and total_installments <= 36),
  due_date date not null,
  principal_cents integer not null check (principal_cents > 0),
  paid_principal_cents integer not null default 0
    check (paid_principal_cents >= 0 and paid_principal_cents <= principal_cents),
  accrued_fine_cents integer not null default 0 check (accrued_fine_cents >= 0),
  accrued_interest_cents integer not null default 0 check (accrued_interest_cents >= 0),
  paid_total_cents integer not null default 0 check (paid_total_cents >= 0),
  remaining_principal_cents integer not null check (remaining_principal_cents >= 0),
  status public.installment_status not null default 'pending',
  paid_at timestamptz null,
  cancelled_at timestamptz null,
  notes text null check (notes is null or char_length(trim(notes)) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installments_id_workspace_unique unique (id, workspace_id),
  constraint installments_principal_balance_check
    check (paid_principal_cents + remaining_principal_cents = principal_cents),
  constraint installments_paid_total_check
    check (paid_total_cents = paid_principal_cents + accrued_fine_cents + accrued_interest_cents),
  constraint installments_sale_workspace_fkey
    foreign key (sale_id, workspace_id)
    references public.sales (id, workspace_id)
    on delete cascade,
  constraint installments_customer_workspace_fkey
    foreign key (customer_id, workspace_id)
    references public.customers (id, workspace_id)
    on delete set null
);

create index if not exists idx_installments_workspace_due_status
  on public.installments (workspace_id, status, due_date asc);

create index if not exists idx_installments_workspace_sale
  on public.installments (workspace_id, sale_id, installment_number asc);

create index if not exists idx_installments_workspace_customer
  on public.installments (workspace_id, customer_id, due_date asc);

drop trigger if exists trg_installments_set_updated_at on public.installments;
create trigger trg_installments_set_updated_at
before update on public.installments
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Tabela: public.payments (Eventos Históricos de Recebimento — RF-052, RF-055)
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sale_id uuid null,
  customer_id uuid null,
  payment_method public.payment_method not null default 'pix',
  amount_cents integer not null check (amount_cents > 0),
  principal_allocated_cents integer not null check (principal_allocated_cents > 0),
  fine_cents integer not null default 0 check (fine_cents >= 0),
  interest_cents integer not null default 0 check (interest_cents >= 0),
  paid_at timestamptz not null default now(),
  notes text null check (notes is null or char_length(trim(notes)) <= 300),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 6 and 120),
  is_reversed boolean not null default false,
  reversed_at timestamptz null,
  reversal_reason text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_id_workspace_unique unique (id, workspace_id),
  constraint payments_workspace_idempotency_unique unique (workspace_id, idempotency_key),
  constraint payments_amount_composition_check
    check (amount_cents = principal_allocated_cents + fine_cents + interest_cents),
  constraint payments_sale_workspace_fkey
    foreign key (sale_id, workspace_id)
    references public.sales (id, workspace_id)
    on delete set null,
  constraint payments_customer_workspace_fkey
    foreign key (customer_id, workspace_id)
    references public.customers (id, workspace_id)
    on delete set null
);

create index if not exists idx_payments_workspace_paid_at
  on public.payments (workspace_id, paid_at desc);

create index if not exists idx_payments_workspace_sale
  on public.payments (workspace_id, sale_id, paid_at desc);

create index if not exists idx_payments_workspace_customer
  on public.payments (workspace_id, customer_id, paid_at desc);

-- -----------------------------------------------------------------------------
-- 6. Tabela: public.payment_allocations (Alocações por Parcela — RF-053)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  payment_id uuid not null,
  installment_id uuid not null,
  principal_allocated_cents integer not null check (principal_allocated_cents > 0),
  fine_allocated_cents integer not null default 0 check (fine_allocated_cents >= 0),
  interest_allocated_cents integer not null default 0 check (interest_allocated_cents >= 0),
  total_allocated_cents integer not null check (total_allocated_cents > 0),
  created_at timestamptz not null default now(),
  constraint payment_allocations_sum_check
    check (total_allocated_cents = principal_allocated_cents + fine_allocated_cents + interest_allocated_cents),
  constraint payment_allocations_payment_workspace_fkey
    foreign key (payment_id, workspace_id)
    references public.payments (id, workspace_id)
    on delete cascade,
  constraint payment_allocations_installment_workspace_fkey
    foreign key (installment_id, workspace_id)
    references public.installments (id, workspace_id)
    on delete cascade
);

create index if not exists idx_payment_allocations_workspace_installment
  on public.payment_allocations (workspace_id, installment_id);

create index if not exists idx_payment_allocations_workspace_payment
  on public.payment_allocations (workspace_id, payment_id);

-- -----------------------------------------------------------------------------
-- 7. Row Level Security (RLS) e Grants de Leitura
--    (Escritas acontecem exclusivamente via RPCs atômicas e auditáveis)
-- -----------------------------------------------------------------------------
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

drop policy if exists installments_select_member on public.installments;
create policy installments_select_member
on public.installments
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists payments_select_member on public.payments;
create policy payments_select_member
on public.payments
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists payment_allocations_select_member on public.payment_allocations;
create policy payment_allocations_select_member
on public.payment_allocations
for select
to authenticated
using (public.is_workspace_member(workspace_id));

grant select on public.installments to authenticated;
grant select on public.payments to authenticated;
grant select on public.payment_allocations to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC: update_workspace_finance_settings (Configuração de Multa/Juros/Carência)
-- -----------------------------------------------------------------------------
create or replace function public.update_workspace_finance_settings(
  p_workspace_id uuid,
  p_late_fee_enabled boolean,
  p_default_fine_percent numeric,
  p_default_monthly_interest_percent numeric,
  p_grace_period_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_fine numeric(6, 2);
  v_interest numeric(6, 2);
  v_grace integer;
  v_workspace public.workspaces%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado a este espaço de trabalho.' using errcode = '42501';
  end if;

  v_fine := round(coalesce(p_default_fine_percent, 0), 2);
  v_interest := round(coalesce(p_default_monthly_interest_percent, 0), 2);
  v_grace := coalesce(p_grace_period_days, 0);

  if v_fine < 0 or v_fine > 100 then
    raise exception 'A multa padrão deve estar entre 0%% e 100%%.'
      using errcode = '22023';
  end if;

  if v_interest < 0 or v_interest > 100 then
    raise exception 'Os juros mensais padrão devem estar entre 0%% e 100%%.'
      using errcode = '22023';
  end if;

  if v_grace < 0 or v_grace > 365 then
    raise exception 'Os dias de carência devem estar entre 0 e 365.'
      using errcode = '22023';
  end if;

  update public.workspaces
  set
    late_fee_enabled = coalesce(p_late_fee_enabled, true),
    default_fine_percent = v_fine,
    default_monthly_interest_percent = v_interest,
    grace_period_days = v_grace
  where id = p_workspace_id
  returning * into v_workspace;

  if not found then
    raise exception 'Espaço de trabalho não encontrado.' using errcode = 'P0002';
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
    'workspace.finance_settings_updated',
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'late_fee_enabled', v_workspace.late_fee_enabled,
      'default_fine_percent', v_workspace.default_fine_percent,
      'default_monthly_interest_percent', v_workspace.default_monthly_interest_percent,
      'grace_period_days', v_workspace.grace_period_days
    )
  );

  return jsonb_build_object(
    'workspace_id', v_workspace.id,
    'late_fee_enabled', v_workspace.late_fee_enabled,
    'default_fine_percent', v_workspace.default_fine_percent,
    'default_monthly_interest_percent', v_workspace.default_monthly_interest_percent,
    'grace_period_days', v_workspace.grace_period_days
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Função Auxiliar Interna: generate_sale_installments_internal
--    Gera parcelas e recebimentos iniciais (à vista ou entrada) quando uma
--    venda é confirmada, dividindo centavos sem sobra/perda.
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
  v_existing_count integer;
  v_installment public.installments%rowtype;
  v_payment public.payments%rowtype;
  v_remaining_to_parcel integer;
  v_count integer;
  v_base_amount integer;
  v_remainder integer;
  v_parcel_amount integer;
  v_due_date date;
  v_first_due date;
  i integer;
begin
  -- Se já existem parcelas ativas para esta venda, não recria
  select count(*)
  into v_existing_count
  from public.installments inst
  where inst.workspace_id = p_sale.workspace_id
    and inst.sale_id = p_sale.id
    and inst.status <> 'cancelled';

  if v_existing_count > 0 then
    return;
  end if;

  if p_sale.total_cents <= 0 then
    return;
  end if;

  -- Caso 1: Venda À Vista (ou total coberto pela entrada)
  if p_sale.payment_mode = 'cash' or p_sale.down_payment_cents >= p_sale.total_cents then
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
      coalesce(p_sale.confirmed_at::date, current_date),
      p_sale.total_cents,
      p_sale.total_cents,
      0,
      0,
      p_sale.total_cents,
      0,
      'paid',
      coalesce(p_sale.confirmed_at, now()),
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
      coalesce(p_sale.confirmed_at, now()),
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
  v_first_due := coalesce(p_sale.first_due_date, (current_date + interval '30 days')::date);

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
      coalesce(p_sale.confirmed_at::date, current_date),
      p_sale.down_payment_cents,
      p_sale.down_payment_cents,
      0,
      0,
      p_sale.down_payment_cents,
      0,
      'paid',
      coalesce(p_sale.confirmed_at, now()),
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
      coalesce(p_sale.confirmed_at, now()),
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

  v_remaining_to_parcel := p_sale.total_cents - coalesce(p_sale.down_payment_cents, 0);
  v_base_amount := v_remaining_to_parcel / v_count;
  v_remainder := mod(v_remaining_to_parcel, v_count);

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
-- 10. Evolução das RPCs de Vendas para Gerar e Cancelar Parcelas Automaticamente
-- -----------------------------------------------------------------------------
drop function if exists public.create_or_confirm_sale(
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean,
  text
);

drop function if exists public.update_draft_sale(
  uuid,
  uuid,
  jsonb,
  uuid,
  integer,
  text,
  boolean
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
  p_first_due_date date default null
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
  v_first_due date := p_first_due_date;
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
    v_first_due := coalesce(v_first_due, (current_date + interval '30 days')::date);
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
    'created_at', v_sale.created_at,
    'idempotent_replay', false
  );
end;
$$;

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
  p_first_due_date date default null
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
  v_pay_mode public.sale_payment_mode := coalesce(p_payment_mode, 'cash');
  v_pay_method public.payment_method := coalesce(p_payment_method, 'pix');
  v_down_cents integer := coalesce(p_down_payment_cents, 0);
  v_inst_count integer := coalesce(p_installment_count, 1);
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
    v_first_due := coalesce(v_first_due, (current_date + interval '30 days')::date);
  end if;

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
    payment_mode = v_pay_mode,
    payment_method = v_pay_method,
    down_payment_cents = v_down_cents,
    installment_count = v_inst_count,
    first_due_date = v_first_due,
    confirmed_at = case when p_confirm_immediately then now() else null end
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

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
    case when p_confirm_immediately then 'sale.draft_confirmed' else 'sale.draft_updated' end,
    'sale',
    v_sale.id,
    jsonb_build_object(
      'status', v_sale.status,
      'subtotal_cents', v_sale.subtotal_cents,
      'discount_cents', v_sale.discount_cents,
      'total_cents', v_sale.total_cents,
      'item_count', v_sale.item_count,
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
    'created_at', v_sale.created_at,
    'idempotent_replay', false
  );
end;
$$;

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

  perform public.generate_sale_installments_internal(v_sale, v_user_id);

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

  if v_sale.status = 'cancelled' then
    return jsonb_build_object(
      'sale_id', v_sale.id,
      'status', v_sale.status,
      'cancelled_at', v_sale.cancelled_at,
      'idempotent_replay', true
    );
  end if;

  v_previous_status := v_sale.status;

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

    -- Cancela parcelas e estorna pagamentos vinculados de forma auditável
    update public.installments
    set
      status = 'cancelled',
      cancelled_at = now()
    where workspace_id = p_workspace_id
      and sale_id = v_sale.id
      and status <> 'cancelled';

    update public.payments
    set
      is_reversed = true,
      reversed_at = now(),
      reversal_reason = 'Venda cancelada: ' || left(v_clean_reason, 240)
    where workspace_id = p_workspace_id
      and sale_id = v_sale.id
      and is_reversed = false;
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
-- 11. RPC Transacional e Idempotente: record_installment_payment
--     (RF-052, RF-053, RF-054, RF-055, RF-056, RF-057)
--     Permite pagar uma parcela (total ou parcial) ou alocar um recebimento em
--     várias parcelas abertas em ordem de vencimento, com multa e juros
--     editáveis na hora do recebimento.
-- -----------------------------------------------------------------------------
create or replace function public.record_installment_payment(
  p_workspace_id uuid,
  p_installment_ids uuid[],
  p_principal_payment_cents integer,
  p_fine_cents integer default 0,
  p_interest_cents integer default 0,
  p_payment_method public.payment_method default 'pix',
  p_notes text default null,
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
  v_existing_payment public.payments%rowtype;
  v_payment public.payments%rowtype;
  v_fine integer := coalesce(p_fine_cents, 0);
  v_interest integer := coalesce(p_interest_cents, 0);
  v_principal_to_allocate integer := coalesce(p_principal_payment_cents, 0);
  v_total_open_principal integer := 0;
  v_remaining_pool integer;
  v_inst public.installments%rowtype;
  v_alloc_principal integer;
  v_alloc_fine integer;
  v_alloc_interest integer;
  v_new_paid_principal integer;
  v_new_remaining_principal integer;
  v_new_accrued_fine integer;
  v_new_accrued_interest integer;
  v_new_paid_total integer;
  v_new_status public.installment_status;
  v_first_inst boolean := true;
  v_sale_id uuid := null;
  v_customer_id uuid := null;
  v_allocations_count integer := 0;
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

  -- Proteção contra retry / duplo clique
  select *
  into v_existing_payment
  from public.payments pay
  where pay.workspace_id = p_workspace_id
    and pay.idempotency_key = v_clean_key;

  if found then
    return jsonb_build_object(
      'payment_id', v_existing_payment.id,
      'workspace_id', v_existing_payment.workspace_id,
      'amount_cents', v_existing_payment.amount_cents,
      'principal_allocated_cents', v_existing_payment.principal_allocated_cents,
      'fine_cents', v_existing_payment.fine_cents,
      'interest_cents', v_existing_payment.interest_cents,
      'paid_at', v_existing_payment.paid_at,
      'idempotent_replay', true
    );
  end if;

  if p_installment_ids is null or array_length(p_installment_ids, 1) is null or array_length(p_installment_ids, 1) = 0 then
    raise exception 'Selecione pelo menos uma parcela para registrar o recebimento.'
      using errcode = '22023';
  end if;

  if v_principal_to_allocate <= 0 then
    raise exception 'O valor principal recebido deve ser maior que zero.'
      using errcode = '22023';
  end if;

  if v_fine < 0 or v_interest < 0 then
    raise exception 'Os valores de multa e juros não podem ser negativos.'
      using errcode = '22023';
  end if;

  v_clean_notes := nullif(trim(coalesce(p_notes, '')), '');
  if v_clean_notes is not null and char_length(v_clean_notes) > 300 then
    raise exception 'A observação do pagamento deve ter no máximo 300 caracteres.'
      using errcode = '22023';
  end if;

  -- Trava parcelas selecionadas em ordem de vencimento / número
  for v_inst in
    select *
    from public.installments i
    where i.workspace_id = p_workspace_id
      and i.id = any(p_installment_ids)
    order by i.due_date asc, i.installment_number asc, i.id asc
    for update
  loop
    if v_inst.status = 'cancelled' then
      raise exception 'Não é possível registrar pagamento para uma parcela cancelada.'
        using errcode = '22023';
    end if;

    if v_inst.remaining_principal_cents <= 0 or v_inst.status = 'paid' then
      raise exception 'A parcela #% já está totalmente quitada.', v_inst.installment_number
        using errcode = '22023';
    end if;

    v_total_open_principal := v_total_open_principal + v_inst.remaining_principal_cents;
    if v_sale_id is null then
      v_sale_id := v_inst.sale_id;
    end if;
    if v_customer_id is null then
      v_customer_id := v_inst.customer_id;
    end if;
  end loop;

  if v_total_open_principal = 0 then
    raise exception 'Nenhuma parcela aberta encontrada para este recebimento.'
      using errcode = 'P0002';
  end if;

  if v_principal_to_allocate > v_total_open_principal then
    raise exception 'O valor principal informado (%) excede o saldo em aberto das parcelas selecionadas (%).',
      v_principal_to_allocate, v_total_open_principal
      using errcode = '22023';
  end if;

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
    p_workspace_id,
    v_sale_id,
    v_customer_id,
    coalesce(p_payment_method, 'pix'),
    v_principal_to_allocate + v_fine + v_interest,
    v_principal_to_allocate,
    v_fine,
    v_interest,
    now(),
    v_clean_notes,
    v_clean_key,
    v_user_id
  )
  returning * into v_payment;

  v_remaining_pool := v_principal_to_allocate;

  for v_inst in
    select *
    from public.installments i
    where i.workspace_id = p_workspace_id
      and i.id = any(p_installment_ids)
    order by i.due_date asc, i.installment_number asc, i.id asc
  loop
    exit when v_remaining_pool <= 0;

    v_alloc_principal := least(v_remaining_pool, v_inst.remaining_principal_cents);
    if v_alloc_principal > 0 then
      v_remaining_pool := v_remaining_pool - v_alloc_principal;
      v_allocations_count := v_allocations_count + 1;

      if v_first_inst then
        v_alloc_fine := v_fine;
        v_alloc_interest := v_interest;
        v_first_inst := false;
      else
        v_alloc_fine := 0;
        v_alloc_interest := 0;
      end if;

      v_new_paid_principal := v_inst.paid_principal_cents + v_alloc_principal;
      v_new_remaining_principal := v_inst.principal_cents - v_new_paid_principal;
      v_new_accrued_fine := v_inst.accrued_fine_cents + v_alloc_fine;
      v_new_accrued_interest := v_inst.accrued_interest_cents + v_alloc_interest;
      v_new_paid_total := v_new_paid_principal + v_new_accrued_fine + v_new_accrued_interest;

      if v_new_remaining_principal = 0 then
        v_new_status := 'paid';
      else
        v_new_status := 'partial';
      end if;

      update public.installments
      set
        paid_principal_cents = v_new_paid_principal,
        remaining_principal_cents = v_new_remaining_principal,
        accrued_fine_cents = v_new_accrued_fine,
        accrued_interest_cents = v_new_accrued_interest,
        paid_total_cents = v_new_paid_total,
        status = v_new_status,
        paid_at = case when v_new_status = 'paid' then now() else paid_at end
      where id = v_inst.id
        and workspace_id = p_workspace_id;

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
        p_workspace_id,
        v_payment.id,
        v_inst.id,
        v_alloc_principal,
        v_alloc_fine,
        v_alloc_interest,
        v_alloc_principal + v_alloc_fine + v_alloc_interest
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
    'payment.recorded',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'amount_cents', v_payment.amount_cents,
      'principal_allocated_cents', v_payment.principal_allocated_cents,
      'fine_cents', v_payment.fine_cents,
      'interest_cents', v_payment.interest_cents,
      'allocations_count', v_allocations_count,
      'payment_method', v_payment.payment_method
    )
  );

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'workspace_id', v_payment.workspace_id,
    'amount_cents', v_payment.amount_cents,
    'principal_allocated_cents', v_payment.principal_allocated_cents,
    'fine_cents', v_payment.fine_cents,
    'interest_cents', v_payment.interest_cents,
    'paid_at', v_payment.paid_at,
    'idempotent_replay', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Backfill Seguro para Vendas Confirmadas Anteriores sem Parcelas
-- -----------------------------------------------------------------------------
do $$
declare
  v_sale public.sales%rowtype;
begin
  for v_sale in
    select *
    from public.sales s
    where s.status = 'confirmed'
  loop
    perform public.generate_sale_installments_internal(v_sale, v_sale.created_by);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 13. Permissões de Execução das RPCs
-- -----------------------------------------------------------------------------
revoke all on function public.generate_sale_installments_internal(public.sales, uuid) from public;

revoke all on function public.update_workspace_finance_settings(
  uuid,
  boolean,
  numeric,
  numeric,
  integer
) from public;

grant execute on function public.update_workspace_finance_settings(
  uuid,
  boolean,
  numeric,
  numeric,
  integer
) to authenticated;

revoke all on function public.create_or_confirm_sale(
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
) from public;

grant execute on function public.create_or_confirm_sale(
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
) to authenticated;

revoke all on function public.update_draft_sale(
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
) from public;

grant execute on function public.update_draft_sale(
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
) to authenticated;

revoke all on function public.record_installment_payment(
  uuid,
  uuid[],
  integer,
  integer,
  integer,
  public.payment_method,
  text,
  text
) from public;

grant execute on function public.record_installment_payment(
  uuid,
  uuid[],
  integer,
  integer,
  integer,
  public.payment_method,
  text,
  text
) to authenticated;

commit;
