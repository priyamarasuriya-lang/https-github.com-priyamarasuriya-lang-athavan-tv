import { expect, test, type Page } from '@playwright/test';

/**
 * Full operational flow against the seeded test database. Users and the password come from prisma/seed.ts
 * (development-only credentials).
 */
const PASSWORD = process.env.SEED_PASSWORD ?? 'BatDemo!2026pass';
// Inside the seeded campaigns' flight dates (seed "today" ± 30 days).
const DATE = process.env.E2E_DATE ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
const DATE_LABEL = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${DATE}T00:00:00Z`));
const CH = { code: 'E2E', name: 'E2E Test Channel' };

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function newContent(page: Page, path: string, title: string, duration: string, category?: string) {
  await page.goto(path);
  await page.getByRole('button', { name: 'New item' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  if (category) await dialog.getByLabel('Category').selectOption(category);
  await dialog.getByLabel('Planned duration').fill(duration);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Content saved')).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(title) }).first()).toBeVisible();
}

const row = (page: Page, title: string) => page.getByRole('group', { name: new RegExp(`^${title},`) }).first();

test('scheduler → approver → publish → export, with server-enforced locks and permissions', async ({ page }) => {
  // 1–2. An administrator sets up a channel and content (schedulers cannot create channels).
  await login(page, 'admin@bat.local');
  await page.goto('/channels');
  await page.getByRole('button', { name: 'New channel' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code').fill(CH.code);
  await dialog.getByLabel('Name').fill(CH.name);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: new RegExp(CH.name) }).first()).toBeVisible();
  await newContent(page, '/programs', 'E2E Morning Show', '02:00:00');
  await newContent(page, '/news-events', 'E2E Bulletin', '00:30:00');
  // 2h + 30m + 3m break + 21h27m = exactly 24h
  await newContent(page, '/promotions', 'E2E Day Filler', '21:27:00', 'FILLER');

  // 3. The scheduler creates a daily schedule.
  await login(page, 'scheduler@bat.local');
  await page.goto('/schedules');
  await page.getByRole('button', { name: 'New schedule' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Channel').selectOption({ label: CH.name });
  await dialog.getByLabel('Broadcast date').fill(DATE);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/schedules\/[a-z0-9]+$/);
  await expect(page.getByRole('heading', { name: /E2E Test Channel/ })).toBeVisible();

  // 4. Add programs, a commercial break with an advertisement, and a filler.
  const library = page.getByRole('complementary', { name: 'Content library' });
  await library.getByLabel('Search content').fill('E2E');
  await library.getByRole('button', { name: 'Add E2E Morning Show to schedule' }).click();
  await library.getByRole('button', { name: 'Add E2E Bulletin to schedule' }).click();
  await library.getByRole('button', { name: 'Add Standard break to schedule' }).click();
  await library.getByLabel('Search content').fill('Ceylon Soda');
  await library.getByRole('button', { name: /Add Ceylon Soda — Splash 30s to schedule/ }).click(); // goes into the selected break
  await library.getByRole('button', { name: /Add Ceylon Soda — Fizz 30s to schedule/ }).click();
  await library.getByLabel('Search content').fill('E2E Day Filler');
  await library.getByRole('button', { name: 'Add E2E Day Filler to schedule' }).click();
  await expect(row(page, 'E2E Bulletin')).toHaveAccessibleName(/08:00:00 to 08:30:00/);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Schedule saved|Saved with/)).toBeVisible();

  // 5. Reorder and verify server recalculation.
  await row(page, 'E2E Bulletin').getByRole('button', { name: 'Move up' }).click();
  await expect(row(page, 'E2E Bulletin')).toHaveAccessibleName(/06:00:00 to 06:30:00/);
  await expect(row(page, 'E2E Morning Show')).toHaveAccessibleName(/06:30:00 to 08:30:00/);

  // 6. Introduce a conflict: pin the morning show to 06:00 so it overlaps the bulletin.
  await row(page, 'E2E Morning Show').getByRole('button', { name: 'Edit timing for E2E Morning Show' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Fixed start time').check();
  await dialog.getByLabel('Start (channel local time)').fill('06:00');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const validation = page.getByRole('region', { name: 'Conflicts' });
  await expect(validation.getByText(/overlaps "E2E Bulletin"/)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Saved with \d+ blocking conflict/)).toBeVisible();

  // Submission is refused by the server while the conflict exists.
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByRole('dialog')).toContainText(/resolve them before you submit/);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // 7. Resolve: back to sequential timing; validation clears.
  await row(page, 'E2E Morning Show').getByRole('button', { name: 'Edit timing for E2E Morning Show' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Follows the previous item').check();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(validation.getByText(/overlaps/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Schedule saved')).toBeVisible();
  await expect(page.getByText('Blocking errors').locator('..')).toContainText('0');
  const scheduleUrl = page.url();
  const scheduleId = scheduleUrl.split('/').pop()!;

  // 8. Submit for approval.
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('dialog').getByLabel(/Note for the approver/).fill('E2E ready');
  await page.getByRole('dialog').getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('submitted', { exact: true }).first()).toBeVisible();

  // 9–10. Approver approves and publishes.
  await login(page, 'approver@bat.local');
  await page.goto('/approvals');
  await expect(page.getByRole('link', { name: `${CH.name} · ${DATE_LABEL}` })).toBeVisible();
  await page.goto(scheduleUrl);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/is approved and locked/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/is published and locked/)).toBeVisible();

  // 12. Export PDF and XLSX.
  for (const fmt of ['pdf', 'xlsx']) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: fmt, exact: true }).click()]);
    expect(download.suggestedFilename()).toBe(`schedule-${CH.code}-${DATE}.${fmt}`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe(fmt === 'pdf' ? '%PDF' : 'PK\u0003\u0004');
  }

  // 11. Unauthorised change: the scheduler cannot edit the published schedule, even by calling the API directly.
  await login(page, 'scheduler@bat.local');
  await page.goto(scheduleUrl);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  const current = await page.request.get(`/api/schedules/${scheduleId}`);
  const lockVersion = (await current.json()).data.lockVersion;
  const put = await page.request.put(`/api/schedules/${scheduleId}/items`, { data: { lockVersion, items: [] }, headers: { origin: 'http://localhost:3100' } });
  expect(put.status()).toBe(423);
  const approve = await page.request.post(`/api/schedules/${scheduleId}/transition/approve`, { data: { lockVersion }, headers: { origin: 'http://localhost:3100' } });
  expect(approve.status()).toBe(403);
});

test('users without permission cannot reach restricted features', async ({ page }) => {
  // 13. Reports viewer: no user management, no editing, no settings — in the UI and at the API.
  await login(page, 'viewer@bat.local');
  await expect(page.getByRole('link', { name: 'User Management' })).toHaveCount(0);
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  expect((await page.request.get('/api/users')).status()).toBe(403);
  expect((await page.request.put('/api/settings', { data: { stationName: 'x' }, headers: { origin: 'http://localhost:3100' } })).status()).toBe(403);
  const list = await (await page.request.get('/api/schedules?status=DRAFT')).json();
  const draft = list.data.items[0];
  const view = await (await page.request.get(`/api/schedules/${draft.id}`)).json();
  const put = await page.request.put(`/api/schedules/${draft.id}/items`, { data: { lockVersion: view.data.lockVersion, items: [] }, headers: { origin: 'http://localhost:3100' } });
  expect(put.status()).toBe(403);
  await page.goto(`/schedules/${draft.id}`);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Content library' })).toHaveCount(0);
});

test('negative cases: bad login, stale saves, cross-site requests', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('scheduler@bat.local');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible();

  const cross = await request.post('/api/auth/login', { data: { email: 'scheduler@bat.local', password: PASSWORD }, headers: { origin: 'https://evil.example' } });
  expect(cross.status()).toBe(403);

  await login(page, 'scheduler@bat.local');
  const list = await (await page.request.get('/api/schedules?status=DRAFT')).json();
  const draft = list.data.items.find((s: { channel: { code: string } }) => s.channel.code === 'BAT1');
  const view = await (await page.request.get(`/api/schedules/${draft.id}`)).json();
  const items = view.data.items.map((i: { id: string }) => ({ ...i, clientKey: i.id }));
  const toInput = (i: Record<string, unknown>): Record<string, unknown> => ({ kind: i.kind, contentItemId: i.contentItemId, commercialBreakId: i.commercialBreakId, timingMode: i.timingMode, fixedTime: i.fixedTime, plannedDurationMs: i.plannedDurationMs, children: ((i.children as Record<string, unknown>[]) ?? []).map(toInput) });
  const headers = { origin: 'http://localhost:3100' };
  const first = await page.request.put(`/api/schedules/${draft.id}/items`, { data: { lockVersion: view.data.lockVersion, items: items.map(toInput) }, headers });
  expect(first.status()).toBe(200);
  const stale = await page.request.put(`/api/schedules/${draft.id}/items`, { data: { lockVersion: view.data.lockVersion, items: items.map(toInput) }, headers });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.code).toBe('STALE_VERSION');
  const invalid = await page.request.put(`/api/schedules/${draft.id}/items`, { data: { lockVersion: (await first.json()).data.lockVersion, items: [{ kind: 'CONTENT', contentItemId: items[0].contentItemId, timingMode: 'SEQUENTIAL', plannedDurationMs: 0 }] }, headers });
  expect(invalid.status()).toBe(400);
});
