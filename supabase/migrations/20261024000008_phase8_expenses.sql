-- =============================================================================
-- VendeFácil — Fase 8: Despesas Operacionais, Categorias e Relatórios DRE
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Categorias de Despesas
-- -----------------------------------------------------------------------------
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  icon text default 'tag-outline',
  color text default '#64716B',
  created_at timestamptz not null default now(),
  constraint expense_categories_name_not_empty check (char_length(trim(name)) > 0),
  constraint expense_categories_unique_name_per_workspace unique (workspace_id, name)
);

create index if not exists idx_expense_categories_workspace
  on public.expense_categories (workspace_id, name);

-- -----------------------------------------------------------------------------
-- 2. Tabela de Despesas
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid references public.expense_categories(id) on delete set null,
  description text not null,
  amount_cents integer not null,
  expense_date date not null default current_date,
  payment_method public.payment_method not null default 'pix',
  notes text,
  is_cancelled boolean not null default false,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_cents_positive check (amount_cents > 0),
  constraint expenses_description_not_empty check (char_length(trim(description)) > 0)
);

create index if not exists idx_expenses_workspace_date
  on public.expenses (workspace_id, expense_date desc, created_at desc);

create index if not exists idx_expenses_workspace_category
  on public.expenses (workspace_id, category_id);

-- -----------------------------------------------------------------------------
-- 3. Trigger para updated_at em public.expenses
-- -----------------------------------------------------------------------------
create or replace function public.handle_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
  before update on public.expenses
  for each row
  execute function public.handle_expenses_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Função auxiliar para semear categorias padrão no workspace
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_expense_categories(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.expense_categories (workspace_id, name, icon, color)
  values
    (target_workspace_id, 'Fornecedores e Compras', 'cube-outline', '#087F5B'),
    (target_workspace_id, 'Aluguel e Condomínio', 'business-outline', '#2563EB'),
    (target_workspace_id, 'Embalagens e Sacolas', 'bag-outline', '#D97706'),
    (target_workspace_id, 'Água, Luz e Internet', 'flash-outline', '#059669'),
    (target_workspace_id, 'Marketing e Divulgação', 'megaphone-outline', '#7C3AED'),
    (target_workspace_id, 'Impostos e Taxas', 'document-text-outline', '#DC2626'),
    (target_workspace_id, 'Salários e Pró-labore', 'people-outline', '#4F46E5'),
    (target_workspace_id, 'Outras Despesas', 'receipt-outline', '#64716B')
  on conflict (workspace_id, name) do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. RLS (Row Level Security)
-- -----------------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

-- Policies para expense_categories
drop policy if exists "expense_categories_select_members" on public.expense_categories;
create policy "expense_categories_select_members"
  on public.expense_categories
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expense_categories.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "expense_categories_insert_members" on public.expense_categories;
create policy "expense_categories_insert_members"
  on public.expense_categories
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expense_categories.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin', 'seller')
    )
  );

drop policy if exists "expense_categories_update_members" on public.expense_categories;
create policy "expense_categories_update_members"
  on public.expense_categories
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expense_categories.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expense_categories.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- Policies para expenses
drop policy if exists "expenses_select_members" on public.expenses;
create policy "expenses_select_members"
  on public.expenses
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expenses.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "expenses_insert_members" on public.expenses;
create policy "expenses_insert_members"
  on public.expenses
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expenses.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin', 'seller')
    )
  );

drop policy if exists "expenses_update_members" on public.expenses;
create policy "expenses_update_members"
  on public.expenses
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expenses.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin', 'seller')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = expenses.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin', 'seller')
    )
  );

commit;
