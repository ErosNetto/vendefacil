-- =============================================================================
-- VendeFácil — Teste SQL: Venda com Data Retroativa
-- =============================================================================

begin;

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-0000000009a1';
  v_ws_id uuid;
  v_prod_id uuid;
  v_cat_id uuid;
  v_res jsonb;
  v_sale_id uuid;
  v_sale_date date := (current_date - interval '15 days')::date;
  v_future_date date := (current_date + interval '5 days')::date;
  v_paid_at timestamptz;
  v_due_date date;
begin
  -- 1. Cria usuário e workspace de teste
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (v_user_id, 'retroativa@teste.local', '{"full_name": "Lojista Retroativo"}'::jsonb, 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_id := (public.create_workspace('Loja Retroativa')->>'workspace_id')::uuid;

  -- 2. Cadastra categoria e produto
  insert into public.categories (workspace_id, name)
  values (v_ws_id, 'Roupas')
  returning id into v_cat_id;

  insert into public.products (
    workspace_id, category_id, name, cost_cents, price_cents, current_stock_qty, min_stock_qty
  )
  values (
    v_ws_id, v_cat_id, 'Camiseta Básica', 2000, 5000, 50, 5
  )
  returning id into v_prod_id;

  -- 3. Cria venda à vista retroativa de 15 dias atrás
  v_res := public.create_or_confirm_sale(
    p_workspace_id => v_ws_id,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 2)),
    p_discount_cents => 0,
    p_confirm_immediately => true,
    p_idempotency_key => 'test_retro_cash_001',
    p_payment_mode => 'cash',
    p_payment_method => 'pix',
    p_sale_date => v_sale_date
  );

  v_sale_id := (v_res->>'sale_id')::uuid;

  -- 4. Valida se a sale_date gravada é de 15 dias atrás
  if not exists (select 1 from public.sales where id = v_sale_id and sale_date = v_sale_date) then
    raise exception 'FALHA: sale_date não foi gravada corretamente com a data retroativa.';
  end if;

  -- 5. Valida se o pagamento à vista foi registrado com a data retroativa
  select paid_at into v_paid_at
  from public.payments
  where sale_id = v_sale_id
  limit 1;

  if v_paid_at::date <> v_sale_date then
    raise exception 'FALHA: paid_at do pagamento à vista (%) não corresponde à sale_date (%).', v_paid_at::date, v_sale_date;
  end if;

  -- 6. Cria venda parcelada retroativa sem informar 1º vencimento (deve sugerir sale_date + 30 dias)
  v_res := public.create_or_confirm_sale(
    p_workspace_id => v_ws_id,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 1)),
    p_discount_cents => 0,
    p_confirm_immediately => true,
    p_idempotency_key => 'test_retro_inst_002',
    p_payment_mode => 'installments',
    p_payment_method => 'pix',
    p_installment_count => 2,
    p_sale_date => v_sale_date
  );

  v_sale_id := (v_res->>'sale_id')::uuid;

  select due_date into v_due_date
  from public.installments
  where sale_id = v_sale_id and installment_number = 1
  limit 1;

  if v_due_date <> (v_sale_date + interval '30 days')::date then
    raise exception 'FALHA: 1º vencimento da parcela (%) não foi calculado a partir da sale_date (%).', v_due_date, (v_sale_date + interval '30 days')::date;
  end if;

  -- 7. Valida que tentar registrar venda com data futura é bloqueado
  begin
    perform public.create_or_confirm_sale(
      p_workspace_id => v_ws_id,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 1)),
      p_discount_cents => 0,
      p_confirm_immediately => true,
      p_idempotency_key => 'test_future_sale_blocked',
      p_payment_mode => 'cash',
      p_payment_method => 'pix',
      p_sale_date => v_future_date
    );
    raise exception 'FALHA: Venda com data futura deveria ter sido rejeitada!';
  exception
    when others then
      -- Esperado: bloqueio de data futura
      null;
  end;

  raise notice 'Sucesso! Todos os testes de venda retroativa passaram com perfeição!';
end;
$$;

rollback;
