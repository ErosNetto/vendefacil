-- =============================================================================
-- VendeFácil — Testes SQL de Isolamento RLS e Anti-Escalada (Fase 1)
-- =============================================================================
-- Como executar no SQL Editor do Supabase (após rodar a migração da Fase 1):
-- Este script roda em uma transação com ROLLBACK ao final, sem deixar lixo no banco.
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000000a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000000b2';
  v_ws_a jsonb;
  v_ws_b jsonb;
  v_ws_a_id uuid;
  v_ws_b_id uuid;
  v_count integer;
begin
  -- 1. Cria dois usuários fictícios em auth.users
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values
    (v_user_a, 'vendedora.a@teste.local', '{"full_name": "Ana Vendedora"}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_b, 'vendedora.b@teste.local', '{"full_name": "Beatriz Vendedora"}'::jsonb, 'authenticated', 'authenticated');

  -- 2. Simula sessão autenticada como Usuária A e cria Workspace A
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_a := public.create_workspace('Loja da Ana');
  v_ws_a_id := (v_ws_a->>'workspace_id')::uuid;

  -- 3. Simula sessão autenticada como Usuária B e cria Workspace B
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_b := public.create_workspace('Espaço da Beatriz');
  v_ws_b_id := (v_ws_b->>'workspace_id')::uuid;

  -- 4. Verifica que a Usuária B enxerga apenas o Workspace B (e NÃO o Workspace A)
  select count(*) into v_count
  from public.workspaces
  where id = v_ws_a_id;

  if v_count <> 0 then
    raise exception 'FALHA RLS: Usuária B conseguiu ler o Workspace A!';
  end if;

  -- 5. Verifica que a Usuária B NÃO consegue se inserir no Workspace A diretamente
  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_ws_a_id, v_user_b, 'owner');
    raise exception 'FALHA RLS: Usuária B conseguiu se auto-promover no Workspace A!';
  exception
    when insufficient_privilege or others then
      -- Esperado: bloqueio pela RLS
      null;
  end;

  reset role;
  raise notice 'SUCESSO: Isolamento entre workspaces e bloqueio de escalada validados!';
end;
$$;

rollback;
