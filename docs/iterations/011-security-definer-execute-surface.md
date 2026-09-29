# Iteração 011 — superfície EXECUTE de funções SECURITY DEFINER

## Objetivo e âmbito

Reduzir a superfície de execução das funções `SECURITY DEFINER` ao mínimo necessário para a aplicação pública atual, antes de introduzir autenticação e grupos privados. Esta iteração limita-se às permissões `EXECUTE` das funções administrativas que não são usadas pelo frontend. As nove RPCs necessárias à app continuam públicas e sem exigir autenticação, mantendo o modelo atual até existir Auth/grupos privados.

Não faz parte desta iteração alterar o comportamento das funções, tabelas, dados, políticas RLS ou o fluxo de autenticação. `rating_snapshots` permanece intencionalmente privada: o Advisor assinala RLS sem policies como INFO, não como uma policy em falta a corrigir nesta fase.

## Evidência read-only em 2026-09-29

O Security Advisor reportou 14 funções `SECURITY DEFINER` executáveis por `anon` e 14 por `authenticated`. Também reportou `rating_snapshots` com RLS ativado e sem policies; esse estado é INFO e intencional, porque a tabela é privada.

## Decisão

Revogar `EXECUTE` apenas para estas cinco funções administrativas não usadas pelo frontend:

- `recompute_rating_history`
- `recompute_season_rating_history`
- `start_new_season`
- `switch_active_season`
- `delete_season`

Manter sem autenticação as nove RPCs públicas requeridas pela app. Não alterar a acessibilidade de outras funções nem a privacidade de `rating_snapshots` nesta iteração.

Conceder explicitamente `EXECUTE` a `service_role` para as cinco funções. Isto preserva uma via de manutenção no servidor sem depender do `PUBLIC` implícito ou de grants herdados de instalações anteriores.

## Critérios e verificações

- O teste de integração PGlite confirma que as cinco funções administrativas deixam de ser executáveis por `anon` e `authenticated`, mesmo quando existiam grants explícitos.
- O mesmo teste confirma que `service_role` recebe acesso explícito e que uma RPC pública representativa (`register_match`) continua executável sem autenticação.
- A pesquisa dos call-sites em `lib/padel-queries.ts` e `lib/padel-data.ts` confirmou que as cinco funções restringidas não são invocadas pela app. As nove RPCs requeridas pela app não são alteradas pela migração.
- `rating_snapshots` continua privada, com RLS sem policies; a indicação INFO do Advisor é tratada como intencional.
- Rever no projeto remoto o estado das permissões e o resultado do Advisor após uma futura aplicação autorizada: pendente.

## Aplicação

Nenhuma aplicação remota foi feita. A migração foi preparada e validada localmente, mas a sua aplicação fica para depois da revisão e de autorização explícita.

## Verificação local

- `npm test`: 30 testes aprovados.
- `npm run lint`: aprovado.
- `npm run build`: aprovado com Next.js 16.2.6.
- `npm run test:e2e`: iniciado, mas não executado; o Chromium do Playwright não estava instalado e o download foi bloqueado pelo ambiente. A alteração não modifica a interface nem o runtime da aplicação.
- `git diff --check`: aprovado.

## Próximo passo

Preparar a fase de Auth e grupos privados, que permitirá rever a autorização das RPCs públicas e restringir operações à pertença do grupo.
