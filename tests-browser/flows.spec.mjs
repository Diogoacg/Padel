import { test, expect } from '@playwright/test';

const players = ['Ana', 'Bruno', 'Carla', 'Diogo'].map((name, index) => ({
  id: `player-${index}`, name, rating: [1000, 1001, 1002, 1004][index],
  base_rating: [1000, 1001, 1002, 1004][index], matches: 0, wins: 0,
  inactivity_penalty: 0, inactivity_forfeit: 0, last_decay_at: null, created_at: '2026-01-01T00:00:00Z'
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

async function mockApi(page, {
  historyError = false,
  completed = false,
  failFirstMutation,
  listMatch = false,
  playerRows = players,
  matchRows,
  ratingHistoryRows = []
} = {}) {
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
    if (resource === 'players') {
      const playerId = url.searchParams.get('id')?.replace(/^eq\./, '');
      const selected = playerId ? playerRows.find((player) => player.id === playerId) : null;
      data = selected && request.headers().accept?.includes('application/vnd.pgrst.object+json')
        ? selected
        : playerRows;
    }
    if (resource === 'current_season_id') data = 'season';
    if (resource === 'seasons') {
      const season = { id: 'season', name: '2026 T3', starts_at: '2026-07-01', ends_at: '2026-09-30', active: true, quarter_year: 2026, quarter_number: 3 };
      data = request.headers().accept?.includes('application/vnd.pgrst.object+json') ? season : [season];
    }
    if (resource === 'season_player_standings') data = playerRows.map(({ id, name, rating, matches, wins }) => ({ player_id: id, name, rating, matches, wins }));
    if (resource === 'player_rating_history') data = ratingHistoryRows;
    if (resource === 'home_dashboard') data = {
      season_id: 'season', season_name: '2026 T3', total_players: playerRows.length,
      total_matches: 10, average_rating: 1000, inactive_players: 0,
      top_players: [...playerRows].sort((a, b) => b.rating - a.rating).slice(0, 5).map((player) => ({
        id: player.id, name: player.name, rating: player.rating,
        matches: player.matches, wins: player.wins, inactivityPenalty: 0, lastDecayAt: null
      })),
      best_duo_label: null, best_duo_wins: 0, best_duo_matches: 0,
      biggest_upset_label: null, biggest_upset_gap: null,
      closest_match_label: null, closest_match_sets: null
    };
    if (resource === 'matches') {
      if (historyError && !url.searchParams.has('id')) {
        return route.fulfill({ status: 500, json: { message: 'Histórico indisponível' } });
      }
      data = url.searchParams.has('id') ? {
        ...match, ...(completed ? { status: 'completed', score_a: 2, set_1_a: 6, set_1_b: 4, set_2_a: 6, set_2_b: 3 } : {})
      } : matchRows ? matchRows.filter((row) => {
        const seasonFilter = url.searchParams.get('season_id');
        return !seasonFilter || row.season_id === seasonFilter.replace(/^eq\./, '');
      }) : listMatch && !deleted ? [{ ...match, ...(completed ? { status: 'completed', score_a: 2, set_1_a: 6, set_1_b: 4, set_2_a: 6, set_2_b: 3 } : {}) }] : [];
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

test('mobile draw uses both teams base Elo even with different ranking penalties', async ({ page }) => {
  const playerRows = players.map((player, index) => ({
    ...player,
    base_rating: [1100, 900, 1050, 950][index],
    rating: [900, 900, 1050, 950][index],
    inactivity_penalty: index === 0 ? 200 : 0
  }));
  await mockApi(page, { playerRows });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/sorteio');
  for (const player of playerRows) await page.getByRole('button', { name: new RegExp(player.name) }).click();
  await page.getByRole('button', { name: 'Gerar duplas' }).click();
  await expect(page.locator('.drawGap')).toContainText('0');
  await expect(page.getByText('1000 média de Elo base')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('quarterly ranking displays the current quarter on a narrow screen', async ({ page }) => {
  const playerRows = players.map((player, index) => ({
    ...player, matches: index < 2 ? 1 : 0, wins: index === 0 ? 1 : 0
  }));
  await mockApi(page, { playerRows });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/jogadores');
  await expect(page.getByText('2026 T3')).toBeVisible();
  await expect(page.getByText(/01\/07\/2026.*30\/09\/2026/)).toBeVisible();
  await expect(page.locator('.playerRow')).toHaveCount(2);
  await expect(page.getByText('0 jogos')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('empty quarter has no ranked players but still offers player registration', async ({ page }) => {
  await mockApi(page);
  await page.goto('/jogadores');
  await expect(page.locator('.playerRow')).toHaveCount(0);
  await expect(page.getByText('Ainda ninguém jogou nesta época.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Juntar' })).toBeVisible();
});

test('mobile player profile uses only completed active-season matches', async ({ page }) => {
  const playerRows = players.map((player, index) => ({
    ...player,
    rating: index === 0 ? 1048 : player.rating,
    matches: index < 2 ? 2 : 0,
    wins: index < 2 ? 2 : 0
  }));
  const profileMatches = [
    {
      ...match, id: 'profile-old-win', status: 'completed', played_at: '2026-08-01',
      score_a: 2, score_b: 1, set_1_a: 6, set_1_b: 4, set_2_a: 4, set_2_b: 6,
      set_3_a: 7, set_3_b: 5, rating_delta: 20
    },
    {
      ...match, id: 'profile-other-season', season_id: 'season-previous', status: 'completed', played_at: '2026-06-20',
      score_a: 0, score_b: 2, set_1_a: 0, set_1_b: 6, set_2_a: 2, set_2_b: 6, rating_delta: 150
    },
    {
      ...match, id: 'profile-pending', status: 'pending', played_at: '2026-08-28',
      team_a_player_1: 'player-0', team_a_player_2: 'player-2',
      score_a: 0, score_b: 2, set_1_a: 0, set_1_b: 6, set_2_a: 2, set_2_b: 6, rating_delta: 99
    },
    {
      ...match, id: 'profile-new-win', status: 'completed', played_at: '2026-08-20',
      score_a: 2, score_b: 0, set_1_a: 6, set_1_b: 0, set_2_a: 6, set_2_b: 2, rating_delta: 24
    }
  ];
  const ratingHistoryRows = ['profile-new-win', 'profile-old-win'].map((matchId, index) => ({
    match_id: matchId,
    played_at: index === 0 ? '2026-08-20' : '2026-08-01',
    rating_before: index === 0 ? 1024 : 1004,
    rating_after: index === 0 ? 1048 : 1024,
    rating_delta: index === 0 ? 24 : 20,
    won: true,
    team_label: 'Ana / Bruno',
    opponent_label: 'Carla / Diogo',
    score_label: index === 0 ? '2-0' : '2-1'
  }));
  await mockApi(page, { playerRows, matchRows: profileMatches, ratingHistoryRows });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/jogadores/player-0');

  const profileRows = page.locator('.matchList .matchRow');
  await expect(page.getByRole('heading', { name: 'Ana em números' })).toBeVisible();
  await expect(profileRows).toHaveCount(2);
  await expect(profileRows.nth(0)).toHaveAttribute('href', '/jogos/profile-new-win');
  await expect(profileRows.nth(1)).toHaveAttribute('href', '/jogos/profile-old-win');
  await expect(page.locator('.cardStats > div').nth(2).locator('strong')).toHaveText('2');
  await expect(page.locator('.compactInsights .insightCard').filter({ hasText: 'Melhor parceiro' })).toContainText('Bruno');
  await expect(page.locator('.compactInsights .insightCard').filter({ hasText: 'Momento' })).toContainText('Está quente');
  await expect(page.locator('.compactInsights .insightCard').filter({ hasText: 'Momento' })).toContainText('+2 seguidos');
  await expect(page.locator('.ratingPoint')).toHaveCount(2);
  await expect(page.locator('.ratingPoint').nth(0)).toHaveAttribute('href', '/jogos/profile-new-win');
  await expect(page.locator('.ratingPoint').nth(1)).toHaveAttribute('href', '/jogos/profile-old-win');
  await expect(page.locator('.ratingHistoryFooter')).toContainText('2 jogos com Elo base');
  await expect(page.locator('.matchList')).not.toContainText('0 - 2');
  await expect(page.locator('.matchList')).not.toContainText('99');
  await expect(page.locator('.matchList')).not.toContainText('150');

  await page.getByRole('button', { name: 'Ver raio-x completo' }).click();
  await expect(page.locator('.expandedInsights .insightCard').filter({ hasText: 'Jogos na época' })).toContainText('2');
  await expect(page.locator('.expandedInsights .insightCard').filter({ hasText: 'Pior dor de cabeça' })).toContainText('Ainda sem trauma');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('player with no participation has an empty profile and no invented Elo history', async ({ page }) => {
  const playerRows = [{ ...players[0], matches: 0, wins: 0 }];
  await mockApi(page, { playerRows, matchRows: [], ratingHistoryRows: [] });
  await page.goto('/jogadores/player-0');

  await expect(page.locator('.cardTop')).toContainText('RK–');
  await expect(page.locator('.cardStats > div').nth(2).locator('strong')).toHaveText('0');
  await expect(page.locator('.compactInsights .insightCard').filter({ hasText: 'Melhor parceiro' })).toContainText('Ainda sem dupla');
  await expect(page.locator('.compactInsights .insightCard').filter({ hasText: 'Momento' })).toContainText('Sem série');
  await expect(page.locator('.compactInsights .insightCard').filter({ hasText: 'Momento' })).toContainText('0 jogos');
  await expect(page.getByText('Ainda não há jogos com alteração de Elo base nesta época.')).toBeVisible();
  await expect(page.getByText('Ainda não há jogos concluídos na época 2026 T3.')).toBeVisible();
  await expect(page.locator('.ratingPoint')).toHaveCount(0);
  await expect(page.locator('.matchList .matchRow')).toHaveCount(0);
});

test('expanding player match history reveals every match beyond the first eight', async ({ page }) => {
  const matchRows = Array.from({ length: 9 }, (_, index) => ({
    ...match,
    id: `profile-match-${index}`,
    status: 'completed',
    played_at: `2026-08-${String(29 - index).padStart(2, '0')}`,
    score_a: 2,
    score_b: 0,
    set_1_a: 6,
    set_1_b: 4,
    set_2_a: 6,
    set_2_b: 3,
    rating_delta: 12
  }));
  const playerRows = players.map((player, index) => ({
    ...player,
    matches: index < 2 ? 9 : 0,
    wins: index < 2 ? 9 : 0
  }));
  await mockApi(page, { playerRows, matchRows });
  await page.goto('/jogadores/player-0');

  await expect(page.locator('.matchList .matchRow')).toHaveCount(3);
  await page.getByRole('button', { name: 'Ver histórico completo' }).click();
  await expect(page.locator('.matchList .matchRow')).toHaveCount(9);
  await expect(page.locator('.matchList .matchRow').last()).toHaveAttribute('href', '/jogos/profile-match-8');
});

test('home ranking fills all five places with players who have matches', async ({ page }) => {
  const playerRows = [
    ...players.slice(0, 2).map((player) => ({ ...player, rating: 1000, matches: 0 })),
    ...['Eva', 'Filipe', 'Gabi', 'Hugo', 'Inês'].map((name, index) => ({
      ...players[0], id: `ranked-${index}`, name,
      rating: [1050, 1030, 970, 960, 950][index], matches: 2, wins: index < 2 ? 2 : 0
    }))
  ];
  await mockApi(page, { playerRows });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.locator('.playerRow')).toHaveCount(5);
  await expect(page.locator('.playerRow').last()).toContainText('Inês');
  await expect(page.getByText('0 jogos')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('mobile rating algorithm is consistent on home and player ranking', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 740 });

  const algorithmButton = page.getByRole('button', { name: 'Ver algoritmo do rating', exact: true });
  const algorithmNote = page.getByRole('complementary', { name: 'Como funciona o rating' });

  await page.goto('/');
  await algorithmButton.click();
  await expect(algorithmButton).toHaveAttribute('aria-expanded', 'true');
  await expect(algorithmNote).toBeVisible();
  const homeAlgorithm = await algorithmNote.innerText();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/jogadores');
  await algorithmButton.click();
  await expect(algorithmButton).toHaveAttribute('aria-expanded', 'true');
  await expect(algorithmNote).toBeVisible();
  const playersAlgorithm = await algorithmNote.innerText();

  expect(playersAlgorithm).toBe(homeAlgorithm);
  for (const expected of [/1,40/, /0,90/, /30 dias/, /25 pontos/, /200/, /dia 61/, /50%/, /trimestre/, /1000/]) {
    expect(playersAlgorithm).toMatch(expected);
  }
  for (const outdated of [/1[,.]30/, /21 dias/, /3 pontos/]) {
    expect(playersAlgorithm).not.toMatch(outdated);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
