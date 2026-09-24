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
      --hair:#e6ded1;--rule:#cabfae;--blue:#1f66bd;--red:#c8352f;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink-2:#c3c2b7;--muted:#898781;
  --hair:#2c2c2a;--rule:#383835;--blue:#3987e5;--red:#e66767;}}
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
<meta name="twitter:card" content="summary_large_image">
<style>${css(faces)}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
${scripts.map((s) => `<script src="${s}" defer></script>\n`).join('')}</head>
<body>
<main>
  <div class="top">
    <span class="kicker">${esc(kicker)}</span>
    <a href="${altHref}">${esc(altLabel)}</a>
  </div>
${body}
</main>
</body>
</html>
`;
}
