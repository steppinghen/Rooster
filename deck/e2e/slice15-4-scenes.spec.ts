import { expect, test, type Page } from '@playwright/test';

// Phase 1.5 slice 4: the scene system on the styleguide, on a pinned clock. Every beat lands at
// the art spec's time; Reduce Motion shows each still with its words.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'scene timings run once, on the iPad profile'));

async function open(page: Page, reduced = false) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-02T10:00:00') });
  await page.goto('/styleguide');
  // Time moves only on runFor, so a slow load can't slip past a beat.
  await page.clock.pauseAt(new Date('2026-10-02T10:00:05'));
  await page.getByTestId('sg-scenes').scrollIntoViewIfNeeded();
}
const beat = (page: Page, id: string) => page.getByTestId(id).getAttribute('data-beat');

test('celebration: POP burst beats at 0, 0.12, 0.3 and 1.4 s, then it ends by itself', async ({ page }) => {
  await open(page);
  await page.getByTestId('sg-play-pop').click();
  const c = page.getByTestId('celebration');
  await expect(c).toHaveAttribute('data-kind', 'pop');
  expect(await beat(page, 'celebration')).toBe('0');
  await page.clock.runFor(130);
  expect(await beat(page, 'celebration')).toBe('1');
  await page.clock.runFor(200);
  expect(await beat(page, 'celebration')).toBe('2');
  await page.clock.runFor(1100);
  expect(await beat(page, 'celebration')).toBe('3');
  await page.clock.runFor(1700); // holds briefly, then hands off
  await expect(c).toHaveCount(0);
});

test('celebration: a tap skips it', async ({ page }) => {
  await open(page);
  await page.getByTestId('sg-play-stoked').click();
  await page.getByTestId('celebration').click();
  await expect(page.getByTestId('celebration')).toHaveCount(0);
});

test('celebration: rooster cheer squashes, jumps and cheers on the beat; shell spin tucks and spins', async ({ page }) => {
  await open(page);
  await page.getByTestId('sg-play-rooster-cheer').click();
  const pose = () => page.getByTestId('celebration').locator('.sc-mascot').first().getAttribute('data-pose');
  expect(await pose()).toBe('calm');
  await page.clock.runFor(420);
  expect(await pose()).toBe('celebrate');
  await page.clock.runFor(700);
  await expect(page.getByTestId('celebration').locator('.sc-burst__word')).toHaveText('WOO-HOO!');
  await page.getByTestId('celebration').click();
  await page.getByTestId('sg-play-shell-spin').click();
  await page.clock.runFor(300);
  expect(await pose()).toBe('tucked');
  await page.clock.runFor(800);
  await expect(page.getByTestId('celebration').locator('.sc-burst__word')).toHaveText('WHEEE!');
});

test('Reduce Motion: every celebration shows its still and its shout word at once', async ({ page }) => {
  await open(page, true);
  const words: Record<string, string | null> = { pop: 'POP!', confetti: null, 'rooster-cheer': 'WOO-HOO!', 'shell-spin': 'WHEEE!', kickflip: 'SHRED!', stoked: 'STOKED!', squad: 'YEAH!' };
  for (const [kind, word] of Object.entries(words)) {
    await page.getByTestId(`sg-play-${kind}`).click();
    const c = page.getByTestId('celebration');
    await expect(c, kind).toHaveAttribute('data-kind', kind);
    if (word) await expect(c.locator('.sc-burst__word'), kind).toHaveText(word);
    await c.click();
  }
});

test('sticker earned: on the left half the dog rides in from the right; wind-up, slap, paw up, roll off on the beat', async ({ page }) => {
  await open(page);
  await page.getByTestId('sg-play-slap-left').click();
  const slap = page.getByTestId('paw-slap');
  await expect(slap).toHaveAttribute('data-from', 'right');
  const dogPose = () => slap.locator('.sc-mascot').getAttribute('data-pose');
  expect(await dogPose()).toBe('board');
  await page.clock.runFor(1100);
  expect(await dogPose()).toBe('celebrate');
  await page.clock.runFor(350);
  expect(await dogPose()).toBe('slap');
  await expect(slap.locator('.sc-slap__sticker')).toHaveAttribute('data-placed', 'true');
  await page.clock.runFor(450);
  expect(await dogPose()).toBe('celebrate');
  await page.clock.runFor(700);
  expect(await dogPose()).toBe('board');
  await page.clock.runFor(1000);
  await expect(slap).toHaveCount(0);
  await page.getByTestId('sg-play-slap-right').click();
  await expect(page.getByTestId('paw-slap')).toHaveAttribute('data-from', 'left');
});

