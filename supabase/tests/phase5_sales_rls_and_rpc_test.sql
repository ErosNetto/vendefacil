-- =============================================================================
-- VendeFácil — Teste SQL Fase 5: Isolamento RLS, Snapshots, Baixa e Estorno
-- =============================================================================
-- Como executar: cole no SQL Editor do Supabase após rodar a migração da Fase 5.
-- A transação termina com ROLLBACK para não deixar dados de teste no banco.
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000005a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000005b2';
  v_ws_a jsonb;
  v_ws_b jsonb;
  v_ws_a_id uuid;
  v_prod_a_id uuid;
  v_sale_res jsonb;
  v_replay_res jsonb;
  v_sale_id uuid;
  v_stock_after numeric;
  v_visible_b integer;
  v_visible_items_b integer;
begin
  -- 1. Cria dois usuários de teste em auth.users (como postgres)
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at, updated_at)
  values
    (v_user_a, 'vendedor_a_fase5@teste.local', '{"full_name":"Vendedor A"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
    (v_user_b, 'vendedor_b_fase5@teste.local', '{"full_name":"Vendedor B"}'::jsonb, 'authenticated', 'authenticated', now(), now())
  on conflict (id) do nothing;

  -- 2. Assume o papel `authenticated` como Usuário A (ativa avaliação de RLS)
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user_a::text)::text,
    true
  );
  set local role authenticated;

  v_ws_a := public.create_workspace('Loja A Fase 5');
  v_ws_a_id := (v_ws_a ->> 'workspace_id')::uuid;

  insert into public.products (
    workspace_id,
    name,
    sku,
    cost_cents,
    price_cents,
    min_stock_qty,
    current_stock_qty
  )
  values (
    v_ws_a_id,
    'Perfume Teste Fase 5',
    'SKU-F5',
    5000,
    12000,
    2,
    10
  )
  returning id into v_prod_a_id;

  -- 3. Confirmar venda de 3 unidades com desconto de R$ 10,00 (1000 centavos)
  v_sale_res := public.create_or_confirm_sale(
    v_ws_a_id,
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_a_id, 'quantity', 3)
    ),
    null,
    1000,
    'Venda teste idempotente',
    true,
    'sale_test_key_001'
  );

  v_sale_id := (v_sale_res ->> 'sale_id')::uuid;

  if (v_sale_res ->> 'total_cents')::integer <> 35000 then
    raise exception 'Total esperado 35000 centavos, recebido %', v_sale_res ->> 'total_cents';
  end if;

  -- 4. Testar replay idempotente com a mesma chave (não deve baixar estoque duas vezes)
  v_replay_res := public.create_or_confirm_sale(
    v_ws_a_id,
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_a_id, 'quantity', 3)
    ),
    null,
    1000,
    'Venda teste idempotente',
    true,
    'sale_test_key_001'
  );

  if (v_replay_res ->> 'idempotent_replay')::boolean is not true then
    raise exception 'Replay idempotente deveria retornar idempotent_replay = true';
  end if;

  select current_stock_qty into v_stock_after from public.products where id = v_prod_a_id;
  if v_stock_after <> 7 then
    raise exception 'Estoque deveria ser 7 após venda de 3 un., mas é %', v_stock_after;
  end if;

  -- 5. Testar isolamento RLS: Troca para Usuário B no papel `authenticated`
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user_b::text)::text,
    true
  );
  set local role authenticated;

  v_ws_b := public.create_workspace('Loja B Fase 5');

  select count(*) into v_visible_b from public.sales where id = v_sale_id;
  if v_visible_b <> 0 then
    raise exception 'Falha de RLS: Usuário B conseguiu ler venda do Workspace A!';
  end if;

  select count(*) into v_visible_items_b from public.sale_items where sale_id = v_sale_id;
  if v_visible_items_b <> 0 then
    raise exception 'Falha de RLS: Usuário B conseguiu ler itens da venda do Workspace A!';
  end if;

  -- 6. Voltar para Usuário A e cancelar a venda (deve devolver 3 un. ao estoque -> 10 un.)
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user_a::text)::text,
    true
  );
  set local role authenticated;

  perform public.cancel_sale(v_ws_a_id, v_sale_id, 'Cancelamento de teste com estorno');

  select current_stock_qty into v_stock_after from public.products where id = v_prod_a_id;
  if v_stock_after <> 10 then
    raise exception 'Estoque deveria voltar para 10 após cancelamento, mas é %', v_stock_after;
  end if;

  -- 7. Criar rascunho, editar com update_draft_sale e confirmar
  v_sale_res := public.create_or_confirm_sale(
    v_ws_a_id,
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_a_id, 'quantity', 1)
    ),
    null,
    0,
    'Rascunho inicial',
    false,
    'sale_draft_key_002'
  );

  v_sale_id := (v_sale_res ->> 'sale_id')::uuid;

  v_sale_res := public.update_draft_sale(
    v_ws_a_id,
    v_sale_id,
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_a_id, 'quantity', 2)
    ),
    null,
    500,
    'Rascunho editado e confirmado',
    true
  );

  if (v_sale_res ->> 'total_cents')::integer <> 23500 then
    raise exception 'Total do rascunho editado esperado 23500, recebido %', v_sale_res ->> 'total_cents';
  end if;

  select current_stock_qty into v_stock_after from public.products where id = v_prod_a_id;
  if v_stock_after <> 8 then
    raise exception 'Estoque deveria ser 8 após confirmar rascunho editado de 2 un., mas é %', v_stock_after;
  end if;

  raise notice 'SUCESSO: Todos os testes de RLS, snapshots, idempotência, edição de rascunho, baixa e estorno da Fase 5 passaram!';
end
$$;

rollback;
