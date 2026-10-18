# 08 — Testes e qualidade

## Checks
Configurar scripts compatíveis com Expo instalado: `typecheck` (`tsc --noEmit`), lint, testes e formatter se adotado.

## Unitários
- Formatação BRL.
- Subtotal/desconto.
- Distribuição de centavos entre parcelas sem perder centavos.
- Saldo após pagamento parcial.
- Regras de juros após definição formal.
- Estoque mínimo e validação de quantidades.
- Datas de fim de mês/ano e timezone.

## Integração
- Auth e criação de workspace.
- CRUD de clientes/produtos.
- Upload/visualização de imagem privada.
- Venda com vários itens e baixa única.
- Cancelamento e estorno.
- Pagamento parcial/integral.
- Retry não duplica pagamento/movimento.

## Segurança
Testar dois usuários/workspaces: sem leitura cruzada, escrita cruzada, acesso a imagem alheia ou escalada de papel.

## UI
Verificar loading, vazio, erro/retry, sucesso, teclado, texto longo, fonte ampliada, toque e conexão interrompida.

## Pronto
Compilar não basta: exigir validação, autorização, tratamento de erro e testes proporcionais ao risco.
