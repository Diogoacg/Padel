export const RATING_ALGORITHM_PARAGRAPHS: readonly string[] = Object.freeze([
  "Cada trimestre começa com Elo base de 1000.",
  "Em cada jogo, o Elo usa as médias das equipas, K=32 e a dificuldade esperada; o resultado multiplica o delta por 1,40 num 2–0 e 0,90 num 2–1.",
  "Após 30 dias completos sem jogar, o ranking desconta 25 pontos por semana iniciada, até 200. O Elo base não muda enquanto o jogador está parado.",
  "No primeiro jogo concluído de regresso até ao dia 60, recupera toda a penalização. Desde o dia 61, perde permanentemente 10% da penalização por cada semana iniciada depois dos 60 dias, até 50%, e recupera o restante.",
]);
