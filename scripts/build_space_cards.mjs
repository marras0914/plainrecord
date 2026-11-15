/**
 * PlainRecord: share cards for the Religion and Economics spaces
 *
 *   node scripts/build_space_cards.mjs
 *
 * Writes public/og-religion.png, og-religion.es.png, og-economics.png and
 * og-economics.es.png (1200x630). Until 14 Nov 2026 every page shared the
 * quiz's card ("The Purple Strip, a blind quiz on 67 votes"), so a link to a
 * church's page or the economy round, posted anywhere, advertised the quiz.
 *
 * EVERY WORD IS ALREADY APPROVED: the space's nav label (home.json), and each
 * space's own headline and description (faith.json, economy.json). Nothing is
 * written here, so nothing here needs a Spanish review. The logo is the
 * purple strip, drawn as on the site (BRAND colours from _site_nav.mjs).
 *
 * Committed, like og.png. Re-run after changing any of those strings; the
 * script checks the text fits the card and refuses to write one that does not.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { HOME_COPY } from './_home_copy.mjs';
import { FAITH_COPY } from './_faith_copy.mjs';
import { ECON_COPY } from './_econ_copy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200, H = 630;
const font = (f) => pathToFileURL(resolve(ROOT, 'public/fonts', f)).href;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const str = (copy, key, L) => { const v = copy[key]?.[L]; if (!v) throw new Error(`build_space_cards: no ${L} for ${key}`); return v.replace(/<[^>]+>/g, ''); };

export const CARDS = [
  { file: 'og-religion', kicker: (L) => str(HOME_COPY, 'nav.religion', L), title: (L) => str(FAITH_COPY, 'home.h1', L), deck: (L) => str(FAITH_COPY, 'home.desc', L) },
  { file: 'og-economics', kicker: (L) => str(HOME_COPY, 'nav.economics', L), title: (L) => str(ECON_COPY, 'bl.h1', L), deck: (L) => str(ECON_COPY, 'hub.h2', L) },
];

const page = (kicker, title, deck) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Lexend;src:url("${font('lexend-latin-300-700.woff2')}") format("woff2");font-weight:300 700}
@font-face{font-family:Newsreader;src:url("${font('newsreader-latin-400-600.woff2')}") format("woff2");font-weight:400 600}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px}
body{background:#faf7f1;color:#1a1714;font-family:Lexend,system-ui,sans-serif;display:flex;flex-direction:column;padding:62px 72px 54px;position:relative;overflow:hidden}
.strip{position:absolute;left:0;right:0;top:0;height:14px;display:flex}
.strip i{display:block;height:100%}
.kicker{font-size:22px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7d5ba6}
h1{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:74px;line-height:1.06;letter-spacing:-.012em;margin-top:22px;max-width:1000px}
p{font-size:28px;line-height:1.42;color:#57514a;margin-top:26px;max-width:960px}
footer{margin-top:auto;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #cabfae;padding-top:20px}
.brand{display:inline-flex;font-weight:700;font-size:30px;line-height:1;letter-spacing:-.01em}
.brand span{background:no-repeat 0 100%/calc(100% - 3px) 7px;padding-bottom:10px}
.brand .r{background-image:linear-gradient(#c8352f,#c8352f)}
.brand .n{color:#7d5ba6;background-image:linear-gradient(#7d5ba6,#7d5ba6)}
.brand .l{background-image:linear-gradient(#1f66bd,#1f66bd)}
.tld{font-size:24px;color:#6f6a62;margin-left:2px}
</style></head><body>
<div class="strip"><i style="width:31%;background:#c8352f"></i><i style="width:38%;background:#7d5ba6"></i><i style="width:31%;background:#1f66bd"></i></div>
<div class="kicker">${esc(kicker)}</div>
<h1>${esc(title)}</h1>
<p>${esc(deck)}</p>
<footer><div><span class="brand"><span class="r">right</span><span class="n">n</span><span class="l">left</span></span><span class="tld">.com</span></div></footer>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'space-cards-'));
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: W, height: H } });
let bad = 0;
for (const c of CARDS) {
  for (const L of ['en', 'es']) {
    const f = join(dir, `${c.file}.${L}.html`);
    writeFileSync(f, page(c.kicker(L), c.title(L), c.deck(L)));
    await tab.goto(pathToFileURL(f).href);
    await tab.evaluate(() => document.fonts.ready);
    // The fonts must be the real ones, and nothing may run off the card.
    const check = await tab.evaluate(() => ({
      fonts: document.fonts.check('500 74px Newsreader') && document.fonts.check('600 22px Lexend'),
      overflow: document.body.scrollHeight > innerHeight || document.body.scrollWidth > innerWidth
        || document.querySelector('footer').getBoundingClientRect().bottom > innerHeight,
    }));
    const out = resolve(ROOT, 'public', `${c.file}${L === 'es' ? '.es' : ''}.png`);
    if (!check.fonts || check.overflow) { bad++; console.log(`  [FAIL] ${out}: ${!check.fonts ? 'fonts did not load' : 'text runs off the card'}`); continue; }
    await tab.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`  [PASS] wrote ${out}`);
  }
}
await browser.close();
if (bad) { console.error(`\n  ${bad} card(s) not written`); process.exit(1); }
