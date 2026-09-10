/**
 * PlainRecord — the guards that keep correspondence out of the repository
 *
 *   npx tsx scripts/guards.smoke.ts
 *
 * On 10 September 2026 an Open States maintainer's private reply was left in the
 * repo root, taken by `git add -A`, and pushed to the public mirror with his
 * work email address in it. Removing it required deleting and recreating that
 * repository, because a force-push does not remove a blob from GitHub.
 *
 * The gitignore had patterns for outreach filenames at the time. They did not
 * match: the file was called `Jesse-responded.md` and nobody had guessed that
 * name in advance. So the guard became a folder, which needs no guessing, plus
 * a hook, because a gitignore does nothing about an already-tracked file or
 * `git add -f`.
 *
 * THIS SUITE EXISTS BECAUSE BOTH GUARDS ARE EASY TO LOSE QUIETLY. A gitignore
 * line can be reordered into uselessness, and `core.hooksPath` is per clone, so
 * a fresh checkout has no hook at all until somebody sets it. Neither failure
 * announces itself; both are only discovered by leaking something.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** Ask git itself whether a path is ignored, rather than reading the patterns. */
function ignored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The folder
// ---------------------------------------------------------------------------

check('private/ exists as a place to drop things', existsSync('private'));
check('private/README.md explains the rule', existsSync('private/README.md'));

// Asked of git, with names nobody has anticipated, which is the whole point.
for (const name of [
  'private/whatever.md',
  'private/Someone-responded.md',
  'private/notes.txt',
  'private/deeper/nested/thing.md',
  'private/screenshot.png',
]) {
  check(`git ignores ${name}`, ignored(name));
}

// The README is the one thing in there that SHOULD be committable. Without this
// the negation could silently stop working and nobody would notice, because a
// folder that ignores everything looks exactly like a folder that works.
check('but private/README.md is NOT ignored, so the rule travels with the repo',
  !ignored('private/README.md'));

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

check('.githooks/pre-commit exists', existsSync('.githooks/pre-commit'));

let hooksPath = '';
try {
  hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim();
} catch { /* unset */ }
check('this clone is configured to use it',
  hooksPath === '.githooks',
  hooksPath || 'unset — run: git config core.hooksPath .githooks');

const hook = existsSync('.githooks/pre-commit')
  ? readFileSync('.githooks/pre-commit', 'utf8')
  : '';
check('the hook blocks paths under private/', /private\/\*\)/.test(hook));
check('the hook blocks correspondence-shaped names', /responded/.test(hook));
check('the hook offers a deliberate override rather than being unbypassable',
  /ALLOW_PRIVATE/.test(hook));

// ---------------------------------------------------------------------------
// Nothing of the sort is tracked right now. This is the check that would have
// caught the original mistake, and it asks git rather than trusting a pattern.
// ---------------------------------------------------------------------------

let tracked: string[] = [];
try {
  tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch { /* not a repo */ }

check('the repo has tracked files to check at all', tracked.length > 50, `${tracked.length} files`);

const suspicious = tracked.filter((f) =>
  /responded|-reply|reply-|correspond|outreach|playbook|pitch|followup|follow-up/i.test(f));
check('no correspondence or outreach file is tracked',
  suspicious.length === 0, suspicious.join(', ') || `${tracked.length} paths scanned`);

const inPrivate = tracked.filter((f) => f.startsWith('private/') && f !== 'private/README.md');
check('nothing but the README is tracked under private/',
  inPrivate.length === 0, inPrivate.join(', ') || 'clean');

// And no email address that is not the project's own published one.
const OWN = 'arras.marco@gmail.com';
const leaked: string[] = [];
for (const f of tracked) {
  if (!/\.(ts|mjs|js|json|md|html|css|txt|yml)$/.test(f)) continue;
  let text = '';
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const addr = m[0];
    if (addr === OWN) continue;
    if (/noreply|example\.(com|org)|@types|@vercel|@upstash|@babel|@rollup|@esbuild|w3\.org|schema\.org/i.test(addr)) continue;
    leaked.push(`${f}: ${addr}`);
  }
}
check('no third party email address is tracked anywhere',
  leaked.length === 0, leaked.slice(0, 3).join(' | ') || 'only the published contact address');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
