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
  COMPARATORS,
  OPPONENTS,
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
import { inject } from '@vercel/analytics';
import { renderVerdict } from './verdict';
import { t, word } from './i18n';
import * as pes from './payload-i18n';
import * as rep from './members';

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
  const mix = Math.min(1, Math.abs(coord));
  const out = oklabToHex(
    neut[0] + (pole[0] - neut[0]) * mix,
    neut[1] + (pole[1] - neut[1]) * mix,
    neut[2] + (pole[2] - neut[2]) * mix,
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
// Comparators stay closed until asked for; the three races come first.
let comparatorsOpen = false;
// The district the reader looked up, and the loaded record. Kept as state so the
// panel survives a re-render when they answer another question, which is the
// whole point: the score should move as they answer.
let repDistrict: number | null = null;
let repFile: Awaited<ReturnType<typeof rep.loadMembers>> = null;
let repStatus: 'idle' | 'loading' | 'failed' = 'idle';
let repQuery = '';
// Whether the lookup's inputs have been built. The result region re-renders
// freely; the inputs must not, or typing loses focus.
let repShell = false;
// The ZIP path. Kept separate from repDistrict because a ZIP can be an ANSWER
// (one district) or a QUESTION (several), and the panel has to say which.
let repZip = '';
let repZipFile: Awaited<ReturnType<typeof rep.loadZips>> = null;
let repZipStatus: 'idle' | 'loading' | 'failed' = 'idle';
type ZipResult =
  | { kind: 'none' }
  | { kind: 'unknown'; zip: string }
  | { kind: 'whole'; zip: string; d: number }
  | { kind: 'split'; zip: string; ds: rep.ZipDistrict[] };
let repZipResult: ZipResult = { kind: 'none' };

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
  }, t('strip.noContent')));

  svg.appendChild(sv('line', { x1: P.x0, y1: P.axisY, x2: P.x1, y2: P.axisY, stroke: rule, 'stroke-width': 1 }));
  for (const tick of P.narrow ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1]) {
    const x = xScale(tick);
    svg.appendChild(sv('line', { x1: x, y1: P.axisY, x2: x, y2: P.axisY + 5, stroke: rule, 'stroke-width': 1 }));
    svg.appendChild(sv('text', {
      x, y: P.axisY + 18, 'text-anchor': 'middle', 'font-size': 10.5, fill: muted,
      'font-variant-numeric': 'tabular-nums',
    }, tick === 0 ? '0' : (tick > 0 ? '+' : '−') + Math.abs(tick)));
  }
  svg.appendChild(sv('text', {
    x: P.x0, y: P.axisY + 34, 'text-anchor': 'start', 'font-size': 10,
    'letter-spacing': '0.1em', fill: muted,
  }, t(P.narrow ? 'strip.poleDShort' : 'strip.poleD')));
  svg.appendChild(sv('text', {
    x: P.x1, y: P.axisY + 34, 'text-anchor': 'end', 'font-size': 10,
    'letter-spacing': '0.1em', fill: muted,
  }, t(P.narrow ? 'strip.poleRShort' : 'strip.poleR')));

  if (p.n === 0) {
    svg.appendChild(sv('text', {
      x: (P.x0 + P.x1) / 2, y: P.axisY - 52, 'text-anchor': 'middle', 'font-size': 12.5, fill: muted,
    }, t('strip.empty')));
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
    }, t('strip.candidateRecords')));
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
  // Named `tip`, not `t` — `t` is the copy lookup at module scope now, and a
  // local of the same name silently turns every t('key') in the function into a
  // call on a DOM element.
  const tip = el('tip');
  const i = m.item;
  tip.innerHTML =
    `<div class="tip-t">${esc(i.billId)} · ${esc(pes.categoryName(i.category))}</div>` +
    `<div style="color:var(--ink-2)">${esc(t('tip.youAnswered'))} <strong>${esc(t(m.answer === 1 ? 'vote.yea' : 'vote.nay'))}</strong></div>` +
    `<dl><dt>${esc(t('tip.rYea'))}</dt><dd>${i.rYea === null ? '—' : pct(i.rYea)}</dd>` +
    `<dt>${esc(t('tip.dYea'))}</dt><dd>${i.dYea === null ? '—' : pct(i.dYea)}</dd>` +
    `<dt>${esc(t('q.valenceRow'))}</dt><dd>${i.valence === null ? '—' : fmt(i.valence)}</dd>` +
    `<dt>${esc(t('tip.position'))}</dt><dd>${fmt(m.coordinate)}</dd>` +
    `<dt>${esc(t('tip.chamber'))}</dt><dd>${i.yeas}–${i.nays}</dd></dl>`;
  const box = (ev.currentTarget as Element).getBoundingClientRect();
  tip.style.opacity = '1';
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, box.left + box.width / 2 - tip.offsetWidth / 2))}px`;
  tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 8)}px`;
}
const hideTip = () => { el('tip').style.opacity = '0'; };

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function renderMode(): void {
  // Was `All <span id="full-count"></span> votes` with only the number filled
  // in, which put two English words in the markup that no locale could reach.
  // The whole label is one string now, so Spanish can put the count wherever it
  // needs to.
  el('mode-full').textContent = t('mode.full', { n: ALL_ITEMS.length });
  el('mode-short').textContent = t('mode.short');
  el('mode-short').setAttribute('aria-pressed', String(mode === 'short'));
  el('mode-full').setAttribute('aria-pressed', String(mode === 'full'));
  el('mode-desc').innerHTML = t(
    mode === 'short' ? 'mode.shortDesc' : 'mode.fullDesc',
    { n: ALL_ITEMS.length },
  );
}

