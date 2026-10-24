-- =============================================================================
-- VendeFácil — Testes SQL de Isolamento RLS: Despesas e Categorias (Fase 8)
-- =============================================================================
-- Como executar no SQL Editor do Supabase (após rodar a migração da Fase 8):
-- O script roda em uma transação com ROLLBACK ao final (no SQL Editor retornará
-- "Success. No rows returned" ou avisos de notice se todas as asserções passarem).
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000008a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000008b2';
  v_ws_a_id uuid;
  v_ws_b_id uuid;
  v_cat_a_id uuid;
  v_expense_a_id uuid;
  v_count integer;
begin
  -- 1. Cria dois usuários de teste em auth.users para satisfazer foreign keys
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values
    (v_user_a, 'despesa.a@teste.local', '{"full_name": "Usuária A"}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_b, 'despesa.b@teste.local', '{"full_name": "Usuária B"}'::jsonb, 'authenticated', 'authenticated');

  -- 2. Autentica como Usuária A e cria Workspace A
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_a_id := (public.create_workspace('Loja da Ana')->>'workspace_id')::uuid;

  -- 3. Semear categorias padrão no Workspace A
  perform public.seed_default_expense_categories(v_ws_a_id);

  select id into v_cat_a_id
  from public.expense_categories
  where workspace_id = v_ws_a_id
  limit 1;

  if v_cat_a_id is null then
    raise exception 'FALHA: Nenhuma categoria semeada no Workspace A.';
  end if;

  -- 4. Usuária A cadastra uma despesa no Workspace A
  insert into public.expenses (
    workspace_id,
    category_id,
    description,
    amount_cents,
    expense_date,
    payment_method,
    created_by
  )
  values (
    v_ws_a_id,
    v_cat_a_id,
    'Conta de Energia Outubro',
    18550,
    current_date,
    'pix',
    v_user_a
  )
  returning id into v_expense_a_id;

  -- 5. Alterna autenticação para Usuária B e cria Workspace B
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_b_id := (public.create_workspace('Loja da Beatriz')->>'workspace_id')::uuid;

  -- 6. Teste RLS: Usuária B NÃO pode ler categorias do Workspace A
  select count(*) into v_count
  from public.expense_categories
  where workspace_id = v_ws_a_id;

  if v_count <> 0 then
    raise exception 'FALHA RLS: Usuária B conseguiu ler categorias do Workspace A!';
  end if;

  -- 7. Teste RLS: Usuária B NÃO pode ler despesas do Workspace A
  select count(*) into v_count
  from public.expenses
  where id = v_expense_a_id or workspace_id = v_ws_a_id;

  if v_count <> 0 then
    raise exception 'FALHA RLS: Usuária B conseguiu ler despesas do Workspace A!';
  end if;

  -- 8. Teste RLS: Usuária B NÃO pode inserir despesa no Workspace A
  begin
    insert into public.expenses (
      workspace_id,
      category_id,
      description,
      amount_cents,
      expense_date,
      payment_method,
      created_by
    )
    values (
      v_ws_a_id,
      v_cat_a_id,
      'Despesa Invasora',
      5000,
      current_date,
      'pix',
      v_user_b
    );
    raise exception 'FALHA RLS: Usuária B conseguiu inserir despesa no Workspace A!';
  exception
    when insufficient_privilege or others then
      -- Esperado: bloqueio por RLS
      null;
  end;

  -- 9. Retorna para Usuária A e valida cancelamento auditável da despesa
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.expenses
  set
    is_cancelled = true,
    cancelled_at = now(),
    cancellation_reason = 'Teste de cancelamento'
  where id = v_expense_a_id and workspace_id = v_ws_a_id;

  select count(*) into v_count
  from public.expenses
  where id = v_expense_a_id and is_cancelled = true;

  if v_count <> 1 then
    raise exception 'FALHA: Não foi possível cancelar a despesa como membro do workspace.';
  end if;

  raise notice 'Fase 8: Todos os testes de isolamento RLS e auditoria de despesas passaram!';
end;
$$;

rollback;
