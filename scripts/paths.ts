/**
 * PlainRecord — where data lives
 *
 * Two directories, and the distinction is load-bearing:
 *
 *   data/         WORKING data. Build inputs and audit artifacts — the 35 MB
 *                 ingested session, the 16 MB reconciliation log, rosters.
 *                 Gitignored, never deployed.
 *   public/data/  SHIPPED data. Only quiz_89R.json, the 53 KB payload the page
 *                 actually needs. Vite copies public/ verbatim to the deploy, so
 *                 anything parked there goes out to the world — which is how a
 *                 52 MB dist happened before this split existed.
 */

export const WORK_DIR = 'data';
export const SHIP_DIR = 'public/data';
