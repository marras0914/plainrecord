/**
 * PlainRecord — export the quiz payload for the front end
 *
 *   npx tsx scripts/export_quiz_data.ts 89R <bills.csv> <people.csv> [--out file]
 *
 * The ingested session is ~40 MB and carries every member's vote on every item.
 * A page needs neither. This runs the real pipeline — valences, profile weights,
 * the published selection rule — and emits only the selected items plus the
 * three candidates' own votes, with everything the browser cannot recompute
 * (chamber splits, weights) precomputed.
 *
 * Nothing here is placeholder. Question text is the official bill caption from
 * the Texas subject index, which DATA_PIPELINE.md notes is neutral by
 * construction and a better starting point than anything generated.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import type { VoteItem, VoteCast } from '../scoring';
import { yeaShare, discrimination, computeWeights, DEFAULT_OPTIONS } from '../scoring';
import { computeValences, profileWeights } from '../valence';
import type { PartyRoster } from '../valence';
import { selectItems, DEFAULT_RULE } from '../selection';
import { loadTable, col, optionalCol } from './csv_util';
import { WORK_DIR, SHIP_DIR } from './paths';
import { OUTCOMES, INCUMBENTS, CAUSAL_NOTE, DELIBERATE_OMISSIONS } from '../outcomes';
import { actsBySession, normBill, OPPONENTS } from './opponent_acts';

/**
 * The seven-question "headline issues" set.
 *
 * THIS IS HAND CURATION and is logged as such, per DATA_PIPELINE.md: "If any
 * hand curation survives, log it — which items, added or removed, and why — in
 * the repo, not in someone's head."
 *
 * The mechanical rule cannot produce this set, and it is worth being clear why.
 * Ranking by how much the chamber divided picks the CLOSEST votes, not the
 * best-known ones: in Education it returns SB 974 (a superintendent severance
 * payment, 67-79) over SB 2 (school vouchers, 86-63), because the first was
 * closer. Salience is not in the data. So the shortlist is chosen by hand from
 * an external, citable universe — bills the Lieutenant Governor designated a
 * priority or the Governor vetoed — and every choice carries its reason.
 *
 * Note what the set then reveals: six of the seven are strongly party-coded.
 * Headline fights are precisely where the caucuses divide hardest, so the short
 * quiz can mostly only tell you which party you lean toward. Finding out where
 * you cross lines needs the votes where the caucuses agreed, which is what the
 * full set is for. That is a finding, not a flaw, and the page says so.
 */
const HEADLINE_SET: { billId: string; label: string; why: string }[] = [
  { billId: 'SB 2',  label: 'School vouchers',
    why: 'The marquee fight of the session: public money for private school tuition. Lt. Gov. priority bill.' },
  { billId: 'SB 8',  label: 'Immigration enforcement',
    why: 'Requires local law enforcement to assist federal deportation efforts. Lt. Gov. priority bill.' },
  { billId: 'SB 10', label: 'Ten Commandments in classrooms',
    why: 'Requires the Ten Commandments displayed in public schools. Lt. Gov. priority bill.' },
  { billId: 'SB 3',  label: 'THC ban',
    why: 'Lt. Gov. priority bill that the Governor then VETOED — a documented split between two Republican leaders on one bill.' },
  { billId: 'SB 14', label: 'Regulatory review ("Texas DOGE")',
    why: 'Creates a state office to review regulations. Lt. Gov. priority bill.' },
  { billId: 'SB 6',  label: 'Electric grid and large power users',
    why: 'Grid reliability rules for large loads such as data centres. Lt. Gov. priority bill.' },
  { billId: 'SB 5',  label: 'Dementia research institute',
    why: 'Creates a state dementia research institute. Included deliberately as the least party-coded of the headline bills — without it the short set would be entirely party-line.' },
];

const CANDIDATES = [
  { name: 'Vikki Goodwin', office: 'Lieutenant Governor', running: 'vs Dan Patrick (R), Mike Collier (I)' },
  { name: 'Gina Hinojosa', office: 'Governor', running: 'vs Greg Abbott (R)' },
  { name: 'James Talarico', office: 'U.S. Senate', running: 'vs Ken Paxton (R)' },
];

