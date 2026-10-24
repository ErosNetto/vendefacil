-- =============================================================================
-- VendeFácil — Migração: Vincular ou alterar cliente de uma venda (RF-040)
-- Permite vincular uma venda avulsa (balcão) a um cliente após a confirmação,
-- atualizando sales, installments e payments sem afetar itens, estoque ou valores.
-- =============================================================================

create or replace function public.link_sale_customer(
  p_workspace_id uuid,
  p_sale_id uuid,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_customer public.customers%rowtype;
  v_customer_name text := null;
begin
  -- 1. Valida se o usuário autenticado pertence ao workspace
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado: você não pertence a este espaço de trabalho.';
  end if;

  -- 2. Localiza a venda dentro do workspace
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
    and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Venda não encontrada no espaço de trabalho informado.';
  end if;

  -- 3. Se um cliente foi informado, valida existência e snapshot do nome
  if p_customer_id is not null then
    select *
    into v_customer
    from public.customers
    where id = p_customer_id
      and workspace_id = p_workspace_id;

    if not found then
      raise exception 'Cliente não encontrado no espaço de trabalho informado.';
    end if;

    v_customer_name := v_customer.full_name;
  end if;

  -- 4. Atualiza a venda com o novo vínculo e snapshot
  update public.sales
  set
    customer_id = p_customer_id,
    customer_name_snapshot = v_customer_name,
    updated_at = now()
  where id = p_sale_id
    and workspace_id = p_workspace_id;

  -- 5. Atualiza parcelas vinculadas a esta venda
  update public.installments
  set
    customer_id = p_customer_id,
    customer_name_snapshot = v_customer_name,
    updated_at = now()
  where sale_id = p_sale_id
    and workspace_id = p_workspace_id;

  -- 6. Atualiza pagamentos vinculados a esta venda (se houver)
  update public.payments
  set
    customer_id = p_customer_id
  where sale_id = p_sale_id
    and workspace_id = p_workspace_id;

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'customer_id', p_customer_id,
    'customer_name_snapshot', v_customer_name
  );
end;
$$;

grant execute on function public.link_sale_customer(uuid, uuid, uuid) to authenticated;
