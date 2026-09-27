# Iteração 007 — recuperação parcial após pausas superiores a 60 dias

## Objetivo e âmbito

Mantém-se a tolerância de 30 dias para começar o desconto no ranking. Quando o jogador regressa após **31 a 60 dias**, recupera a penalização temporária toda. Se a pausa ultrapassar **60 dias**, parte do desconto transforma-se em perda definitiva de Elo base **ao registar o primeiro jogo concluído**; o resto é recuperado. A perda é própria da época e uma nova época começa, como antes, com 1000 pontos.

## Regra e critérios de aceitação

O desconto temporário continua a ser `P = min(200, 25 × ceil(max(0, dias_sem_jogar - 30) / 7))`. No regresso, a percentagem de P que não se recupera é zero até ao dia 60, 10% no dia 61, mais 10 pontos percentuais por cada sete dias iniciados e no máximo 50% a partir do dia 89. Arredondam-se os pontos perdidos ao inteiro mais próximo, sem baixar o Elo base abaixo de zero. Exemplo: no dia 61, P=125 e perdem-se definitivamente 13 pontos; no dia 89, P=200 e perdem-se 100. Jogadores que permanecem inativos não perdem Elo base diariamente.

- Aplicar a perda antes de calcular as médias de Elo base das duas equipas no jogo de regresso. Guardar os pontos perdidos no evento desse jogo e o total da época no jogador.
- Reconstruir a perda e os deltas cronologicamente ao adicionar, corrigir ou eliminar jogos retroativos; nunca cobrar a mesma ausência duas vezes. Jogos pendentes não contam como atividade.
- Usar a mesma regra nas classificações históricas, preservar o snapshot e o Elo da época atual quando não existirem regressos depois de 60 dias.
- Expor no perfil a penalização temporária e a perda definitiva separadamente. Verificar dia 60/61, evolução semanal, teto, regressos, replay, standings, erros, lint, build e E2E.

## Implementação

A migration incremental `supabase/migrations/20260927_elo_long_absence_forfeit.sql` cria um segundo snapshot privado pré-alteração; adiciona `players.inactivity_forfeit` e `rating_events.inactivity_forfeit`; recalcula temporadas em ordem cronológica com a perda incorporada no Elo base antes do jogo de regresso; atualiza `season_player_standings` e reinicia a contagem numa nova época. A função diária `apply_inactivity_decay` continua responsável apenas pelo desconto temporário. A classificação é sempre `max(0, base_rating - inactivity_penalty)`; `inactivity_forfeit` é histórico acumulado, não se subtrai outra vez.

No projeto remoto verificado em modo de leitura em 2026-09-27, havia 8 jogadores, 17 jogos concluídos e 68 eventos, duas migrations Elo aplicadas e a PR #7 ainda aberta. Nenhum jogador com jogos na época ativa teve pausa superior a 60 dias entre jogos (máximo observado: 27 dias); o primeiro jogo mais tardio foi no dia 59 desde o início da época. Portanto a migração não deve alterar o ranking atual; a regra passará a fazer diferença quando alguém regressar depois do dia 60.

## Verificações

- `npm test`: 23/23 passaram; sete testes de integração PostgreSQL local (PGlite) incluem limites, retorno, replay e classificação histórica.
- `npm run lint`: passou.
- `npm run build`: passou, incluindo TypeScript.
- E2E local: não executado com sucesso; o executável Chromium deixou de existir neste ambiente e `npx playwright install chromium` / `chromium-headless-shell` devolveram arquivos truncados. O CI da PR executa a suite E2E.
- Consulta read-only remota: zero pausas >60 dias entre jogos concluídos na época ativa (máximo 27 dias); primeiro jogo mais tardio no dia 59. A migração nova não foi aplicada em produção.

A execução remota da nova migração fica pendente de revisão e integração da PR. Não repetir as duas migrations já aplicadas.

## Próximo passo

Rever os testes e o CI, integrar a PR e aplicar apenas a nova migration numa operação controlada com verificação de snapshot, contagens, eventos e ranking. Confirmar num regresso real o desconto, a parcela perdida e o delta calculado com o novo Elo base.

## Continuação após integração da PR #7 (2026-09-27)

A PR foi integrada e a migração incremental de perda definitiva foi aplicada uma única vez ao projeto Padel, com resultado de sucesso. Consulta de leitura posterior confirmou a presença dos snapshots anterior e desta mudança, a conservação das contagens de jogadores/jogos/eventos, e zero divergências entre ranking, Elo base e penalização temporária. A classificação não mudou: ainda não ocorreu um regresso depois de mais de 60 dias de inatividade nesta época, logo não foi cobrada qualquer perda definitiva. A função devolveu zero no dia 60, 13 pontos no dia 61 e 100 pontos no dia 89, para Elo suficiente. O CI Quality #15 da PR passou testes, lint, build e E2E. O passo pendente é observar um regresso real e confirmar a parcela definitiva no evento e no perfil. As notas acima sobre migração pendente registam o estado anterior à integração.
