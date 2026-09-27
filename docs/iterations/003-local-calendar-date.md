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
- A primeira execução da nova PR no `master` passou unit tests, lint e build, mas revelou uma corrida no teste E2E de registo (12/13). O teste agora espera pelo estado de sucesso da primeira gravação antes de validar a rejeição da data futura.
- [GitHub Actions — Quality #7](https://github.com/Diogoacg/Padel/actions/runs/36283246713): passou em Ubuntu/Node 24, incluindo instalação do Chromium e os 13 testes E2E.
- A execução E2E local continua indisponível: o processo local do Next/Turbopack falhou ao arrancar com um erro interno. A verificação E2E autoritativa foi feita pelo runner GitHub.
- A correção anterior tinha sido integrada na branch de uma PR já fechada, não no `master`; esta reaplicação foi aberta diretamente sobre `master` na [PR #4](https://github.com/Diogoacg/Padel/pull/4).

Não foram executadas RPCs reais nem feitas alterações à base de dados. Os testes de navegador simulam o Supabase.

## Próximo passo

Após revisão e integração da PR #4, validar as RPCs numa base de staging autorizada e considerar um teste de data para a criação de época e inatividade.
