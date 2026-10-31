-- =============================================================================
-- VendeFácil — Fase 9: Testes de RLS, PIX do Vendedor, Precificação por Remessa
-- e Preço Unitário Negociado na Venda
-- Execute no SQL Editor do Supabase. Roda dentro de BEGIN ... ROLLBACK.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_user_a uuid := '00000000-0000-4000-8000-000000000901';
  v_user_b uuid := '00000000-0000-4000-8000-000000000902';
  v_ws_a uuid;
  v_ws_b uuid;
  v_prod_a uuid;
  v_sale_res jsonb;
  v_stock_res jsonb;
  v_pix_res jsonb;
  v_prod_cost integer;
  v_prod_price integer;
  v_sale_total integer;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_user_a, 'fase9_a@vendefacil.test', '{"full_name":"Vendedor A"}'::jsonb, now(), now()),
    (v_user_b, 'fase9_b@vendefacil.test', '{"full_name":"Vendedor B"}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_ws_a := public.create_workspace_with_owner('Loja Fase 9 A');

  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  v_ws_b := public.create_workspace_with_owner('Loja Fase 9 B');

  -- 1. Teste de atualização de PIX do vendedor e bloqueio entre lojas (RLS)
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  v_pix_res := public.update_workspace_pix_settings(
    v_ws_a,
    'cpf_cnpj',
    '123.456.789-00',
    'Nubank',
    'Vendedor A'
  );
  IF v_pix_res->>'pix_key' <> '123.456.789-00' THEN
    RAISE EXCEPTION 'Falha ao salvar configurações de PIX.';
  END IF;

  -- Usuário B tentando alterar PIX da loja A deve falhar
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  BEGIN
    PERFORM public.update_workspace_pix_settings(
      v_ws_a,
      'random',
      'chave-invasora',
      'Banco X',
      'Hacker'
    );
    RAISE EXCEPTION 'ERRO DE SEGURANÇA: Usuário B alterou PIX da Loja A!';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- 2. Teste de Entrada de Estoque com novo Custo e Preço de Venda (Migration 11)
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  INSERT INTO public.products (
    workspace_id, name, cost_cents, price_cents, min_stock_qty, current_stock_qty, barcode
  )
  VALUES (
    v_ws_a, 'Perfume Lote Junho', 5000, 10000, 2, 2, '7890000009991'
  )
  RETURNING id INTO v_prod_a;

  v_stock_res := public.adjust_stock(
    v_ws_a,
    v_prod_a,
    'entry',
    8,
    'Remessa Outubro',
    'stk_phase9_test_01',
    5800,
    12000
  );

  SELECT cost_cents, price_cents INTO v_prod_cost, v_prod_price
  FROM public.products
  WHERE id = v_prod_a;

  IF v_prod_cost <> 5800 OR v_prod_price <> 12000 THEN
    RAISE EXCEPTION 'Falha ao atualizar custo/preço do produto na entrada de estoque.';
  END IF;

  -- 3. Teste de Venda com Preço Unitário Negociado no Carrinho (sem alterar catálogo)
  v_sale_res := public.create_or_confirm_sale(
    v_ws_a,
    jsonb_build_array(
      jsonb_build_object(
        'product_id', v_prod_a,
        'quantity', 2,
        'unit_price_cents', 11000
      )
    ),
    NULL,
    0,
    'Venda com preço unitário negociado',
    true,
    'sale_phase9_test_01',
    'cash',
    'pix',
    0,
    1,
    NULL,
    CURRENT_DATE
  );

  v_sale_total := (v_sale_res->>'total_cents')::integer;
  IF v_sale_total <> 22000 THEN
    RAISE EXCEPTION 'Total da venda negociada deveria ser 22000, mas foi %', v_sale_total;
  END IF;

  -- Catálogo deve permanecer em 12000
  SELECT price_cents INTO v_prod_price FROM public.products WHERE id = v_prod_a;
  IF v_prod_price <> 12000 THEN
    RAISE EXCEPTION 'Preço de catálogo não deveria ter mudado após venda negociada.';
  END IF;

  RAISE NOTICE 'SUCESSO: Todos os testes da Fase 9 (RLS, PIX, Lotes de Estoque e Preço Negociado) passaram!';
END;
$$;

ROLLBACK;
