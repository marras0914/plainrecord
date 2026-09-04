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
/**
 * `plain` — a plain-language gloss of what the bill DOES.
 *
 * This is the one thing on the page that is written by this project rather than
 * copied from the record, and it is the most dangerous field in the whole payload.
 * In a blind quiz the wording IS the question: "lets parents use public money for
 * private school" and "gives parents a choice of school" describe the same bill
 * and pull answers in opposite directions. So three rules constrain every line:
 *
 *   1. Describe the MECHANISM, not the effect. What changes, and for whom. Never
 *      whether that is good, who benefits, or what it will lead to.
 *   2. No evaluative adjectives, and no word either campaign uses as a slogan.
 *   3. Nothing that is not in the caption or the bill's own operative text. If a
 *      gloss needs a fact from outside the record, it does not get written.
 *
 * They are labelled on screen as ours, sit BELOW the official caption rather than
 * replacing it, and are written only for these seven. The other 60 items show the
 * caption alone: writing 60 more glosses from captions I have not read against the
 * bill text would be inventing meaning, and a confident wrong summary is worse for
 * a reader than a dense accurate one. That gap is deliberate and is stated in the
 * payload, not hidden.
 */
const HEADLINE_SET: { billId: string; label: string; why: string; plain: string }[] = [
  { billId: 'SB 2',  label: 'School vouchers',
    why: 'The marquee fight of the session: public money for private school tuition. Lt. Gov. priority bill.',
    plain: 'Creates state-funded accounts that families can spend on private school tuition and other approved school costs. The money comes out of the state budget.' },
  { billId: 'SB 8',  label: 'Immigration enforcement',
    why: 'Requires local law enforcement to assist federal deportation efforts. Lt. Gov. priority bill.',
    plain: 'Requires sheriffs to sign agreements letting their deputies carry out federal immigration enforcement, and creates state grants to pay for doing it.' },
  { billId: 'SB 10', label: 'Ten Commandments in classrooms',
    why: 'Requires the Ten Commandments displayed in public schools. Lt. Gov. priority bill.',
    plain: 'Requires every public school classroom in Texas to display a copy of the Ten Commandments.' },
  { billId: 'SB 3',  label: 'THC ban',
    why: 'Lt. Gov. priority bill that the Governor then VETOED — a documented split between two Republican leaders on one bill.',
    plain: 'Bans hemp products containing THC — the ones sold in smoke shops and convenience stores — and adds licences, fees and criminal penalties for selling them.' },
  { billId: 'SB 14', label: 'Regulatory review ("Texas DOGE")',
    why: 'Creates a state office to review regulations. Lt. Gov. priority bill.',
    plain: 'Sets up a new state office to review the rules that agencies write, and tells judges to stop treating an agency’s own reading of the law as the correct one.' },
  { billId: 'SB 6',  label: 'Electric grid and large power users',
    why: 'Grid reliability rules for large loads such as data centres. Lt. Gov. priority bill.',
    plain: 'Sets the rules for how very large electricity users, such as data centres, connect to the Texas grid and how much of the cost of serving them they pay.' },
  { billId: 'SB 5',  label: 'Dementia research institute',
    why: 'Creates a state dementia research institute. Included deliberately as the least party-coded of the headline bills — without it the short set would be entirely party-line.',
    plain: 'Creates a state institute that funds dementia prevention and research.' },
];

const CANDIDATES = [
  { name: 'Vikki Goodwin', office: 'Lieutenant Governor', running: 'vs Dan Patrick (R), Mike Collier (I)' },
  { name: 'Gina Hinojosa', office: 'Governor', running: 'vs Greg Abbott (R)' },
  { name: 'James Talarico', office: 'U.S. Senate', running: 'vs Ken Paxton (R)' },
];

