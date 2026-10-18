# VendeFácil — Gestão Comercial e Financeira Mobile

Aplicativo mobile em **React Native + Expo + TypeScript + Expo Router** com backend gerenciado no **Supabase** (Auth, PostgreSQL, RLS e Storage privado), projetado para vendedores autônomos e pequenos negócios no Brasil.

## Decisões Arquiteturais Fixas
- **Stack Mobile:** React Native + Expo SDK 58 + TypeScript estrito + Expo Router.
- **Backend Gerenciado:** Supabase Auth, PostgreSQL, Row Level Security (RLS) e Supabase Storage.
- **Sem servidor Node.js próprio e sem MongoDB.**
- **Isolamento Multiusuário:** Todo registro comercial pertence a um `workspace` isolado por políticas RLS no PostgreSQL.
- **Moeda e Datas:** Valores monetários armazenados em centavos inteiros e exibidos em `BRL` (`R$`); datas no padrão brasileiro (`dd/MM/yyyy`).
- **Segurança no Cliente:** Apenas `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` (chave pública/anon) são utilizadas no app. A chave `service_role` **jamais** deve ser colocada no `.env` ou no código do cliente.

## Estrutura do Projeto
```text
src/
  app/                  # Rotas Expo Router: (auth), (onboarding), (tabs), customers, products, settings
  components/ui/        # Design system e componentes base reutilizáveis
  constants/theme.ts    # Tokens oficiais de cores, tipografia, espaçamento e raio
  features/
    auth/               # Schemas Zod, serviços de autenticação e SessionProvider
    workspace/          # Schemas Zod e serviços de workspace + RPC create_workspace
  lib/
    supabase.ts         # Cliente Supabase com SecureStore em blocos (chunked)
    supabaseEnv.ts      # Validação das variáveis públicas e bloqueio contra service_role
  types/
    database.ts         # Tipagem estrita do schema PostgreSQL e RPCs
  utils/
    formatters.ts       # Formatação BRL, datas dd/MM/yyyy e rateio exato de centavos
supabase/
  migrations/           # Migrações SQL versionadas
  tests/                # Testes SQL de isolamento RLS entre workspaces
docs/                   # Especificações funcionais, arquitetura, segurança e plano
design/                 # Blueprint visual de referência
```

## Scripts Disponíveis
- `npm start` / `npx expo start`: Inicia o servidor de desenvolvimento do Expo.
- `npm run android`: Abre o aplicativo em emulador ou dispositivo Android conectado.
- `npm run typecheck`: Executa `tsc --noEmit` para verificação estrita de tipos.
- `npm run lint`: Executa `eslint` sem permitir avisos ou uso de `any`.
- `npm test`: Executa a suíte de testes unitários com Vitest.

## Configuração Passo a Passo do Supabase (Ação Manual do Usuário)

1. **Criar o projeto no Supabase:**
   - Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard) e clique em **New project**.
   - Escolha a organização, defina o nome `VendeFacil`, crie uma senha forte para o banco de dados e selecione a região `South America (São Paulo)`.
2. **Configurar o arquivo `.env` local:**
   - Na raiz deste repositório, copie `.env.example` para `.env`.
   - No painel do Supabase, acesse **Project Settings > API**.
   - Copie a **Project URL** e cole em `EXPO_PUBLIC_SUPABASE_URL`.
   - Copie a chave pública **anon / public** (ou publishable key) e cole em `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   - **Importante:** Nunca copie a chave `service_role`!
3. **Executar a Migração SQL da Fase 1:**
   - No painel do Supabase, abra **SQL Editor > New query**.
   - Copie todo o conteúdo de `supabase/migrations/20261017000001_phase1_foundation.sql`, cole no editor e clique em **Run**.
4. **Validar o Isolamento RLS (Opcional, recomendado):**
   - No **SQL Editor**, abra uma nova query, cole o conteúdo de `supabase/tests/phase1_rls_isolation_test.sql` e clique em **Run**.
   - Confirme que a mensagem `SUCESSO: Isolamento entre workspaces e bloqueio de escalada validados!` aparece na aba **Messages** (o script faz `ROLLBACK` automático ao final).
