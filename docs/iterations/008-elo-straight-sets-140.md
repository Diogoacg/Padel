# Iteração 008 — dar mais peso a vitórias por 2–0

## Objetivo, âmbito e critérios de aceitação

Uma vitória por 2–0 passa a multiplicar o delta Elo por **1,40** (era 1,10). O multiplicador de 2–1 mantém-se em **0,90**, com K=32 e a probabilidade calculada pela média do Elo base dos dois jogadores de cada equipa. Para equipas de médias iguais, os deltas são 22 pontos (2–0) e 14 pontos (2–1); uma surpresa de média 1000 contra 1400 passa a valer 41 pontos num 2–0 e 26 pontos num 2–1. Não alterar resultados, equipas, datas, regras de inatividade ou o reinício de época.

- Guardar um snapshot privado pré-alteração e reconstruir os deltas, eventos e Elo das duas épocas pela ordem cronológica. Os 2–1 mantêm multiplicador de 0,90, embora alguns deltas possam mudar indiretamente pela trajetória anterior.
- A prévia do cliente e a função PostgreSQL devem calcular os mesmos 2–0 de qualquer lado da equipa. O Elo base continua a alimentar as médias das duas equipas; o ranking continua a refletir separadamente a penalização temporária.
- Confirmar idempotência, preservação dos jogos e das perdas permanentes, testes unitários/integração, lint, build e E2E com Chromium quando disponível.

## Validação antes da implementação remota

Uma leitura inofensiva do projeto Supabase confirmou que a fórmula anterior continua em vigor. Simulei localmente o replay dos jogos e épocas: o modelo anterior reproduziu o resultado observado, e o novo modelo altera os deltas das vitórias por 2–0 e os jogos posteriores afetados pela trajetória Elo. A projeção depende dos jogos existentes no momento da aplicação e deve ser novamente conferida após a migração.

## Implementação e preservação

`supabase/migrations/20260927_elo_straight_sets_140.sql` verifica a presença do modelo anterior, guarda cópia prévia de jogadores, jogos e eventos em `padel_internal.rating_snapshots`, substitui só `rating_margin_multiplier` e reexecuta o replay existente nas épocas na mesma migração transacional. O cliente altera apenas o multiplicador correspondente. Antes de aplicar a migração, reconciliar o histórico de migrations do ambiente de destino.

## Testes e resultado

- `npm test`: **23/23** passaram, incluindo replay, snapshot, idempotência, deltas 2–0/2–1 para ambos os lados, perdas permanentes e cenários de erro com PostgreSQL local via PGlite.
- `npm run lint`: passou.
- `npm run build`: passou com verificação TypeScript.
- E2E local: não executado nesta sessão porque Chromium não estava instalado e as tentativas recentes de download neste ambiente devolveram arquivos truncados. O CI da PR deverá executar o E2E.

A migração remota ainda não foi aplicada. A projeção é de leitura/simulação; apenas um replay na instância PostgreSQL do Supabase após integrar a PR confirmará o ranking definitivo.

## Próximo passo

Rever e integrar a PR. Aplicar exclusivamente a nova migration, conferir o snapshot, os multiplicadores e o ranking; investigar qualquer diferença causada por jogos novos.
