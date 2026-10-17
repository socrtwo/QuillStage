// Browser smoke test: serves dist/ with `vite preview`, builds a small presentation, and checks the results.
// Usage: npm run build && npm run e2e   (set QS_URL to test an already-running server instead)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4189;
let server = null;
let url = process.env.QS_URL;
if (!url) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const exe = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const browser = await chromium.launch(exe);
const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };

try {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(() => localStorage.setItem('quillstage.prefs.v1', JSON.stringify({ firstRun: false })));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForSelector('.qs-slide-host svg');
  await p.waitForTimeout(500);

  // Type a title into the first placeholder.
  const title = await p.evaluate(() => { const r = document.querySelector('.qs-slide-host [data-id]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.dblclick(title[0], title[1]);
  await p.keyboard.type('Quarterly Review');
  await p.keyboard.press('Escape');
  check('title', await p.evaluate(() => qs.slide.elements[0].text.paras[0].runs.map((r) => r.text).join('')), 'Quarterly Review');

  // New slide gets Title and Content; bullets with a second level.
  await p.keyboard.press('Control+m');
  check('layout', await p.evaluate(() => qs.deck.layout(qs.slide.layout).name), 'Title and Content');
  const body = await p.evaluate(() => { const r = document.querySelectorAll('.qs-slide-host [data-id]')[1].getBoundingClientRect(); return [r.x + 80, r.y + 30]; });
  await p.mouse.dblclick(body[0], body[1]);
  await p.keyboard.type('Revenue up');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Tab');
  await p.keyboard.type('Mostly services');
  await p.keyboard.press('Escape');
  check('bullets', await p.evaluate(() => qs.slide.elements[1].text.paras.map((x) => [x.level, x.runs.map((r) => r.text).join('')])), [[0, 'Revenue up'], [1, 'Mostly services']]);

  // Insert a shape by dragging, then undo and redo it.
  await p.evaluate(() => qs.exec('insert.shape', 'roundRect'));
  const st = await p.evaluate(() => { const r = document.querySelector('.qs-edit-stage').getBoundingClientRect(); return [r.x, r.y, qs.tab.ui.zoom]; });
  await p.mouse.move(st[0] + 600 * st[2], st[1] + 320 * st[2]);
  await p.mouse.down();
  await p.mouse.move(st[0] + 800 * st[2], st[1] + 420 * st[2], { steps: 6 });
  await p.mouse.up();
  check('shape', await p.evaluate(() => qs.slide.elements.at(-1).geom), 'roundRect');
  await p.evaluate(() => qs.exec('edit.undo'));
  check('undo', await p.evaluate(() => qs.slide.elements.length), 2);
  await p.evaluate(() => qs.exec('edit.redo'));
  check('redo', await p.evaluate(() => qs.slide.elements.length), 3);

  // Every view renders.
  for (const v of ['view.outline', 'view.slideSorter', 'view.notesPage', 'view.reading', 'view.slideMaster', 'view.normal']) {
    await p.evaluate((id) => qs.exec(id), v);
    await p.waitForTimeout(150);
  }

  // Save as .pptx and .odp, then open them again.
  const round = await p.evaluate(async () => {
    const io = await window.__qsIO();
    const out = [];
    for (const f of ['pptx', 'odp', 'qsp', 'md']) {
      const { data } = await io.exportDeck(qs.deck, f);
      const { deck } = await io.importDeck(data, `t.${f}`);
      out.push([f, deck.slides.length]);
    }
    return out;
  });
  check('round trips', round, [['pptx', 2], ['odp', 2], ['qsp', 2], ['md', 2]]);

  // Slide show: start, advance, end.
  await p.evaluate(() => qs.exec('show.fromStart'));
  await p.waitForSelector('.qs-show');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  // The end-of-show prompt for ink does not appear without ink; the show closes.
  check('show closed', await p.evaluate(() => !document.querySelector('.qs-show')), true);

  if (errs.length) failures.push(...errs);
} finally {
  await browser.close();
  if (server) try { process.kill(-server.pid); } catch { /* already gone */ }
}

if (failures.length) { console.error('E2E failures:\n' + failures.join('\n')); process.exit(1); }
console.log('E2E smoke test passed');
