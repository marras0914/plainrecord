/**
 * PlainRecord — the shared shell for the static, findable pages
 *
 * Used by build_races.mjs and build_district_pages.mjs. It exists because the
 * second generator would otherwise have started as a copy of the first, and two
 * copies of a stylesheet drift: one gets a dark-mode fix and the other does not,
 * and nobody notices because each page looks fine on its own.
 *
 * What lives here is everything that must be identical across those pages: the
 * type, the colour tokens in both schemes, the layout, and the head. What does
 * NOT live here is anything a page says, because that is the part that differs.
 *
 * SAME RULES AS THE FACT SHEET. No JavaScript, nothing third-party, no
 * tracking, every URL absolute. The fonts are read from the vendored
 * src/fonts.css at build time and served from this origin, because linking
 * /fonts.css would 404: vite bundles it into a hashed asset that does not exist
 * under public/.
 */

import { readFileSync } from 'node:fs';
import { navHtml, footerHtml } from './_site_nav.mjs';

export const SITE = 'https://rightnleft.com';

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** The Latin Lexend and Newsreader faces, lifted from the vendored stylesheet. */
export function loadFaces(root) {
  const vendored = readFileSync(new URL('../src/fonts.css', import.meta.url), 'utf8');
  const faces = (vendored.match(/@font-face\s*\{[^}]*\}/g) ?? [])
    .filter((b) => /(lexend|newsreader)-latin(-ext)?-/.test(b));
  if (faces.length < 2) {
    throw new Error('Could not find the Latin Lexend and Newsreader faces in src/fonts.css');
  }
  return faces;
}

