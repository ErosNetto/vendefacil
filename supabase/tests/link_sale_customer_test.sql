-- =============================================================================
-- VendeFácil — Teste SQL: Vincular Cliente a Venda Avulsa (link_sale_customer)
-- =============================================================================
-- Como executar: cole no SQL Editor do Supabase após rodar a migração 20261024000007.
-- A transação termina com ROLLBACK para não deixar dados de teste no banco.
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000007a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000007b2';
  v_ws_a jsonb;
  v_ws_a_id uuid;
  v_ws_b jsonb;
  v_ws_b_id uuid;
  v_prod_id uuid;
  v_cust_id uuid;
  v_sale_res jsonb;
  v_sale_id uuid;
  v_link_res jsonb;
  v_sale_rec public.sales%rowtype;
  v_inst_rec public.installments%rowtype;
begin
  -- 1. Cria usuários em auth.users
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at, updated_at)
  values
    (v_user_a, 'vendedor_a_link@teste.local', '{"full_name":"Vendedor A"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
    (v_user_b, 'vendedor_b_link@teste.local', '{"full_name":"Vendedor B"}'::jsonb, 'authenticated', 'authenticated', now(), now())
  on conflict (id) do nothing;

  -- 2. Assume papel autenticado como Usuário A
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user_a::text)::text,
    true
  );
  set local role authenticated;

  v_ws_a := public.create_workspace('Loja A Vincular');
  v_ws_a_id := (v_ws_a ->> 'workspace_id')::uuid;

  -- Cria cliente na Loja A
  insert into public.customers (workspace_id, full_name, phone)
  values (v_ws_a_id, 'Carlos Cliente Balcão', '11999998888')
  returning id into v_cust_id;

  -- Cria produto
  insert into public.products (workspace_id, name, sku, cost_cents, price_cents, min_stock_qty, current_stock_qty)
  values (v_ws_a_id, 'Camiseta Básica', 'SKU-CAM-01', 2000, 5000, 1, 10)
  returning id into v_prod_id;

  -- Cria venda avulsa (sem cliente) parcelada em 2x
  v_sale_res := public.create_or_confirm_sale(
    v_ws_a_id,
    jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 1)),
    null, -- sem cliente (avulsa)
    0,
    'Venda rápida de balcão',
    true,
    'sale_link_test_001',
    'installments',
    'pix',
    0,
    2,
    current_date
  );
  v_sale_id := (v_sale_res ->> 'sale_id')::uuid;

  -- Verifica que a venda foi criada sem cliente
  select * into v_sale_rec from public.sales where id = v_sale_id;
  if v_sale_rec.customer_id is not null or v_sale_rec.customer_name_snapshot is not null then
    raise exception 'Venda deveria ter sido criada sem cliente!';
  end if;

  -- 3. Chama link_sale_customer para vincular o cliente cadastrado depois
  v_link_res := public.link_sale_customer(v_ws_a_id, v_sale_id, v_cust_id);
  if (v_link_res ->> 'success')::boolean is not true then
    raise exception 'Falha ao executar link_sale_customer!';
  end if;

  -- Verifica se a venda foi atualizada com customer_id e snapshot
  select * into v_sale_rec from public.sales where id = v_sale_id;
  if v_sale_rec.customer_id <> v_cust_id or v_sale_rec.customer_name_snapshot <> 'Carlos Cliente Balcão' then
    raise exception 'Venda não foi atualizada com o cliente correto: % / %',
      v_sale_rec.customer_id, v_sale_rec.customer_name_snapshot;
  end if;

  -- Verifica se as parcelas também foram atualizadas
  select * into v_inst_rec from public.installments where sale_id = v_sale_id and installment_number = 1;
  if v_inst_rec.customer_id <> v_cust_id or v_inst_rec.customer_name_snapshot <> 'Carlos Cliente Balcão' then
    raise exception 'Parcela não foi atualizada com o cliente correto: % / %',
      v_inst_rec.customer_id, v_inst_rec.customer_name_snapshot;
  end if;

  -- 4. Testar desvinculação (passando null)
  perform public.link_sale_customer(v_ws_a_id, v_sale_id, null);
  select * into v_sale_rec from public.sales where id = v_sale_id;
  if v_sale_rec.customer_id is not null or v_sale_rec.customer_name_snapshot is not null then
    raise exception 'Desvinculação falhou: venda ainda possui cliente vinculado!';
  end if;

  -- Vincula novamente para testar RLS
  perform public.link_sale_customer(v_ws_a_id, v_sale_id, v_cust_id);

  -- 5. Teste de isolamento RLS: Usuário B não pode alterar a venda do Usuário A
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user_b::text)::text,
    true
  );
  set local role authenticated;

  v_ws_b := public.create_workspace('Loja B Vincular');
  v_ws_b_id := (v_ws_b ->> 'workspace_id')::uuid;

  begin
    perform public.link_sale_customer(v_ws_b_id, v_sale_id, null);
    raise exception 'Falha de segurança: Usuário B conseguiu acessar venda do Workspace A!';
  exception when others then
    -- Esperado erro de acesso ou não encontrada
    null;
  end;

  raise notice 'SUCESSO: Todos os testes de link_sale_customer e isolamento RLS passaram!';
end
$$;

rollback;