function renderProv(): void {
  const act = activeItems();
  const jrn = act.filter((i) => i.src === 'journal').length;
  const cross = act.filter((i) => i.valence !== null && Math.abs(i.valence) < DATA.rulePartisanThreshold).length;
  const cats = new Set(act.map((i) => i.category)).size;
  el('hdr-eyebrow').textContent =
    t('hdr.eyebrow', { session: DATA.session, n: ALL_ITEMS.length });
  // "Cross-cutting" and "provenance" are terms of art. The reader gets the plain
  // word; the precise term stays in SCORING.md where it belongs.
  const tiles: [string, string, string][] = [
    [t('prov.questions.label'), String(act.length),
      mode === 'short' ? t('prov.questions.short') : t('prov.questions.full', { cats })],
    [t('prov.record.label'), t('prov.record.value', { n: jrn, total: act.length }),
      t('prov.record.hint')],
    [t('prov.agreed.label'), `${Math.round((100 * cross) / act.length)}%`,
      cross / act.length < 0.15
        ? t('prov.agreed.mostlyParty')
        : t('prov.agreed.notAFight')],
    [t('prov.picked.label'),
      mode === 'short' ? t('prov.picked.hand') : t('prov.picked.rule'),
      mode === 'short'
        ? t('prov.picked.handHint')
        : t('prov.picked.ruleHint', { rule: DATA.ruleVersion, perCat: DATA.rulePerCategory })],
  ];
  el('prov').innerHTML = tiles
    .map(([label, value, hint]) =>
      `<div><dt>${label}</dt><dd>${value}<small>${hint}</small></dd></div>`)
    .join('');

  // Plain language, short sentences, no jargon a reader has to decode. The earlier
  // version said things like "stratified across 20 subject areas" and "strongly
  // party-coded" — accurate, and unreadable. The facts are unchanged; only the
  // words are simpler. Numbers still come from the data, never hardcoded.
  // Each paragraph is a lead and a body, assembled here rather than carried as
  // one string with a <b> in it — a translator should not have to preserve
  // markup to move a sentence.
  const para = (lead: string, body: string) => `<b>${lead}</b> ${body}`;
  const payloadLink =
    `<a href="${PAYLOAD_URL}">${PAYLOAD_URL.replace(/^https?:\/\/[^/]+/, '')}</a>`;

  el('method').innerHTML = [
    para(t('method.where.lead'), t('method.where.body', { perCat: DATA.rulePerCategory })),

    para(t('method.notFights.lead'), t('method.notFights.body', {
      reserve: Math.round(DATA.ruleReserve * 100),
      rule: `<code>${esc(DATA.ruleVersion)}</code>`,
    })),

    // Said on the page, not only in a comment: the comparators arrive by a stated
    // rule and the candidates do not, and a choice presented without comment
    // reads as a measurement.
    //
    // The body is payload prose and is still English — it belongs to the
    // quiz_89R.es.json sidecar, which is pass two. On the Spanish page the lead
    // is Spanish and this sentence is not, which is worse than either; that is
    // why the Spanish build is gated on the sidecar landing.
    para(t('method.who.lead'),
      esc(pes.prose('candidateProvenance', DATA.candidateProvenance))),

    para(t('method.seven.lead'), t('method.seven.body')),

    // Sits next to the rule paragraphs because it is about the rule. A reader
    // who downloads the payload and recomputes the cross-cutting share gets a
    // different figure from the tile above — both correct, over different
    // denominators — and until this paragraph existed nothing on either surface
    // said so. The tile counts all items; the file's field counts the
    // rule-selected ones, because it is a diagnostic on the rule.
    para(t('method.denominator.lead'), t('method.denominator.body', {
      items: ALL_ITEMS.length,
    })),

    para(t('method.words.lead'), t('method.words.body')),

    // A page that asks you to trust its numbers has to hand them over. This is the
    // exact file the page itself runs on — not a summary of it.
    para(t('method.check.lead'), t('method.check.body', { link: payloadLink })),
  ].join('<br><br>');
}

