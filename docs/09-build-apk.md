# 09 — Desenvolvimento, Build do APK Android e Backup

## 1. Como funciona a geração do APK (Local + Site do Expo)
O processo usa o **EAS Build** (serviço oficial do Expo):
- **Aqui no projeto (já configurado):**
  - Ícones oficiais gerados em `assets/icon.png`, `assets/adaptive-icon.png` e `assets/splash-icon.png` (1024x1024px na paleta `#087F5B`).
  - Manifesto [`app.json`](../app.json) configurado com pacote `br.com.vendefacil.app`, `versionCode: 1` e permissões de câmera/galeria em português.
  - Perfil `preview` configurado em [`eas.json`](../eas.json) com `"buildType": "apk"` (para gerar um instalador `.apk` direto, e não `.aab` de loja).
- **No seu terminal + Painel Web do Expo (`expo.dev`):**
  - Você dispara o comando pelo terminal do Windows e os servidores do Expo compilam o APK na nuvem em ~5 a 10 minutos, gerando um **link e QR Code** para você abrir no celular e instalar.

---

## 2. Passo a passo exato para gerar e instalar seu APK

### Passo 1 — Criar conta gratuita no Expo (se ainda não tiver)
1. Acesse [https://expo.dev/signup](https://expo.dev/signup) e crie sua conta gratuita.

### Passo 2 — Fazer login no EAS pelo terminal
No terminal do Windows (dentro da pasta `C:\Users\erosn\Downloads\vendefacil`), rode:
```powershell
npx eas-cli login
```
*(Digite seu e-mail/usuário e senha do Expo).*

### Passo 3 — Vincular o projeto e enviar as variáveis públicas do `.env`
Como o arquivo `.env` não vai para o Git por segurança, envie as duas variáveis públicas (`EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`) para o ambiente `preview` do EAS:

1. Inicialize o projeto no EAS (se perguntar *"Would you like to automatically create an EAS project..."*, responda **`Y`**):
   ```powershell
   npx eas-cli project:init
   ```
2. Envie o seu `.env` local para o ambiente `preview` do Expo:
   ```powershell
   npx eas-cli env:push --environment preview --path .env
   ```
   *(Alternativa pelo site: você também pode entrar em `expo.dev` -> seu projeto `vendefacil` -> menu **Environment variables** -> adicionar `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` com visibilidade **Plain text** para o ambiente **Preview**).*

### Passo 4 — Disparar a geração do APK na nuvem
No terminal, execute:
```powershell
npx eas-cli build --platform android --profile preview
```
- Se perguntar *"Generate a new Android Keystore?"*, responda **`Y`** (o Expo cria e guarda a chave de assinatura do Android para você).
- O terminal mostrará o link do build no painel `https://expo.dev/accounts/.../builds/...`.
- Quando terminar (status **Finished**), basta **ler o QR Code com a câmera do celular** ou abrir o link no celular, baixar o arquivo `.apk` e instalar!

---

## 3. Procedimento de Backup e Restauração (Supabase)

### Backup dos Dados (PostgreSQL)
1. **Exportação rápida pelo App (CSV para Excel):**
   - No próprio VendeFácil, vá em **Relatórios** (`/reports`) e utilize o botão de **Exportar CSV** para salvar DRE, Fluxo de Caixa, Vendas e Despesas a qualquer momento.
2. **Backup completo do banco pelo painel do Supabase:**
   - Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard) -> selecione seu projeto -> **Database** -> **Backups** (ou execute `pg_dump` usando a string de conexão em **Project Settings -> Database**).
3. **Estrutura reproduzível (Migrations):**
   - Todas as 11 migrações SQL numeradas (`supabase/migrations/20261017000001_*.sql` até `20261031000011_*.sql`) recriam 100% das tabelas, índices, políticas RLS, triggers, bucket privado `product-images` e RPCs transacionais em qualquer projeto Supabase novo.

### Backup das Fotos de Produtos (Supabase Storage)
- As fotos ficam no bucket privado `product-images` organizadas por `<workspace_id>/<product_id>/<arquivo>.jpg`.
- Pelo painel do Supabase -> **Storage** -> `product-images`, você pode visualizar ou baixar os objetos armazenados.
