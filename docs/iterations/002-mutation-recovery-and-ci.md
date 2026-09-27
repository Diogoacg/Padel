# Iteração 002 — recuperação de mutações e CI de qualidade

## Objetivo

Criar uma verificação automática em pull requests para `master` que execute testes unitários, lint, build e testes de navegador com Chromium. Quando os testes de navegador falharem, o workflow deve preservar o relatório Playwright e os traces para diagnóstico. Cobrir também o primeiro erro e a repetição de registo, edição e remoção de jogos sem perder o estado do utilizador.

## Critérios de aceitação

- [x] `quality.yml` corre em `pull_request` para `master` (a proteção da branch, se desejada, é uma configuração separada no GitHub).
- [x] O workflow usa Node.js 24 e instala dependências com `npm ci`.
- [x] `npm test`, `npm run lint`, `npm run build`, instalação de Chromium e `npm run test:e2e` são etapas explícitas.
- [x] Em caso de falha, o workflow tenta guardar `playwright-report/` e `test-results/` como artefacto.
- [x] As permissões do workflow permanecem mínimas (`contents: read`).
- [x] Quatro testes simulam erro transitório na primeira chamada de `register_match`, `replace_match` e `delete_match`: os formulários/detalhes mantêm-se, o erro é apresentado, o arquivo recupera o jogo removido otimisticamente e uma repetição bem-sucedida confirma a operação. O fluxo de 320px e o fluxo principal de 390px continuam cobertos.
- [x] A alteração não introduz credenciais Supabase nem escreve na base de dados real.

## Razão técnica

O CI reproduz o fluxo local definido no `package.json` e instala o navegador com as dependências do sistema exigidas pelo Playwright em runners Ubuntu. O Node.js 24 mantém a versão pedida para os testes. O relatório HTML e os traces ficam restritos a execuções com falha, reduzindo ruído e retenção de artefactos; a retenção curta e a permissão somente de leitura limitam a exposição e o acesso do workflow.

## Resultados dos testes

- `npm test`: **9/9**, local.
- `npm run lint`: **passou**, local.
- `npm run build`: **passou**, incluindo TypeScript, local.
- `npm run test:e2e -- --workers=1`: **11/11**, Chromium 153 local, Supabase simulado. A instalação habitual do Playwright tinha expirado; usou-se um binário Chromium descartável externo ao repositório. O sétimo teste mobile da iteração 001 passou agora.
- `git diff --check`: **passou**, local.
- [Execução GitHub Actions da PR #2](https://github.com/Diogoacg/Padel/actions/runs/35469431236): **passou**. As etapas de instalação de dependências, testes unitários, lint, build, instalação Playwright Chromium e E2E ficaram todas verdes em Ubuntu/Node 24. O upload condicional dos relatórios não foi exercitado, pois não houve falha.

## Próximo passo

Abrir um pull request para validar o workflow num runner Ubuntu real. Se o check ficar verde, considerar exigir o check nas regras de proteção de `master` (configuração do proprietário, não alterada nesta iteração). A seguir, corrigir o limite UTC/local na data de jogos perto da meia-noite; verificar as RPCs numa base de staging autorizada, porque os testes atuais simulam o Supabase.