test('quiet reveal: a tap peels the corner in five steps, then the name; untouched it peels after 8 s', async ({ page }) => {
  await open(page);
  await page.getByTestId('sg-play-reveal').click();
  const r = page.getByTestId('quiet-reveal');
  await expect(r).toHaveAttribute('data-peel', '0');
  await r.getByRole('button', { name: 'Tap to peel your surprise' }).click();
  await page.clock.runFor(1050);
  await expect(r).toHaveAttribute('data-peel', '5');
  await expect(r.getByText('A surfboard!')).toBeVisible();
  await expect(r).not.toContainText('SHRED'); // the quiet version: no shout word
  await page.clock.runFor(5000);
  await expect(r).toHaveCount(0);
  await page.getByTestId('sg-play-reveal').click();
  await page.clock.runFor(8100);
  await page.clock.runFor(1100);
  await expect(page.getByTestId('quiet-reveal')).toHaveAttribute('data-peel', '5');
});

test('Lights out: calm, yawn at 1 s, tucked and roosting at 2 s, stars and dim at 3 s, very dim at 4.5 s; snow in winter', async ({ page }) => {
  await open(page);
  await page.getByTestId('sg-play-lights').click();
  const s = page.getByTestId('lights-out-scene');
  const turtle = () => s.locator('[data-who="turtle"]').getAttribute('data-pose');
  expect(await turtle()).toBe('lights-calm');
  await page.clock.runFor(1050);
  expect(await turtle()).toBe('yawn');
  await page.clock.runFor(1000);
  expect(await turtle()).toBe('lights-tucked');
  expect(await s.locator('[data-who="rooster"]').getAttribute('data-pose')).toBe('roost');
  await page.clock.runFor(1000);
  await expect(s).toHaveAttribute('data-dim', 'dim');
  await expect(s.locator('.sc-star').first()).toBeAttached();
  await page.clock.runFor(1500);
  await expect(s).toHaveAttribute('data-dim', 'very');
  await page.getByTestId('sg-play-snow').click();
  await page.clock.runFor(3100);
  await expect(page.getByTestId('lights-out-scene').locator('.sc-snow__flake').first()).toBeAttached();
  await expect(page.getByTestId('lights-out-scene').locator('.sc-star')).toHaveCount(0);
});

test('heads-up: eight chunks drain on real time; the last one pulses from 1:45; Reduce Motion keeps the clock, not the pulse', async ({ page }) => {
  await open(page);
  const h = page.getByTestId('sg-scene-headsup');
  await expect(h.getByTestId('heads-up-chunks')).toHaveAttribute('data-left', '8');
  await expect(h.locator('.sc-chunk--pulse')).toHaveCount(0);
  await page.getByTestId('sg-headsup-late').click();
  await expect(h.getByTestId('heads-up-chunks')).toHaveAttribute('data-left', '1');
  await expect(h.locator('.sc-chunk--pulse')).toHaveCount(1);
  await expect(h.getByTestId('heads-up-left')).toHaveText(/^0:1[0-4]$/);
  await page.clock.runFor(900);
  await expect(h.getByTestId('heads-up')).toHaveAttribute('data-beat', '2');
});

test('heads-up under Reduce Motion: the pose, the line and the timer, no pulse', async ({ page }) => {
  await open(page, true);
  const h = page.getByTestId('sg-scene-headsup');
  await expect(h.getByTestId('heads-up')).toHaveAttribute('data-beat', '2');
  await page.getByTestId('sg-headsup-late').click();
  await expect(h.locator('.sc-chunk--pulse')).toHaveCount(0);
  await expect(h.getByTestId('heads-up-left')).toHaveText(/^0:1[0-4]$/);
});

test('breathing wave: the turtle rides in and out; Reduce Motion is a still turtle with the words', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('breathing-wave')).toHaveAttribute('data-phase', 'in');
  await page.getByTestId('sg-breathe-toggle').click();
  await expect(page.getByTestId('breathing-wave')).toHaveAttribute('data-phase', 'out');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('breathing-wave')).toContainText('Breathe out');
});

test('idle: one mascot at a time, every 8–15 s; never under Reduce Motion', async ({ page }) => {
  await open(page);
  const moving = () => page.getByTestId('sg-scene-idle').locator('[data-moving="true"]').count();
  let seen = 0;
  for (let t = 0; t < 32_000; t += 50) {
    await page.clock.runFor(50);
    const n = await moving();
    expect(n).toBeLessThanOrEqual(1);
    seen += n;
    if (seen && t > 16_000) break;
  }
  expect(seen).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.clock.runFor(40_000);
  expect(await moving()).toBe(0);
});

test('trim entrance: steps in over 1.2 s once a day, then still; the second visit just shows it', async ({ page }) => {
  await open(page);
  await page.getByTestId('sg-play-trim').click();
  const trim = page.locator('.sc-trim');
  await expect(trim).toHaveAttribute('data-entering', 'true');
  await page.clock.runFor(1250);
  await expect(trim).toHaveAttribute('data-entering', 'false');
});

test('Morning, Session starts and Last Run ship as their stills and lines', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('still-morning')).toContainText('Good morning, Kid A!');
  await expect(page.getByTestId('still-session')).toContainText('Session time!');
  await expect(page.getByTestId('still-lastrun')).toContainText('Time to wind down.');
});
