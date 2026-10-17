/**
 * Headless browser checks for the game, using your installed Chrome (no browser download).
 *
 *   node scripts/browser-check.mjs <url> [options]
 *
 * Options:
 *   --size=1280x720     viewport (widths under 500 emulate a phone with touch, 3x DPR)
 *   --wait=6000         ms to wait after the loading screen closes before measuring
 *   --shot=out.png      save a screenshot
 *   --fps               measure average fps over 3 s
 *   --profile           CPU-profile 3 s and print the hottest functions
 *   --eval="js expr"    evaluate an expression in the page and print the JSON result
 *
 * Always prints total bytes downloaded and any console errors / page errors.
 * Set CHROME_PATH if Chrome isn't at the default macOS location.
 */
import { chromium } from 'playwright-core';

const [url, ...rest] = process.argv.slice(2);
if (!url) {
  console.error('usage: node scripts/browser-check.mjs <url> [--size=WxH] [--wait=ms] [--shot=file] [--fps] [--profile] [--eval=expr]');
  process.exit(1);
}
const opt = Object.fromEntries(
  rest.map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
const [w, h] = String(opt.size ?? '1280x720').split('x').map(Number);
const phone = w < 500;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: w, height: h },
  isMobile: phone,
  hasTouch: phone,
  deviceScaleFactor: phone ? 3 : 1,
});
const page = await ctx.newPage();
const errors = [];
let bytes = 0;
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', async (r) => {
  try {
    bytes += (await r.body()).length;
  } catch {
    // Redirects and aborted requests have no body.
  }
});

await page.goto(url, { waitUntil: 'networkidle' });
// Wait for the game's loading screen to finish (up to 90 s), then settle.
await page
  .waitForFunction(() => !document.querySelector('.loading-screen'), null, { timeout: 90000 })
  .catch(() => console.warn('loading screen still up after 90 s'));
await page.waitForTimeout(Number(opt.wait ?? 6000));
// Resource timing is more reliable than summing response bodies (some can't be read back).
const downloaded = await page.evaluate(() =>
  performance.getEntriesByType('resource').reduce((s, e) => s + e.encodedBodySize, 0),
);
const out = { url, size: `${w}x${h}`, downloadedMB: +((downloaded || bytes) / 1e6).toFixed(1) };

if (opt.fps) {
  out.fps = Math.round(
    await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
            else res((n * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(tick);
        }),
    ),
  );
}
if (opt.eval) out.eval = await page.evaluate(String(opt.eval));
if (opt.profile) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(3000);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (const id of profile.samples) {
    const f = byId.get(id).callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + 1);
  }
  out.profile = [...self]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k, c]) => `${((100 * c) / profile.samples.length).toFixed(1)}% ${k}`);
}
if (opt.shot) await page.screenshot({ path: String(opt.shot) });
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
