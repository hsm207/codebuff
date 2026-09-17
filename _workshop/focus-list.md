# agent plugins: PR review readiness (block 7, opened 2026-09-16)

PR OPEN: https://github.com/CodebuffAI/freebuff/pull/1372
(fork:fix/agent-plugin-support, opened 2026-09-17). Block 7 is done;
remaining work is reviewer response, tracked in PR comments.

Field-note wall state (cleared 2026-09-17, verdicts in the clearing
commit): two notes remain, both with a written death condition -
- 2026-09-13-01-shape-agent-plugins.md: the initiative's shape,
  phases and rulings. Dies when PR #1372 merges.
- 2026-09-17-01-upstream-main-tsc-red.md: the upstream-tsc-red
  finding every baseline run needs. Dies when upstream main is
  tsc-green.
The smoke-walkthrough results live in the shape note's ledger and
commit c26e9b893; the letters and the ADC recipe live in oss-labnotes
projects/freebuff/labnotes 2026-09-17-01 and -02.

Correction (same day, operator ruling): the first squash (dc10ea0a6)
silently carried the unmerged MCP-fix (#1259) content - 11 commits of
zod-safe-clone/union-repair/converter work mixed into a plugins PR.
Rebuilt plugins-only (6bd820be8, 49 files / +4276): every MCP-fix
module, test and hunk removed, upstream files restored to main state;
verified plugin suites green, tsc parity with upstream red counts,
agent-runtime failure set identical to pristine main. Force-pushed
onto the open PR (--force-with-lease, no reviews lost). Lesson: a
squash of a stacked branch carries the whole stack - unmix it BEFORE
the squash, or cut the branch from the right base to begin with.

Driver rebuilt 2026-09-17: local/debug-infra now points at the
feature tip (7d1bf68d9) — V2-rebuild shape, toolbox commits re-arm
from there. Old driver preserved as backup/driver-pre-plugins-rebuild.

Branch state: PR commit 6bd820be8 (plugins-only) on
fork:fix/agent-plugin-support; local twin tmp-plugins-only.
feat/agent-plugins keeps the full local history (still stacked on the
MCP-fix - that is correct for the driver) + backup/
pre-rebase-2026-09-17.

## Must pass before the PR opens

- [x] rebased onto origin/main (dea6619dd, 80 snapshot-sync commits):
      118 commits replayed, zero conflicts, both sides of the one
      overlapping file verified; our deltas are clean (see
      field-notes/2026-09-17-01 for the upstream-tsc-red finding)
- [x] no file that travels upstream contains internal tracker
      references (task numbers, ruling dates, workshop paths) - file
      sweep + commit-message sweep done; two docstring leaks fixed;
      toolbox + chore(local) commits removed via squash (see
      field-notes/2026-09-17-02)
- [x] the local formatter hook stripped and the debug-toolbox + its
      six call-sites removed; final tree verified identical to the
      feature tree minus exactly those strips; 213 tests green on the
      PR tree
- [x] the PR description compiled from the shape note (draft:
      field-notes/2026-09-17-03, rewritten in the author voice per
      conventions/voice.md after operator review round 1; commit
      message amended same round; round 2 fixed invented headers to
      mirror PR #1259; round 3 cut the closing note and linked every
      spec citation to its anchor) - final read pending; then the
      tmp-plugin-pr branch is pushed as the PR
- [x] full suite green at the verified baselines: scoped suites
      (common/plugins 62, cli 264 with 5 pre-existing upstream
      failures proven on pristine main, agent-runtime/mcp/llm-providers
      203) pass; `tsc` error counts identical to origin/main in all
      5 packages (upstream main is tsc-red from the ai 7.0.105 bump;
      see field-notes/2026-09-17-01)

## Known refactorings

(none open — the P5 watch item lives in the phase-6 record, not here)
