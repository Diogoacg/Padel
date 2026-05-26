# AGENTS.md

Guia operacional para agents que trabalhem neste projeto.

## Projeto

Este projeto e uma app para gerir jogos de padel entre amigos.

Objetivo principal:

- Registar jogadores.
- Registar jogos 2v2.
- Calcular e acompanhar ratings.
- Mostrar ranking, historico e estatisticas simples do grupo.

Stack obrigatoria:

- Next.js
- React
- TypeScript
- Supabase
- CSS global/local simples, sem adicionar UI kits pesados sem necessidade.

## Comandos

Instalar dependencias:

```bash
npm install
```

Desenvolvimento:

```bash
npm run dev
```

Build de verificacao:

```bash
npm run build
```

Lint, se aplicavel:

```bash
npm run lint
```

## Estrutura Atual

- `app/page.tsx`: experiencia principal da app.
- `app/layout.tsx`: layout base e metadata.
- `app/globals.css`: estilos globais.
- `lib/supabase.ts`: cliente Supabase.
- `lib/types.ts`: tipos partilhados.
- `supabase/schema.sql`: schema inicial da base de dados.
- `.env.example`: variaveis publicas esperadas para Supabase.

## Protocolo de Trabalho

Antes de alterar:

1. Ler os ficheiros relevantes.
2. Manter a stack Next.js + Supabase.
3. Preservar o foco numa app utilizavel, nao numa landing page.
4. Evitar refactors grandes se a tarefa for pequena.
5. Confirmar com `npm run build` quando houver alteracoes em TypeScript, componentes ou config.

Ao implementar:

- Preferir componentes simples e legiveis.
- Manter types explicitos para dados de jogadores, jogos e ratings.
- Nao introduzir dependencias novas sem uma razao clara.
- Manter a UI densa, pratica e adequada a uma ferramenta usada regularmente.
- Usar `lucide-react` para icones quando fizer sentido.
- Evitar texto explicativo dentro da UI sobre como usar a app; a interface deve ser obvia.

## Supabase

Credenciais esperadas:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Regras:

- Nunca commitar `.env.local`.
- Manter migrations/schema em `supabase/`.
- Alteracoes de base de dados devem ser refletidas em `lib/types.ts`.
- Preferir queries tipadas e funcoes pequenas para acesso a dados.
- Quando ligar persistencia real, substituir progressivamente o estado local por operacoes Supabase.

Tabelas iniciais:

- `players`
- `matches`

## Dominio do Rating

O rating inicial recomendado e `1000`.

O rating atual no prototipo segue uma formula simples inspirada em Elo por equipa:

- Calcula media de rating da equipa vencedora.
- Calcula media de rating da equipa derrotada.
- Aplica delta aos dois vencedores.
- Remove delta aos dois derrotados.

Ao evoluir este sistema:

- Manter previsivel e explicavel para os utilizadores.
- Guardar o `rating_delta` no jogo.
- Considerar historico de alteracoes por jogador se for preciso auditar ratings.

## Prioridades de Produto

Proximas funcionalidades provaveis:

1. Persistencia real no Supabase.
2. Autenticacao ou grupo privado.
3. Perfil de jogador.
4. Rankings por mes/temporada.
5. Estatisticas: win rate, parceiro mais forte, adversario dificil.
6. Marcacao de jogos de fim de semana.

## Qualidade

Antes de terminar uma tarefa:

- Correr `npm run build`.
- Confirmar que a app abre em `http://localhost:3000` quando for alteracao visual.
- Mencionar qualquer teste que nao tenha sido possivel correr.
- Nao mascarar problemas de `npm audit`; explicar quando uma correcao automatica for arriscada.

## Estilo de Codigo

- Usar TypeScript estrito.
- Evitar `any`.
- Preferir nomes claros a abstracoes genericas.
- Comentarios so quando ajudam a entender uma decisao nao obvia.
- Manter texto em portugues na UI.
- Usar ASCII nos ficheiros, a menos que haja uma razao para acentos.
