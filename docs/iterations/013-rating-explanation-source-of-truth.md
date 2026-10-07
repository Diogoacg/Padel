# Iteração 013 — explicação do rating com fonte única

## Objetivo e evidência do problema

Alinhar a explicação visível do rating com as regras efetivamente usadas pela aplicação e manter uma única fonte de texto para os pontos onde é apresentada.

No estado base, a home e a página de jogadores apresentavam explicações diferentes. A home ainda descrevia K=32 de forma incompleta, multiplicadores e bónus antigos (incluindo um limite de 1,30x) e regras de inatividade anteriores: pausa superior a 21 dias, 3 pontos por semana e teto de 60 por ciclo. A página de jogadores já mencionava 2–0 = 1,40, 2–1 = 0,90, 30 dias e perda parcial após 60 dias, mas mantinha a explicação inline, sem uma fonte partilhada. Isto podia ensinar regras contraditórias conforme a página consultada.

O histórico das iterações 006–009 estabelece as regras atuais: tolerância de 30 dias completos, penalização temporária de 25 pontos por semana iniciada até 200, recuperação integral até ao dia 60 e perda permanente parcial ao regressar depois disso; K=32, médias das equipas e multiplicadores 1,40/0,90; e reinício do Elo em 1000 a cada trimestre. As iterações 010–012 mantêm o ranking e a ficha isolados por época.

## Âmbito e não-âmbito

Centralizar a cópia explicativa e reutilizá-la na home e na página de jogadores, garantindo que ambas descrevem as mesmas regras atuais. Esta iteração é de explicação/interface e testes locais da cópia.

Não alterar o algoritmo Elo, rankings, épocas, registos ou dados; não alterar RPCs, migrations, permissões ou políticas Supabase; não aplicar SQL remoto. PWA e funcionamento offline ficam fora desta iteração e devem ser tratados separadamente.

## Decisão: fonte única

Manter o texto canónico do rating num único módulo de cópia partilhada, apresentado por um componente comum nas páginas que o expõem. A explicação deve cobrir, sem sugerir que o desconto temporário altera o Elo base:

- Cada trimestre começa com Elo base 1000; jogos e ranking são considerados na época correspondente.
- O cálculo usa médias de Elo base das equipas, K=32 e dificuldade esperada; o resultado multiplica o delta por 1,40 num 2–0 e 0,90 num 2–1.
- Após 30 dias completos sem jogo concluído, o ranking desconta 25 pontos por semana iniciada, até 200. O Elo base não diminui enquanto o jogador está inativo.
- Ao regressar até ao dia 60, recupera o desconto temporário. Depois de 60 dias, uma parte transforma-se em perda permanente de Elo base no jogo de regresso: 10% no dia 61, mais 10 pontos percentuais por cada sete dias iniciados, até 50%; a restante penalização é recuperada.

## Critérios de aceitação

- Home e página de jogadores renderizam a explicação a partir da mesma fonte partilhada, sem cópias concorrentes do texto.
- O texto corresponde aos multiplicadores, K, reinício trimestral e regras de inatividade descritos nesta entrada e nas iterações anteriores.
- Testes cobrem a cópia canónica e a sua utilização nos dois pontos de apresentação; não se altera a lógica de rating.
- Executar testes, lint e build aplicáveis e registar os resultados reais antes de marcar a verificação como concluída.
- Nenhuma operação SQL mutável é realizada.

## Estado Supabase read-only observado em 2026-10-06

As PRs #4, #14 e #15 estão integradas. O histórico remoto contém apenas cinco migrations, até `quarterly_seasons`; a migration de segurança #14 (`20260929210654_restrict_admin_function_execution.sql`) continua ausente. `register_match` usa o fuso horário `Europe/Lisbon`. As cinco RPCs administrativas continuam executáveis por `anon` e `authenticated`. Não foi executado SQL mutável.

## Verificação

- `npm test`: 40/40 aprovados, incluindo três testes novos para a cópia canónica, os limites 30/31 e 60/61 e a ausência dos valores antigos.
- `npm run lint`: aprovado.
- `npm run build`: aprovado com Next.js 16.2.6 e TypeScript.
- `git diff --check`: aprovado.
- `node --check tests-browser/flows.spec.mjs` e `npm run test:e2e -- --list`: aprovados; a suite lista 21 cenários.
- O novo E2E abre a home e o ranking a 320 px, compara a explicação visível, valida os valores atuais, `aria-expanded` e overflow horizontal. A execução local não arrancou porque o executável Chromium do Playwright não está instalado neste ambiente.
- [Quality #28](https://github.com/Diogoacg/Padel/actions/runs/37531769643): aprovado — 40 testes unitários/integração, lint, build e 21/21 cenários Playwright em Chromium.

## Próximo passo

Tratar PWA e suporte offline numa iteração separada, com âmbito e critérios próprios.
