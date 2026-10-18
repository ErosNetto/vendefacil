# 02 — Requisitos funcionais

## Auth e workspaces
- RF-001 cadastro/login/logout e sessão persistente.
- RF-002 primeiro usuário cria workspace e vira owner.
- RF-003 cada registro comercial pertence a workspace.
- RF-004 nenhum usuário acessa workspace de que não seja membro.
- RF-005 convites/membership só após fluxo seguro sem escalada de privilégio.

## Clientes
- RF-010 CRUD, pesquisa, filtro e arquivamento.
- RF-011 nome obrigatório; telefone, e-mail, endereço e notas opcionais.
- RF-012 ficha exibe vendas, parcelas e recebimentos.
- RF-013 arquivar não apaga histórico.

## Produtos e fotos
- RF-020 CRUD de produto/categoria.
- RF-021 nome, marca, SKU/barcode opcional, custo, preço, mínimo de estoque e descrição.
- RF-022 escolher foto da câmera/galeria, pré-visualizar, otimizar e enviar para bucket privado.
- RF-023 banco guarda `storage_path`, não URL pública permanente.
- RF-024 validar tamanho/MIME e tratar falha de upload.

## Estoque
- RF-030 entradas, saídas, ajustes, danos, devoluções e estornos.
- RF-031 saldo e histórico de movimentos.
- RF-032 alerta de saldo menor/igual ao mínimo.
- RF-033 confirmar venda e baixar estoque atomicamente.
- RF-034 impedir saldo negativo por padrão.
- RF-035 retry não duplica movimentos.

## Vendas
- RF-040 venda com vários produtos e cliente opcional.
- RF-041 snapshot de nome/SKU/preço/custo nos itens.
- RF-042 subtotal/desconto/total validados no banco.
- RF-043 rascunho e confirmação.
- RF-044 cancelamento confirmado gera estorno auditável.

## Financeiro
- RF-050 entrada e parcelamento.
- RF-051 parcelas com vencimento e principal.
- RF-052 pagamentos totais e parciais.
- RF-053 pagamento pode ser alocado em várias parcelas.
- RF-054 saldo calculado de forma consistente.
- RF-055 registrar método, data, valor e observação.
- RF-056 juros/multa somente após regra aprovada.
- RF-057 manter trilha de recebimentos e estornos.

## Dashboard, calendário e relatórios
- RF-060 filtros hoje/semana/mês/ano/período.
- RF-061 distinguir vendido, recebido, a receber, despesas e lucro estimado.
- RF-062 listar vencidos e próximos vencimentos.
- RF-063 selecionar dia no calendário e ver eventos.
- RF-064 indicadores abrem detalhes.
- RF-070 relatórios de venda, recebimento, inadimplência e estoque.
- RF-071 exportação CSV em fase posterior.

## Não funcionais
pt-BR/BRL; acessibilidade; loading/vazio/erro/sucesso; TypeScript; RLS; testes de cálculos; sem segredos no cliente; evitar hard delete financeiro.