export function css(faces) {
  return `
${faces.join('\n')}
:root{--page:#faf7f1;--surface:#fffdf9;--ink:#1a1714;--ink-2:#57514a;--muted:#6f6a62;
      --hair:#e6ded1;--rule:#cabfae;--blue:#1f66bd;--red:#c8352f;
      /* Chart purples, one hue light to dark, validated --ordinal against both
         the card and the page surface. --pbar is the single-series bar. */
      --p1:#bda5da;--p2:#a583cc;--p3:#8e62bc;--p4:#7241a0;--p5:#54277c;--pbar:#8e62bc;}
/* Dark by the quiz's rule, not the OS: light by default, dark only when the
   reader chose it on the quiz. /js/theme.js sets data-theme before paint. These
   pages used to follow prefers-color-scheme, which turned a light quiz into a
   dark race page for anyone whose phone was set to dark. */
:root[data-theme="dark"]{color-scheme:dark;
  --page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink-2:#c3c2b7;--muted:#898781;
  --hair:#2c2c2a;--rule:#383835;--blue:#3987e5;--red:#e66767;
  --p1:#684b88;--p2:#865eb1;--p3:#a377d3;--p4:#bc97e8;--p5:#d5b9f7;--pbar:#a377d3;}
/* A crossfade between pages instead of a hard cut, using the browser's own
   cross-document view transitions: CSS only, same-origin only, and ignored by
   browsers without it. Off for anyone who asked for reduced motion. The quiz
   carries the same rule in src/styles.css, so moving between them fades too. */
@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);
  font-family:"Lexend",system-ui,-apple-system,sans-serif;line-height:1.55;
  font-size:17px;-webkit-text-size-adjust:100%}
main{max-width:38rem;margin:0 auto;padding:40px 16px 72px}
h1,h2{font-family:"Newsreader",Georgia,serif;font-weight:500;letter-spacing:-.006em;
  line-height:1.15;text-wrap:balance}
h1{font-size:clamp(1.9rem,6.5vw,2.6rem);margin:6px 0 18px}
h2{font-size:clamp(1.25rem,4.4vw,1.5rem);margin:40px 0 10px}
.kicker{font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0}
.lede{font-size:1.1rem;color:var(--ink-2);margin:0 0 8px;text-wrap:pretty}
p{margin:0 0 14px}
.label{font-weight:600}
.card{background:var(--surface);border:1px solid var(--hair);border-radius:12px;
  padding:18px 18px 6px;margin:14px 0}
ul{margin:0 0 14px;padding-left:1.1rem}
li{margin:0 0 8px}
.bill{font-variant-numeric:tabular-nums;font-weight:600}
.small{font-size:13.5px;color:var(--muted)}
/* The check-it-yourself link beside a bill. Deliberately quieter than the
   summary it follows: it is there for the reader who doubts the line, not a
   thing every reader is being sent to. */
.hist{font-size:12.5px;white-space:nowrap}
/* How a member stood on a headline bill. A word, not a colour: the page is read
   by people who cannot distinguish red from green, and printed in black. */
.dindex{list-style:none;padding:0;margin:14px 0 18px;columns:2;column-gap:26px}
.dindex li{break-inside:avoid;padding:3px 0;font-size:15.5px}
.dindex a{text-decoration:none}
.dindex a:hover{text-decoration:underline}
@media (max-width:520px){.dindex{columns:1}}
.stand{list-style:none;padding:0;margin:0}
.stand li{padding:9px 0;border-top:1px solid var(--hair)}
.stand li:first-child{border-top:0}
.vm{font-size:12.5px;padding:1px 8px;border-radius:999px;white-space:nowrap;
    border:1px solid var(--rule);color:var(--ink-2)}
.vm-none{opacity:.75}
a{color:var(--blue)}
.cta{display:inline-block;margin:6px 0 2px;padding:13px 26px;border-radius:999px;
  background:var(--ink);color:var(--page);text-decoration:none;font-weight:600}
hr{border:none;border-top:1px solid var(--hair);margin:36px 0}
.top{display:flex;justify-content:space-between;gap:12px;align-items:baseline;
  font-size:13px;margin-bottom:22px}
/* Site nav and footer, from scripts/_site_nav.mjs. The nav wraps rather than
   scrolling sideways on a phone; the current section is ink, not link blue. */
.sitenav{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14.5px;margin:-10px 0 26px;padding-bottom:12px;border-bottom:1px solid var(--hair)}
.sitenav a{text-decoration:none;display:inline-block;min-height:24px;padding:3px 0}
.sitenav a:hover{text-decoration:underline}
.sitenav a[aria-current]{color:var(--ink);font-weight:600}
.sitefoot{margin-top:44px;padding-top:18px;border-top:1px solid var(--hair);display:grid;grid-template-columns:1fr 1.3fr 1.3fr;gap:18px;font-size:13.5px}
.sitefoot ul{list-style:none;padding:0;margin:0}.sitefoot li{margin:0}
.sitefoot a{text-decoration:none;display:inline-block;min-height:24px;padding:3px 0}.sitefoot a:hover{text-decoration:underline}
.foot-head{font-weight:600;color:var(--ink);margin:0 0 8px}
@media (max-width:620px){.sitefoot{grid-template-columns:1fr}}
/* Charts, drawn by scripts/_charts.mjs. */
.chart{margin:16px 0 10px}
.chart svg{display:block;width:100%;height:auto;overflow:visible}
.chart text{font-family:inherit;fill:var(--ink-2);font-size:12px}
.chart .tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.chart .note{fill:var(--muted);font-size:11.5px}
.chart .lab{fill:var(--ink);font-size:12.5px;font-weight:600}
.chart .val{fill:var(--ink);font-size:12px;font-weight:600}
.chart .grid,.chart .axis{stroke:var(--hair);stroke-width:1}
.chart .axis{stroke:var(--rule)}
.chart .med{stroke:var(--ink-2);stroke-width:1.5}
.chart .lead{stroke:var(--muted);stroke-width:1}
.chart .bar{fill:var(--pbar)}
.chart .dot{stroke:var(--surface);stroke-width:2}
.chart .D{fill:var(--blue)} .chart .R{fill:var(--red)}
.chart .sq.none{opacity:.32}
.chart .dist{stroke:var(--page);stroke-width:.6}
.chart .p1{fill:var(--p1)} .chart .p2{fill:var(--p2)} .chart .p3{fill:var(--p3)}
.chart .p4{fill:var(--p4)} .chart .p5{fill:var(--p5)} .chart .nodata{fill:var(--hair)}
.chart .maplab{fill:var(--ink);font-size:11.5px;font-weight:600;paint-order:stroke;stroke:var(--page);stroke-width:3px;stroke-linejoin:round}
.chart .inbox{fill:none;stroke:var(--ink-2);stroke-width:1}
.chart a:hover .dist,.chart a:focus .dist{stroke:var(--ink);stroke-width:1.5}
.chart a:hover .dot,.chart a:focus .dot{stroke:var(--ink)}
/* A 608-wide viewBox drawn into a phone scales to about 0.56, which took 11px
   labels to 6px. Larger type in viewBox units lands near 10px on screen. */
@media (max-width:520px){.chart .tick,.chart .note,.chart .maplab{font-size:17px}.chart .lab,.chart .val{font-size:18px}}
.legend{list-style:none;padding:0;margin:4px 0 0;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13.5px;color:var(--ink-2)}
.legend li{margin:0}.legend .sw{display:inline-block;width:14px;height:12px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.legend .p1{background:var(--p1)}.legend .p2{background:var(--p2)}.legend .p3{background:var(--p3)}.legend .p4{background:var(--p4)}.legend .p5{background:var(--p5)}.legend .nodata{background:var(--hair)}.legend .D{background:var(--blue)}.legend .R{background:var(--red)}
p.lab{font-weight:600;color:var(--ink);margin:14px 0 0}
.insets{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}
@media (max-width:520px){.insets{grid-template-columns:1fr}}
.inset{margin:0}.inset svg{border:1px solid var(--hair);border-radius:8px}
details.table{margin:6px 0 18px}
details.table summary{cursor:pointer;font-size:14px;color:var(--blue)}
.chart-table{border-collapse:collapse;width:100%;font-size:13.5px;margin-top:8px}
.chart-table th,.chart-table td{text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid var(--hair)}
.chart-table td.num,.chart-table th.num{text-align:right;font-variant-numeric:tabular-nums}
/* The ZIP box on /districts. 17px so iOS does not zoom the page on focus. */
#ziplookup input{font:inherit;font-size:17px;padding:10px 12px;width:9.5rem;margin-top:6px;
  border:1px solid var(--rule);border-radius:8px;background:var(--page);color:var(--ink)}
#ziplookup .zipout p{margin:12px 0 6px}
.zips{font-variant-numeric:tabular-nums;font-size:14px;color:var(--ink-2);
  line-height:1.8;word-spacing:.15em}
`;
}

