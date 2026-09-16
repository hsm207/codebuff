# agent plugins: PR review readiness (block 7, opened 2026-09-16)

Cleared 2026-09-16 at the block 6→7 boundary — the first clearing pass
this file has had. Blocks 1–6 (manifest parsing, skills, MCP, install,
session wiring + smoke, review hardening) are complete; their item
verdicts live in the clearing commit's message and `git log -p` of this
file. The initiative's phases and rulings live in
`field-notes/2026-09-13-01-shape-agent-plugins.md`.

## Must pass before the PR opens

- [ ] no file that travels upstream contains internal tracker
      references (task numbers, ruling dates, workshop paths)
- [ ] the local formatter hook (`scripts/hooks/pre-commit` +
      `core.hooksPath`) is stripped, its removal its own commit
- [ ] the PR description is compiled from the shape note and covers:
      the public-checkout limitation, the scope statement, the
      §-deltas, and the two upstream discussion points (backlog #5, #6)
- [ ] full monorepo suite green: 84 tests, `tsc` at the 10/1 baselines

## Known refactorings

(none open — the P5 watch item lives in the phase-6 record, not here)
