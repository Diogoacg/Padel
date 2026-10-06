import test from "node:test";
import assert from "node:assert/strict";
import { RATING_ALGORITHM_PARAGRAPHS } from "../lib/rating-algorithm-copy.ts";

test("rating algorithm copy states the current Elo and inactivity rules", () => {
  assert.deepEqual(RATING_ALGORITHM_PARAGRAPHS, [
    "Cada trimestre começa com Elo base de 1000.",
    "Em cada jogo, o Elo usa as médias das equipas, K=32 e a dificuldade esperada; o resultado multiplica o delta por 1,40 num 2–0 e 0,90 num 2–1.",
    "Após 30 dias completos sem jogar, o ranking desconta 25 pontos por semana iniciada, até 200. O Elo base não muda enquanto o jogador está parado.",
    "No primeiro jogo concluído de regresso até ao dia 60, recupera toda a penalização. Desde o dia 61, perde permanentemente 10% da penalização por cada semana iniciada depois dos 60 dias, até 50%, e recupera o restante.",
  ]);
  assert.ok(Object.isFrozen(RATING_ALGORITHM_PARAGRAPHS));
});

test("copy protects the grace and return boundaries", () => {
  const copy = RATING_ALGORITHM_PARAGRAPHS.join(" ");

  assert.match(copy, /Após 30 dias completos/);
  assert.match(copy, /25 pontos por semana iniciada, até 200/);
  assert.match(copy, /Elo base não muda enquanto o jogador está parado/);
  assert.match(copy, /primeiro jogo concluído de regresso até ao dia 60, recupera toda a penalização/);
  assert.match(copy, /Desde o dia 61/);
  assert.match(copy, /10% da penalização por cada semana iniciada depois dos 60 dias, até 50%/);
  assert.match(copy, /recupera o restante/);
});

test("copy does not reintroduce superseded algorithm values", () => {
  const copy = RATING_ALGORITHM_PARAGRAPHS.join(" ").toLocaleLowerCase("pt-PT");

  assert.doesNotMatch(copy, /1[.,]30/);
  assert.doesNotMatch(copy, /21 dias/);
  assert.doesNotMatch(copy, /3 pontos/);
});
