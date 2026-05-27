# AGENTS.md

Guia operacional para agents que trabalhem neste projeto.

## Projeto

App mobile-first para gerir jogos de padel entre amigos.

Objetivos principais:

- Registar jogadores.
- Registar jogos 2v2 em melhor de 3 sets.
- Calcular ratings.
- Mostrar ranking, historico, fichas de jogador e detalhe de jogos.
- Evoluir para temporadas, estatisticas, sorteio de equipas e features sociais.

Stack obrigatoria:

- Next.js App Router
- React
- TypeScript
- Supabase
- CSS global simples em `app/globals.css`
- `lucide-react` para iconografia

Nao transformar isto numa landing page. A app deve continuar a parecer ferramenta de telemovel para usar antes/depois dos jogos.

## Comandos

```bash
npm install
npm run dev
npm run build
```

Antes de terminar qualquer tarefa que toque em TypeScript, Supabase client, componentes ou CSS:

```bash
npm run build
```

## Estrutura Atual

- `app/page.tsx`: home curta com resumo, acoes e top ranking.
- `app/registar/page.tsx`: registo de jogo.
- `app/jogos/page.tsx`: lista de jogos e apagar jogo.
- `app/jogos/[id]/page.tsx`: detalhe de jogo com simulacao de campo.
- `app/jogadores/page.tsx`: lista/adicionar jogadores.
- `app/jogadores/[id]/page.tsx`: ficha de jogador estilo carta.
- `app/components/BottomNav.tsx`: navegacao inferior mobile.
- `app/globals.css`: design system e layout responsive.
- `lib/supabase.ts`: cliente Supabase.
- `lib/padel-data.ts`: funcoes de dados e mappers.
- `lib/match-utils.ts`: rating, sets e helpers de jogo.
- `lib/types.ts`: records alinhados com Supabase.
- `supabase/schema.sql`: schema base.
- `supabase/migrations/`: alteracoes incrementais.

## Skills E Protocolo Para Agents

Quando a tarefa tocar em SQL, schema, RLS, RPCs, indexes, constraints ou performance:

1. Usar a skill local instalada em `.agents/skills/supabase-postgres-best-practices`.
2. Ler apenas as referencias relevantes:
   - RLS: `references/security-rls-basics.md`
   - performance RLS: `references/security-rls-performance.md`
   - constraints: `references/schema-constraints.md`
   - foreign key indexes: `references/schema-foreign-key-indexes.md`
   - missing indexes: `references/query-missing-indexes.md`
3. Aplicar as regras ao SQL antes de editar migrations.
4. Nao depender apenas do frontend para regras de integridade.

Nota: a skill e documentacao/protocolo. Nao e uma ferramenta que executa SQL diretamente no Supabase.

## Supabase

Credenciais esperadas:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Regras:

- Nunca commitar `.env.local`.
- Toda alteracao de base deve ter migration em `supabase/migrations/`.
- Alteracoes em tabelas/retornos devem atualizar `lib/types.ts`.
- Preferir RPC para operacoes multi-step que mexem em jogos + ratings.
- Evitar sequencias frontend do tipo "insert depois update" quando precisa de atomicidade.
- RLS deve estar explicita para `anon, authenticated` enquanto nao houver Auth/grupos privados.
- Indexar foreign keys usadas em joins/filtros.

Migrations importantes:

- `20260526_match_sets.sql`: adiciona sets ao modelo de jogos.
- `20260526_delete_matches.sql`: policy para apagar jogos.
- `20260527_match_rpc_and_rating_events.sql`: `rating_events` e RPCs atomicas.

## Modelo De Dados Atual

Tabelas:

- `players`
- `matches`
- `rating_events`

RPCs:

- `register_match(...)`
  - cria o jogo
  - atualiza ratings/jogos/vitorias
  - cria eventos em `rating_events`
  - roda numa transacao

- `delete_match(p_match_id uuid)`
  - reverte eventos de rating
  - apaga o jogo
  - tem fallback para jogos antigos sem `rating_events`

O frontend deve chamar estas RPCs atraves de `lib/padel-data.ts`.

## Dominio Do Rating

Rating inicial: `1000`.

Formula atual:

- media rating vencedores
- media rating derrotados
- delta estilo Elo por equipa com `K = 24`
- multiplicador de margem:
  - 2-1: base `0.85`
  - 2-0: base `1.00`
  - +`0.05` por set ganho com diferenca >= 4 jogos
  - +`0.10` por cada set ganho a 6-0
  - maximo `1.30`
- vencedores ganham `rating_delta`
- derrotados perdem `rating_delta`

Regras:

- O rating deve ser previsivel e explicavel.
- Guardar sempre `rating_delta` no jogo.
- Guardar antes/depois em `rating_events`.
- Ao apagar jogo, reverter via `rating_events`.
- Evitar recalculos parciais no frontend.
- Se o algoritmo mudar, criar migration de recomputacao historica e atualizar `lib/match-utils.ts`.

## Fases De Produto

### Fase 1: Base Solida

Status: iniciada.

- RPC `register_match`.
- RPC `delete_match`.
- `rating_events`.
- Apagar jogo com reversao robusta.

Proximo refinamento:

- Migrar jogos antigos para `rating_events` se necessario.
- Garantir que todas as operacoes antigas usam RPC.

### Fase 2: Temporadas

- Criar `seasons`.
- Adicionar `season_id` em `matches`.
- Ranking por temporada.
- Temporada ativa.
- Nova temporada com rating inicial `1000`.

### Fase 3: Estatisticas

- Win rate.
- Forma recente.
- Melhor dupla.
- Pior dupla.
- Adversario dificil.
- Streaks.
- Pneus dados/levados.
- Grafico de rating por jogador usando `rating_events`.

### Fase 4: Pre-Jogo

- Disponibilidade.
- Proximo jogo.
- Sorteador de equipas equilibradas por rating.
- Rotacoes para 5/6/8 jogadores.

### Fase 5: Social

- Badges/conquistas.
- Notas nos jogos.
- MVP/pior da partida.
- Rivalidades/head-to-head.

### Fase 6: App Feel

- PWA.
- Melhor offline/loading.
- Auth/grupo privado.

## Regras De UI

- Mobile-first.
- Bottom nav e a navegacao principal.
- Evitar paginas "doom scroll".
- Separar tarefas por pagina:
  - home resumo
  - registar jogo
  - jogos
  - jogadores
- Texto em portugues informal.
- Nao usar cards dentro de cards sem necessidade.
- Layouts devem caber em viewport mobile sem overflow horizontal.
- Campo de padel e carta de jogador devem ser compactos em mobile.

## Qualidade

Antes de entregar:

- `npm run build`.
- Se mexer em Supabase, dizer exatamente que migration correr.
- Se mexer em UI mobile, verificar breakpoints CSS relevantes.
- Se nao for possivel testar contra Supabase real, dizer isso.
- Nao esconder erros de RLS ou migrations.

## Git

- `.env.local` fica fora do git.
- `.agents/` e `skills-lock.json` ficam fora do git.
- Fazer commits pequenos por fase quando possivel.
