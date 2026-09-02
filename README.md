# PlainRecord — rightnleft.com

A blind quiz on **real Texas House roll calls**. You answer bills without being
told which party took which side; only afterwards does the page show where you
landed, which legislators you actually agree with, and where Texas ranks on the
outcomes tied to those categories.

Every question is a vote that happened. Every number on the screen traces to a
roll call, a veto, or a cited statistic. Nothing is generated to fill a gap.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 176 checks across 6 suites
npm run build        # -> dist/  (~154 KB)
npm run preview      # serve the build on :4173
```

`npm run build` runs `tsc --noEmit` first, so a type error fails the build rather
than shipping.

## What ships, and what doesn't

The site is fully static — no server, no API, no database at runtime.

```
public/data/quiz_89R.json        53 KB   the entire quiz payload. SHIPPED.
data/tx_evidence_vetoes.json    117 KB   279 Abbott vetoes, 84R-89R, each with
                                         its LRL source URL. COMMITTED but not
                                         shipped — npm test needs it.
data/tx_bills_89R.json           35 MB   \
data/tx_reconcile_89R.json       16 MB    > bulk build inputs. GITIGNORED.
data/tx_roster_89R.json, ...            /
```

`scripts/paths.ts` is the single source of truth for that split (`WORK_DIR` vs
`SHIP_DIR`). It exists because Vite copies `public/` verbatim: with the working
files in there, `dist/` was 52 MB of data nobody downloads. Anything a script
writes as an intermediate goes in `WORK_DIR`. Only `export_quiz_data.ts` writes
to `SHIP_DIR`.

The payload is served CORS-open at `/data/quiz_89R.json` on purpose. A civic tool
that asks you to trust its numbers should let you take them.

## Deploying

Two configs are here; **use one, not both**.

### Vercel

```bash
npx vercel            # first run links the project
npx vercel --prod
```

`vercel.json` sets the build command, `dist` as output, long-lived immutable
caching on the fingerprinted `/assets/*`, and a CSP.

### Netlify

```bash
npx netlify deploy --prod
```

`netlify.toml` is the equivalent, pinned to Node 22.

### The CSP is tight on purpose

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';
form-action 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'
```

Google Fonts is the only third party the page touches. `script-src 'self'` with
no `unsafe-inline` means an analytics snippet or embed pasted in later will fail
loudly in the console instead of quietly shipping a tracker on a page about
public records. If you *want* one, widen the policy deliberately.

The build is verified against these exact headers, not just against `vite
preview` — see [Verifying a build](#verifying-a-build).

### One-file share build

```bash
npm run build:artifact     # -> share/artifact.html  (~91 KB, no external assets)
```

Flattens `dist/` into a single self-contained page **outside `dist/`**: the stylesheet becomes a
`<style>`, the module bundle an inline `<script>`. It is a *transform of the real
build*, never a separate copy — hand-maintaining a second inline version is how a
copy rewrite once landed in the shared page and not in the site. Two rewrites are
deliberate and logged by the script: the payload link becomes absolute (the
single file has no `/data/` next to it) and the `— PlainRecord` title suffix is
dropped so republishing never renames the artifact.

The shareable copy lives at
<https://claude.ai/code/artifact/8d8b86ed-6170-4dd3-9da8-7d9ebb8126a9> (private
until shared from that page). Republish to **that URL** rather than creating a
new one, or the link you have already handed out goes stale.

## Pointing rightnleft.com at it

The domain is **registered at Squarespace**. You are moving DNS only; the
registration stays put.

### Vercel

1. Vercel → project → **Settings → Domains → Add** → `rightnleft.com`.
   Add `www.rightnleft.com` too and let Vercel redirect one to the other.
2. Vercel shows the target records. Squarespace → **Domains →
   rightnleft.com → DNS → DNS Settings**.
3. Delete the Squarespace parking/default records for `@` and `www`
   (Squarespace points these at its own site by default — leaving them means
   intermittent resolution to the wrong host), then add:

   | Host  | Type | Value          |
   |-------|------|----------------|
   | `@`   | A    | `76.76.21.21`  |
   | `www` | A    | `76.76.21.21`  |

   Both are A records. Vercel used to hand out `CNAME www -> cname.vercel-dns.com`
   and much of the internet still says so; what it actually printed for this
   project was an A record for `www` as well. Take the values from
   `vercel domains inspect rightnleft.com`, not from memory or from a blog post.

   **Do not** take the "change your nameservers to `ns1/ns2.vercel-dns.com`"
   option unless you have checked the domain's MX records first. That moves *all*
   DNS off Squarespace, email included, and any mail on the domain stops.
   The two A records leave everything else where it is.
4. Back in Vercel, wait for **Valid Configuration**. TLS is issued automatically
   once DNS resolves.

### Netlify

Same shape: `@` → A `75.2.60.5`, `www` → CNAME `<site>.netlify.app`. Or move the
nameservers to Netlify DNS and skip the records entirely.

### Checking it took

```bash
npm run dns:check                                  # rightnleft.com
node scripts/check_domain.mjs --domain other.com   # anything else
```

Do not judge this by a status code. While the domain still points at Squarespace's
parking page, `curl -o /dev/null -w '%{http_code}' https://rightnleft.com` returns
**200** — valid TLS, no errors, and completely wrong, because it is someone else's
"Coming Soon" page. `dns:check` reports *who* is answering: the resolved A records,
the `Server` header, the `x-vercel-id`, our own CSP, and the page title compared
against the known-good origin.

Propagation is usually minutes, but Squarespace's TTL can hold the old answer for
up to 48 hours. A stale parked page is cached DNS, not a failed deploy — confirm
with `dns:check` before changing anything.

## Verifying a build

`npm test` covers the data pipeline, scoring, valence, selection, and evidence
rules. It does **not** cover the rendered page, so there is a second pass:

```bash
npm run build
npm run preview                              # in another shell
node scripts/verify_site.mjs                 # against vite preview
node scripts/verify_site.mjs --with-headers  # against dist + the real vercel.json headers
```

The second form matters: a CSP that blocks your own page looks fine under
`preview` and breaks only in production. It asserts, in a real browser:

- the page boots in 7-issue mode on SB 2, with the reason for the pick shown
- outcome statistics stay hidden until something is answered (showing a state
  ranking before the vote would steer the answer)
- the three demo presets each produce the profile they exist to demonstrate
- switching to full mode rescopes the provenance footer to all 67 items
- indicators link to a live source URL, and the table view exposes the
  R-Yea / D-Yea / valence columns
- **zero console errors**, which is also how a CSP violation surfaces

Preset assertions test *properties*, not captured digits — the item count moves
legitimately when a headline bill is force-added, and pinning an exact lean
turned a correct build red once already.

## Rebuilding the data

Only needed to add a session or refresh vetoes; the shipped payload is committed.

```bash
npm run data:vetoes      # LRL veto lists -> data/tx_evidence_vetoes.json
npm run data:ingest      # Open States bulk -> data/tx_bills_89R.json + roster
npm run data:reconcile   # cross-check against the House Journal
npm run data:backfill    # recover member votes the bulk export dropped
npm run data:export      # -> public/data/quiz_89R.json   (the only shipped file)
npm run data:acts        # add opponent actions to an already-built payload
npm run data:report      # coverage + provenance summary
```

`DATA_PIPELINE.md` documents each stage and the failures that shaped it — the
5.27% of 89R votes Open States loses to truncated names, the em dash in the
Journal's member lists, the surname collision that overwrote a real member's
record. Read it before touching an ingest.

## Ground rules this codebase enforces in code, not just in prose

- **Votes are never fabricated.** No position is attributed to a named person
  without a roll call, a veto, or a cited act behind it.
- **Stances are never scored.** A campaign platform is `tier: stance` and is
  displayed as text. `assertComparable()` throws on a cross-tier comparison.
- **One-sided records can't become agreement scores.** A veto list is all
  opposition; `Coverage.oneSided` refuses to turn it into a match percentage. The
  page shows Patrick's and Abbott's action on a *named bill* and never a rate over
  their lists — a priority list contains only bills its author wanted passed, so a
  percentage over it would measure the press release, not the positions.
- **Absence is not a position.** Texas governors let bills become law unsigned,
  so the lack of a veto is never read as support.
- **No causal claims.** Outcome indicators show a ranking, a recorded act, and a
  tenure length, side by side. `CAUSAL_NOTE` states plainly that the page is not
  asserting one caused the other, and `DELIBERATE_OMISSIONS` records the
  categories left blank rather than filled with a weak proxy.
- **Hand curation is logged with a reason.** `selection.ts` `Override` throws if
  constructed without one.

## Known gaps

- Only the **89th regular session** is loaded. Hinojosa's 85R record and
  everything before 86R is missing.
- Six categories have no outcome indicator yet (Public Safety, State & Local
  Government, Military & Veterans, Arts). Transportation and Religion are
  deliberately blank — see `DELIBERATE_OMISSIONS`.
- No `og:image`, so shares render as a text card.
- Importance multipliers are plumbed (`ImportanceMap`) but nothing sets them.
  See `OPEN_QUESTIONS.md` #4.
