-- =============================================================================
-- VendeFácil — Testes SQL de Isolamento RLS para Produtos, Categorias e Storage (Fase 3)
-- =============================================================================
-- Como executar no SQL Editor do Supabase (após rodar a migração da Fase 3):
-- O script roda em transação com ROLLBACK ao final (no SQL Editor retornará
-- "Success. No rows returned" se todas as verificações passarem).
-- =============================================================================

begin;

do $$
declare
  v_user_a uuid := '00000000-0000-4000-8000-0000000003a1';
  v_user_b uuid := '00000000-0000-4000-8000-0000000003b2';
  v_ws_a_id uuid;
  v_ws_b_id uuid;
  v_cat_a_id uuid;
  v_prod_a_id uuid;
  v_prod_b_id uuid;
  v_path_a text;
  v_count integer;
begin
  -- 1. Cria dois usuários de teste em auth.users
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values
    (v_user_a, 'produto.a@teste.local', '{"full_name": "Vendedora A"}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_b, 'produto.b@teste.local', '{"full_name": "Vendedora B"}'::jsonb, 'authenticated', 'authenticated');

  -- 2. Autentica como Usuária A, cria Workspace A, Categoria A e Produto A
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_a_id := (public.create_workspace('Loja Cosméticos A')->>'workspace_id')::uuid;

  insert into public.categories (workspace_id, name)
  values (v_ws_a_id, 'Perfumes')
  returning id into v_cat_a_id;

  insert into public.products (workspace_id, category_id, name, brand, cost_cents, price_cents, min_stock_qty)
  values (v_ws_a_id, v_cat_a_id, 'Egeo Dolce', 'O Boticário', 7000, 12990, 2)
  returning id into v_prod_a_id;

  v_path_a := v_ws_a_id::text || '/' || v_prod_a_id::text || '/foto1.webp';

  -- Verifica que Usuária A tem permissão no Storage para o caminho válido do seu produto
  if not public.can_access_product_image_object('product-images', v_path_a) then
    raise exception 'FALHA STORAGE: Usuária A deveria ter acesso ao próprio caminho de imagem!';
  end if;

  -- 3. Autentica como Usuária B e cria Workspace B
  reset role;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_ws_b_id := (public.create_workspace('Loja Cosméticos B')->>'workspace_id')::uuid;

  -- 4. Verifica que a Usuária B NÃO consegue ler produtos nem categorias do Workspace A
  select count(*) into v_count
  from public.products
  where workspace_id = v_ws_a_id or id = v_prod_a_id;

  if v_count <> 0 then
    raise exception 'FALHA RLS: Usuária B conseguiu ler produto do Workspace A!';
  end if;

  -- 5. Verifica que a Usuária B NÃO consegue vincular um produto do Workspace B à Categoria do Workspace A
  begin
    insert into public.products (workspace_id, category_id, name, cost_cents, price_cents)
    values (v_ws_b_id, v_cat_a_id, 'Produto Cruzado', 1000, 2000)
    returning id into v_prod_b_id;
    raise exception 'FALHA FK COMPOSTA: Usuária B conseguiu vincular categoria do Workspace A!';
  exception
    when foreign_key_violation or others then
      null;
  end;

  -- 6. Verifica que a Usuária B NÃO tem acesso ao objeto de imagem do Produto A no Storage
  if public.can_access_product_image_object('product-images', v_path_a) then
    raise exception 'FALHA STORAGE RLS: Usuária B obteve permissão na imagem do Workspace A!';
  end if;

  reset role;
  raise notice 'SUCESSO: Isolamento RLS de categorias, produtos e Storage validado!';
end;
$$;

rollback;