/**
 * The document around a page's own content.
 *
 * `altHref` and `altLabel` are the other language's URL and link text, which
 * every one of these pages has, because a Spanish reader landing on the English
 * one from a search result needs a way across that does not involve the site's
 * front door.
 */
/**
 * A line pointing at the printable one-page sheet.
 *
 * RETURNS HTML, not text, so callers must NOT pass it through esc(). It is the
 * only string in these builders that carries a tag, which is why it says so
 * here rather than trusting whoever adds the next caller to notice.
 *
 * It exists because both sheets were orphans: in the sitemap, linked from no
 * page on the site, and carrying no outbound link of their own.
 */
export const sheetLine = (lang) => (lang === 'es'
  ? `También hay una <a href="${SITE}/hoja">hoja informativa de una página</a>, para imprimir o para entregar en mano.`
  : `There is also a <a href="${SITE}/fact-sheet">one-page fact sheet</a>, to print or to hand to someone.`);

/**
 * docTitle, when given, is the whole <title> with no site-name suffix. Search
 * results show about 60 characters, and a page whose h1 is already long lost
 * its tail to " | The Purple Strip". og:title keeps the h1 wording either way.
 */
export function document_({ lang, title, docTitle, siteName, desc, canonical, altHref, altLabel, otherLang, ogImage, jsonld, faces, kicker, body, scripts = [] }) {
  // A string here gets stringified again and ships as one quoted string, which
  // Google rejects as 'Invalid top level element'. /districts did exactly that.
  if (typeof jsonld !== 'object' || jsonld === null) throw new Error('document_: jsonld must be an object, got ' + typeof jsonld);
  return `<!doctype html>
<html lang="${lang === 'es' ? 'es-US' : 'en-US'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle ?? `${title} | ${siteName}`)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${otherLang ? `<link rel="alternate" hreflang="${lang}" href="${canonical}">
<link rel="alternate" hreflang="${otherLang}" href="${altHref}">
` : ''}<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script src="/js/theme.js"></script>
<link rel="preload" href="/fonts/lexend-latin-300-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/newsreader-latin-400-600.woff2" as="font" type="font/woff2" crossorigin>
<style>${css(faces)}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
${scripts.map((s) => `<script src="${s}" defer></script>\n`).join('')}</head>
<body>
<main>
  <div class="top">
    <span class="kicker">${esc(kicker)}</span>
    <a href="${altHref}">${esc(altLabel)}</a>
  </div>
  ${navHtml(lang, canonical)}
${body}
  ${footerHtml(lang)}
</main>
</body>
</html>
`;
}
