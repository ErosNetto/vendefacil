# 03 — Arquitetura técnica

## Stack
React Native + Expo + TypeScript + Expo Router. Supabase Auth/PostgreSQL/RLS/Storage. Sem servidor Node.js próprio. Futuro Next.js no mesmo Supabase.

## Estrutura sugerida
```text
src/app/
src/components/ui/
src/features/{auth,workspace,dashboard,customers,products,inventory,sales,receivables,calendar,reports,settings}/
src/lib/supabase.ts
src/types/
src/utils/
supabase/migrations/
supabase/tests/
docs/
design/
```

## Camadas
`app` compõe rotas; `features` organiza domínio; `services` acessa dados; `schemas` valida; `utils` contém funções puras; `components/ui` mantém consistência. Não concentrar regras nas telas.

## Dados
Dinheiro em centavos inteiros. Estoque pode usar `numeric` se quantidades fracionárias forem necessárias. Vencimento sem horário usa `date`; eventos usam `timestamptz`. Formatar com `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`.

## Operações atômicas
Confirmar venda + movimento de estoque e registrar pagamento + alocação devem ser RPC/transações PostgreSQL com validação, autorização e proteção contra repetição.

## Futuro web
Reusar banco, policies, tipos e funções puras; não tentar compartilhar componentes React Native com Next.js indiscriminadamente.
