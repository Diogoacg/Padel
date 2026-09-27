# Iteração 006 — tolerância de 30 dias para inatividade

## Decisão e critérios

Após a integração da [PR #6](https://github.com/Diogoacg/Padel/pull/6), o utilizador pediu **um mês inteiro sem jogar** antes do decay. Para evitar variação por comprimento do mês, esta iteração define um mês como **30 dias completos** desde o último jogo concluído na época ativa (ou desde o início da época, se não houve jogos). No dia 30, penalização zero; no dia 31, 25 pontos; dia 38, 50; teto 200 no dia 80. Mantêm-se o Elo base, K=32, médias das duas equipas e o teto/ritmo do decay. A penalização continua reversível ao regressar.

Critérios: atualizar só a função de penalização e o ranking derivado; preservar jogos, resultados, Elo base e snapshot anterior; verificar limites 30/31/37/38/80, contagens, histórico e consistência `rating = max(0, base_rating - inactivity_penalty)`; versionar o SQL efetivamente aplicado.

## Sequência real e aplicação

A PR #6 foi integrada em `master` em 2026-09-27. Uma chamada de aplicação da migração Elo v2 pareceu interrompida pelo cliente; **a leitura subsequente demonstrou que a operação tinha sido concluída** no Supabase remoto, registada como `20260927105250 elo_activity_replay_20260927`. É incorreto tratá-la como anulada. O snapshot privado foi criado antes da recontagem. Havia 8 jogadores, 17 jogos concluídos, 68 eventos, 2 épocas, zero jogos inválidos ou eventos órfãos antes da operação.

Após o pedido de 30 dias, aplicou-se `20260927105417 elo_activity_grace_30_days_20260927`, cujo SQL corresponde a `supabase/migrations/20260927_elo_activity_grace_30_days.sql`. A migração inclui um guarda para Elo v2 e snapshot, substitui `inactivity_decay_points` e chama `apply_inactivity_decay` com a data civil de Lisboa. Não recalcula nem altera o Elo base nem os resultados: só o ranking/penalizações. Ambas as migrações estão agora no histórico do conector Supabase, que antes devolvia uma lista vazia.

## Verificação remota em 2026-09-27

- 8 jogadores, 17 jogos concluídos, 68 eventos; snapshot privado existente.
- Ranking final, por ordem: **1049, 1033, 1012, 985, 967, 954, 800, 800**. As seis primeiras penalizações são zero. Dois jogadores sem jogos nesta época têm Elo base 1000, penalização 200 e ranking 800.
- O jogador com último jogo em 29 de agosto (29 dias antes) mantém Elo base 1012 e passou de ranking 937/penalização 75 a **1012/zero** por cumprir os 30 dias de tolerância.
- Os oito valores de penalização observados coincidem com `inactivity_decay_points` para a data de Lisboa e a última partida concluída.
- A chamada `apply_migration` da correção devolveu `success: true`; os rankings e versões foram lidos posteriormente. Não foram inseridos, apagados ou editados jogos nesta correção.

## Testes e limitações

A versão original passou 21/21 testes locais, lint, build e 14/14 E2E antes desta alteração. Esta PR adapta os testes PostgreSQL locais aos limites de 30 dias e à migração adicional. O executor local está indisponível nesta sessão; **não declarar esta nova suite como executada localmente**. A confirmação no PostgreSQL 17.6 remoto cobre os valores observados hoje; o CI da PR deverá executar os testes alterados. A validação de concorrência e da próxima mudança de dia continua pendente.

O histórico anterior em `005-elo-activity-replay.md` descreve o estado e a projeção *antes* da aplicação e antes desta decisão; esta entrada documenta o estado posterior. Antes de futuros `db push`, reconciliar os nomes/versões de migrations do CLI com as duas versões registadas pelo conector.

## Próximo passo

Acompanhar o CI da PR de seguimento e observar a primeira transição de dia 30 para 31 num jogador real. Não executar novamente as migrações Elo por suposição; consultar primeiro o histórico e o estado da função.
