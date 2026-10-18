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

## Fase 2 — Clientes
- [x] CRUD, busca, filtro, arquivamento (`supabase/migrations/20261018000002_phase2_customers.sql`).
- [x] Validação e estados (`src/features/customers/`, `src/app/customers/`).
- [x] Teste de isolamento (`supabase/tests/phase2_customers_rls_test.sql`).

## Fase 3 — Produtos e fotos
- [x] CRUD produtos/categorias (`supabase/migrations/20261018000003_phase3_products_and_storage.sql`, `src/features/products/`).
- [x] Câmera/galeria e prévia (`src/features/products/imageService.ts`, `src/features/products/ProductForm.tsx`).
- [x] Otimização e upload privado (`expo-image-manipulator` WebP + bucket privado `product-images`).
- [x] URL assinada, substituição e remoção (`getSignedProductImageUrl`, `uploadProductImageToPrivateBucket`, `removeProductPrimaryImage`).
- [x] Testes RLS/Storage (`supabase/tests/phase3_products_storage_rls_test.sql` + `src/features/products/schemas.test.ts`).

> **Nota de validação da Fase 3:** Execute `supabase/migrations/20261018000003_phase3_products_and_storage.sql` no SQL Editor do Supabase para criar as tabelas `categories`, `products`, `product_images`, o bucket privado `product-images` e as políticas RLS de banco e Storage.

## Fase 4 — Estoque
- [x] Lista/detalhe e alertas de mínimo (`src/app/(tabs)/inventory.tsx`, `src/features/inventory/schemas.ts`).
- [x] Entradas, ajustes, danos e devoluções (`src/app/inventory/adjust.tsx`, `src/features/inventory/services.ts`).
- [x] Histórico append-only (`src/app/inventory/movements.tsx`, `public.stock_movements`).
- [x] RPC transacional e testes contra duplicação/saldo negativo (`supabase/migrations/20261018000004_phase4_inventory.sql`, `supabase/tests/phase4_inventory_rls_and_rpc_test.sql`, `src/features/inventory/schemas.test.ts`).

> **Nota de validação da Fase 4:** Execute `supabase/migrations/20261018000004_phase4_inventory.sql` no SQL Editor do Supabase para criar a tabela append-only `stock_movements` e a função atômica e idempotente `adjust_stock`.

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
