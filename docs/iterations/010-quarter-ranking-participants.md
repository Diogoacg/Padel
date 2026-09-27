# Iteração 010 — ranking apenas de participantes

## Objetivo e critérios

Cada época lista no ranking apenas jogadores com pelo menos um jogo **concluído nessa época**. Os jogadores com zero jogos continuam registados e disponíveis para criar partidas. A página inicial destaca até cinco participantes do trimestre corrente, mesmo se jogadores com zero jogos ocuparem lugares entre os cinco primeiros da resposta antiga. Uma época ainda sem jogos apresenta uma mensagem clara.

## Decisão e implementação

Filtrar a resposta `season_player_standings` por jogos concluídos no cliente; a RPC já calcula os contadores por época. Para a página inicial, obter o conjunto completo de jogadores do trimestre ativo antes de ordenar e limitar a cinco; quando o resumo consultar uma época histórica, usar o ranking isolado dessa época. Assim, o corte dos cinco primeiros nunca acontece antes de excluir jogadores sem partidas. Não alterar registos, rating base, eventos ou funções SQL.

## Verificações

- `npm test`: 28/28 passaram.
- `npm run lint`: passou.
- `npx next build --webpack`: passou, incluindo TypeScript; a build padrão passou no CI Quality #21 com instalação normal de dependências.
- Testes E2E Playwright para ranking mobile a 320 px, época vazia e cinco participantes após excluir jogadores sem jogos: passaram no CI Quality #21 com Chromium. Não executados localmente porque o Chromium não estava instalado.

## Próximo passo

Rever e integrar a PR; depois confirmar a lista no telemóvel. Não existe migração de base de dados nesta iteração.
