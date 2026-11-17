/**
 * PlainRecord: the one place the build learns which legislative session it is
 * for. Reads session.json at the repo root. Every build script that names a
 * session file (quiz_89R.json, members_89R.json, votes_89R.json, zips_89R.json,
 * and the data/ inputs behind them) builds the name from SESSION, so pointing
 * the build at another session is one edit, not a search through 40 scripts.
 *
 * Comments and prose that are ABOUT the 89th (its history, its counts) keep
 * saying 89R: they would be wrong for any other session.
 */

import { readFileSync } from 'node:fs';

const file = JSON.parse(readFileSync(new URL('../session.json', import.meta.url), 'utf8'));
if (!/^\d{2,3}(R|-\d)$/.test(file.session ?? '')) {
  throw new Error(`session.json: "${file.session}" is not a session id like 89R or 89-1`);
}

/** The session id, e.g. "89R" (regular) or "89-1" (first called session). */
export const SESSION = file.session;
