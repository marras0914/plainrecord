# private/

**Nothing in this folder is ever committed.** Drop anything here that must not
reach a repository: correspondence, replies from real people, outreach drafts,
strategy notes, screenshots with someone's name in them, half-finished specs.

## Why it exists

On 10 September 2026 a reply from an Open States maintainer was left in the repo
root, swept up by `git add -A`, and pushed to the public mirror with the sender's
work email address in it. It took deleting and recreating that repository to get
it out, because a force-push does not remove a blob from GitHub.

The gitignore had patterns for outreach filenames at the time. They did not
match, because the file was called `Jesse-responded.md` and nobody had thought of
that name in advance. A folder does not need anyone to guess a filename.

## The two guards

`.gitignore` ignores `private/` entirely, except this README.

`.githooks/pre-commit` refuses any commit that stages a path under `private/`,
and refuses a few obvious correspondence patterns anywhere in the tree. It is
active only if the repo is configured to use it:

    git config core.hooksPath .githooks

That is a per-clone setting, so a fresh clone needs it again. `npm test` checks
both guards and says so if either is missing.

## What is NOT here

The outreach archive, which predates this folder, lives outside the repo
entirely at `side-piece/rightnleft-outreach/`. That is the older convention and
it still holds: the playbook, the reporter drafts, the Reddit copy, the status
snapshots and the sent-mail records are all there. This folder is the safe
landing spot for anything dropped into the repo directory by habit.
