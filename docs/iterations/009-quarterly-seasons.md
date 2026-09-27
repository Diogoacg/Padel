# Iteração 009 — épocas trimestrais isoladas

## Objetivo e critérios

Substituir os semestres por trimestres civis (janeiro–março, abril–junho, julho–setembro, outubro–dezembro). A data civil local do jogo determina a época, incluindo jogos pendentes. Cada trimestre calcula Elo desde 1000 com os seus próprios jogos, sem transportar jogos, vitórias, penalizações ou perdas por inatividade do trimestre anterior. Um jogador sem jogos começa com 1000 e não sofre inatividade antes da sua primeira partida.

Preservar jogadores, jogos, resultados e eventos históricos num snapshot privado antes de reclassificar e reconstruir o histórico. Edições que mudam a data entre trimestres recalculam as épocas afetadas. O ranking e histórico de uma época mostram exclusivamente os seus jogos; o trimestre corrente é determinado pela data de Lisboa, mesmo após a passagem de trimestre sem escrita manual.

## Decisões

- Usar trimestres fixos do calendário, com limites inclusivos e chaves únicas por ano e trimestre.
- Manter o algoritmo Elo existente: médias das equipas, K=32, multiplicadores 1,40/0,90 e penalização por ausência apenas dentro da própria época.
- Migrar dados de forma transacional e fornecer testes PostgreSQL locais de fronteiras, replay, erros e preservação.
- A base remota foi consultada apenas em modo leitura nesta iteração; a migração será entregue por PR e não será aplicada antes da revisão e autorização específica para a alteração em produção.

## Verificação

- `npm test`: 28/28 passaram, incluindo 5 integrações PostgreSQL locais (PGlite) para datas de fronteira, repartição de jogos pendentes/concluídos, reset do Elo, registo retroativo entre trimestres, ausência inicial, idempotência e rollback de erro.
- `npm run lint`: passou.
- `npx next build --webpack`: passou com TypeScript; o `npm run build` padrão com Turbopack ficou impedido pela ligação simbólica das dependências no worktree isolado, a confirmar no CI com instalação normal.
- Teste E2E mobile de ranking a 320 px adicionado à suite Playwright; execução a validar no CI da PR porque este ambiente local não tem Chromium executável.

## Próximo passo

Rever a PR e o CI; após integração, pedir autorização específica para aplicar a migração no Supabase. Antes/depois da aplicação, conferir os snapshots, contagem e atribuição dos jogos, eventos Elo e rankings de cada trimestre.
