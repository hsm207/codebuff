# PR-prep sweep findings (block 7, file-content + commit-message pass)

Sweep scope: all 79 PR-bound files (branch diff vs origin/main,
_workshop/ excluded) for internal references, plus the 118 commit
messages. The pattern list: T-numbers, ruling dates, block numbers,
backlog/focus-list/shape-note/field-note names, big sis, hsm207,
oss-labnotes, debug-infra, driver branch/line, Buffy, smoke, t35.

## Traveling files — two genuine comment leaks

1. `common/src/debug-toolbox/check.ts:71` — the DRIVER_ONLY_FILES
   docstring names "oss-labnotes handbook, Appendix A/B" and narrates
   the driver-branch workflow. Fix: rewrite the docstring in plain
   terms (the check exists to stop private working files from reaching
   a public branch) without naming the private bundle or its appendices.

2. `common/src/plugins/__tests__/fixtures/mcp.ts:78` — "part of the
   bare-bones contract (human ruling 2026-09-16)" names a session
   ruling. The date/ruling add nothing upstream needs. Fix: "a plugin
   carrying several MCP servers is part of the bare-bones contract."

`prompts.ts` "You (Buffy)" is upstream's own product persona —
byte-identical to origin/main, not a leak.

## The structural finding — debug-toolbox rides the PR branch

The whole `common/src/debug-toolbox/` directory (6 files: README,
check.ts, tracer.ts, probes.ts, mcp-drive.mjs, warning-net.test.ts)
is on feat/agent-plugins, and PR-bound files reference it:
- `run-agent-step.ts`, `mcp.ts`, `prompts.ts`, `content-mapping.ts`,
  `cli/src/entry.ts`, `cli/src/index.tsx` carry `toolboxTrace(...)`
  call-sites
- README names the private oss-labnotes repo and the local/debug-infra
  branch topology — it must never travel upstream by its own words

The README's own PR-prep instruction (git mv the directory off, then
remove the call-sites) is exactly right. Ruling: EXECUTE IT NOW as the
hook-strip commit's sibling — two separate commits, both chore(local):

1. strip the formatter hook (scripts/hooks/ + core.hooksPath config
   stays local-only)
2. strip debug-toolbox + its call-sites (tracer import + toolboxTrace
   lines) from the PR-bound files

Not in scope for this PR, noted for the description's discussion
section: upstream may want the toolbox pattern (a self-check that
blocks PR-bound branches from carrying driver-only files); mention as
an idea, ship nothing of it.

## Commit messages leak too (chore/local only)

The sweep of origin/main..HEAD subjects+bodies found internal
references ONLY in the chore(local) commits: the workshop move, the
clearing pass (T-numbers, block numbers, ruling dates throughout), the
smoke archive, the pruning/hook commits. The feature commits (test:,
feat:, refactor:, docs:) came back clean - they were written for
upstream from the start.

The chore commits are exactly what the PR-prep ruling covers: before
the PR opens, the local-only commits leave the branch. Mechanically:
interactive rebase onto origin/main, dropping every chore(local)
commit - the sweep is then clean by construction, verified after.

## Residuals to re-check after the strip + rebase

- grep the final branch diff for every pattern again (both files and
  messages)
- the two docstring fixes land before the chore-drop rebase so they
  ride a feature commit
- field-notes/2026-09-17-01 (upstream-tsc-red) said "backup branch
  delete after PR merges" - keep until then
