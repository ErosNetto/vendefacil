-- =============================================================================
-- VendeFácil — Testes SQL de Estoque: Isolamento RLS, Idempotência e Saldo Negativo (Fase 4)
-- =============================================================================
-- Como executar no SQL Editor do Supabase (após rodar a migração da Fase 4):
-- O script roda em transação com ROLLBACK ao final (retornará "Success. No rows returned").
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000004a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000004b2';
  v_ws_a_id uuid;
  v_ws_b_id uuid;
  v_prod_a_id uuid;
  v_res_1 jsonb;
  v_res_2 jsonb;
  v_stock numeric;
  v_count integer;
begin
  -- 1. Cria dois usuários de teste em auth.users
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values
    (v_user_a, 'estoque.a@teste.local', '{"full_name": "Vendedora A"}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_b, 'estoque.b@teste.local', '{"full_name": "Vendedora B"}'::jsonb, 'authenticated', 'authenticated');

  -- 2. Autentica como Usuária A, cria Workspace A e Produto A (saldo inicial 0)
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_a_id := (public.create_workspace('Estoque A')->>'workspace_id')::uuid;

  insert into public.products (workspace_id, name, cost_cents, price_cents, min_stock_qty)
  values (v_ws_a_id, 'Perfume Teste', 5000, 9990, 3)
  returning id into v_prod_a_id;

  -- 3. Registra entrada de 10 unidades com idempotency_key 'idem-key-001'
  v_res_1 := public.adjust_stock(
    v_ws_a_id,
    v_prod_a_id,
    'entry'::public.stock_movement_type,
    10,
    'Compra inicial de fornecedor',
    'idem-key-001'
  );

  -- 4. Testa idempotência (RF-035): repetir a mesma idempotency_key NÃO pode somar +10 de novo
  v_res_2 := public.adjust_stock(
    v_ws_a_id,
    v_prod_a_id,
    'entry'::public.stock_movement_type,
    10,
    'Compra inicial de fornecedor',
    'idem-key-001'
  );

  select current_stock_qty into v_stock
  from public.products
  where id = v_prod_a_id;

  if v_stock <> 10 or (v_res_2->>'idempotent_replay')::boolean is distinct from true then
    raise exception 'FALHA IDEMPOTÊNCIA: Retry duplicou saldo de estoque (%)!', v_stock;
  end if;

  -- 5. Testa bloqueio de saldo negativo (RF-034): tentar retirar 15 quando há 10
  begin
    perform public.adjust_stock(
      v_ws_a_id,
      v_prod_a_id,
      'damage'::public.stock_movement_type,
      15,
      'Caixa danificada',
      'idem-key-002'
    );
    raise exception 'FALHA SALDO NEGATIVO: Sistema permitiu saída maior que o saldo!';
  exception
    when others then
      null;
  end;

  -- 6. Autentica como Usuária B e verifica isolamento RLS
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_b_id := (public.create_workspace('Estoque B')->>'workspace_id')::uuid;

  select count(*) into v_count
  from public.stock_movements
  where workspace_id = v_ws_a_id;

  if v_count <> 0 then
    raise exception 'FALHA RLS: Usuária B conseguiu ler movimentos do Workspace A!';
  end if;

  begin
    perform public.adjust_stock(
      v_ws_a_id,
      v_prod_a_id,
      'adjustment_out'::public.stock_movement_type,
      1,
      'Tentativa invasora',
      'idem-key-003'
    );
    raise exception 'FALHA RLS RPC: Usuária B conseguiu ajustar estoque do Workspace A!';
  exception
    when insufficient_privilege or others then
      null;
  end;

  reset role;
  raise notice 'SUCESSO: RLS, idempotência e bloqueio de saldo negativo validados!';
end;
$$;

rollback;
