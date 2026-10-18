-- =============================================================================
-- VendeFácil — Migração Fase 2: Clientes / CRM (customers + RLS + índices)
-- =============================================================================
-- Requisitos atendidos:
-- RF-010: CRUD, pesquisa, filtro e arquivamento.
-- RF-011: nome obrigatório; telefone, e-mail, endereço e notas opcionais.
-- RF-013: arquivar não apaga histórico (sem hard delete pelo cliente).
-- Integridade: UNIQUE (id, workspace_id) para permitir FK composta em vendas futuras.
-- =============================================================================

begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text check (phone is null or char_length(trim(phone)) <= 30),
  email text check (email is null or char_length(trim(email)) <= 160),
  address text check (address is null or char_length(trim(address)) <= 300),
  notes text check (notes is null or char_length(trim(notes)) <= 1000),
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_id_workspace_unique unique (id, workspace_id)
);

create index if not exists idx_customers_workspace_archived_name
  on public.customers (workspace_id, is_archived, full_name);

create index if not exists idx_customers_workspace_created
  on public.customers (workspace_id, created_at desc);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS (Row Level Security)
-- -----------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customers force row level security;

drop policy if exists customers_select_member on public.customers;
create policy customers_select_member
  on public.customers
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists customers_insert_member on public.customers;
create policy customers_insert_member
  on public.customers
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists customers_update_member on public.customers;
create policy customers_update_member
  on public.customers
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Nota: Não há policy de DELETE direto para preservar histórico comercial/financeiro (RF-013).
-- O desuso de um cadastro deve utilizar is_archived = true.

commit;
