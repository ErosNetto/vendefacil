# 05 — Modelo de dados

## Entidades
`profiles`, `workspaces`, `workspace_members`, `customers`, `categories`, `products`, `product_images`, `suppliers`, `purchases`, `purchase_items`, `stock_movements`, `sales`, `sale_items`, `installments`, `payments`, `payment_allocations`, `expenses`, `audit_logs`.

## Relacionamentos
Workspace tem clientes/produtos/vendas/despesas/movimentos; usuário pertence a workspaces por membership; cliente tem vendas; venda tem itens e parcelas; produto tem imagens e movimentos; pagamento tem alocações para parcelas.

## Regras
- Tabelas comerciais têm `workspace_id` e RLS.
- Usar constraints/foreign keys compostas quando necessário para impedir relações cruzadas entre workspaces.
- Dinheiro em centavos; snapshots de nome/SKU/preço/custo nos itens vendidos.
- `stock_movements` append-only; correções criam movimentos inversos.
- Recebimentos e estornos não são apagados silenciosamente.
- Parcelas têm vencimento, principal, juros, multa, valor alocado e saldo.
- Evitar status duplicados contraditórios.
- Revisar `ON DELETE` para preservar integridade financeira.

## RPCs necessárias
1. `create_workspace(name)` cria workspace e owner atomicamente.
2. `add_workspace_member(...)` valida papel e evita escalada.
3. `confirm_sale(...)` valida preços/estoque e cria movimentos atomicamente, com idempotência.
4. `cancel_sale(...)` gera estornos/auditoria.
5. `record_payment(...)` cria recebimento e aloca parcelas atomicamente.
6. `adjust_stock(...)` valida autorização/motivo e cria movimento.
7. Consultas agregadas seguras para dashboard/relatórios.

Versionar SQL em `supabase/migrations/`. Migração já aplicada não deve ser editada em ambiente compartilhado; criar outra migração.