function renderStats(p: PartisanProfile): void {
  const leanNote = !p.n
    ? t('stats.lean.empty')
    : p.netLean < -PROFILE_BANDS.mildLean
      ? t('stats.lean.towardD')
      : p.netLean > PROFILE_BANDS.mildLean
        ? t('stats.lean.towardR')
        : t('stats.lean.middle');

  const tiles: [string, string, string][] = [
    [t('stats.lean.label'), p.n ? fmt(p.netLean) : '—', leanNote],
    [t('stats.cross.label'), p.n ? pct(p.crossoverShare) : '—', t('stats.cross.hint')],
    [t('stats.load.label'), p.n ? p.partisanLoad.toFixed(2) : '—',
      p.n && p.partisanLoad < PROFILE_BANDS.weakLoad
        ? t('stats.load.low')
        : t('stats.load.hint')],
  ];
  el('stats').innerHTML = tiles
    .map(([l, v, n]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-val num">${v}</div><div class="stat-note">${n}</div></div>`)
    .join('');
}

function renderReadout(p: PartisanProfile): void {
  // renderVerdict always returns a caveat, so the old conditional is gone: all
  // seven readings carry something that qualifies them, and the one that did not
  // would have been a reading the page states without any hedge at all.
  const d = renderVerdict(describe(p));
  el('readout').innerHTML =
    `<div class="readout-head">${esc(d.headline)}</div>` +
    `<div class="readout-caveat">${esc(d.caveat)}</div>` +
    `<div class="readout-caveat mono">` +
    `${esc(t('readout.answered', { n: p.n, total: activeItems().length }))}</div>`;
}

/**
 * How the three candidates voted on the bill the reader just answered.
 *
 * This is the payoff of a blind quiz: you commit to a position with no party cue,
 * and only then find out who stood where. It renders for the PREVIOUS question,
 * never the current one — the same rule the outcome reveal follows, and for the
 * same reason. Showing "Talarico voted Nay" above an unanswered question would
 * turn a blind quiz into a cue-following exercise.
 *
 * Three things it must not do:
 *   - Treat an absence as a disagreement. A missing position means no recorded
 *     vote (Talarico has 57 of 67), which is a fact about the record and not a
 *     position. It reads "no vote recorded" and is counted as neither.
 *   - Invent the reason for an absence. Excused, absent, paired, presiding, or
 *     simply not voting are different things and the payload does not carry which.
 *   - Imply the candidate agreed with the reader's reasoning. Two people can vote
 *     the same way on a bill for opposite reasons, so the wording is "voted the
 *     same way as you", not "agrees with you".
 */
function candidateReveal(item: QuizItem, yourAnswer: 1 | -1): string {
  const rows = CANDIDATES.map((cand) => {
    const cast = item.votes[cand.id];
    // The office and the opponent were already in the payload and never shown.
    // Putting them on the row is what makes these three read as THE RACES this
    // page is about, rather than three names among nine.
    const tag = `<small>${esc(cand.office)} · ${esc(cand.running)}</small>`;

    if (cast !== 1 && cast !== -1) {
      return (
        `<li class="cand-rev cr-none"><span class="cr-name">${esc(cand.name)}${tag}</span>` +
        `<span class="cr-vote">${esc(t('vote.none'))}</span>` +
        `<span class="cr-match">—</span></li>`
      );
    }
    const same = cast === yourAnswer;
    return (
      `<li class="cand-rev ${same ? 'cr-same' : 'cr-diff'}">` +
      `<span class="cr-name">${esc(cand.name)}${tag}</span>` +
      `<span class="cr-vote">${esc(t('rev.voted', { vote: t(cast === 1 ? 'vote.yea' : 'vote.nay') }))}</span>` +
      `<span class="cr-match">${esc(t(same ? 'rev.sameAsYou' : 'rev.oppositeToYou'))}</span></li>`
    );
  }).join('');

  const counted = CANDIDATES.filter((c) => {
    const v = item.votes[c.id];
    return v === 1 || v === -1;
  });
  const agreed = counted.filter((c) => item.votes[c.id] === yourAnswer).length;
  const missing = CANDIDATES.length - counted.length;

  const summary = counted.length === 0
    ? t('rev.noneVoted')
    : t('rev.agreedCount', { agreed, counted: counted.length }) +
      (missing
        ? (missing === 1 ? t('rev.missingOne') : t('rev.missingMany', { n: missing }))
        : '.');

  // The Republican comparators, in the SAME tier as the candidates above: House
  // members who voted on this exact bill. They are the only genuinely comparable
  // Republican signal, since none of the three opponents casts a House vote.
  // Grouped separately and labelled with the role that selected them, so nobody
  // mistakes them for people on the ballot.
  const comparatorRows = (party: string) =>
    COMPARATORS.filter((c) => c.party === party)
      .map((c) => {
        const cast = item.votes[c.id];
        const tag = `<small>${esc(c.party)} · ${esc(c.role)}</small>`;
        if (cast !== 1 && cast !== -1) {
          return (
            `<li class="cand-rev cr-none"><span class="cr-name">${esc(c.name)}${tag}</span>` +
            `<span class="cr-vote">${esc(t('vote.none'))}</span><span class="cr-match">—</span></li>`
          );
        }
        const same = cast === yourAnswer;
        return (
          `<li class="cand-rev ${same ? 'cr-same' : 'cr-diff'}">` +
          `<span class="cr-name">${esc(c.name)}${tag}</span>` +
          `<span class="cr-vote">${esc(t('rev.voted', { vote: t(cast === 1 ? 'vote.yea' : 'vote.nay') }))}</span>` +
          `<span class="cr-match">${esc(t(same ? 'rev.sameAsYou' : 'rev.oppositeToYou'))}</span></li>`
        );
      })
      .join('');

  // Same rule, both caucuses. Running it on Republicans only — while the three
  // Democrats above were named individuals — was a double standard however well
  // argued: either the rule governs who appears or it does not.
  const repRows = ([['R', t('rev.repsHead')],
                    ['D', t('rev.demsHead')]] as const)
    .map(([party, head]) => {
      const rows = comparatorRows(party);
      return rows
        ? `<div class="ps-head">${head}</div><ul class="cand-revs rep-revs">${rows}</ul>`
        : '';
    })
    .join('');

  // How the two caucuses split on this same roll call. This is the part that keeps
  // the reveal from reading as a panel of three Democrats: it is symmetric by
  // construction, sits in the same vote tier, and exists on EVERY question rather
  // than the 8 where an opponent action happens to attach.
  const split =
    item.rYea === null || item.dYea === null
      ? ''
      : `<div class="party-split">` +
        `<div class="ps-row"><span class="ps-label">${esc(t('rev.reps'))}</span>` +
        `<span class="ps-bar"><i style="width:${Math.round(item.rYea * 100)}%"></i></span>` +
        `<span class="ps-num num">${esc(t('rev.yeaShare', { pct: pct(item.rYea) }))}</span></div>` +
        `<div class="ps-row"><span class="ps-label">${esc(t('rev.dems'))}</span>` +
        `<span class="ps-bar"><i style="width:${Math.round(item.dYea * 100)}%"></i></span>` +
        `<span class="ps-num num">${esc(t('rev.yeaShare', { pct: pct(item.dYea) }))}</span></div>` +
        `</div>`;

  return (
    `<div class="reveal cand-reveal">` +
    `<div class="outc-cat">${esc(t('rev.threeRaces', { bill: item.billId }))}</div>` +
    `<ul class="cand-revs">${rows}</ul>` +
    `<div class="cand-rev-sum">${summary} ` +
    `${t('rev.youSaidVote', { vote: esc(t(yourAnswer === 1 ? 'vote.yea' : 'vote.nay')) })}</div>` +
    // Collapsed by default. The six comparators exist so the page is not one-sided,
    // but on screen at all times they buried the three races the page is actually
    // about. Balance has to be available, not dominant.
    (repRows
      ? `<details class="cmp"${comparatorsOpen ? ' open' : ''}>` +
        `<summary>${esc(t('rev.compareSummary'))} <span>` +
        `${esc(t('rev.compareHint'))}</span></summary>` +
        repRows +
        `<div class="rep-note">${esc(t('rev.compareNote'))}` +
        `` +
        `` +
        `</div></details>`
      : '') +
    `<div class="ps-head">${esc(t('rev.partyVote'))}</div>` +
    split +
    opponentReveal(item, yourAnswer) +
    `</div>`
  );
}

/**
 * What the candidates' opponents did on this same bill.
 *
 * Every one of them is a non-legislator, so none casts a vote here: Abbott has
 * never served in a legislature, Paxton's last vote was in 2015 before any of the
 * three took office, and Patrick presides over the Senate rather than voting in
 * the House. Leaving them out entirely, though, makes the page look like a panel
 * of three Democrats — so where there IS a recorded action on the exact bill just
 * answered, it is shown.
 *
 * The one rule that cannot bend: this is the `act` tier and it never joins the
 * vote tally above. Patrick's list contains only bills he wanted passed and
 * Abbott's contains only bills he killed, so counting "you agreed with Patrick on
 * 6 of 7" would be measuring the shape of his press release, not his positions.
 * Direction on a single named bill is a fact; a rate over a one-sided list is not.
 */
function opponentReveal(item: QuizItem, yourAnswer: 1 | -1): string {
  const acts = item.acts ?? [];
  if (!acts.length) return '';

  const rows = acts
    .map((a) => {
      // Kept short on purpose: 'named it a priority bill' in a monospace face
      // overflowed its row below 420px and pushed the whole page into a
      // horizontal scroll at 320px.
      const verb = t(a.kind === 'veto' ? 'rev.oppVetoed' : 'rev.oppPriority');
      const same = a.position === yourAnswer;
      return (
        `<li class="opp-row ${same ? 'op-same' : 'op-diff'}">` +
        `<span class="opp-name">${esc(a.who)}<small>${esc(a.office)}</small></span>` +
        `<span class="opp-act">${verb}</span>` +
        `<span class="opp-side">${esc(t(same ? 'rev.sameSide' : 'rev.oppositeSide'))}</span>` +
        `<a class="opp-src" href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">${esc(t('rev.source'))}</a></li>`
      );
    })
    .join('');

  return (
    `<div class="opp-block"><div class="ps-head">${esc(t('rev.oppHead'))}</div>` +
    `<ul class="opp-rows">${rows}</ul>` +
    `<div class="opp-note">${esc(t('rev.oppNote'))}` +
    `` +
    `` +
    `</div></div>`
  );
}

function renderQuestion(): void {
  const c = el('q-card');
  if (cursor >= queue.length) {
    c.innerHTML =
      `<div class="eyebrow">${esc(t('q.doneEyebrow'))}</div>` +
      `<div class="q-caption">${esc(t('q.doneCaption', { n: queue.length }))}</div>` +
      `<div class="q-sub">${esc(t('q.doneSub'))}</div>` +
      `<div class="q-actions"><button data-preset="reset">${esc(t('q.startOver'))}</button></div>`;
    bindPresets();
    return;
  }
  // Prose only — the official caption is untouched by pes.itemProse.
  const it = pes.itemProse(queue[cursor]);
  const prev = cursor > 0 ? queue[cursor - 1] : null;
  // Outcomes reveal only AFTER an answer. Showing "Texas ranks 47th" beside an
  // education question would tell the reader how to vote.
  const prevAnswered = prev && (answers[prev.id] === 1 || answers[prev.id] === -1);
  const prevOut = prevAnswered
    ? (() => {
      const found = DATA.outcomes.find((o) => o.category === prev!.category);
      return found ? pes.outcome(found) : undefined;
    })()
    : undefined;

  c.innerHTML =
    `<div class="q-meta"><div class="eyebrow">` +
    `${esc(t('q.counter', { i: cursor + 1, n: queue.length }))} · ${esc(it.billId)} · ` +
    `${esc(it.label || pes.categoryName(it.category))}</div>` +
    `<div class="eyebrow">${esc(t('q.blind'))}</div></div>` +
    // The caption is the official record, copied word for word, and is NEVER
    // translated. On the Spanish page it stays English and carries lang="en" so
    // a screen reader switches voice for it — see official_text_rule in
    // i18n/copy.json. A Spanish rendering ships beside it, not instead of it.
    `<div class="q-caption" lang="en">${esc(it.caption)}</div>` +
    `<div class="q-sub">${esc(t('q.caption', { yeas: it.yeas, nays: it.nays }))}</div>` +
    // Ours, not the record's — so it is labelled, and it sits BELOW the official
    // caption instead of replacing it. In a blind quiz the wording is the
    // question, so the reader has to be able to see which words are whose.
    (it.plain
      ? `<div class="q-plain"><span class="q-plain-tag">${esc(t('q.plainTag'))}</span>${esc(it.plain)}` +
        `<small>${esc(t('q.plainNote'))}</small></div>`
      : '') +
    (it.why
      ? `<div class="headline-why"><b>${esc(t('q.whyThis'))}</b> ${esc(it.why)}</div>`
      : '') +
    `<div class="q-actions">` +
    `<button data-answer="1">${esc(t('vote.yea'))}</button>` +
    `<button data-answer="-1">${esc(t('vote.nay'))}</button>` +
    `<button class="ghost" data-answer="0">${esc(t('q.skip'))}</button>` +
    `<button class="ghost" id="receipt-btn">` +
    `${esc(t(receiptOpen ? 'q.hideReceipt' : 'q.showReceipt'))}</button></div>` +
    `<div class="receipt${receiptOpen ? ' on' : ''}">` +
    `<strong>${esc(t('q.receiptHead'))}</strong> ${esc(t('q.receiptBody'))}` +
    `<dl><dt>${esc(t('q.rYea'))}</dt><dd>${it.rYea === null ? '—' : pct(it.rYea)}</dd>` +
    `<dt>${esc(t('q.dYea'))}</dt><dd>${it.dYea === null ? '—' : pct(it.dYea)}</dd>` +
    `<dt>${esc(t('q.valenceRow'))}</dt><dd>${it.valence === null ? '—' : fmt(it.valence)}</dd>` +
    // `it.src` is the literal token the table column shows ("journal"/"scrape"),
    // so it stays untranslated: method.words.body names those exact words.
    `<dt>${esc(t('rev.source'))}</dt><dd>${it.src}${it.rec ? ` · RV ${it.rec}` : ''}</dd>` +
    `</dl></div>` +
    (prevAnswered ? candidateReveal(prev!, answers[prev!.id] as 1 | -1) : '') +
    (prevOut
      ? `<div class="reveal"><div class="outc-cat">` +
        `${esc(t('rev.outcomeHead', { category: pes.categoryName(prevOut.category).toLowerCase() }))}</div>` +
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
  // <details> keeps its own state, but the card is re-rendered on every answer, so
  // the choice has to be remembered or it snaps shut mid-quiz.
  document.querySelectorAll<HTMLDetailsElement>('details.cmp').forEach((d) => {
    d.addEventListener('toggle', () => { comparatorsOpen = d.open; });
  });
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

/**
 * The incumbency objection, answered where it arises.
 *
 * Every name this page can put a number on is a sitting House member, because a
 * score needs both people to have voted on the same bills and only legislators
 * have. That is a real structural asymmetry, not an appearance problem, and the
 * honest move is to state it before the reader notices it — a page that looks
 * like it is hiding this loses the argument regardless of the arithmetic.
 *
 * Everything here is read off the payload: the reasons come from each opponent's
 * own `whyNoVotes`, the refusal to compute a rate comes from `oneSided`, and the
 * comparator counts are recomputed from COMPARATORS. Nothing is typed in, so the
 * card cannot end up describing a build it is not part of.
 */
function renderBias(): void {
  const reps = COMPARATORS.filter((c) => c.party === 'R').length;
  const dems = COMPARATORS.filter((c) => c.party === 'D').length;
  const coverage = COMPARATORS.map((c) => c.voted);
  const lo = Math.min(...coverage);
  const hi = Math.max(...coverage);
  const withActs = ALL_ITEMS.filter((i) => (i.acts ?? []).length).length;

  // One opponent's `oneSided` sentence, not all three: they make the same point
  // and stacking them reads as protesting too much.
  //
  // It has to carry the NAME with it. The payload sentence is written to sit
  // beside a named opponent and opens "Every bill on that list is one he wanted
  // passed" — lifted out on its own, that "he" has no antecedent and the reader
  // cannot tell whose list is being described.
  const oneSidedOf = OPPONENTS.map(pes.opponent).find((o) => o.oneSided);

  // Only the first character, never the whole string: these payload fields are
  // multi-sentence, and .toLowerCase() on one of them flattens the capital that
  // starts its second sentence.
  const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  // Counts of people are spelled out, the way the rest of the page does it
  // ("All three sat in the same chamber"). Data figures — 67 questions, 8 acts,
  // 56–64 of 67 — stay as numerals, because those are measurements and the
  // reader is meant to be able to check them. `word` comes from ./i18n now and
  // carries a Spanish numeral list; the local copy here only knew English.
  const payloadLink =
    `<a href="${PAYLOAD_URL}">${PAYLOAD_URL.replace(/^https?:\/\/[^/]+/, '')}</a>`;

  el('bias-card').innerHTML =
    `<div class="eyebrow">${esc(t('bias.heading'))}</div>` +

    `<div class="blurb" style="margin-top:12px">` +

    `<p>${t('bias.p1', { n: word(CANDIDATES.length) })}</p>` +

    `<ul class="bias-why">` +
    OPPONENTS.map(pes.opponent).map((o) =>
      `<li><span class="bias-who">${esc(o.name)}<small>${esc(o.office)}</small></span>` +
      `<span class="bias-reason">${esc(o.whyNoVotes)}</span></li>`).join('') +
    `</ul>` +

    `<p>${t('bias.p2')}</p>` +

    // The payload's comparatorRule is used verbatim and as its own sentence. It
    // already reads "From each caucus: … The same rule on both sides, recomputed
    // every build." — so it needs no lead-in, and lowercasing it (an earlier
    // draft did) breaks the capital on its second sentence. It is still English
    // on the Spanish page: payload prose is pass two.
    `<p>${t('bias.p3', {
      n: word(CANDIDATES.length),
      items: ALL_ITEMS.length,
      total: word(reps + dems),
      reps: word(reps),
      dems: word(dems),
    })} ${esc(pes.prose('comparatorRule', DATA.comparatorRule))} ${t('bias.p3b', {
      lo, hi, items: ALL_ITEMS.length,
    })}</p>` +

    `<p>${t('bias.p4', { acts: withActs, items: ALL_ITEMS.length })}` +
    (oneSidedOf
      ? ' ' + t('bias.clearestCase', {
        name: esc(oneSidedOf.name),
        why: esc(lowerFirst(oneSidedOf.oneSided)),
      })
      : '') +
    `</p>` +

    // Hand over the attack surface rather than asking to be trusted. The rule is
    // the only place a thumb could go, so it is named and the file is linked.
    //
    // "Is the instrument fair" and "who built it" are the same question asked
    // twice, so the answer to the second is one click from the first rather than
    // something the reader has to go hunting for at the bottom of the page.
    `<p class="blurb-fine">${t('bias.fine', {
      total: word(reps + dems),
      payload: payloadLink,
      authorLink: `<a href="#author-card">${esc(t('bias.authorLinkText'))}</a>`,
    })}</p>` +

    `</div>`;
}


/**
 * How the reader's own representative voted.
 *
 * Placed after the incumbency card because the honest answer to "why only these
 * three" is what earns the right to then ask about their own member. The score
 * comes from the same estimator the candidates go through, so the two numbers
 * are the same claim — verify_site.mjs cross-checks that by looking up district
 * 47, who is also one of the three candidates, and asserting both paths agree.
 *
 * SPLIT IN TWO ON PURPOSE. The first version rebuilt the whole card's innerHTML
 * on every input event, which replaced the input element the reader was typing
 * into and dropped focus after the first keystroke. Typing "147" was impossible.
 * The shell is built once; only the result region re-renders.
 */
function renderRep(): void {
  const c = el('rep-card');
  const answered = Object.values(answers).filter((v) => v === 1 || v === -1).length;

  const head =
    `<div class="eyebrow">${esc(t('rep.heading'))}</div>` +
    `<p class="lede">${esc(t('rep.lede'))}</p>`;

  // Nothing to score against yet. Saying so beats rendering an input that can
  // only produce a meaningless number.
  if (answered === 0) {
    c.innerHTML = head + `<p class="rep-note">${esc(t('rep.answerFirst'))}</p>`;
    repShell = false;
    return;
  }

  if (!repShell) {
    const stateLookup =
      `<a href="https://wrm.capitol.texas.gov/home" target="_blank" rel="noopener">` +
      `${esc(t('rep.findDistrictLinkText'))}</a>`;

    c.innerHTML =
      head +
      `<div class="rep-form">` +
      `<div class="rep-field"><label for="rep-district">${esc(t('rep.districtLabel'))}</label>` +
      `<input id="rep-district" type="number" min="1" max="150" inputmode="numeric" ` +
      `placeholder="${esc(t('rep.districtPlaceholder'))}"></div>` +
      `<div class="rep-field"><label for="rep-zip">${esc(t('rep.zipLabel'))}</label>` +
      `<input id="rep-zip" type="text" inputmode="numeric" maxlength="5" autocomplete="postal-code" ` +
      `placeholder="${esc(t('rep.zipPlaceholder'))}"></div>` +
      `<div class="rep-field"><label for="rep-name">${esc(t('rep.nameLabel'))}</label>` +
      `<input id="rep-name" type="search" autocomplete="off" ` +
      `placeholder="${esc(t('rep.namePlaceholder'))}"></div>` +
      `</div>` +
      `<p class="rep-help">${t('rep.findDistrict', { link: stateLookup })}</p>` +
      `<div id="rep-out"></div>`;

    // Load on first interaction, not on page load: the record is 10.7 KB
    // gzipped and most visitors will never open this panel.
    const ensure = async () => {
      if (repFile || repStatus === 'loading') return;
      repStatus = 'loading';
      const f = await rep.loadMembers();
      repFile = f;
      repStatus = f ? 'idle' : 'failed';
      renderRepOut();
    };

    // The crosswalk is a second file. Only ZIP users fetch it.
    const ensureZips = async () => {
      if (repZipFile || repZipStatus === 'loading') return;
      repZipStatus = 'loading';
      const f = await rep.loadZips();
      repZipFile = f;
      repZipStatus = f ? 'idle' : 'failed';
    };

    /** Resolve the typed ZIP once both files are in. */
    const resolveZip = async () => {
      if (repZip.length !== 5) { repZipResult = { kind: 'none' }; renderRepOut(); return; }
      await Promise.all([ensure(), ensureZips()]);
      if (!repZipFile) { renderRepOut(); return; }
      const ds = rep.districtsForZip(repZipFile, repZip);
      // Keep the district box in step. Without this it can be left showing a
      // number the panel is no longer talking about — type 999, then a ZIP, and
      // the out-of-range warning goes but the 999 stays on screen.
      const box = document.getElementById('rep-district') as HTMLInputElement | null;
      if (!ds) {
        repZipResult = { kind: 'unknown', zip: repZip };
        repDistrict = null;
        if (box) box.value = '';
      } else if (ds.length === 1) {
        // The common case. Answer it outright rather than making the reader
        // click a list of one.
        repZipResult = { kind: 'whole', zip: repZip, d: ds[0].d };
        repDistrict = ds[0].d;
        if (box) box.value = String(ds[0].d);
      } else {
        // A split ZIP cannot be resolved from a ZIP alone. Say so and let them
        // pick; guessing the largest share would be wrong for up to half of
        // the people in the ZIP.
        repZipResult = { kind: 'split', zip: repZip, ds };
        repDistrict = null;
        if (box) box.value = '';
      }
      renderRepOut();
    };

    const z = el<HTMLInputElement>('rep-zip');
    z.addEventListener('input', () => {
      const digits = z.value.replace(/\D/g, '').slice(0, 5);
      if (digits !== z.value) z.value = digits;
      repZip = digits;
      repQuery = '';
      void resolveZip();
      renderRepOut();
    });

    const d = el<HTMLInputElement>('rep-district');
    d.addEventListener('input', () => {
      const v = d.value.trim();
      repDistrict = v === '' ? null : Number(v);
      repQuery = '';
      repZipResult = { kind: 'none' };
      void ensure();
      renderRepOut();
    });
    const nm = el<HTMLInputElement>('rep-name');
    nm.addEventListener('input', () => {
      repQuery = nm.value;
      repZipResult = { kind: 'none' };
      void ensure();
      renderRepOut();
    });

    repShell = true;
  }

  renderRepOut();
}

/**
 * Only the result region. Never touches the inputs, so focus and caret survive.
 *
 * Picking a name from the search sets the district input's value directly rather
 * than through a re-render, for the same reason.
 */
function renderRepOut(): void {
  const out = document.getElementById('rep-out');
  if (!out) return;
  const items = repFile?.itemOrder.length ?? 67;
  let html = '';

  // The ZIP verdict comes first: it explains why a district is being shown at
  // all, or why one cannot be.
  if (repZipStatus === 'failed') {
    html += `<p class="rep-note">${esc(t('rep.zipFailed'))}</p>`;
  } else if (repZipResult.kind === 'unknown') {
    html += `<p class="rep-note">${esc(t('rep.zipUnknown', { zip: repZipResult.zip }))}</p>`;
  } else if (repZipResult.kind === 'whole') {
    html += `<p class="rep-note">${
      esc(t('rep.zipWhole', { zip: repZipResult.zip, d: repZipResult.d }))}</p>`;
  } else if (repZipResult.kind === 'split') {
    const link =
      `<a href="https://wrm.capitol.texas.gov/home" target="_blank" rel="noopener">` +
      `${esc(t('rep.findDistrictLinkText'))}</a>`;
    html += `<p class="rep-note">${t('rep.zipSpans', {
      zip: repZipResult.zip, n: repZipResult.ds.length, link,
    })}</p>`;
    html += `<ul class="rep-hits rep-split">` + repZipResult.ds.map((c) => {
      const m = repFile ? rep.memberForDistrict(repFile, c.d) : undefined;
      // A share that rounds to nothing must not render as "0% of this ZIP",
      // which reads like broken data next to a real option.
      const share = c.pct >= 1 ? t('rep.zipShare', { pct: c.pct }) : t('rep.zipShareSmall');
      return `<li><button class="ghost" data-rep-d="${c.d}"${
        c.d === repDistrict ? ' aria-current="true"' : ''}>` +
        `${esc(m ? m.n : t('rep.district', { d: c.d }))} ` +
        `<span class="mono">${esc(t('rep.district', { d: c.d }))}</span> ` +
        `<span class="rep-share">${esc(share)}</span></button></li>`;
    }).join('') + `</ul>`;
  }

  if (repStatus === 'failed') {
    const link = `<a href="${rep.MEMBERS_URL}">${rep.MEMBERS_URL}</a>`;
    html += `<p class="rep-note">${t('rep.loadFailed', { link })}</p>`;
  } else if (repFile) {
    if (repQuery.trim().length >= 2) {
      const hits = rep.searchMembers(repFile, repQuery);
      if (hits.length) {
        html += `<ul class="rep-hits">` + hits.map((m) =>
          `<li><button class="ghost" data-rep-d="${m.d}">${esc(m.n)} ` +
          `<span class="mono">${esc(t('rep.district', { d: m.d }))}</span></button></li>`).join('') +
          `</ul>`;
      }
    }

    if (repDistrict !== null) {
      if (!Number.isInteger(repDistrict) || repDistrict < 1 || repDistrict > 150) {
        html += `<p class="rep-note">${esc(t('rep.outOfRange'))}</p>`;
      } else {
        const m = rep.memberForDistrict(repFile, repDistrict);
        if (!m) {
          html += `<p class="rep-note">${esc(t('rep.noSuchDistrict', { d: repDistrict }))}</p>`;
        } else {
          const r = rep.scoreMember(adapted, repFile, m, answers);
          const party = m.p === 'D' ? t('party.D') : m.p === 'R' ? t('party.R') : m.p;
          html +=
            `<div class="rep-out"><div class="cands"><div class="cand">` +
            `<div class="cand-name">${esc(m.n)}</div>` +
            `<div class="cand-office">${esc(t('rep.district', { d: m.d }))} · ${esc(party)}</div>` +
            `<div class="cand-score num">${r.phrase ? fmt(r.adjusted) : '—'}</div>` +
            `<div class="cand-phrase">${esc(r.phrase ?? '')}</div>` +
            `<div class="cand-n">n = ${r.n}</div>` +
            `</div></div>`;
          // An absence is not a middling result. Without this the bands would
          // file a member who cast none of these votes under "no clearer than
          // chance", which reads as a finding rather than as missing data.
          if (!r.phrase) {
            html += `<p class="rep-note">${esc(t('rep.noVotes', { name: m.n, items }))}</p>`;
          } else {
            html += `<p class="rep-note">${
              esc(t('rep.coverage', { voted: m.voted, items, n: r.n }))}</p>`;
            if (r.n < 10) {
              html += `<p class="rep-note rep-thin">${esc(t('rep.thin', { n: r.n }))}</p>`;
            }
          }
          html += `</div>`;
        }
      }
    }

    const excluded = repFile.provenance?.unnamedVoters ?? 0;
    if (excluded) {
      html += `<p class="rep-excluded">${esc(t('rep.excluded', { n: excluded }))}</p>`;
    }
  }

  out.innerHTML = html;

  out.querySelectorAll<HTMLButtonElement>('[data-rep-d]').forEach((b) => {
    b.addEventListener('click', () => {
      repDistrict = Number(b.dataset.repD);
      repQuery = '';
      const d = document.getElementById('rep-district') as HTMLInputElement | null;
      if (d) d.value = String(repDistrict);
      const nm = document.getElementById('rep-name') as HTMLInputElement | null;
      if (nm) nm.value = '';
      renderRepOut();
    });
  });
}

function renderOutcomes(): void {
  const answered = new Set(
    activeItems().filter((i) => answers[i.id] === 1 || answers[i.id] === -1).map((i) => i.category),
  );
  const shown = DATA.outcomes.filter((o) => answered.has(o.category)).map(pes.outcome);
  const card = el('outcome-card');
  if (!shown.length) { card.hidden = true; return; }
  card.hidden = false;
  el('outcomes').innerHTML = shown.map((o) =>
    `<div class="outc-row"><div class="outc-cat">${esc(pes.categoryName(o.category))} · ${esc(o.label)}</div>` +
    `<div class="outc-val">${esc(o.value)}</div>` +
    `<div class="outc-cmp">${esc(o.comparison)}</div>` +
    // No rank means no badge: a coloured chip would imply a ranking this measure
    // does not have.
    (o.rank ? `<div class="outc-rank st-${o.standing}">${esc(o.rank)}</div>` : '') +
    `<div class="outc-src">${esc(o.sourceName)} · ${esc(o.year)} · ` +
    `<a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener">source</a></div>` +
    `<div class="outc-cav">${esc(o.caveat)}</div></div>`).join('');
  el('causal').textContent = pes.prose('causalNote', DATA.causalNote);
  el('omissions').innerHTML = DATA.omissions.length
    ? t('outc.leftBlank') + ' ' + DATA.omissions.map((o) =>
        `<b>${esc(pes.categoryName(o.category))}</b> — ${esc(pes.omissionWhy(o.category, o.why))}`).join(' ')
    : '';
  el('incumbents').innerHTML = DATA.incumbents.map(pes.incumbent).map((i) =>
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
  const tbl = el('table');
  if (p.n === 0) {
    tbl.innerHTML =
      `<tbody><tr><td style="color:var(--muted);padding:20px 0">` +
      `${esc(t('table.empty'))}</td></tr></tbody>`;
    return;
  }
  const byId = new Map(activeItems().map((i) => [i.id, i]));
  const rows = [...p.marks].sort((a, b) => a.coordinate - b.coordinate).map((m) => {
    const i = byId.get(m.itemId)!;
    return `<tr><td><span class="swatch" style="background:${markColor(m.coordinate)}"></span>${esc(i.billId)}</td>` +
      `<td lang="en">${esc(i.caption)}</td><td>${esc(pes.categoryName(i.category))}</td><td class="num">${esc(t(m.answer === 1 ? 'vote.yea' : 'vote.nay'))}</td>` +
      `<td class="num">${i.rYea === null ? '—' : pct(i.rYea)}</td>` +
      `<td class="num">${i.dYea === null ? '—' : pct(i.dYea)}</td>` +
      `<td class="num">${i.valence === null ? '—' : fmt(i.valence)}</td>` +
      `<td class="num">${fmt(m.coordinate)}</td>` +
      `<td class="src">${i.src}${i.rec ? ` ${i.rec}` : ''}</td></tr>`;
  }).join('');
  tbl.innerHTML =
    `<thead><tr><th>${esc(t('table.bill'))}</th><th>${esc(t('table.caption'))}</th>` +
    `<th>${esc(t('table.category'))}</th><th class="num">${esc(t('table.you'))}</th>` +
    `<th class="num">${esc(t('table.rYea'))}</th><th class="num">${esc(t('table.dYea'))}</th>` +
    `<th class="num">${esc(t('table.valence'))}</th>` +
    `<th class="num">${esc(t('table.position'))}</th><th>${esc(t('table.source'))}</th>` +
    `</tr></thead><tbody>` + rows + `</tbody>`;
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
  renderBias();
  renderRep();
  renderOutcomes();
  renderStatements();
  renderTable(p);
  bindPresets();
}

el('table-toggle').addEventListener('click', () => {
  tableOpen = !tableOpen;
  el('table-panel').hidden = !tableOpen;
  el('table-toggle').textContent = t(tableOpen ? 'ui.hideTable' : 'ui.showTable');
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

/**
 * Page-view counting, and nothing else.
 *
 * MODULE TOP LEVEL, and that placement is the whole point. An earlier version put
 * this inside setMode(), so it only ran when somebody switched between the
 * seven-issue and all-67 views — the page counted nothing on a plain visit. It
 * survived review because verify_site.mjs clicks the mode button during its run,
 * so the "analytics script was requested" check passed on a request that a real
 * visitor would never have triggered.
 *
 * inject() is used rather than the two script tags the docs give for plain HTML,
 * because the first of those is INLINE and this page's CSP is `script-src 'self'`
 * with no unsafe-inline — it would be blocked, loudly, which is what that policy
 * is for. Imported here it ships inside the bundle, and the script it loads is
 * same-origin (/_vercel/insights/), so the CSP needs no widening at all.
 *
 * What it sends: a page view, a referrer, a coarse device and country. No cookie,
 * and the visitor hash resets daily, so nobody can be followed across days or
 * across sites.
 *
 * What it does NOT send: the answers. Custom events are the only mechanism that
 * could carry one and they are not on this plan — but the real guard is that
 * verify_site.mjs answers five questions and fails if anything beyond fonts and
 * the page-view beacon leaves the browser, and separately that no request carries
 * an item id, a bill number or a candidate id. The claim is on the page, so it is
 * enforced rather than intended.
 */
inject();
