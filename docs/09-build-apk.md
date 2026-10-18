# 09 — Desenvolvimento e APK

## Desenvolvimento
1. Instalar Node.js LTS e Git localmente (Node é ferramenta do ecossistema Expo, não um backend hospedado).
2. Instalar Android Studio/emulador ou usar Android físico.
3. Instalar dependências compatíveis com o template Expo.
4. Configurar `.env` local com URL Supabase e chave publicável/anon.
5. Executar `npx expo start`.
6. Testar em emulador/dispositivo.

## APK
Usar EAS Build com perfil Android preview configurado para gerar APK. O agente deve verificar versões/documentação antes de assumir configurações.
1. Revisar `app.json`/`app.config.ts`.
2. Criar `eas.json` de preview APK.
3. Usuário executa `eas login` no terminal.
4. Configurar EAS se necessário.
5. Rodar build, baixar APK e instalar no aparelho.
6. Validar login, fotos, vendas e segurança.

## O que o usuário precisa fazer
Criar projeto Supabase; configurar `.env`; executar migração de desenvolvimento; fazer login EAS; testar APK no aparelho. O agente deve dizer exatamente onde clicar/colar e como confirmar sucesso. Nunca pedir service-role key nem commitar `.env`.
