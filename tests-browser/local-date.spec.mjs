import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Europe/Lisbon' });

const players = ['Ana', 'Bruno', 'Carla', 'Diogo'].map((name, index) => ({
  id: `player-${index}`, name, rating: [1000, 1001, 1002, 1004][index], matches: 0, wins: 0,
  inactivity_penalty: 0, last_decay_at: null, created_at: '2026-01-01T00:00:00Z'
}));

async function freezeLocalTime(page) {
  await page.clock.install({ time: new Date('2026-09-19T23:30:00Z') });
}

async function mockApi(page) {
  const writes = [];
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
    if (resource === 'matches') data = [];
    if (resource === 'apply_inactivity_decay') data = 0;
    if (['register_match', 'replace_match', 'create_pending_match', 'delete_match'].includes(resource)) {
      writes.push({ resource, payload: request.postDataJSON() });
      data = { id: 'sample', status: 'completed' };
    }
    await route.fulfill({ json: data });
  });
  return writes;
}

async function selectTeams(page) {
  for (const [label, id] of [
    ['Equipa A, jogador 1', 'player-0'], ['Equipa A, jogador 2', 'player-1'],
    ['Equipa B, jogador 1', 'player-2'], ['Equipa B, jogador 2', 'player-3']
  ]) {
    await page.getByLabel(label, { exact: true }).selectOption(id);
  }
}

async function enterValidResult(page) {
  for (const [set, a, b] of [[1, '6', '4'], [2, '6', '3']]) {
    await page.getByLabel(`Set ${set}, Equipa A`, { exact: true }).fill(a);
    await page.getByLabel(`Set ${set}, Equipa B`, { exact: true }).fill(b);
  }
}

test('register uses Lisbon local date and rejects tomorrow', async ({ page }) => {
  const writes = await mockApi(page);
  await freezeLocalTime(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/registar');

  const date = page.getByLabel('Data', { exact: true });
  await expect(date).toHaveValue('2026-09-20');
  await selectTeams(page);
  await enterValidResult(page);
  await page.getByRole('button', { name: 'Fechar resultado', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ resource: 'register_match', payload: { p_played_at: '2026-09-20' } });

  await date.fill('2026-09-21');
  await enterValidResult(page);
  await page.getByRole('button', { name: 'Fechar resultado', exact: true }).click();
  await expect(page.locator('.notice[role="alert"]')).toContainText('Calma campeão, esse jogo ainda está no futuro.');
  expect(writes).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('draw starts on Lisbon local date and fits a 320px viewport', async ({ page }) => {
  await mockApi(page);
  await freezeLocalTime(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/sorteio');

  await expect(page.getByLabel('Data do jogo', { exact: true })).toHaveValue('2026-09-20');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