/**
 * Comparators — three members from EACH caucus, by the same rule.
 *
 * The three candidates are all Democrats, which left the page showing one side of
 * the chamber. Their opponents cannot fix that — none of them votes in the House
 * (see scripts/opponent_acts.ts) — but the House's own members can: they voted on
 * the exact same bills, so they are directly comparable in the same tier.
 *
 * WHICH members is the whole problem, and the first version of this got the answer
 * half right. It picked Republicans by measured rule, on the argument that naming
 * recognisable Republicans would inject a judgement of who matters into a tool
 * whose premise is that it contains none — while the three Democrats on the same
 * page were named individuals. That argument, applied to one side only, is just a
 * double standard with a rationale attached. Either the rule governs who appears
 * or it does not.
 *
 * So it governs both. The same three roles are computed for each caucus: the most
 * party-line member, the median member, and the member who most often broke ranks.
 * The candidates remain as the page's SUBJECT, which is what a reader came for,
 * but they are no longer the only Democrats shown and no longer sit beside a
 * rule-picked Republican set with no equivalent of their own. Where they came from
 * is now stated on the page too — see CANDIDATE_PROVENANCE — because their being
 * there is a choice, and a choice presented without comment reads as a measurement.
 *
 * Definitions, so the numbers are checkable:
 *   with-caucus  share of this member's votes that matched their OWN caucus
 *                majority on the same item
 *   crossover    of the items where the two caucus majorities DISAGREED, the
 *                share where this member voted with the other caucus
 *
 * A member needs votes on at least 55 of the selected items to be eligible, so a
 * near-absent member cannot top either end on a handful of votes.
 */
const COMPARATOR_RULE =
  'From each caucus: the most party-line member, the median member, and the member ' +
  'who most often broke ranks. The same rule on both sides, recomputed every build.';

/**
 * How the three candidates got onto this page — stated, because it is NOT a
 * measured rule and the reader is entitled to know that.
 *
 * The comparators are picked by COMPARATOR_RULE and say so on screen. The three
 * candidates are named individuals, and for a while the page showed them beside a
 * rule-picked Republican set without ever admitting the difference. That held one
 * side of the aisle to a stricter standard than the other. The honest fix is two
 * things: run the rule on BOTH caucuses (it now does), and say plainly where the
 * three came from instead of letting their presence imply a rule that does not
 * exist.
 */
const CANDIDATE_PROVENANCE =
  'This page is about three specific races: Governor, Lieutenant Governor and ' +
  'U.S. Senate. All three Democratic candidates sit in the Texas House, which is ' +
  'the reason the comparison works at all — they voted on the same bills you are ' +
  'being asked about, so their records can be checked against yours vote for vote. ' +
  'Choosing those three races is an editorial decision, not a measurement, and the ' +
  'six other members below each question are picked by rule from both parties so ' +
  'the page is not left showing one side of the chamber.';

