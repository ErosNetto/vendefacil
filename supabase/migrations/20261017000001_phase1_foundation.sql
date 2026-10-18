-- =============================================================================
-- VendeFácil — Migração Fase 1: Fundação (Auth, Perfis, Workspaces, Membros, RLS)
-- =============================================================================
-- Regras de segurança aplicadas:
-- 1. RLS habilitado e forçado em todas as tabelas privadas.
-- 2. Isolamento estrito por workspace validado no banco via funções SECURITY DEFINER
--    com search_path fixo (public, pg_temp).
-- 3. Proibição de escalada de privilégios: cliente não pode inserir/alterar
--    diretamente `workspace_members` para se promover a owner/admin.
-- 4. Criação atômica de workspace + owner + log de auditoria via RPC `create_workspace`.
-- =============================================================================

begin;

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Tipos enumerados
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type public.workspace_role as enum ('owner', 'admin', 'seller');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Função utilitária de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Tabela: profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(trim(full_name)) <= 120),
  phone text check (phone is null or char_length(trim(phone)) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Trigger automático ao cadastrar usuário no Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_full_name text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Vendedor(a)'
  );

  insert into public.profiles (id, full_name)
  values (new.id, left(v_full_name, 120))
  on conflict (id) do update
    set full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 4. Tabelas: workspaces, workspace_members e audit_logs
-- -----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  owner_id uuid not null references auth.users(id) on delete restrict,
  currency_code text not null default 'BRL' check (currency_code = 'BRL'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'seller',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_workspace_user_unique unique (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user_active
  on public.workspace_members (user_id, is_active);

create index if not exists idx_workspace_members_workspace_active
  on public.workspace_members (workspace_id, is_active);

drop trigger if exists trg_workspace_members_updated_at on public.workspace_members;
create trigger trg_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(trim(action)) between 2 and 100),
  entity_type text not null check (char_length(trim(entity_type)) between 2 and 60),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_workspace_created
  on public.audit_logs (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 5. Funções de verificação de membership e papel (SECURITY DEFINER seguro)
-- -----------------------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
  );
$$;

create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_allowed_roles public.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and wm.role = any(p_allowed_roles)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

revoke all on function public.has_workspace_role(uuid, public.workspace_role[]) from public;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RLS (Row Level Security)
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;

alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- Policies: profiles
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Policies: workspaces
-- Somente membros ativos podem visualizar o workspace.
-- Inserção direta bloqueada para forçar uso da RPC transacional `create_workspace`.
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
  on public.workspaces
  for select
  to authenticated
  using (public.is_workspace_member(id));

drop policy if exists workspaces_update_owner_admin on public.workspaces;
create policy workspaces_update_owner_admin
  on public.workspaces
  for update
  to authenticated
  using (
    public.has_workspace_role(
      id,
      array['owner'::public.workspace_role, 'admin'::public.workspace_role]
    )
  )
  with check (
    public.has_workspace_role(
      id,
      array['owner'::public.workspace_role, 'admin'::public.workspace_role]
    )
  );

-- Policies: workspace_members
-- Somente membros ativos do mesmo workspace podem ler a lista de membros.
-- Nenhuma policy de INSERT/UPDATE/DELETE direto para evitar auto-promoção de role.
drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_member
  on public.workspace_members
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Policies: audit_logs
-- Somente leitura para owner/admin do workspace; inserção apenas via funções seguras.
drop policy if exists audit_logs_select_owner_admin on public.audit_logs;
create policy audit_logs_select_owner_admin
  on public.audit_logs
  for select
  to authenticated
  using (
    public.has_workspace_role(
      workspace_id,
      array['owner'::public.workspace_role, 'admin'::public.workspace_role]
    )
  );

-- -----------------------------------------------------------------------------
-- 7. RPCs Atômicas: create_workspace e add_workspace_member
-- -----------------------------------------------------------------------------
create or replace function public.create_workspace(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_clean_name text;
  v_workspace public.workspaces%rowtype;
  v_member public.workspace_members%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  v_clean_name := trim(coalesce(p_name, ''));
  if char_length(v_clean_name) < 2 or char_length(v_clean_name) > 80 then
    raise exception 'O nome do espaço de trabalho deve ter entre 2 e 80 caracteres.'
      using errcode = '22023';
  end if;

  -- Garante que o perfil do usuário existe
  insert into public.profiles (id, full_name)
  values (v_user_id, 'Vendedor(a)')
  on conflict (id) do nothing;

  insert into public.workspaces (name, owner_id, currency_code)
  values (v_clean_name, v_user_id, 'BRL')
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role, is_active)
  values (v_workspace.id, v_user_id, 'owner'::public.workspace_role, true)
  returning * into v_member;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_workspace.id,
    v_user_id,
    'workspace.created',
    'workspace',
    v_workspace.id,
    jsonb_build_object('name', v_workspace.name, 'role', v_member.role)
  );

  return jsonb_build_object(
    'workspace_id', v_workspace.id,
    'name', v_workspace.name,
    'owner_id', v_workspace.owner_id,
    'currency_code', v_workspace.currency_code,
    'role', v_member.role,
    'created_at', v_workspace.created_at
  );
end;
$$;

revoke all on function public.create_workspace(text) from public;
grant execute on function public.create_workspace(text) to authenticated;

create or replace function public.add_workspace_member(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_role public.workspace_role default 'seller'::public.workspace_role
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid;
  v_member public.workspace_members%rowtype;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  -- Apenas um owner ativo pode adicionar membros ou conceder papéis
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner'::public.workspace_role]
  ) then
    raise exception 'Apenas o proprietário do espaço de trabalho pode gerenciar membros.'
      using errcode = '42501';
  end if;

  if p_role = 'owner'::public.workspace_role then
    raise exception 'Não é permitido atribuir o papel de proprietário por esta operação.'
      using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, is_active)
  values (p_workspace_id, p_target_user_id, p_role, true)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        is_active = true,
        updated_at = now()
  returning * into v_member;

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
    v_actor_id,
    'workspace_member.upserted',
    'workspace_member',
    v_member.id,
    jsonb_build_object('target_user_id', p_target_user_id, 'role', p_role)
  );

  return jsonb_build_object(
    'id', v_member.id,
    'workspace_id', v_member.workspace_id,
    'user_id', v_member.user_id,
    'role', v_member.role,
    'is_active', v_member.is_active
  );
end;
$$;

revoke all on function public.add_workspace_member(uuid, uuid, public.workspace_role) from public;
grant execute on function public.add_workspace_member(uuid, uuid, public.workspace_role) to authenticated;

commit;
