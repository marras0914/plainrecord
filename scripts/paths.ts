/**
 * PlainRecord — where data lives
 *
 * Two directories, and the distinction is load-bearing:
 *
 *   data/         WORKING data. Build inputs and audit artifacts — the 35 MB
 *                 ingested session, the 16 MB reconciliation log, rosters.
 *                 Gitignored, never deployed.
 *   public/data/  SHIPPED data. Vite copies public/ verbatim to the deploy, so
 *                 anything parked there goes out to the world, which is how a
 *                 52 MB dist happened before this split existed. Every file in
 *                 it, and the one script that writes it:
 *
 *                   quiz_89R.json            scripts/export_quiz_data.ts
 *                   quiz_89R.es.json         authored; edited by add_plain.mjs
 *                                            and the other sidecar scripts
 *                   votes_89R.json           scripts/export_bulk_votes.mjs
 *                   members_89R.json         scripts/build_members.mjs
 *                   zips_89R.json            scripts/build_zips.mjs
 *                   boundaries_tx.topo.json  scripts/build_boundaries.mjs
 *                   election_tx.json         scripts/build_election_dates.mjs
 *                   econ_blind.json          scripts/export_econ.ts
 *                   econ_terms.json          scripts/export_econ.ts
 *
 *                 This comment said "only quiz_89R.json" until 12 Nov 2026,
 *                 long after it stopped being true. A new file here means a
 *                 new line above.
 */

export const WORK_DIR = 'data';
export const SHIP_DIR = 'public/data';
