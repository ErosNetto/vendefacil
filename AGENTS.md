# AGENTS.md — Regras para Gemini CLI

## Missão
Implementar o VendeFácil no repositório aberto, usando `AIContext.md` como contexto canônico e `docs/` como especificação.

## Stack obrigatória
- React Native + Expo + TypeScript.
- Expo Router.
- Supabase Auth, PostgreSQL, RLS e Storage.
- Sem backend Node.js próprio; não usar MongoDB.
- Futuro web em Next.js, no mesmo Supabase.
- UI em português brasileiro, moeda BRL e datas `dd/MM/yyyy`.

## Antes de alterar
1. Inspecione o repositório e identifique o que já existe.
2. Leia `AIContext.md` e documentos relevantes.
3. Resuma estado atual e proponha a menor próxima etapa verificável.
4. Não sobrescreva código sem entender o estado.
5. Faça mudanças pequenas, testáveis e documentadas.

## Arquitetura
- Separe UI, features, serviços de dados, validação, tipos e utilitários.
- Use TypeScript estrito e evite `any`.
- Use versões compatíveis com Expo instalado; prefira `npx expo install` para dependências nativas.
- Não coloque toda a lógica nas telas.
- Operações críticas (confirmar venda + baixar estoque; registrar pagamento + alocar parcelas) devem ser atômicas no PostgreSQL via RPC/transações.
- Não criar servidor Node.js separado.

## Segurança obrigatória
- Nunca colocar service-role key, token privado ou segredo no cliente, no Git ou em docs.
- `EXPO_PUBLIC_*` é público; só URL e chave publicável/anon podem ser usadas.
- RLS em todas as tabelas privadas; isolamento por workspace validado no banco.
- Bucket de imagens privado; salvar `storage_path`, não URL pública permanente.
- Validar MIME, tamanho e autorização de upload.
- Não confiar em `workspace_id`, preço, total, desconto ou role enviados pelo cliente sem validação no banco.
- Impedir escalada de privilégios e acesso cruzado entre workspaces.
- Operações críticas precisam de proteção contra retries e double tap.
- Não apagar silenciosamente histórico financeiro; usar cancelamentos/estornos auditáveis.
- Não inventar regra de juros: definir fórmula, dias, arredondamento e pagamentos parciais antes de implementar.

## Processo por fase
1. Ler a especificação.
2. Implementar um incremento pequeno.
3. Rodar lint, typecheck e testes disponíveis.
4. Corrigir erros introduzidos.
5. Resumir arquivos alterados e comandos realmente executados.
6. Listar bloqueios e passos manuais exatos.
7. Atualizar `docs/07-plano-de-implementacao.md`.

## Interação com usuário
- Responder em português brasileiro, direto e didático.
- Diferenciar o que foi executado pelo agente do que o usuário deve fazer.
- Ao pedir ação manual, dizer onde entrar, o que clicar/copiar/colar e como validar.
- Não presumir acesso ao Supabase, GitHub, EAS, Android Studio ou aparelho.
- Nunca pedir service-role key.
- Se uma tarefa depender de acesso externo, implemente o que for possível localmente e explique a limitação.

## Design
Siga `docs/04-design-system.md` e `design/vendefacil-design-blueprint.png`. Não reproduza erros textuais do moodboard. Use componentes consistentes, ícones de verdade, acessibilidade e estados loading/vazio/erro/sucesso.

## Definição de pronto
Não marcar como pronto só porque compila ou há uma tela estática. Exigir validação, autorização, tratamento de erros e testes proporcionais ao risco. Nunca alegar que um build/deploy/teste foi feito se não foi executado.
