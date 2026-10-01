// Regenerates assets/ icons from mark.js: `node scripts/brand/render.js assets` (needs playwright + chromium).
const { chromium } = require('playwright');
const m = require('./mark.js');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const jobs = [['icon.png', m.icon(1024), 1024, false], ['android-icon-background.png', m.bg(512), 512, false], ['android-icon-foreground.png', m.fg(512), 512, true], ['android-icon-monochrome.png', m.mono(432), 432, true], ['splash-icon.png', m.splash(1024), 1024, true], ['favicon.png', m.icon(48), 48, false]];
  for (const [name, s, size, transparent] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await p.locator('svg').screenshot({ path: `${out}/${name}`, omitBackground: transparent });
  }
  await b.close();
})();
