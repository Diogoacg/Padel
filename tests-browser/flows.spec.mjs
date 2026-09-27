import { test, expect } from '@playwright/test';

const players = ['Ana', 'Bruno', 'Carla', 'Diogo'].map((name, index) => ({
  id: `player-${index}`, name, rating: [1000, 1001, 1002, 1004][index], matches: 0, wins: 0,
  inactivity_penalty: 0, last_decay_at: null, created_at: '2026-01-01T00:00:00Z'
}));
const match = {
  id: 'sample', season_id: 'season', status: 'pending', played_at: '2026-01-01',
  team_a_player_1: 'player-0', team_a_player_2: 'player-1',
  team_b_player_1: 'player-2', team_b_player_2: 'player-3',
  score_a: 0, score_b: 0, set_1_a: 0, set_1_b: 0, set_2_a: 0, set_2_b: 0,
  set_3_a: 0, set_3_b: 0, rating_delta: 0
};

async function selectTeams(page) {
  for (const [label, id] of [['Equipa A, jogador 1', 'player-0'], ['Equipa A, jogador 2', 'player-1'], ['Equipa B, jogador 1', 'player-2'], ['Equipa B, jogador 2', 'player-3']]) {
    await page.getByLabel(label, { exact: true }).selectOption(id);
  }
}

async function mockApi(page, { historyError = false, completed = false, failFirstMutation, listMatch = false } = {}) {
  const writes = [];
  let failedFirstMutation = false;
  let deleted = false;
  await page.route('https://padel-test.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const resource = url.pathname.split('/').at(-1);
    let data = [];
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    }
    if (resource === 'players') data = players;
    if (resource === 'seasons') data = { id: 'season', name: 'Época teste', starts_at: '2026-01-01', ends_at: null, active: true };
    if (resource === 'matches') {
      if (historyError && !url.searchParams.has('id')) {
        return route.fulfill({ status: 500, json: { message: 'Histórico indisponível' } });
      }
      data = url.searchParams.has('id') ? {
        ...match, ...(completed ? { status: 'completed', score_a: 2, set_1_a: 6, set_1_b: 4, set_2_a: 6, set_2_b: 3 } : {})
      } : listMatch && !deleted ? [{ ...match, ...(completed ? { status: 'completed', score_a: 2, set_1_a: 6, set_1_b: 4, set_2_a: 6, set_2_b: 3 } : {}) }] : [];
    }
    if (resource === 'apply_inactivity_decay') data = 0;
    if (['register_match', 'replace_match', 'create_pending_match', 'delete_match'].includes(resource)) {
      const payload = request.postDataJSON();
      writes.push({ resource, payload });
      if (resource === failFirstMutation && !failedFirstMutation) {
        failedFirstMutation = true;
        return route.fulfill({ status: 500, json: { message: `${resource} falhou pela primeira vez` } });
      }
      if (resource === 'delete_match') { deleted = true; data = true; }
      else data = { ...match, status: 'completed' };
    }
    await route.fulfill({ json: data });
  });
  return writes;
}

test('balanced draw works when history fails; random explains and blocks', async ({ page }) => {
  await mockApi(page, { historyError: true });
  await page.goto('/sorteio');
  for (const player of players) await page.getByRole('button', { name: new RegExp(player.name) }).click();
  await page.getByRole('button', { name: 'Gerar duplas' }).click();
  await expect(page.getByRole('heading', { name: 'Mais equilibrado possível' })).toBeVisible();
  await expect(page.locator('.drawGap')).toContainText('0.5');
  await page.getByRole('button', { name: 'Aleatório', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sortear à sorte' })).toBeDisabled();
  await expect(page.getByRole('alert').first()).toBeVisible();
});

test('new result starts empty, accepts 2–1 and sends entered sets', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/registar');
  await expect(page.getByLabel('Equipa A, jogador 1', { exact: true })).toBeVisible();
  await selectTeams(page);
  await expect(page.getByLabel('Set 3, Equipa A', { exact: true })).toHaveCount(0);
  await page.getByLabel('Set 1, Equipa A', { exact: true }).fill('6');
  await page.getByLabel('Set 1, Equipa B', { exact: true }).fill('4');
  await page.getByLabel('Set 2, Equipa A', { exact: true }).fill('3');
  await page.getByLabel('Set 2, Equipa B', { exact: true }).fill('6');
  await page.getByLabel('Set 3, Equipa A', { exact: true }).fill('7');
  await expect(page.locator('.resultSummary')).not.toContainText('venceu');
  await page.getByLabel('Set 3, Equipa B', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Guardar resultado|Fechar resultado/ }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].payload).toMatchObject({ p_score_a: 2, p_score_b: 1, p_set_3_a: 7, p_set_3_b: 5 });
});

