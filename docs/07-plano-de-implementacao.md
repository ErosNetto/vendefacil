# 07 — Plano de implementação

## Fase 0 — Auditoria
- [x] Inspecionar repo e versões.
- [x] Confirmar Expo Router/TypeScript.
- [x] Estruturar features.
- [x] Configurar lint, typecheck e testes.

## Fase 1 — Fundação
- [x] Design tokens/componentes base.
- [x] Navegação e layouts.
- [x] Cliente Supabase com sessão segura.
- [x] Login, cadastro, logout, loading/erro.
- [x] Criar workspace com RPC segura (`supabase/migrations/20261017000001_phase1_foundation.sql`).
- [x] Tela de onboarding/sem workspace.

> **Nota de validação da Fase 1:** Código mobile, tipos estritos, validações Zod, testes unitários e migração SQL transacional com RLS e testes SQL (`supabase/tests/phase1_rls_isolation_test.sql`) estão implementados e verificados localmente. Falta apenas a ação manual do usuário para configurar o `.env` com seu projeto Supabase e executar a migração SQL no painel do Supabase.

## Fase 2 — Clientes
- [ ] CRUD, busca, filtro, arquivamento.
- [ ] Validação e estados.
- [ ] Teste de isolamento.

## Fase 3 — Produtos e fotos
- [ ] CRUD produtos/categorias.
- [ ] Câmera/galeria e prévia.
- [ ] Otimização e upload privado.
- [ ] URL assinada, substituição e remoção.
- [ ] Testes RLS/Storage.

## Fase 4 — Estoque
- [ ] Lista/detalhe e alertas de mínimo.
- [ ] Entradas, ajustes, danos e devoluções.
- [ ] Histórico append-only.
- [ ] RPC transacional e testes contra duplicação/saldo negativo.

## Fase 5 — Vendas
- [ ] Carrinho multi-itens.
- [ ] Snapshots de preço/custo.
- [ ] Rascunho, confirmação e cancelamento.
- [ ] RPC transacional com baixa de estoque.
- [ ] Testes de retry/concorrência.

## Fase 6 — Financeiro
- [ ] Entrada, parcelas e contas a receber.
- [ ] Pagamentos parciais e alocações.
- [ ] RPC transacional.
- [ ] Definir juros antes de programar.
- [ ] Testes de arredondamento e atraso.

## Fase 7 — Dashboard/calendário
- [ ] Métricas reais por período.
- [ ] Vencimentos e agenda.
- [ ] Alertas de estoque.
- [ ] Testes de datas/timezone.

## Fase 8 — Despesas/relatórios
- [ ] Despesas e relatórios.
- [ ] Exportação CSV.
- [ ] Validar receita vs recebimento vs lucro.

## Fase 9 — APK
- [ ] Testes RLS e fluxos ponta a ponta.
- [ ] Acessibilidade/performance.
- [ ] Ícone/splash/configuração Android.
- [ ] EAS Build APK de preview.
- [ ] Instalar e testar em aparelho real.
- [ ] Documentar backup.

Não marcar tarefa concluída sem implementar e verificar. Atualizar este checklist após cada fase.
