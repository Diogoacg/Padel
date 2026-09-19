# Padel Weekends

App Next.js + Supabase para gerir jogos de padel entre amigos: jogadores, resultados, historico e rating.

## Arranque

```bash
npm install
npm run dev
```

Depois abre `http://localhost:3000`.

## Verificação

Usa Node.js 24. Depois de `npm ci`:

```bash
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes de navegador arrancam um servidor isolado na porta 3100 e simulam as respostas do Supabase: não precisam de credenciais nem criam jogos reais. Para um Chromium já instalado, define `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` com o caminho do executável.

O diário de decisões e verificações está em [docs/iterations](docs/iterations).

## Supabase

1. Cria um projeto no Supabase.
2. Prepara o schema e as migrations existentes em `supabase/migrations/`, respeitando a ordem e o estado já aplicado no teu projeto; o schema base sozinho não inclui todas as RPCs atuais. Não reapliques alterações a uma base existente sem rever as migrations.
3. Copia `.env.example` para `.env.local`.
4. Preenche `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

A aplicação usa o Supabase para persistir jogadores, jogos (incluindo jogos pendentes) e eventos de rating. As queries e mutações estão centralizadas em `lib/padel-queries.ts` e `lib/padel-data.ts`; configura as variáveis de ambiente antes de arrancar.

## Proximas funcoes boas

- Login e grupos privados (standby para uma fase posterior).
- Pagina de perfil por jogador com forma recente.
- Temporadas e rankings mensais.
- Convites para marcar jogos ao fim de semana.
