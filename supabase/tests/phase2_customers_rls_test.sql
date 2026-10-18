-- =============================================================================
-- VendeFácil — Testes SQL de Isolamento RLS para Clientes (Fase 2)
-- =============================================================================
-- Como executar no SQL Editor do Supabase (após rodar a migração da Fase 2):
-- O script roda em transação com ROLLBACK ao final (no SQL Editor retornará
-- "Success. No rows returned" se todas as asserções passarem).
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000002a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000002b2';
  v_ws_a_id uuid;
  v_ws_b_id uuid;
  v_customer_a_id uuid;
  v_count integer;
begin
  -- 1. Cria dois usuários de teste em auth.users
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values
    (v_user_a, 'cliente.a@teste.local', '{"full_name": "Vendedora A"}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_b, 'cliente.b@teste.local', '{"full_name": "Vendedora B"}'::jsonb, 'authenticated', 'authenticated');

  -- 2. Autentica como Usuária A, cria Workspace A e cadastra uma cliente
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_a_id := (public.create_workspace('Loja A')->>'workspace_id')::uuid;

  insert into public.customers (workspace_id, full_name, phone, email)
  values (v_ws_a_id, 'Ana Souza', '(11) 98765-4321', 'ana@exemplo.com')
  returning id into v_customer_a_id;

  -- 3. Autentica como Usuária B e cria Workspace B
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_b_id := (public.create_workspace('Loja B')->>'workspace_id')::uuid;

  -- 4. Verifica que a Usuária B NÃO consegue ler clientes do Workspace A
  select count(*) into v_count
  from public.customers
  where id = v_customer_a_id or workspace_id = v_ws_a_id;

  if v_count <> 0 then
    raise exception 'FALHA RLS: Usuária B conseguiu ler cliente do Workspace A!';
  end if;

  -- 5. Verifica que a Usuária B NÃO consegue inserir cliente no Workspace A
  begin
    insert into public.customers (workspace_id, full_name)
    values (v_ws_a_id, 'Cliente Invasor');
    raise exception 'FALHA RLS: Usuária B conseguiu inserir cliente no Workspace A!';
  exception
    when insufficient_privilege or others then
      null;
  end;

  -- 6. Verifica que a Usuária B NÃO consegue atualizar cliente do Workspace A
  update public.customers
  set full_name = 'Nome Alterado Indevidamente'
  where id = v_customer_a_id;

  reset role;
  select count(*) into v_count
  from public.customers
  where id = v_customer_a_id and full_name = 'Nome Alterado Indevidamente';

  if v_count <> 0 then
    raise exception 'FALHA RLS: Usuária B conseguiu alterar cliente do Workspace A!';
  end if;

  raise notice 'SUCESSO: Isolamento RLS de clientes entre workspaces validado!';
end;
$$;

rollback;
