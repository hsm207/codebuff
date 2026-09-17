# agent plugins: PR review readiness (block 7, opened 2026-09-16)

PR OPEN: https://github.com/CodebuffAI/freebuff/pull/1372
(fork:fix/agent-plugin-support, opened 2026-09-17). Block 7 is done;
remaining work is reviewer response, tracked in PR comments.

Driver rebuilt 2026-09-17: local/debug-infra now points at the
feature tip (7d1bf68d9) — V2-rebuild shape, toolbox commits re-arm
from there. Old driver preserved as backup/driver-pre-plugins-rebuild.

Branch state: PR commit dc10ea0a6 on tmp-plugin-pr (one commit atop
origin/main dea6619dd, workshop/toolbox/hook stripped, suites green).
feat/agent-plugins keeps the full local history + backup/
pre-rebase-2026-09-17. _workshop/ restored locally, untracked.

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