function main() {
  const argv = process.argv.slice(2);
  const [session, billsCsv, peopleCsv] = argv.filter((a) => !a.startsWith('--'));
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : join(SHIP_DIR, 'quiz_89R.json');
  const perCat = (() => {
    const i = argv.indexOf('--per-category');
    return i >= 0 ? parseInt(argv[i + 1], 10) : 3;
  })();

  if (!session || !billsCsv || !peopleCsv) {
    console.error('usage: export_quiz_data.ts <session> <bills.csv> <people.csv> [--out f] [--per-category N]');
    process.exit(1);
  }

  const items: VoteItem[] = JSON.parse(
    readFileSync(join(WORK_DIR, `tx_bills_${session}.json`), 'utf8'),
  );
  // Roster comes from the people CSV, which carries chamber and party.
  const pT = loadTable(peopleCsv);
  const pid = col(pT, ['id']);
  const pname = col(pT, ['name']);
  const pparty = col(pT, ['party']);
  const pchamber = optionalCol(pT, ['chamber']);
  const roster: PartyRoster = {};
  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  for (const r of pT.rows) {
    const party = /^d/i.test(r[pparty]) ? 'D' : /^r/i.test(r[pparty]) ? 'R' : 'O';
    roster[r[pid]] = party;
    nameToId.set(r[pname], r[pid]);
    idToName.set(r[pid], r[pname]);
  }
  const houseIds = new Set(
    pchamber ? pT.rows.filter((r) => r[pchamber] === 'lower').map((r) => r[pid]) : Object.keys(roster),
  );

  // Bill captions — the official caption, used verbatim as the question text.
  const bT = loadTable(billsCsv);
  const bIdent = col(bT, ['identifier']);
  const bTitle = col(bT, ['title']);
  const captions = new Map<string, string>();
  for (const r of bT.rows) if (!captions.has(r[bIdent])) captions.set(r[bIdent], r[bTitle]);

  // House items only: all three candidates sit in the House, so a Senate roll
  // gives them no position and would only dilute the quiz.
  const houseItems = items.filter((it) => {
    const voters = Object.keys(it.votes).filter((id) => houseIds.has(id));
    return voters.length > 60;
  });

  // Drop uncategorized items before selection. They cannot participate in
  // stratified selection by definition, and empirically they are the ceremonial
  // ones the categorizer could not place: 89R's uncategorized bucket produced
  // "Authorizing the burial of Guy Herman in the State Cemetery" and
  // "Designating Rockwall County as the official Marriage Capital of Texas" as
  // quiz questions. An item with no category is a build gap, not a bucket.
  const uncategorized = houseItems.filter((it) => !it.category).length;
  const withCategory = houseItems.filter((it) => it.category);

  // ONE BILL, ONE QUESTION. A bill can carry several record votes (second and
  // third reading, amendments), and 89R's first export asked about HB 5616 twice
  // in the same category. Beyond being poor UX, it double-counts a single
  // position: the redundancy correction in valence.ts only merges same-bill items
  // whose votes correlate above 0.72, so two readings that diverged slightly both
  // survive with near-full weight. Collapsing to the most divisive vote per bill
  // removes the duplication at the source rather than discounting it afterwards.
  const bestPerBill = new Map<string, VoteItem>();
  for (const it of withCategory) {
    const cur = bestPerBill.get(it.billId);
    if (!cur) { bestPerBill.set(it.billId, it); continue; }
    const d = discrimination(it) - discrimination(cur);
    // Deterministic tie-break so the published question set cannot drift.
    if (d > 1e-12 || (Math.abs(d) <= 1e-12 && it.id < cur.id)) bestPerBill.set(it.billId, it);
  }
  const collapsedDuplicates = withCategory.length - bestPerBill.size;
  const categorized = [...bestPerBill.values()];

  const valences = computeValences(categorized, roster);
  const pWeights = profileWeights(categorized, DEFAULT_OPTIONS);
  const sWeights = computeWeights(categorized, DEFAULT_OPTIONS);

  const rule = { ...DEFAULT_RULE, maxPerCategory: perCat };
  const sel = selectItems(categorized, valences, rule);

  // Force the headline bills in even where the mechanical rule did not pick
  // them, and mark them so the page can offer a seven-question view.
  const headlineIds = new Map<string, { label: string; why: string }>();
  const selectedIds = new Set(sel.selected.map((i) => i.id));
  const missingHeadline: string[] = [];
  for (const h of HEADLINE_SET) {
    const cands = categorized.filter((i) => i.billId === h.billId && pWeights.has(i.id));
    if (cands.length === 0) { missingHeadline.push(h.billId); continue; }
    const best = cands.reduce((a, b) => (discrimination(b) > discrimination(a) ? b : a));
    headlineIds.set(best.id, { label: h.label, why: h.why });
    if (!selectedIds.has(best.id)) { sel.selected.push(best); selectedIds.add(best.id); }
  }
  if (missingHeadline.length) {
    console.warn(`  WARNING: headline bills with no eligible House vote: ${missingHeadline.join(', ')}`);
  }

  const candIds = CANDIDATES.map((c) => {
    const id = nameToId.get(c.name);
    if (!id) throw new Error(`candidate not found in roster: ${c.name}`);
    return { ...c, id };
  });

  // Opponent actions on the same bill. The join, and the reason these can never
  // be scored like votes, both live in scripts/opponent_acts.ts so the exporter
  // and augment_acts.ts cannot drift apart.
  const actsByBill = actsBySession(session);

  let itemsWithActs = 0;

  const out = {
    session,
    generated: 'static build',
    ruleVersion: rule.version,
    rulePerCategory: rule.maxPerCategory,
    ruleReserve: rule.crossCuttingReserve,
    rulePartisanThreshold: rule.partisanValenceThreshold,
    partisanByConstruction: sel.partisanByConstruction,
    headlineCount: headlineIds.size,
    crossCuttingShare: sel.crossCuttingShare,
    provenance: {
      houseItemsTotal: houseItems.length,
      uncategorizedExcluded: uncategorized,
      sameBillCollapsed: collapsedDuplicates,
      journalSourced: houseItems.filter((i) => i.voteSource === 'journal').length,
      selectedJournalSourced: sel.selected.filter((i) => i.voteSource === 'journal').length,
      eligibleTotal: categorized.filter((i) => pWeights.has(i.id)).length,
    },
    // Outcome indicators, incumbent tenure, and the causal caveat travel with the
    // payload so the page cannot render one without the other.
    outcomes: OUTCOMES,
    incumbents: INCUMBENTS,
    causalNote: CAUSAL_NOTE,
    omissions: DELIBERATE_OMISSIONS,
    // Who the three are running against, and — stated plainly, because the page
    // must not imply an absence of data is an absence of positions — exactly why
    // none of them can be scored against the reader the way a legislator can.
    opponents: OPPONENTS,
    candidates: candIds.map((c) => ({
      id: c.id,
      name: c.name,
      office: c.office,
      running: c.running,
      // Coverage over the SELECTED items, which is what the page scores on.
      voted: sel.selected.filter((i) => i.votes[c.id] === 1 || i.votes[c.id] === -1).length,
    })),
    items: sel.selected.map((it) => {
      const v = valences.get(it.id)!;
      const statements = (it.voteStatements ?? [])
        .filter((s) => s.memberId && candIds.some((c) => c.id === s.memberId))
        .map((s) => ({
          member: idToName.get(s.memberId!) ?? s.member,
          shownAs: s.shownAs,
          claimed: s.claimed,
          text: s.text.replace(/\s+/g, ' ').trim().slice(0, 240),
        }));
      const hl = headlineIds.get(it.id);
      return {
        id: it.id,
        billId: it.billId,
        ...(hl ? { headline: true, label: hl.label, why: hl.why } : {}),
        category: it.category,
        caption: (captions.get(it.billId) ?? '').replace(/\s+/g, ' ').trim(),
        yeas: it.yeas,
        nays: it.nays,
        p: +yeaShare(it).toFixed(4),
        valence: v.valence === null ? null : +v.valence.toFixed(4),
        rYea: v.rYeaShare === null ? null : +v.rYeaShare.toFixed(4),
        dYea: v.dYeaShare === null ? null : +v.dYeaShare.toFixed(4),
        w: +(pWeights.get(it.id) ?? 0).toFixed(4),
        sw: +(sWeights.get(it.id) ?? discrimination(it)).toFixed(4),
        src: it.voteSource ?? 'scrape',
        rec: it.journalRecord ?? null,
        votes: Object.fromEntries(
          candIds.map((c) => [c.id, (it.votes[c.id] ?? null) as VoteCast]),
        ),
        ...(statements.length ? { statements } : {}),
        ...(() => {
          const found = actsByBill.get(normBill(it.billId)) ?? [];
          if (!found.length) return {};
          itemsWithActs++;
          return { acts: found };
        })(),
      };
    }),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out));

  const bytes = readFileSync(outPath).length;
  console.log(`\nsession ${session}   rule ${rule.version} (max ${perCat}/category)`);
  console.log(`  House items            ${houseItems.length}`);
  console.log(`  uncategorized dropped  ${uncategorized}`);
  console.log(`  same-bill collapsed    ${collapsedDuplicates}`);
  console.log(`  eligible               ${out.provenance.eligibleTotal}`);
  console.log(`  categories             ${sel.byCategory.length}`);
  console.log(`  SELECTED               ${out.items.length}`);
  console.log(`  headline set           ${headlineIds.size}`);
  {
    const hs = out.items.filter((i) => (i as { headline?: boolean }).headline);
    const cross = hs.filter((i) => Math.abs(i.valence ?? 0) < rule.partisanValenceThreshold).length;
    console.log(`  headline cross-cutting ${cross}/${hs.length}`);
    for (const h of hs) console.log(`     ${h.billId.padEnd(7)} |v|=${Math.abs(h.valence ?? 0).toFixed(2)}  ${(h as {label?:string}).label}`);
  }
  console.log(`  items with an opponent action  ${itemsWithActs}/${out.items.length}`);
  console.log(`  cross-cutting share    ${(sel.crossCuttingShare * 100).toFixed(1)}%`);
  console.log(`  journal-sourced        ${out.provenance.selectedJournalSourced}/${out.items.length} selected`);
  console.log(`  items with a caption   ${out.items.filter((i) => i.caption).length}`);
  console.log(`  candidate statements   ${out.items.filter((i) => (i as { statements?: unknown[] }).statements).length}`);
  for (const c of out.candidates) {
    console.log(`    ${c.name.padEnd(16)} voted on ${c.voted}/${out.items.length} selected`);
  }
  console.log(`  -> ${outPath}  (${(bytes / 1024).toFixed(0)} KB)\n`);
}

if (process.argv[1] && /^export_quiz_data\.(ts|js|mjs|cjs)$/.test(basename(process.argv[1]))) main();
