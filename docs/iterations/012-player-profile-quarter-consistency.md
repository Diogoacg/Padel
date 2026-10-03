# Iteração 012 — ficha coerente com o trimestre

## Objetivo e âmbito

Garantir que a ficha individual representa apenas jogos concluídos na época ativa. Antes desta iteração, um jogo pendente podia entrar na forma, nas séries, nos parceiros/adversários e no histórico como se fosse uma derrota. A posição da carta também era calculada pela lista global de jogadores, em vez do ranking trimestral, e o botão “Ver histórico completo” continuava limitado a oito jogos.

Esta alteração é exclusivamente frontend e testes. Não altera RPCs, dados, Elo, épocas, RLS ou permissões Supabase.

## Decisão e implementação

- Centralizar a seleção e ordenação dos jogos do perfil em `lib/player-profile-utils.ts`.
- Aceitar apenas jogos `completed` que pertencem ao jogador e à época ativa; ordenar por data descendente e preservar, em datas iguais, a ordem `created_at` já recebida da base.
- Calcular forma, série, parceiro, adversário, maiores oscilações e pneus a partir dessa coleção já validada.
- Obter a posição através de `season_player_standings`, tal como a página de ranking, e mostrar `–` para quem ainda não participou no trimestre.
- Mostrar inicialmente os três jogos mais recentes e, quando expandido, todos os jogos concluídos — sem o antigo limite de oito.
- Identificar claramente o estado vazio da época ativa e expor `aria-expanded` nos controlos de expansão.

## Critérios de aceitação

- Um pendente nunca aparece como derrota, resultado ou oscilação de Elo na ficha.
- Jogos de outra época não entram nas estatísticas do trimestre ativo.
- Forma e série usam os jogos concluídos mais recentes, preservando a ordem de criação para jogos do mesmo dia.
- Durante uma mudança de trimestre, a ficha não apresenta dados-placeholder da época anterior.
- A posição coincide com o ranking trimestral e fica sem número quando o jogador tem zero jogos.
- “Histórico completo” mostra todos os jogos concluídos, incluindo mais de oito.
- A ficha continua sem overflow horizontal a 320 px.

## Verificação

- `npm test`: 37/37 aprovados, incluindo sete testes novos de lógica do perfil.
- `npm run lint`: aprovado.
- `npm run build`: aprovado com Next.js 16.2.6 e TypeScript.
- `git diff --check`: aprovado.
- `npm run test:e2e -- --list`: 20 cenários descobertos, incluindo três novos para perfil mobile com pendente, jogador sem participação e expansão para nove jogos. Não executados localmente porque o Chromium do Playwright não está instalado neste ambiente; aguardam o CI da PR.

## Estado Supabase em 2026-10-03

A leitura inofensiva confirmou que a PR #14 foi integrada, mas a migration `20260929210654_restrict_admin_function_execution.sql` ainda não consta do histórico remoto. As cinco funções administrativas continuam executáveis por `anon` e `authenticated`, e o Security Advisor mantém 14 avisos para cada role. Nenhum SQL mutável foi executado nesta iteração; aplicar essa migration continua dependente de autorização explícita.

## Próximo passo

Depois da revisão desta PR, confirmar a ficha num telemóvel com dados reais. Numa iteração separada, corrigir a explicação antiga do algoritmo ainda presente na home e, quando autorizado, aplicar e verificar a migration de permissões já integrada.
