-- =============================================================================
-- VendeFácil — Migração: Dados PIX da Loja/Vendedor para Cobrança via WhatsApp
-- =============================================================================

begin;

alter table public.workspaces
  add column if not exists pix_key_type text null
    check (pix_key_type is null or pix_key_type in ('cpf_cnpj', 'phone', 'email', 'random')),
  add column if not exists pix_key text null
    check (pix_key is null or char_length(trim(pix_key)) <= 140),
  add column if not exists pix_bank_name text null
    check (pix_bank_name is null or char_length(trim(pix_bank_name)) <= 80),
  add column if not exists pix_holder_name text null
    check (pix_holder_name is null or char_length(trim(pix_holder_name)) <= 120);

create or replace function public.update_workspace_pix_settings(
  p_workspace_id uuid,
  p_pix_key_type text default null,
  p_pix_key text default null,
  p_pix_bank_name text default null,
  p_pix_holder_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_clean_type text := nullif(trim(coalesce(p_pix_key_type, '')), '');
  v_clean_key text := nullif(trim(coalesce(p_pix_key, '')), '');
  v_clean_bank text := nullif(trim(coalesce(p_pix_bank_name, '')), '');
  v_clean_holder text := nullif(trim(coalesce(p_pix_holder_name, '')), '');
  v_ws public.workspaces%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'Espaço de trabalho inválido.'
      using errcode = '22023';
  end if;

  if not public.has_workspace_role(
    p_workspace_id,
    array['owner'::public.workspace_role, 'admin'::public.workspace_role]
  ) then
    raise exception 'Somente proprietários ou administradores podem alterar os dados PIX da loja.'
      using errcode = '42501';
  end if;

  if v_clean_type is not null and v_clean_type not in ('cpf_cnpj', 'phone', 'email', 'random') then
    raise exception 'Tipo de chave PIX inválido.'
      using errcode = '22023';
  end if;

  if v_clean_key is not null and char_length(v_clean_key) > 140 then
    raise exception 'A chave PIX deve ter no máximo 140 caracteres.'
      using errcode = '22023';
  end if;

  if v_clean_bank is not null and char_length(v_clean_bank) > 80 then
    raise exception 'O nome do banco deve ter no máximo 80 caracteres.'
      using errcode = '22023';
  end if;

  if v_clean_holder is not null and char_length(v_clean_holder) > 120 then
    raise exception 'O nome do titular deve ter no máximo 120 caracteres.'
      using errcode = '22023';
  end if;

  -- Se a chave PIX foi limpa, limpa também os campos auxiliares
  if v_clean_key is null then
    v_clean_type := null;
    v_clean_bank := null;
    v_clean_holder := null;
  elsif v_clean_type is null then
    v_clean_type := 'cpf_cnpj';
  end if;

  update public.workspaces
  set
    pix_key_type = v_clean_type,
    pix_key = v_clean_key,
    pix_bank_name = v_clean_bank,
    pix_holder_name = v_clean_holder,
    updated_at = now()
  where id = p_workspace_id
  returning * into v_ws;

  if not found then
    raise exception 'Espaço de trabalho não encontrado.'
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_workspace_id,
    v_user_id,
    'workspace.pix_settings_updated',
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'pix_key_type', v_ws.pix_key_type,
      'has_pix_key', (v_ws.pix_key is not null),
      'pix_bank_name', v_ws.pix_bank_name,
      'pix_holder_name', v_ws.pix_holder_name
    )
  );

  return jsonb_build_object(
    'workspace_id', v_ws.id,
    'pix_key_type', v_ws.pix_key_type,
    'pix_key', v_ws.pix_key,
    'pix_bank_name', v_ws.pix_bank_name,
    'pix_holder_name', v_ws.pix_holder_name
  );
end;
$$;

revoke all on function public.update_workspace_pix_settings(uuid, text, text, text, text) from public;
grant execute on function public.update_workspace_pix_settings(uuid, text, text, text, text) to authenticated;

commit;