test('register mutation failure keeps the result draft for a retry', async ({ page }) => {
  const writes = await mockApi(page, { failFirstMutation: 'register_match' });
  await page.goto('/registar');
  await selectTeams(page);
  for (const [set, a, b] of [[1, '6', '4'], [2, '6', '3']]) {
    await page.getByLabel(`Set ${set}, Equipa A`, { exact: true }).fill(a);
    await page.getByLabel(`Set ${set}, Equipa B`, { exact: true }).fill(b);
  }

  await page.getByRole('button', { name: 'Fechar resultado', exact: true }).click();
  await expect(page.locator('.notice[role="alert"]')).toContainText('register_match falhou pela primeira vez');
  await expect(page.getByLabel('Equipa A, jogador 1', { exact: true })).toHaveValue('player-0');
  await expect(page.getByLabel('Set 1, Equipa A', { exact: true })).toHaveValue('6');

  await page.getByRole('button', { name: 'Fechar resultado', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Resultado guardado');
  expect(writes).toHaveLength(2);
  expect(writes[1].payload).toMatchObject({ p_score_a: 2, p_score_b: 0, p_set_1_a: 6, p_set_2_b: 3 });
});

test('editing preserves recorded sets and mobile layout fits at 320px', async ({ page }) => {
  await mockApi(page, { completed: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/jogos/sample/editar');
  await expect(page.getByLabel('Set 1, Equipa A', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Set 2, Equipa B', { exact: true })).toHaveValue('3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scoreBox = await page.getByLabel('Set 1, Equipa A', { exact: true }).boundingBox();
  expect(scoreBox.width).toBeGreaterThanOrEqual(44);
  expect(scoreBox.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/result-mobile.png', fullPage: true });
});

test('mobile score entry replaces zero and accepts a cleared field', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/registar');
  const score = page.getByLabel('Set 1, Equipa A', { exact: true });
  await page.getByRole('button', { name: 'Diminuir Set 1, Equipa A' }).click();
  await expect(score).toHaveValue('0');
  await score.click();
  await page.keyboard.insertText('6');
  await expect(score).toHaveValue('6');
  await score.fill('07');
  await expect(score).toHaveValue('7');
  await score.fill('');
  await expect(score).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('query-prefilled teams are preserved', async ({ page }) => {
  await mockApi(page);
  await page.goto('/registar?a1=player-3&a2=player-1&b1=player-0&b2=player-2');
  await expect(page.getByLabel('Equipa A, jogador 1', { exact: true })).toHaveValue('player-3');
  await expect(page.getByLabel('Equipa B, jogador 2', { exact: true })).toHaveValue('player-2');
});

test('four players can swap teams; tied sets never announce a winner', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/registar');
  await selectTeams(page);
  await page.getByLabel('Equipa A, jogador 2', { exact: true }).selectOption('player-2');
  await expect(page.getByLabel('Equipa B, jogador 1', { exact: true })).toHaveValue('player-1');
  for (const set of [1, 2]) {
    for (const side of ['A', 'B']) await page.getByLabel(`Set ${set}, Equipa ${side}`, { exact: true }).fill('6');
  }
  await expect(page.locator('.resultSummary')).not.toContainText('venceu');
  await page.getByRole('button', { name: /Guardar resultado|Fechar resultado/ }).click();
  expect(writes).toHaveLength(0);
});

test('deciding set survives an incomplete edit, but clears on a straight-set win', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/jogos/sample/editar');
  await expect(page.getByLabel('Set 1, Equipa A', { exact: true })).toHaveValue('');
  for (const [set, a, b] of [[1, '6', '4'], [2, '3', '6'], [3, '7', '5']]) {
    await page.getByLabel(`Set ${set}, Equipa A`, { exact: true }).fill(a);
    await page.getByLabel(`Set ${set}, Equipa B`, { exact: true }).fill(b);
  }
  await page.getByLabel('Set 1, Equipa A', { exact: true }).fill('');
  await page.getByLabel('Set 1, Equipa A', { exact: true }).fill('6');
  await expect(page.getByLabel('Set 3, Equipa A', { exact: true })).toHaveValue('7');
  await page.getByLabel('Set 2, Equipa A', { exact: true }).fill('7');
  await expect(page.getByLabel('Set 3, Equipa A', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar resultado', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].payload).toMatchObject({ p_score_a: 2, p_score_b: 0, p_set_3_a: 0, p_set_3_b: 0 });
});

test('replace mutation failure keeps the edited result for a retry', async ({ page }) => {
  const writes = await mockApi(page, { completed: true, failFirstMutation: 'replace_match' });
  await page.goto('/jogos/sample/editar');
  await expect(page.getByLabel('Set 1, Equipa A', { exact: true })).toHaveValue('6');
  await page.getByRole('button', { name: 'Guardar correção', exact: true }).click();
  await expect(page.locator('.notice[role="alert"]')).toContainText('replace_match falhou pela primeira vez');
  await expect(page.getByLabel('Set 1, Equipa A', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Equipa B, jogador 2', { exact: true })).toHaveValue('player-3');

  await page.getByRole('button', { name: 'Guardar correção', exact: true }).click();
  await expect(page).toHaveURL(/\/jogos\/sample/);
  await expect(page.getByRole('status')).toContainText('Resultado guardado');
  expect(writes).toHaveLength(2);
  expect(writes[1].payload).toMatchObject({ p_match_id: 'sample', p_set_1_a: 6 });
});

test('delete mutation failure keeps the match available for a retry', async ({ page }) => {
  const writes = await mockApi(page, { completed: true, failFirstMutation: 'delete_match' });
  await page.goto('/jogos/sample');
  await expect(page.getByRole('button', { name: 'Apagar jogo', exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());

  await page.getByRole('button', { name: 'Apagar jogo', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('delete_match falhou pela primeira vez');
  await expect(page.getByRole('button', { name: 'Apagar jogo', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Apagar jogo', exact: true }).click();
  await expect(page).toHaveURL(/\/jogos$/);
  await expect(page.getByRole('status')).toContainText('Jogo apagado');
  expect(writes).toHaveLength(2);
});

test('failed optimistic delete restores the match in the archive', async ({ page }) => {
  const writes = await mockApi(page, { listMatch: true, failFirstMutation: 'delete_match' });
  await page.goto('/jogos');
  const card = page.locator('.gameCard');
  await expect(card).toHaveCount(1);
  page.on('dialog', (dialog) => dialog.accept());

  await card.getByTitle('Apagar jogo').click();
  await expect(page.locator('.notice[role="alert"]')).toContainText('delete_match falhou pela primeira vez');
  await expect(card).toHaveCount(1);

  await card.getByTitle('Apagar jogo').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Jogo pendente apagado');
  expect(writes).toHaveLength(2);
});
