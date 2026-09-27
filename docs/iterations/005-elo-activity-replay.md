# Iteração 005 — Elo por equipas e atividade reversível

## Objetivo e âmbito (definidos antes da implementação)

Dar prioridade no ranking a quem continua a jogar, mantendo o Elo competitivo uma medida da força demonstrada. Recalcular os resultados das épocas pela ordem cronológica e conservar o histórico original. Abrange a migração da base de dados, a pré-visualização e o sorteio no cliente, os testes e a explicação no perfil. Não altera os resultados, as equipas nem as datas dos jogos existentes.

## Critérios de aceitação

- Cada resultado usa **a média do Elo base dos dois jogadores de cada equipa**, com expectativa logística de Elo (escala 400), K=32, vitória 2–0 multiplicada por 1,10 ou 2–1 por 0,90; os quatro jogadores da partida ganham ou perdem o mesmo delta.
- O ranking apresentado é `max(0, elo_base - penalização)`. A penalização começa depois de 14 dias sem jogo concluído na época ativa, sobe 25 pontos por semana iniciada e tem teto de 200. Ao voltar a jogar, recupera a penalização; o Elo base não perde pontos por inatividade.
- Recalcular jogos concluídos por data/criação/ID em cada época; partidas pendentes não contam como jogo ou atividade. Inserir, corrigir ou apagar um resultado anterior refaz os resultados posteriores. A operação é atómica, guarda uma cópia prévia privada e não apaga os jogos.
- Verificar fórmula e casos limite em testes unitários e integração PostgreSQL local; executar lint, build e E2E (incluindo ecrã móvel). Confirmar que o histórico de classificação e a explicação no perfil correspondem ao modelo.

## Decisão e projeção

O algoritmo anterior usava K=24 e diferença de jogos para amplificar alguns resultados, e descontava 3 pontos por semana após 21 dias (teto 60) diretamente no rating. Essa penalização podia ficar associada ao desempenho apesar de o jogador voltar a jogar. A nova separação conserva a força competitiva e faz o ranking refletir a frequência recente. Os fatores modestos de 2–0/2–1 reduzem o efeito arbitrário de jogos disputados por poucos pontos.

Projeção **local**, sobre cópia anonimizada dos 17 jogos concluídos e oito jogadores consultados em modo de leitura em 2026-09-27: classificação atual reconstruída 1049, 1033, 985, 967, 954, 937, 800, 800. O jogador que fez só um jogo na época ativa e não joga desde 29 de agosto fica com Elo base 1012 e ranking 937 (75 pontos de inatividade); dois jogadores sem jogos na época ativa ficam no ranking 800 (penalização 200). Estes números são uma simulação; não foram escritos no Supabase remoto.

## Preservação e aplicação

`supabase/migrations/20260927_elo_activity_replay.sql` cria um snapshot privado, com RLS, dos jogadores, partidas e eventos anteriores, na mesma transação que reconstrói o histórico. A migração deve ser revista na PR e aplicada de forma controlada **após a integração do cliente**; aplicar apenas a migração antes do cliente deixaria a pré-visualização antiga temporariamente diferente do resultado oficial. O histórico de migrações do projeto remoto não estava disponível em `list_migrations` na leitura anterior; reconciliar o estado antes de executar um comando automático de migração. Não usar `db push` às cegas. A aplicação remota/recontagem em produção fica pendente da revisão e integração da PR, sem merge automático.

## Verificações e resultado

PostgreSQL local via PGlite executou a migração sobre cópia anonimizada dos dados reais, reconstruiu 68 eventos e produziu a projeção acima. A migração também passou em cinco testes de integração locais: snapshot e repetição sem mudança, inserção retroativa e eliminação, limites e atividade, reversão integral de uma migração com partida inválida e rejeição de pedidos de registo inválidos.

- `npm test`: 21/21 passaram, incluindo testes de cálculo e integração PostgreSQL local.
- `npm run lint`: passou.
- `npm run build`: passou (incluindo verificação de tipos); `npx tsc --noEmit` passou.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chrome-headless-shell-linux64/chrome-headless-shell npm run test:e2e -- --workers=1`: 14/14 passaram, incluindo sorteio com Elo de equipa e penalização diferentes, correção de jogos e viewport de 320 px.
- `git diff --check`: passou.

Limitações: PGlite reproduz o motor PostgreSQL em ambiente local, mas não executa a migração no PostgreSQL 17.6 remoto, nem simula as políticas e a concorrência reais da instância Supabase. Não foram aplicadas alterações ou recontagens no projeto Supabase remoto. O histórico de migrações remoto devolveu lista vazia e requer reconciliação antes de aplicar. A validação com um dia diferente da data de execução exige repetir a projeção antes da aplicação.

Documentação oficial consultada: [Supabase — migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase — funções e segurança](https://supabase.com/docs/guides/database/functions), [PostgreSQL — bloqueios explícitos](https://www.postgresql.org/docs/current/explicit-locking.html), [PGlite — documentação](https://pglite.dev/), [Supabase changelog](https://supabase.com/changelog.md). Nenhuma migração de stack foi necessária; PGlite acrescenta apenas testes de integração locais, sem serviço pago.

## Próximo passo

Rever e integrar a PR; conferir o estado real da migração, guardar cópia verificada e aplicar a migração numa janela controlada. Ler os rankings e contagens depois da aplicação e comparar com a projeção antes de dar por concluída a recontagem remota.
