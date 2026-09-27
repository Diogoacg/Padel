# Iteração 003 — data civil local

## Objetivo

Usar o dia civil do utilizador sempre que a aplicação quer dizer “hoje”. A conversão anterior por `toISOString()` usava UTC e, em Portugal no horário de verão, podia preencher o dia anterior ou rejeitar o dia atual perto da meia-noite.

## Âmbito e decisões

- Foi criado `localDateString()`, baseado em `getFullYear()`, `getMonth()` e `getDate()` locais.
- Registo e edição usam o helper para validar datas futuras.
- Registo e sorteio usam o helper como data inicial.
- Início de época e cálculo de inatividade enviam a data local às RPCs existentes.
- Os valores continuam a ser strings `YYYY-MM-DD`; não há conversões adicionais nem mudanças nos contratos Supabase.
- Não foram alterados SQL, schema, rating, apresentação de datas históricas ou regras de épocas.

## Critérios de aceitação

- Às `2026-09-19T23:30:00Z` em `Europe/Lisbon`, a aplicação usa `2026-09-20`.
- O dia local é aceite e o dia seguinte é rejeitado como futuro.
- O payload de `register_match` preserva exatamente a data escolhida.
- Registo e sorteio não criam overflow horizontal a 320 px.
- Testes unitários, lint, build, E2E e `git diff --check` passam.

## Verificação

- `npm test`: 11/11 passaram, incluindo o limite UTC no verão de Lisboa e um caso de inverno.
- `npm run lint`: passou.
- `npm run build`: passou, incluindo TypeScript e geração das páginas.
- `git diff --check`: passou.
- A suite E2E local não arrancou: o binário Chromium temporário terminou com `SIGSEGV` e a transferência oficial do Playwright devolveu um arquivo vazio/truncado. Os testes foram descobertos por `playwright test --list`; o resultado do GitHub Actions deve ser usado como verificação E2E desta revisão.
- [GitHub Actions — Quality #4](https://github.com/Diogoacg/Padel/actions/runs/36272256417): passou em Ubuntu/Node 24, incluindo instalação do Chromium e os 13 testes E2E.

Não foram executadas RPCs reais nem feitas alterações à base de dados. Os testes de navegador simulam o Supabase.

## Próximo passo

Depois de integrar a PR #2, mudar a base desta PR para `master` se o GitHub não a atualizar automaticamente. Validar as RPCs numa base de staging autorizada e considerar um teste de data para a criação de época e inatividade.
