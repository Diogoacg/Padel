# Iteração 009 — épocas trimestrais isoladas

## Objetivo e critérios

Substituir os semestres por trimestres civis (janeiro–março, abril–junho, julho–setembro, outubro–dezembro). A data civil local do jogo determina a época, incluindo jogos pendentes. Cada trimestre calcula Elo desde 1000 com os seus próprios jogos, sem transportar jogos, vitórias, penalizações ou perdas por inatividade do trimestre anterior. Um jogador sem jogos começa com 1000 e não sofre inatividade antes da sua primeira partida.

Preservar jogadores, jogos, resultados e eventos históricos num snapshot privado antes de reclassificar e reconstruir o histórico. Edições que mudam a data entre trimestres recalculam as épocas afetadas. O ranking e histórico de uma época mostram exclusivamente os seus jogos; o trimestre corrente é determinado pela data de Lisboa, mesmo após a passagem de trimestre sem escrita manual.

## Decisões

- Usar trimestres fixos do calendário, com limites inclusivos e chaves únicas por ano e trimestre.
- Manter o algoritmo Elo existente: médias das equipas, K=32, multiplicadores 1,40/0,90 e penalização por ausência apenas dentro da própria época.
- Migrar dados de forma transacional e fornecer testes PostgreSQL locais de fronteiras, replay, erros e preservação.
- A migração foi entregue pela PR #11 e aplicada após integração com autorização explícita; os dados anteriores foram preservados num snapshot privado.

## Verificação

- `npm test`: 28/28 passaram, incluindo 5 integrações PostgreSQL locais (PGlite) para datas de fronteira, repartição de jogos pendentes/concluídos, reset do Elo, registo retroativo entre trimestres, ausência inicial, idempotência e rollback de erro.
- `npm run lint`: passou.
- `npx next build --webpack`: passou com TypeScript; a build padrão no CI Quality #19 passou com instalação normal de dependências.
- Teste E2E mobile de ranking a 320 px passou no CI Quality #19 com Chromium; Chromium local indisponível.

## Aplicação e verificação em 2026-09-27

Depois de integrada a PR #11, apliquei exclusivamente `quarterly_seasons_20260927` ao projeto Padel pelo conector Supabase. O histórico remoto regista a versão `20260927161029`. O snapshot privado contém as duas épocas anteriores, além de jogadores, jogos e eventos.

A verificação read-only posterior confirmou oito jogadores, 17 jogos concluídos e 68 eventos Elo, sem partidas fora dos limites do respetivo trimestre nem eventos em falta. Q2 2026 contém sete jogos (abril–junho), Q3 2026 contém dez (julho–setembro) e é a única época ativa. Os primeiros eventos de cada jogador em cada trimestre começam em 1000, jogadores sem partidas no trimestre atual permanecem em 1000 e todos os contadores de jogos ativos coincidem com os eventos. Ranking atual, por ordem: **1053, 1046, 1011, 1000, 1000, 980, 973, 937**.

O Advisor de segurança reporta 14 funções SECURITY DEFINER executáveis por anon/authenticated, herdadas do modelo de aplicação pública, e informa que a tabela de snapshots privada tem RLS sem políticas. Não alterei permissões fora do âmbito da migração; rever esse modelo de autorização numa iteração própria.

## Próximo passo

Acompanhar o rollover para Q4 em 1 de outubro (hora de Lisboa) e confirmar automaticamente 1000/0 para todos antes de novos jogos; rever o acesso público às funções privilegiadas.
