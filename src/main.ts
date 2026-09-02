/**
 * PlainRecord — the page
 *
 * Rendering only. Every number on screen comes from `quiz-data.ts`, which calls
 * the real `valence.ts` / `scoring.ts`. Nothing here reimplements the estimator:
 * that was the prototype's one structural flaw and the reason this build exists.
 */

import {
  DATA,
  ALL_ITEMS,
  HEADLINE_ITEMS,
  CANDIDATES,
  adapt,
  profileOf,
  describe,
  scoreOf,
  candidateLean,
  type QuizItem,
  type AnswerMap,
  type Adapted,
} from './quiz-data';
import type { PartisanProfile } from '../valence';
import { PROFILE_BANDS } from '../valence';

/**
 * Where the raw quiz payload lives. Relative on the deployed site so it works the
 * moment it ships; scripts/build_artifact.mjs rewrites it to the absolute
 * rightnleft.com URL for the single-file share build, which has no /data/ dir.
 */
const PAYLOAD_URL = '/data/quiz_89R.json';

// ---------------------------------------------------------------------------
// Diverging ramp, in OKLab so blue→grey→red does not pass through mud
// ---------------------------------------------------------------------------

const sTo = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const sFrom = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hexToOklab(hex: string): [number, number, number] {
  const r = sTo(parseInt(hex.slice(1, 3), 16) / 255);
  const g = sTo(parseInt(hex.slice(3, 5), 16) / 255);
  const b = sTo(parseInt(hex.slice(5, 7), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex(L: number, A: number, B: number): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = sFrom(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = sFrom(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = sFrom(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let ramp: Record<string, string> = {};

function markColor(coord: number): string {
  const key = cssVar('--pole-blue') + coord.toFixed(3);
  const hit = ramp[key];
  if (hit) return hit;
  const pole = hexToOklab(coord < 0 ? cssVar('--pole-blue') : cssVar('--pole-red'));
  const neut = hexToOklab(cssVar('--neutral-mark'));
  const t = Math.min(1, Math.abs(coord));
  const out = oklabToHex(
    neut[0] + (pole[0] - neut[0]) * t,
    neut[1] + (pole[1] - neut[1]) * t,
    neut[2] + (pole[2] - neut[2]) * t,
  );
  ramp[key] = out;
  return out;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Mode = 'short' | 'full';
let mode: Mode = 'short';
let answers: AnswerMap = {};
let cursor = 0;
let tableOpen = false;
let receiptOpen = false;

const activeItems = (): QuizItem[] => (mode === 'short' ? HEADLINE_ITEMS : ALL_ITEMS);
let adapted: Adapted = adapt(activeItems());
let queue: QuizItem[] = [];

function buildQueue(): QuizItem[] {
  const items = activeItems();
  // Short mode leads with the most party-coded bill so the shape of the result
  // is obvious fast. Full mode interleaves categories so the run mixes subjects
  // and mixes party-line with cross-cutting votes.
  if (mode === 'short') return [...items].sort((a, b) => Math.abs(b.valence ?? 0) - Math.abs(a.valence ?? 0));
  const byCat = new Map<string, QuizItem[]>();
  for (const it of items) {
    const arr = byCat.get(it.category) ?? [];
    arr.push(it);
    byCat.set(it.category, arr);
  }
  const cats = [...byCat.keys()].sort();
  const out: QuizItem[] = [];
  for (let i = 0; out.length < items.length; i++) {
    let added = false;
    for (const c of cats) {
      const a = byCat.get(c)!;
      if (i < a.length) { out.push(a[i]); added = true; }
    }
    if (!added) break;
  }
  return out;
}

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
// Sign the number, but never sign a zero: a perfectly balanced answer set is a
// real outcome of the "mixed" pattern, and rendering it "−0.00" reads as a bug.
const fmt = (v: number, d = 2) => {
  const mag = Math.abs(v).toFixed(d);
  if (Number(mag) === 0) return ' ' + mag;
  return (v > 0 ? '+' : '−') + mag;
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// The strip
// ---------------------------------------------------------------------------

interface Plot {
  x0: number; x1: number; axisY: number; dotTop: number;
  candY0: number; candStep: number; r: number; w: number; h: number; narrow: boolean;
}
let P: Plot;

function measure(): void {
  const w = Math.max(320, Math.round(el('strip').getBoundingClientRect().width || 860));
  const narrow = w < 560;
  P = {
    x0: narrow ? 48 : 54, x1: w - 14, axisY: narrow ? 132 : 150, dotTop: 24,
    candY0: narrow ? 190 : 214, candStep: narrow ? 20 : 22, r: narrow ? 4 : 5,
    w, h: narrow ? 262 : 302, narrow,
  };
  // viewBox width tracks measured pixel width so a font-size of 10 renders at
  // 10px at every breakpoint. A fixed viewBox shrinks every label with the chart.
  el('strip').setAttribute('viewBox', `0 0 ${w} ${P.h}`);
}
const xScale = (c: number) => P.x0 + ((c + 1) / 2) * (P.x1 - P.x0);

function sv(name: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (text != null) e.textContent = text;
  return e;
}

interface Mark { item: QuizItem; answer: 1 | -1; coordinate: number; x: number; y: number }

function renderStrip(p: PartisanProfile): void {
  measure();
  const svg = el<SVGSVGElement & HTMLElement>('strip');
  const keep = svg.querySelector('title');
  while (svg.lastChild) svg.removeChild(svg.lastChild);
  if (keep) svg.appendChild(keep);

  const hair = cssVar('--hair'), rule = cssVar('--rule'), muted = cssVar('--muted');
  const ink2 = cssVar('--ink-2'), band = cssVar('--band'), surface = cssVar('--surface');

  svg.appendChild(sv('rect', {
    x: xScale(-PROFILE_BANDS.mildLean), y: P.dotTop,
    width: xScale(PROFILE_BANDS.mildLean) - xScale(-PROFILE_BANDS.mildLean),
    height: P.axisY - P.dotTop, fill: band,
  }));
  svg.appendChild(sv('text', {
    x: xScale(0), y: P.dotTop - 7, 'text-anchor': 'middle', 'font-size': 10,
    'letter-spacing': '0.1em', fill: muted,
  }, 'NO PARTISAN CONTENT'));

  svg.appendChild(sv('line', { x1: P.x0, y1: P.axisY, x2: P.x1, y2: P.axisY, stroke: rule, 'stroke-width': 1 }));
  for (const t of P.narrow ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1]) {
    const x = xScale(t);
    svg.appendChild(sv('line', { x1: x, y1: P.axisY, x2: x, y2: P.axisY + 5, stroke: rule, 'stroke-width': 1 }));
    svg.appendChild(sv('text', {
      x, y: P.axisY + 18, 'text-anchor': 'middle', 'font-size': 10.5, fill: muted,
      'font-variant-numeric': 'tabular-nums',
    }, t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t)));
  }
  svg.appendChild(sv('text', {
    x: P.x0, y: P.axisY + 34, 'text-anchor': 'start', 'font-size': 10,
    'letter-spacing': '0.1em', fill: muted,
  }, P.narrow ? 'DEM-CODED' : 'DEMOCRATIC-CODED'));
  svg.appendChild(sv('text', {
    x: P.x1, y: P.axisY + 34, 'text-anchor': 'end', 'font-size': 10,
    'letter-spacing': '0.1em', fill: muted,
  }, P.narrow ? 'REP-CODED' : 'REPUBLICAN-CODED'));

  if (p.n === 0) {
    svg.appendChild(sv('text', {
      x: (P.x0 + P.x1) / 2, y: P.axisY - 52, 'text-anchor': 'middle', 'font-size': 12.5, fill: muted,
    }, 'Answer a vote to place the first mark.'));
  }

  // Beeswarm: deterministic lane packing upward from the axis.
  const byId = new Map(activeItems().map((i) => [i.id, i]));
  const marks: Mark[] = p.marks
    .map((m) => ({
      item: byId.get(m.itemId)!,
      answer: m.answer as 1 | -1,
      coordinate: m.coordinate,
      x: 0, y: 0,
    }))
    .filter((m) => m.item)
    .sort((a, b) => a.coordinate - b.coordinate);

  const lanes: number[] = [];
  for (const m of marks) {
    const x = xScale(m.coordinate);
    let lane = 0;
    while (lanes[lane] !== undefined && Math.abs(lanes[lane] - x) < P.r * 2 + 2) lane++;
    lanes[lane] = x;
    m.x = x;
    m.y = P.axisY - 10 - lane * (P.r * 2 + 2.5);
  }

  for (const m of marks) {
    const g = sv('g', {
      class: 'dot', tabindex: '0', role: 'img',
      'aria-label': `${m.item.billId} ${m.item.category}, you answered ${m.answer === 1 ? 'Yea' : 'Nay'}, position ${fmt(m.coordinate)}`,
    });
    g.appendChild(sv('circle', { cx: m.x, cy: m.y, r: 12, fill: 'transparent' }));
    g.appendChild(sv('circle', { cx: m.x, cy: m.y, r: P.r + 2, fill: surface }));
    g.appendChild(sv('circle', { cx: m.x, cy: m.y, r: P.r, fill: markColor(m.coordinate) }));
    g.addEventListener('mouseenter', (e) => showTip(e, m));
    g.addEventListener('focus', (e) => showTip(e, m));
    g.addEventListener('mouseleave', hideTip);
    g.addEventListener('blur', hideTip);
    svg.appendChild(g);
  }

  if (!P.narrow) {
    svg.appendChild(sv('text', {
      x: P.x1, y: P.candY0 - 16, 'text-anchor': 'end', 'font-size': 10,
      'letter-spacing': '0.1em', fill: muted,
    }, 'CANDIDATE RECORDS ON THE SAME VOTES'));
  }
  CANDIDATES.forEach((c, i) => {
    const y = P.candY0 + i * P.candStep;
    const { lean, n } = candidateLean(activeItems(), c.id, answers);
    svg.appendChild(sv('line', { x1: P.x0, y1: y, x2: P.x1, y2: y, stroke: hair, 'stroke-width': 1 }));
    svg.appendChild(sv('text', {
      x: P.x0 - 8, y: y + 3.5, 'text-anchor': 'end', 'font-size': 11, fill: ink2,
    }, c.name.split(' ').slice(-1)[0]));
    if (n > 0) {
      const x = xScale(lean);
      svg.appendChild(sv('path', {
        d: `M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`,
        fill: markColor(lean), stroke: surface, 'stroke-width': 2,
      }));
    }
  });
}

function showTip(ev: Event, m: Mark): void {
  const t = el('tip');
  const i = m.item;
  t.innerHTML =
    `<div class="tip-t">${esc(i.billId)} · ${esc(i.category)}</div>` +
    `<div style="color:var(--ink-2)">You answered <strong>${m.answer === 1 ? 'Yea' : 'Nay'}</strong></div>` +
    `<dl><dt>R voted Yea</dt><dd>${i.rYea === null ? '—' : pct(i.rYea)}</dd>` +
    `<dt>D voted Yea</dt><dd>${i.dYea === null ? '—' : pct(i.dYea)}</dd>` +
    `<dt>valence</dt><dd>${i.valence === null ? '—' : fmt(i.valence)}</dd>` +
    `<dt>your position</dt><dd>${fmt(m.coordinate)}</dd>` +
    `<dt>chamber</dt><dd>${i.yeas}–${i.nays}</dd></dl>`;
  const box = (ev.currentTarget as Element).getBoundingClientRect();
  t.style.opacity = '1';
  t.style.left = `${Math.max(8, Math.min(window.innerWidth - t.offsetWidth - 8, box.left + box.width / 2 - t.offsetWidth / 2))}px`;
  t.style.top = `${Math.max(8, box.top - t.offsetHeight - 8)}px`;
}
const hideTip = () => { el('tip').style.opacity = '0'; };

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function renderMode(): void {
  el('full-count').textContent = String(ALL_ITEMS.length);
  el('mode-short').setAttribute('aria-pressed', String(mode === 'short'));
  el('mode-full').setAttribute('aria-pressed', String(mode === 'full'));
  el('mode-desc').innerHTML = mode === 'short'
    ? `Seven of the session's biggest fights — the bills the Lieutenant Governor made priorities or the Governor vetoed. <b>Six of the seven split cleanly along party lines</b>, so this version can mostly only tell you which party you lean toward. Switch to all ${ALL_ITEMS.length} to find where you cross over.`
    : `All ${ALL_ITEMS.length} votes: one per bill, spread across 20 subject areas, including the ones where Republicans and Democrats agreed. Those are the votes that can show you crossing party lines.`;
}

function renderProv(): void {
  const act = activeItems();
  const jrn = act.filter((i) => i.src === 'journal').length;
  const cross = act.filter((i) => i.valence !== null && Math.abs(i.valence) < DATA.rulePartisanThreshold).length;
  const cats = new Set(act.map((i) => i.category)).size;
  el('hdr-eyebrow').textContent = `PlainRecord · Texas House ${DATA.session} · ${ALL_ITEMS.length} real recorded votes`;
  // "Cross-cutting" and "provenance" are terms of art. The reader gets the plain
  // word; the precise term stays in SCORING.md where it belongs.
  const tiles: [string, string, string][] = [
    ['Questions', String(act.length),
      mode === 'short' ? 'the seven biggest fights of the session' : `one per bill, across ${cats} subjects`],
    ['Straight from the record', `${jrn} of ${act.length}`,
      'taken from the official House Journal, not a summary'],
    ['Both parties agreed', `${Math.round((100 * cross) / act.length)}%`,
      cross / act.length < 0.15
        ? 'nearly all of these were party-line fights'
        : 'these votes were not a party fight at all'],
    ['Picked by', mode === 'short' ? 'hand' : 'a written rule',
      mode === 'short'
        ? 'each one shows why it was chosen'
        : `${DATA.ruleVersion}, max ${DATA.rulePerCategory} per subject`],
  ];
  el('prov').innerHTML = tiles
    .map(([k, v, t]) => `<div><dt>${k}</dt><dd>${v}<small>${t}</small></dd></div>`)
    .join('');

  // Plain language, short sentences, no jargon a reader has to decode. The earlier
  // version said things like "stratified across 20 subject areas" and "strongly
  // party-coded" — accurate, and unreadable. The facts are unchanged; only the
  // words are simpler. Numbers still come from the data, never hardcoded.
  el('method').innerHTML =
    `<b>Where the questions come from.</b> These are real votes the Texas House took. ` +
    `We use one vote per bill, so no bill is asked about twice. ` +
    `Then we sort the bills into 20 subject areas — the same list the state's own ` +
    `library uses — and take at most ${DATA.rulePerCategory} from each area.<br><br>` +

    `<b>Why some questions are not close fights.</b> About ${Math.round(DATA.ruleReserve * 100)} out of every 100 ` +
    `spots are saved for votes where Republicans and Democrats <em>agreed</em>. ` +
    `We do that on purpose. If we only picked the big fights, every answer you gave ` +
    `would land at one end or the other, and nobody could ever come out purple. ` +
    `The rule we follow is written down and named <code>${DATA.ruleVersion}</code>, ` +
    `so you can check we did not change it to get a nicer answer.<br><br>` +

    `<b>The seven big ones.</b> We picked these by hand, but not by our own opinion. ` +
    `Each one is a bill the Lieutenant Governor called a top priority, or a bill the ` +
    `Governor vetoed. Those are their published lists, not ours. Each question shows ` +
    `why it made the list. Six of the seven split the two parties sharply — that is ` +
    `what a headline fight is.<br><br>` +

    `<b>Where the words come from.</b> Every question is the bill's official summary, ` +
    `copied word for word. We did not rewrite it to sound better or worse. ` +
    `How each member voted comes from the official House Journal where we could match ` +
    `it (<span class="src">journal</span>), and otherwise from a scrape ` +
    `(<span class="src">scrape</span>). The table tells you which, for every vote.<br><br>` +

    // A page that asks you to trust its numbers has to hand them over. This is the
    // exact file the page itself runs on — not a summary of it.
    `<b>Check it yourself.</b> Every vote, count and score behind this page sits in ` +
    `one file: <a href="${PAYLOAD_URL}">${PAYLOAD_URL.replace(/^https?:\/\/[^/]+/, '')}</a>. ` +
    `That is the exact file this page loaded, not a copy we made for show.`;
}

function renderStats(p: PartisanProfile): void {
  const tiles: [string, string, string][] = [
    ['Which way you lean', p.n ? fmt(p.netLean) : '—',
      p.n ? (p.netLean < -0.15 ? 'toward Democrats' : p.netLean > 0.15 ? 'toward Republicans' : 'right down the middle') : 'answer a few votes'],
    ['How often you cross', p.n ? pct(p.crossoverShare) : '—',
      'of your answers land on the opposite side from your overall lean'],
    ['How partisan these votes were', p.n ? p.partisanLoad.toFixed(2) : '—',
      p.n && p.partisanLoad < PROFILE_BANDS.weakLoad
        ? 'very low — these votes barely split the parties'
        : '1.00 would mean every party member voted with their side'],
  ];
  el('stats').innerHTML = tiles
    .map(([l, v, n]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-val num">${v}</div><div class="stat-note">${n}</div></div>`)
    .join('');
}

function renderReadout(p: PartisanProfile): void {
  const d = describe(p);
  el('readout').innerHTML =
    `<div class="readout-head">${esc(d.headline)}</div>` +
    (d.caveat ? `<div class="readout-caveat">${esc(d.caveat)}</div>` : '') +
    `<div class="readout-caveat mono">${p.n} of ${activeItems().length} answered</div>`;
}

function renderQuestion(): void {
  const c = el('q-card');
  if (cursor >= queue.length) {
    c.innerHTML =
      `<div class="eyebrow">Done</div><div class="q-caption">All ${queue.length} votes answered or skipped.</div>` +
      `<div class="q-sub">The strip above holds every answer with measurable partisan content.</div>` +
      `<div class="q-actions"><button data-preset="reset">Start over</button></div>`;
    bindPresets();
    return;
  }
  const it = queue[cursor];
  const prev = cursor > 0 ? queue[cursor - 1] : null;
  // Outcomes reveal only AFTER an answer. Showing "Texas ranks 47th" beside an
  // education question would tell the reader how to vote.
  const prevAnswered = prev && (answers[prev.id] === 1 || answers[prev.id] === -1);
  const prevOut = prevAnswered ? DATA.outcomes.find((o) => o.category === prev!.category) : undefined;

  c.innerHTML =
    `<div class="q-meta"><div class="eyebrow">${cursor + 1} of ${queue.length} · ${esc(it.billId)} · ${esc(it.label || it.category)}</div>` +
    `<div class="eyebrow">blind — party not shown</div></div>` +
    `<div class="q-caption">${esc(it.caption)}</div>` +
    `<div class="q-sub">Official bill caption. The House voted ${it.yeas} yes, ${it.nays} no.</div>` +
    (it.why ? `<div class="headline-why"><b>Why this one:</b> ${esc(it.why)}</div>` : '') +
    `<div class="q-actions"><button data-answer="1">Yea</button><button data-answer="-1">Nay</button>` +
    `<button class="ghost" data-answer="0">Skip</button>` +
    `<button class="ghost" id="receipt-btn">${receiptOpen ? 'Hide' : 'Show'} the receipt</button></div>` +
    `<div class="receipt${receiptOpen ? ' on' : ''}"><strong>How this vote is coloured.</strong> ` +
    `Valence is the Republican Yea share minus the Democratic Yea share — measured, not judged.` +
    `<dl><dt>Republicans voting Yea</dt><dd>${it.rYea === null ? '—' : pct(it.rYea)}</dd>` +
    `<dt>Democrats voting Yea</dt><dd>${it.dYea === null ? '—' : pct(it.dYea)}</dd>` +
    `<dt>valence</dt><dd>${it.valence === null ? '—' : fmt(it.valence)}</dd>` +
    `<dt>source</dt><dd>${it.src}${it.rec ? ` · RV ${it.rec}` : ''}</dd></dl></div>` +
    (prevOut
      ? `<div class="reveal"><div class="outc-cat">Where Texas stands on ${esc(prevOut.category.toLowerCase())}</div>` +
        `<b>${esc(prevOut.value)}</b> — ${esc(prevOut.comparison)}` +
        (prevOut.rank ? ` <span class="outc-rank st-${prevOut.standing}">${esc(prevOut.rank)}</span>` : '') +
        `<div class="outc-src">${esc(prevOut.sourceName)} · ${esc(prevOut.year)}</div></div>`
      : '') +
    `<div class="progress"><span style="width:${(100 * cursor) / queue.length}%"></span></div>`;

  c.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((b) => {
    b.addEventListener('click', () => {
      const v = parseInt(b.dataset.answer!, 10);
      if (v !== 0) answers[it.id] = v as 1 | -1;
      else delete answers[it.id];
      cursor++;
      render();
    });
  });
  el('receipt-btn').addEventListener('click', () => { receiptOpen = !receiptOpen; render(); });
}

function renderCands(): void {
  el('cands').innerHTML = CANDIDATES.map((c) => {
    const r = scoreOf(adapted, c.id, answers);
    return `<div class="cand"><div class="cand-name">${esc(c.name)}</div>` +
      `<div class="cand-office">${esc(c.office)} · TX House ${DATA.session}</div>` +
      `<div class="cand-score num">${r.n ? fmt(r.adjusted) : '—'}</div>` +
      `<div class="cand-phrase">${r.n ? esc(r.phrase) : 'no answered votes yet'}</div>` +
      `<div class="cand-n">n = ${r.n}${r.n && r.n < 10 ? ' · heavily shrunk' : ''}</div></div>`;
  }).join('');
  el('cand-note').innerHTML =
    `All three sat in the same chamber and are running for different offices, so these are three separate readouts, not a ranking. They voted together on most party-line bills, so expect the numbers to sit close together — where they diverge is the interesting part. Coverage over these ${ALL_ITEMS.length} votes: ` +
    CANDIDATES.map((c) => `${c.name.split(' ').slice(-1)[0]} ${c.voted}`).join(', ') +
    `. A vote they missed is dropped for them alone, not counted against them.`;
}

function renderOutcomes(): void {
  const answered = new Set(
    activeItems().filter((i) => answers[i.id] === 1 || answers[i.id] === -1).map((i) => i.category),
  );
  const shown = DATA.outcomes.filter((o) => answered.has(o.category));
  const card = el('outcome-card');
  if (!shown.length) { card.hidden = true; return; }
  card.hidden = false;
  el('outcomes').innerHTML = shown.map((o) =>
    `<div class="outc-row"><div class="outc-cat">${esc(o.category)} · ${esc(o.label)}</div>` +
    `<div class="outc-val">${esc(o.value)}</div>` +
    `<div class="outc-cmp">${esc(o.comparison)}</div>` +
    // No rank means no badge: a coloured chip would imply a ranking this measure
    // does not have.
    (o.rank ? `<div class="outc-rank st-${o.standing}">${esc(o.rank)}</div>` : '') +
    `<div class="outc-src">${esc(o.sourceName)} · ${esc(o.year)} · ` +
    `<a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener">source</a></div>` +
    `<div class="outc-cav">${esc(o.caveat)}</div></div>`).join('');
  el('causal').textContent = DATA.causalNote;
  el('omissions').innerHTML = DATA.omissions.length
    ? 'Deliberately left blank: ' + DATA.omissions.map((o) => `<b>${esc(o.category)}</b> — ${esc(o.why)}`).join(' ')
    : '';
  el('incumbents').innerHTML = DATA.incumbents.map((i) =>
    `<div style="margin-bottom:9px"><b>${esc(i.name)}</b> has been ${esc(i.office)} since ${esc(i.since)}, covering ${esc(i.sessions)}.` +
    `<ul>${i.acts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`).join('');
}

function renderStatements(): void {
  const withStmt = activeItems().filter((i) => i.statements && i.statements.length);
  const card = el('stmt-card');
  if (!withStmt.length) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = `<div class="eyebrow">Statements of vote</div>` +
    `<p class="footnote" style="margin:10px 0 0">A Texas member may file a statement saying the Journal recorded them wrongly. The recorded vote is the official act and is what is scored here; the statement is shown beside it, never applied in its place.</p>` +
    withStmt.map((i) => i.statements!.map((s) =>
      `<div class="stmt"><b>${esc(s.member)}</b> on ${esc(i.billId)} ` +
      `(${s.shownAs === 1 ? 'recorded Yea' : s.shownAs === -1 ? 'recorded Nay' : 'no position recorded'}` +
      `${s.claimed !== null ? `, says intended ${s.claimed === 1 ? 'Yea' : 'Nay'}` : ''})` +
      `<div class="stmt-q">"${esc(s.text)}"</div></div>`).join('')).join('');
}

function renderTable(p: PartisanProfile): void {
  const t = el('table');
  if (p.n === 0) {
    t.innerHTML = '<tbody><tr><td style="color:var(--muted);padding:20px 0">Nothing answered yet.</td></tr></tbody>';
    return;
  }
  const byId = new Map(activeItems().map((i) => [i.id, i]));
  const rows = [...p.marks].sort((a, b) => a.coordinate - b.coordinate).map((m) => {
    const i = byId.get(m.itemId)!;
    return `<tr><td><span class="swatch" style="background:${markColor(m.coordinate)}"></span>${esc(i.billId)}</td>` +
      `<td>${esc(i.caption)}</td><td>${esc(i.category)}</td><td class="num">${m.answer === 1 ? 'Yea' : 'Nay'}</td>` +
      `<td class="num">${i.rYea === null ? '—' : pct(i.rYea)}</td>` +
      `<td class="num">${i.dYea === null ? '—' : pct(i.dYea)}</td>` +
      `<td class="num">${i.valence === null ? '—' : fmt(i.valence)}</td>` +
      `<td class="num">${fmt(m.coordinate)}</td>` +
      `<td class="src">${i.src}${i.rec ? ` ${i.rec}` : ''}</td></tr>`;
  }).join('');
  t.innerHTML =
    '<thead><tr><th>Bill</th><th>Caption</th><th>Category</th><th class="num">You</th>' +
    '<th class="num">R Yea</th><th class="num">D Yea</th><th class="num">Valence</th>' +
    '<th class="num">Position</th><th>Source</th></tr></thead><tbody>' + rows + '</tbody>';
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const partisanItems = () => ALL_ITEMS.filter((i) => i.valence !== null && Math.abs(i.valence) >= 0.6);
const mutedItems = () => ALL_ITEMS.filter((i) => i.valence !== null && Math.abs(i.valence) < 0.25);

const PRESETS: Record<string, () => AnswerMap> = {
  mixed: () => {
    const a: AnswerMap = {};
    const p = partisanItems();
    p.forEach((it, k) => { a[it.id] = ((k < p.length / 2 ? 1 : -1) * Math.sign(it.valence!) || 1) as 1 | -1; });
    return a;
  },
  muted: () => {
    const a: AnswerMap = {};
    mutedItems().forEach((it, k) => { a[it.id] = (k % 2 === 0 ? 1 : -1) as 1 | -1; });
    return a;
  },
  consistent: () => {
    const a: AnswerMap = {};
    partisanItems().forEach((it) => { a[it.id] = (-Math.sign(it.valence!) || 1) as 1 | -1; });
    return a;
  },
  reset: () => ({}),
};

function bindPresets(): void {
  document.querySelectorAll<HTMLButtonElement & { _bound?: boolean }>('[data-preset]').forEach((b) => {
    if (b._bound) return;
    b._bound = true;
    b.addEventListener('click', () => {
      // Presets always run on the full set: the seven headline votes contain a
      // single low-valence bill, so a "low-signal" demo has nothing to work with.
      if (b.dataset.preset !== 'reset') setMode('full', false);
      answers = PRESETS[b.dataset.preset!]();
      cursor = b.dataset.preset === 'reset' ? 0 : queue.length;
      render();
    });
  });
}

// ---------------------------------------------------------------------------

function setMode(m: Mode, doRender = true): void {
  if (mode === m) return;
  mode = m;
  answers = {};
  cursor = 0;
  adapted = adapt(activeItems());
  queue = buildQueue();
  if (doRender) render();
}

function render(): void {
  const p = profileOf(adapted, answers);
  renderMode();
  renderProv();
  renderStrip(p);
  renderStats(p);
  renderReadout(p);
  renderQuestion();
  renderCands();
  renderOutcomes();
  renderStatements();
  renderTable(p);
  bindPresets();
}

el('table-toggle').addEventListener('click', () => {
  tableOpen = !tableOpen;
  el('table-panel').hidden = !tableOpen;
  el('table-toggle').textContent = tableOpen ? 'Hide table' : 'Show table';
  el('table-toggle').setAttribute('aria-expanded', String(tableOpen));
});
el('mode-short').addEventListener('click', () => setMode('short'));
el('mode-full').addEventListener('click', () => setMode('full'));

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => renderStrip(profileOf(adapted, answers)), 120);
});
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
  ramp = {};
  render();
});

queue = buildQueue();
render();
