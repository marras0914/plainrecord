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
// Comparators stay closed until asked for; the three races come first.
let comparatorsOpen = false;

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

    // Said on the page, not only in a comment: the comparators arrive by a stated
    // rule and the candidates do not, and a choice presented without comment
    // reads as a measurement.
    `<b>Who is on this page.</b> ${esc(DATA.candidateProvenance)}<br><br>` +

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
        `<span class="cr-vote">no vote recorded</span>` +
        `<span class="cr-match">—</span></li>`
      );
    }
    const same = cast === yourAnswer;
    return (
      `<li class="cand-rev ${same ? 'cr-same' : 'cr-diff'}">` +
      `<span class="cr-name">${esc(cand.name)}${tag}</span>` +
      `<span class="cr-vote">voted ${cast === 1 ? 'Yea' : 'Nay'}</span>` +
      `<span class="cr-match">${same ? 'same as you' : 'opposite to you'}</span></li>`
    );
  }).join('');

  const counted = CANDIDATES.filter((c) => {
    const v = item.votes[c.id];
    return v === 1 || v === -1;
  });
  const agreed = counted.filter((c) => item.votes[c.id] === yourAnswer).length;
  const missing = CANDIDATES.length - counted.length;

  const summary = counted.length === 0
    ? 'None of the three has a recorded vote on this bill.'
    : `${agreed} of ${counted.length} voted the same way you did` +
      (missing
        ? `, and ${missing === 1 ? 'one has' : `${missing} have`} no recorded vote.`
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
            `<span class="cr-vote">no vote recorded</span><span class="cr-match">—</span></li>`
          );
        }
        const same = cast === yourAnswer;
        return (
          `<li class="cand-rev ${same ? 'cr-same' : 'cr-diff'}">` +
          `<span class="cr-name">${esc(c.name)}${tag}</span>` +
          `<span class="cr-vote">voted ${cast === 1 ? 'Yea' : 'Nay'}</span>` +
          `<span class="cr-match">${same ? 'same as you' : 'opposite to you'}</span></li>`
        );
      })
      .join('');

  // Same rule, both caucuses. Running it on Republicans only — while the three
  // Democrats above were named individuals — was a double standard however well
  // argued: either the rule governs who appears or it does not.
  const repRows = ([['R', 'Three Republicans, picked by rule'],
                    ['D', 'Three Democrats, picked by the same rule']] as const)
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
        `<div class="ps-row"><span class="ps-label">Republicans</span>` +
        `<span class="ps-bar"><i style="width:${Math.round(item.rYea * 100)}%"></i></span>` +
        `<span class="ps-num num">${pct(item.rYea)} Yea</span></div>` +
        `<div class="ps-row"><span class="ps-label">Democrats</span>` +
        `<span class="ps-bar"><i style="width:${Math.round(item.dYea * 100)}%"></i></span>` +
        `<span class="ps-num num">${pct(item.dYea)} Yea</span></div>` +
        `</div>`;

  return (
    `<div class="reveal cand-reveal">` +
    `<div class="outc-cat">The three races — how they voted on ${esc(item.billId)}</div>` +
    `<ul class="cand-revs">${rows}</ul>` +
    `<div class="cand-rev-sum">${summary} You said ` +
    `<b>${yourAnswer === 1 ? 'Yea' : 'Nay'}</b>.</div>` +
    // Collapsed by default. The six comparators exist so the page is not one-sided,
    // but on screen at all times they buried the three races the page is actually
    // about. Balance has to be available, not dominant.
    (repRows
      ? `<details class="cmp"${comparatorsOpen ? ' open' : ''}>` +
        `<summary>Compare with six other House members <span>three from each party, ` +
        `picked by rule</span></summary>` +
        repRows +
        `<div class="rep-note">None of these six is on the ballot. From each caucus: ` +
        `the most party-line member, the median, and the one who most often broke ` +
        `ranks — the same rule on both sides, recomputed every build, so the ` +
        `comparison is not a pick of names.</div></details>`
      : '') +
    `<div class="ps-head">How each party voted on it</div>` +
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
      const verb = a.kind === 'veto' ? 'vetoed it' : 'made it a priority';
      const same = a.position === yourAnswer;
      return (
        `<li class="opp-row ${same ? 'op-same' : 'op-diff'}">` +
        `<span class="opp-name">${esc(a.who)}<small>${esc(a.office)}</small></span>` +
        `<span class="opp-act">${verb}</span>` +
        `<span class="opp-side">${same ? 'same side as you' : 'opposite side to you'}</span>` +
        `<a class="opp-src" href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">source</a></li>`
      );
    })
    .join('');

  return (
    `<div class="opp-block"><div class="ps-head">What their opponents did on this bill</div>` +
    `<ul class="opp-rows">${rows}</ul>` +
    `<div class="opp-note">Not votes — neither of them votes in the House, so these ` +
    `are not counted above. And each list runs one way only: a governor vetoes just ` +
    `the bills he opposes, a priority list names just the bills its author wants ` +
    `passed. That is why you see a side on this bill and never a percentage.</div></div>`
  );
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
    // Ours, not the record's — so it is labelled, and it sits BELOW the official
    // caption instead of replacing it. In a blind quiz the wording is the
    // question, so the reader has to be able to see which words are whose.
    (it.plain
      ? `<div class="q-plain"><span class="q-plain-tag">In plain terms</span>${esc(it.plain)}` +
        `<small>Our summary, not the official text. The caption above is the official wording.</small></div>`
      : '') +
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
    (prevAnswered ? candidateReveal(prev!, answers[prev!.id] as 1 | -1) : '') +
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
  const oneSidedOf = OPPONENTS.find((o) => o.oneSided);

  // Counts of people are spelled out, the way the rest of the page does it
  // ("All three sat in the same chamber"). Data figures — 67 questions, 8 acts,
  // 56–64 of 67 — stay as numerals, because those are measurements and the
  // reader is meant to be able to check them.
  const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    'eight', 'nine', 'ten'];
  const word = (k: number) => WORDS[k] ?? String(k);

  // Only the first character, never the whole string: these payload fields are
  // multi-sentence, and .toLowerCase() on one of them flattens the capital that
  // starts its second sentence.
  const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  el('bias-card').innerHTML =
    `<div class="eyebrow">Doesn't this favour the people who have voting records?</div>` +

    `<div class="blurb" style="margin-top:12px">` +

    `<p><b>It would, if we scored anyone else. So we don't.</b> A score here needs ` +
    `one thing — the same bills, voted on by both of you. Only members of the Texas ` +
    `House have that. All ${word(CANDIDATES.length)} candidates above sit in the Texas ` +
    `House. Every one of the people they are running against does not:</p>` +

    `<ul class="bias-why">` +
    OPPONENTS.map((o) =>
      `<li><span class="bias-who">${esc(o.name)}<small>${esc(o.office)}</small></span>` +
      `<span class="bias-reason">${esc(o.whyNoVotes)}</span></li>`).join('') +
    `</ul>` +

    `<p>So they get no number at all — not a low one, not an estimate. Any score we ` +
    `printed for them would be votes we made up.</p>` +

    `<p><b>What stops this being a page about ${word(CANDIDATES.length)} Democrats.</b> ` +
    `Under every one of the ${ALL_ITEMS.length} questions we also show ` +
    `${word(reps + dems)} sitting House members — ${word(reps)} Republicans and ` +
    // The payload sentence is used verbatim and as its own sentence. It already
    // reads "From each caucus: … The same rule on both sides, recomputed every
    // build." — so it needs no lead-in, and lowercasing it (an earlier draft did)
    // breaks the capital on its second sentence.
    `${word(dems)} Democrats. ${esc(DATA.comparatorRule)} ` +
    `They voted on the same bills you are answering (${lo}–${hi} of ${ALL_ITEMS.length}), ` +
    `so they are scored the way the candidates are, on every question rather than a ` +
    `chosen few. If the Republican records land close to the Democratic ones on your ` +
    `answers, that is the finding, not a thumb on the scale.</p>` +

    `<p><b>Where an opponent does leave a mark.</b> On ${withActs} of the ` +
    `${ALL_ITEMS.length} there is a recorded action on the exact bill — a veto, or a ` +
    `bill named a must-pass priority. We show it under that question and we never add ` +
    `it to a tally. ` +
    (oneSidedOf
      ? `${esc(oneSidedOf.name)} is the clearest case — ${esc(lowerFirst(oneSidedOf.oneSided))}`
      : '') +
    `</p>` +

    // Hand over the attack surface rather than asking to be trusted. The rule is
    // the only place a thumb could go, so it is named and the file is linked.
    `<p class="blurb-fine">One rule picks all ${word(reps + dems)} of those names, and ` +
    `it cannot be tuned question by question. So if you think it is doing work it ` +
    `shouldn't, the rule is the thing to argue with — and every vote behind it is in ` +
    `<a href="${PAYLOAD_URL}">${PAYLOAD_URL.replace(/^https?:\/\/[^/]+/, '')}</a>.</p>` +

    `</div>`;
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
  renderBias();
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