const COMPARATOR_MIN_VOTES = 55;

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
  const pparty = col(pT, ['party', 'current_party']);
  // Same alias trap as backfill_journal.ts: without 'current_chamber' the
  // House-only filter below quietly accepts Senate members.
  const pchamber = optionalCol(pT, ['chamber', 'current_chamber']);
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

  // How many items the RULE picked, captured before the headline bills are
  // pushed in below.
  //
  // This exists because `sel.crossCuttingShare` is computed inside selectItems()
  // over `sel.selected`, and the loop underneath then MUTATES that same array by
  // appending hand-picked headline bills. The share is therefore a ratio over
  // this count, not over `out.items.length` — and it was previously exported
  // beside a 67-item array with nothing saying so, while
  // `provenance.selectedJournalSourced` in the same object is computed after the
  // push and IS over 67. Two denominators, one payload, no labels.
  //
  // Recomputing the share over all 67 would be the wrong repair. It is a
  // diagnostic on the SELECTION RULE — `partisanByConstruction` trips when it
  // falls below PARTISAN_BY_CONSTRUCTION_THRESHOLD — and the headline bills are
  // chosen by hand precisely because they are the big fights, six of the seven
  // splitting the parties sharply. Folding them in would drag the share down and
  // report the rule as partisan-by-construction on the strength of items the
  // rule did not choose. So the number stays, and the denominator ships with it.
  const ruleSelectedCount = sel.selected.length;

  // Force the headline bills in even where the mechanical rule did not pick
  // them, and mark them so the page can offer a seven-question view.
  const headlineIds = new Map<string, { label: string; why: string; plain: string }>();
  const selectedIds = new Set(sel.selected.map((i) => i.id));
  const missingHeadline: string[] = [];
  for (const h of HEADLINE_SET) {
    const cands = categorized.filter((i) => i.billId === h.billId && pWeights.has(i.id));
    if (cands.length === 0) { missingHeadline.push(h.billId); continue; }
    const best = cands.reduce((a, b) => (discrimination(b) > discrimination(a) ? b : a));
    headlineIds.set(best.id, { label: h.label, why: h.why, plain: h.plain });
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

  // ---------------------------------------------------------------------------
  // Republican comparators, chosen by COMPARATOR_RULE (see the note above)
  // ---------------------------------------------------------------------------
  const houseOnly = (id: string) => houseIds.has(id);
  const caucusMajority = new Map<string, { r: 1 | -1 | null; d: 1 | -1 | null }>();
  for (const it of sel.selected) {
    let ry = 0, rn = 0, dy = 0, dn = 0;
    for (const [pid, v] of Object.entries(it.votes)) {
      if (!houseOnly(pid)) continue;
      const p = roster[pid];
      if (p === 'R') { if (v === 1) ry++; else if (v === -1) rn++; }
      else if (p === 'D') { if (v === 1) dy++; else if (v === -1) dn++; }
    }
    caucusMajority.set(it.id, {
      r: ry === rn ? null : ry > rn ? 1 : -1,
      d: dy === dn ? null : dy > dn ? 1 : -1,
    });
  }

  /**
   * Apply the rule to a caucus. Deliberately parameterised over party rather than
   * written once for Republicans: the first version of this only picked
   * Republicans by rule while the three Democrats were named individuals, which
   * held one side to a stricter standard than the other. Whatever the rule is, it
   * has to be the same rule on both sides of the aisle.
   */
  const comparatorsFor = (party: 'R' | 'D') => {
    const own = (m: { r: 1 | -1 | null; d: 1 | -1 | null }) => (party === 'R' ? m.r : m.d);
    const other = (m: { r: 1 | -1 | null; d: 1 | -1 | null }) => (party === 'R' ? m.d : m.r);
    const label = party === 'R' ? 'Republican' : 'Democrat';

    const stats = Object.keys(roster)
      .filter((id) => houseOnly(id) && roster[id] === party)
      .map((id) => {
        let n = 0, withCaucus = 0, split = 0, crossed = 0;
        for (const it of sel.selected) {
          const v = it.votes[id];
          if (v !== 1 && v !== -1) continue;
          const m = caucusMajority.get(it.id)!;
          const mine = own(m);
          if (mine === null) continue;
          n++;
          if (v === mine) withCaucus++;
          const theirs = other(m);
          if (theirs !== null && theirs !== mine) { split++; if (v === theirs) crossed++; }
        }
        return { id, n, withCaucus: n ? withCaucus / n : 0, split, crossed,
                 crossover: split ? crossed / split : 0 };
      })
      .filter((st) => st.n >= COMPARATOR_MIN_VOTES);

    if (stats.length < 3) {
      throw new Error(
        `only ${stats.length} ${label}s clear ${COMPARATOR_MIN_VOTES} votes — cannot ` +
          'pick comparators by rule, and picking them by hand is exactly what ' +
          'COMPARATOR_RULE exists to prevent.',
      );
    }
    const byLoyalty = [...stats].sort((a, b) => b.withCaucus - a.withCaucus || b.n - a.n);
    const byCrossover = [...stats].sort((a, b) => b.crossover - a.crossover || b.n - a.n);
    const picked = [
      { role: 'most party-line', ...byLoyalty[0] },
      { role: `median ${label}`, ...byLoyalty[Math.floor(byLoyalty.length / 2)] },
      { role: 'most crossover', ...byCrossover[0] },
    ];
    // The ends of a distribution can collide with its middle in a small caucus; a
    // duplicated row would misrepresent the spread as narrower than it is.
    const seen = new Set<string>();
    return picked
      .filter((c) => !seen.has(c.id) && seen.add(c.id))
      .map((c) => ({
        id: c.id,
        name: idToName.get(c.id) ?? c.id,
        party,
        role: c.role,
        voted: c.n,
        withCaucus: +c.withCaucus.toFixed(3),
        crossover: +c.crossover.toFixed(3),
        crossedOf: `${c.crossed}/${c.split}`,
      }));
  };

  // Both caucuses, same rule. The three candidates stay on the page as its
  // SUBJECT — that is what the reader came for — but they are no longer the only
  // Democrats shown, and they no longer sit beside a rule-picked Republican set
  // with no equivalent of their own.
  const comparatorOut = [...comparatorsFor('R'), ...comparatorsFor('D')];
  const comparators = comparatorOut;

  let itemsWithActs = 0;

  const out = {
    session,
    generated: 'static build',
    // The licence travels WITH the data, because the whole distribution model is
    // that someone downloads this file on its own. The site states it and the
    // Dataset JSON-LD declares it, but neither reaches a reader who has only the
    // JSON — which is exactly the reader this project is handing to journalists
    // and civic-tech volunteers. A `Link: <...>; rel="license"` header on
    // /data/* covers that until the next export; this closes it in the file.
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseNote:
      'The official bill captions in items[].caption are copied verbatim from ' +
      "the Texas House record and are not this project's to license. Roll-call " +
      'votes and chamber totals are facts. CC0 covers the original layer: the ' +
      'plain-language descriptions, the outcome prose, the computed valences and ' +
      'the selection rule. Outcome figures cite third-party sources by name and ' +
      "URL; please carry a figure's caveat with the figure.",
    ruleVersion: rule.version,
    rulePerCategory: rule.maxPerCategory,
    ruleReserve: rule.crossCuttingReserve,
    rulePartisanThreshold: rule.partisanValenceThreshold,
    partisanByConstruction: sel.partisanByConstruction,
    headlineCount: headlineIds.size,
    crossCuttingShare: sel.crossCuttingShare,
    // The denominator `crossCuttingShare` is a share OF. Always <= items.length;
    // the difference is the headline bills the rule had not already picked.
    crossCuttingOf: ruleSelectedCount,
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
    // Republican members of the SAME chamber who voted on the SAME bills — the
    // only genuinely comparable Republican signal available, since none of the
    // three opponents casts a House vote. Chosen by rule; see COMPARATOR_RULE.
    comparatorRule: COMPARATOR_RULE,
    candidateProvenance: CANDIDATE_PROVENANCE,
    comparators: comparatorOut,
    // Stated, not hidden: only the seven headline bills carry a plain-language
    // gloss. See the note on HEADLINE_SET for why the other 60 show the official
    // caption alone rather than a summary written from a caption.
    plainLanguageNote:
      'The short description under a bill is written by us, not copied from the ' +
      'record, and only the seven headline bills have one. Every other question ' +
      'shows the official caption on its own.',
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
        ...(hl ? { headline: true, label: hl.label, why: hl.why, plain: hl.plain } : {}),
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
          [...candIds.map((c) => c.id), ...comparators.map((c) => c.id)].map((id) => [
            id,
            (it.votes[id] ?? null) as VoteCast,
          ]),
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
  // Fail before writing, not after shipping. `crossCuttingShare` is computed
  // inside selectItems() and the headline loop then mutates the array it was
  // computed over, so the two can silently drift apart — which is exactly what
  // happened: a share over 60 items was exported beside 67 of them, next to a
  // `selectedJournalSourced` counted over all 67. If the denominator ever
  // exceeds the shipped item count, the ratio is describing a set that is not
  // in the payload and no reader could reconstruct it.
  if (ruleSelectedCount > out.items.length) {
    throw new Error(
      `crossCuttingOf (${ruleSelectedCount}) exceeds items (${out.items.length}) — ` +
        `the share denominator is not a subset of what ships`,
    );
  }
  {
    const numerator = out.crossCuttingShare * ruleSelectedCount;
    if (Math.abs(numerator - Math.round(numerator)) > 1e-6) {
      throw new Error(
        `crossCuttingShare (${out.crossCuttingShare}) is not a whole count over ` +
          `crossCuttingOf (${ruleSelectedCount}) — got ${numerator}, so the ` +
          `denominator is wrong`,
      );
    }
  }

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
  console.log('  comparators, same rule both caucuses:');
  for (const c of comparatorOut)
    console.log(`    ${c.name.padEnd(24)} ${c.role.padEnd(18)} voted ${c.voted}  with-caucus ${(c.withCaucus * 100).toFixed(1)}%  crossed ${c.crossedOf}`);
  // Printed WITH its denominator. "31.7%" beside a 67-item payload reads as
  // 21/67 and is 19/60; the ratio is the only form that cannot be misread.
  console.log(
    `  cross-cutting share    ${(sel.crossCuttingShare * 100).toFixed(1)}% ` +
      `(${Math.round(sel.crossCuttingShare * ruleSelectedCount)}/${ruleSelectedCount} ` +
      `rule-selected, before ${out.items.length - ruleSelectedCount} headline additions)`,
  );
  console.log(`  journal-sourced        ${out.provenance.selectedJournalSourced}/${out.items.length} selected`);
  console.log(`  items with a caption   ${out.items.filter((i) => i.caption).length}`);
  console.log(`  candidate statements   ${out.items.filter((i) => (i as { statements?: unknown[] }).statements).length}`);
  for (const c of out.candidates) {
    console.log(`    ${c.name.padEnd(16)} voted on ${c.voted}/${out.items.length} selected`);
  }
  console.log(`  -> ${outPath}  (${(bytes / 1024).toFixed(0)} KB)\n`);
}

if (process.argv[1] && /^export_quiz_data\.(ts|js|mjs|cjs)$/.test(basename(process.argv[1]))) main();
