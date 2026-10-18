# AIContext.md — Contexto canônico do VendeFácil

## Produto
App Android para vendedores autônomos/pequenos negócios. O primeiro uso é controlar clientes, produtos, fotos, estoque, vendas, parcelas, recebimentos, despesas, calendário e relatórios.

## Decisões fixas
- Mobile: React Native + Expo + TypeScript + Expo Router.
- Backend gerenciado: Supabase Auth, PostgreSQL, RLS e Storage.
- Sem backend Node.js próprio; sem MongoDB.
- Fotos em bucket privado Supabase Storage.
- Futuro site: Next.js + TypeScript, mesmo Supabase.
- Multiusuário: workspaces; vendedores isolados; estrutura preparada para equipes.
- UI pt-BR, moeda BRL, datas `dd/MM/yyyy`.
- Dinheiro persistido em centavos inteiros quando aplicável.
- Datas de vencimento são `date` quando não representam horário; eventos usam `timestamptz`.

## Papéis
`owner`, `admin`, `seller`. Não assumir que papéis estão seguros apenas por existirem no schema: políticas e testes precisam validar as permissões no banco.

## Módulos
Autenticação/onboarding; dashboard; clientes/CRM; catálogo/categorias/fotos; estoque/movimentações; vendas/itens; parcelas/recebimentos; calendário; despesas/relatórios; configurações. Futuro: web, WhatsApp, código de barras, offline e insights.

## Regras de negócio
- Uma venda pode conter vários itens.
- Guardar snapshots de nome/SKU/preço/custo na venda.
- Confirmar venda + baixa de estoque atomicamente e sem duplicação.
- Pagamentos são eventos históricos; permitir pagamentos parciais e alocações.
- Separar principal, juros, multa, pagamentos e saldo.
- Não calcular juros sem regra explícita aprovada e testada.
- Cancelamento/devolução gera estorno auditável.
- Dashboard distingue vendido, recebido, a receber, despesas e lucro.
- Fotos privadas; banco guarda `storage_path`.
- Workspace A jamais pode acessar dados do workspace B.

## Organização desejada
`src/app/` rotas; `src/components/` UI; `src/features/<domínio>/`; `src/lib/supabase.ts`; `src/types/`; `src/utils/`; `supabase/migrations/`; `supabase/tests/`; `docs/`; `design/`.

## Design
Consultar `docs/04-design-system.md` e o moodboard `design/vendefacil-design-blueprint.png`.

## Processo
Implementar incrementalmente conforme `docs/07-plano-de-implementacao.md`. Auditar antes de alterar; testar; documentar; pedir ações manuais apenas quando necessárias.
