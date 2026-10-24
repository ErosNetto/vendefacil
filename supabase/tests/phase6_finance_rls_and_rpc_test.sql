-- =============================================================================
-- VendeFácil — Teste SQL Fase 6: Parcelamento, Alocação, Juros/Multa e RLS
-- =============================================================================
-- Como executar: cole no SQL Editor do Supabase após rodar a migração da Fase 6.
-- A transação termina com ROLLBACK para não deixar dados de teste no banco.
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000006a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000006b2';
  v_ws_a jsonb;
  v_ws_b jsonb;
  v_ws_a_id uuid;
  v_prod_a_id uuid;
  v_sale_res jsonb;
  v_sale_id uuid;
  v_inst_1 public.installments%rowtype;
  v_inst_2 public.installments%rowtype;
  v_inst_3 public.installments%rowtype;
  v_pay_res jsonb;
  v_replay_res jsonb;
  v_alloc_count integer;
  v_visible_inst_b integer;
  v_visible_pay_b integer;
begin
  -- 1. Cria dois usuários de teste em auth.users (como postgres)
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at, updated_at)
  values
    (v_user_a, 'vendedor_a_fase6@teste.local', '{"full_name":"Vendedor A"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
    (v_user_b, 'vendedor_b_fase6@teste.local', '{"full_name":"Vendedor B"}'::jsonb, 'authenticated', 'authenticated', now(), now())
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

  v_ws_a := public.create_workspace('Loja A Fase 6');
  v_ws_a_id := (v_ws_a ->> 'workspace_id')::uuid;

  -- 3. Testar atualização das regras de juros/multa do workspace
  perform public.update_workspace_finance_settings(
    v_ws_a_id,
    true,
    2.50,
    1.50,
    3
  );

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
    'Kit Presente Fase 6',
    'SKU-F6',
    4000,
    10000,
    1,
    10
  )
  returning id into v_prod_a_id;

  -- 4. Confirmar venda de R$ 100,00 (10000 centavos) em 3x sem entrada -> 3334, 3333, 3333
  v_sale_res := public.create_or_confirm_sale(
    v_ws_a_id,
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_a_id, 'quantity', 1)
    ),
    null,
    0,
    'Venda parcelada em 3x',
    true,
    'sale_f6_test_001',
    'installments',
    'pix',
    0,
    3,
    (current_date - interval '10 days')::date
  );

  v_sale_id := (v_sale_res ->> 'sale_id')::uuid;

  select * into v_inst_1 from public.installments where sale_id = v_sale_id and installment_number = 1;
  select * into v_inst_2 from public.installments where sale_id = v_sale_id and installment_number = 2;
  select * into v_inst_3 from public.installments where sale_id = v_sale_id and installment_number = 3;

  if v_inst_1.principal_cents <> 3334 or v_inst_2.principal_cents <> 3333 or v_inst_3.principal_cents <> 3333 then
    raise exception 'Divisão de centavos incorreta nas 3 parcelas: %, %, %',
      v_inst_1.principal_cents, v_inst_2.principal_cents, v_inst_3.principal_cents;
  end if;

  -- 5. Registrar pagamento parcial de R$ 10,00 (1000 centavos) na 1ª parcela + testar idempotência
  v_pay_res := public.record_installment_payment(
    v_ws_a_id,
    array[v_inst_1.id],
    1000,
    0,
    0,
    'pix',
    'Pagamento parcial na parcela 1',
    'pay_f6_key_001'
  );

  v_replay_res := public.record_installment_payment(
    v_ws_a_id,
    array[v_inst_1.id],
    1000,
    0,
    0,
    'pix',
    'Pagamento parcial na parcela 1',
    'pay_f6_key_001'
  );

  if (v_replay_res ->> 'idempotent_replay')::boolean is not true then
    raise exception 'Replay idempotente de pagamento falhou!';
  end if;

  select * into v_inst_1 from public.installments where id = v_inst_1.id;
  if v_inst_1.status <> 'partial' or v_inst_1.remaining_principal_cents <> 2334 then
    raise exception 'Parcela 1 deveria estar partial com saldo 2334, mas está % com %',
      v_inst_1.status, v_inst_1.remaining_principal_cents;
  end if;

  -- 6. Quitar restante da 1ª parcela (2334) com multa (58) + juros (12)
  perform public.record_installment_payment(
    v_ws_a_id,
    array[v_inst_1.id],
    2334,
    58,
    12,
    'cash',
    'Quitação com multa e juros',
    'pay_f6_key_002'
  );

  select * into v_inst_1 from public.installments where id = v_inst_1.id;
  if v_inst_1.status <> 'paid' or v_inst_1.paid_total_cents <> 3404 then
    raise exception 'Parcela 1 deveria estar paid com total pago 3404, mas está % com %',
      v_inst_1.status, v_inst_1.paid_total_cents;
  end if;

  -- 7. Alocar pagamento único (6666 centavos) nas parcelas 2 e 3 simultaneamente (RF-053)
  v_pay_res := public.record_installment_payment(
    v_ws_a_id,
    array[v_inst_2.id, v_inst_3.id],
    6666,
    0,
    0,
    'pix',
    'Quitação conjunta das parcelas 2 e 3',
    'pay_f6_key_003'
  );

  select count(*) into v_alloc_count
  from public.payment_allocations
  where payment_id = (v_pay_res ->> 'payment_id')::uuid;

  if v_alloc_count <> 2 then
    raise exception 'Deveriam existir 2 alocações para o pagamento conjunto, encontrado %', v_alloc_count;
  end if;

  -- 8. Testar isolamento RLS: Troca para Usuário B no papel `authenticated`
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user_b::text)::text,
    true
  );
  set local role authenticated;

  v_ws_b := public.create_workspace('Loja B Fase 6');

  select count(*) into v_visible_inst_b from public.installments where sale_id = v_sale_id;
  if v_visible_inst_b <> 0 then
    raise exception 'Falha de RLS: Usuário B conseguiu ler parcelas do Workspace A!';
  end if;

  select count(*) into v_visible_pay_b from public.payments where sale_id = v_sale_id;
  if v_visible_pay_b <> 0 then
    raise exception 'Falha de RLS: Usuário B conseguiu ler pagamentos do Workspace A!';
  end if;

  raise notice 'SUCESSO: Todos os testes de parcelamento, pagamentos parciais, alocação múltipla, juros/multa e RLS da Fase 6 passaram!';
end
$$;

rollback;
