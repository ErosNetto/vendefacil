# 04 — Design system

Referência: `../design/vendefacil-design-blueprint.png`. É um moodboard, não uma tela pixel-perfect; não reproduzir textos ilegíveis da imagem.

## Direção
Profissional, amigável, clara, confiável e fácil para registrar vendas rapidamente.

## Tokens
- Verde principal `#087F5B`
- Verde escuro `#075B43`
- Verde suave `#E7F6EF`
- Fundo `#F5F7F6`
- Superfície `#FFFFFF`
- Texto `#17211D`
- Texto secundário `#64716B`
- Borda `#E1E8E4`
- Sucesso `#16804A`, atenção `#B7791F`, erro `#C0392B`, informação `#2563EB`

## Tipografia/espaçamento
Fonte de sistema ou Inter se compatível. Título 28–32, seção 18–22, corpo 14–16, legenda 12–13. Espaçamentos 4/8/12/16/20/24/32. Cards 16–20 radius; inputs/botões 12–14. Alvos de toque confortáveis, preferencialmente 44x44.

## Navegação inferior
Início, Vendas, Estoque, Agenda, Financeiro. Clientes e catálogo acessíveis por atalhos contextuais.

## Componentes reutilizáveis
Screen, AppHeader, MetricCard, SearchField, FilterChips, PrimaryButton, SecondaryButton, IconButton, StatusBadge, EmptyState, ErrorState, LoadingState, ProductCard, CustomerRow, MoneyText, ConfirmDialog, FormField.

## Telas
Splash/loading; login; cadastro; onboarding/workspace; dashboard; lista/detalhe/form de cliente; lista/form/detalhe de produto; câmera/galeria; histórico e ajuste de estoque; fluxo de venda; detalhe da venda; parcelas e pagamento parcial; calendário; contas a receber; despesas; relatórios; configurações.

## Dashboard
Período selecionável, cards de vendido/recebido/a receber/vencido, próximos vencimentos, estoque baixo, vendas recentes e gráficos apenas quando houver dados. Nunca mostrar dados fictícios como reais.

## Estados e acessibilidade
Toda tela de dados tem loading, vazio com ação, erro com retry e feedback de sucesso. Labels explícitos, teclado correto, contraste, fonte ampliada e status com texto/ícone além da cor.

## Consistência
Não usar emoji como ícone; não criar gráficos decorativos; usar tokens; botões com verbos claros; confirmações para ações financeiras/destrutivas.
