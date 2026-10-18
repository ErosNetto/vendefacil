# 06 — Segurança Supabase

- O app é cliente público; bundle pode ser inspecionado.
- Só URL e chave publishable/anon podem estar no app; nunca service-role key.
- RLS em toda tabela privada; policies validam membership do workspace.
- Storage privado `product-images`; caminho `<workspace_uuid>/<product_uuid>/<random_filename>.webp`.
- Validar MIME, tamanho, membership e tipo de arquivo.
- Salvar `storage_path`; gerar URL assinada temporária para exibir imagem.
- Não confiar em `workspace_id`, preço, total, desconto ou papel enviado pela UI.
- Funções `SECURITY DEFINER`: `search_path` seguro, privilégio mínimo, validação explícita de auth e membership.
- Operações críticas precisam ser transacionais e idempotentes.
- Não logar telefones, e-mails ou notas de clientes.
- Usar dados fictícios no desenvolvimento; considerar LGPD.

## Checklist pré-produção
- [ ] Dois workspaces provam isolamento de leitura/escrita.
- [ ] Testes de Storage autorizado/não autorizado.
- [ ] Usuário não consegue se promover a owner/admin.
- [ ] Nenhum segredo no Git ou bundle.
- [ ] Backup/recuperação avaliados.
- [ ] Regras de juros documentadas e testadas.
