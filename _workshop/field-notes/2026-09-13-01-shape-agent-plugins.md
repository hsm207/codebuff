# Shape: agent plugin support (backlog #1, upstream issue #1349)

Born 2026-09-13 in the shaping session. Dies when the PR merges and its
review follow-ups settle. This file is the source the PR description is
compiled from.

## End state

    fb plugin install https://github.com/google/skills/plugins/cloud/google-cloud-developer

installs the bundle under `~/.agents/plugins/<name>/` — aborting on any
name conflict with the user's roots — and after a restart the plugin's
skills answer and its MCP servers connect (spec `streamable-http`
mapped to freebuff's `http` transport).

## Phases

1. manifest parsing per §5
2. skills component (reuse the SDK reader)
3. MCP component (thin adapter over `common/src/types/mcp.ts`)
4. env & expansion — **deferred to the next PR** (2026-09-14 scope cut)
5. install pipeline + session wiring + live smoke
6. review hardening (audits, refactors, pruning)

## No Gos

- in-session reload of installed plugins (restart is the refresh)
- deep re-validation of skill files the SDK reader already reads
- anything past bare-bones: multi-skill + multi-MCP-server plugins;
  shadow/merge logic untouched; feature freeze (2026-09-16 ruling)

## Rabbit holes

- §5.2 never defines "object" — assumed plain JSON-serializable object;
  the assumption is recorded in the code where it is enforced
- spec text is authoritative over the machine-readable schema, so no
  zod — the policy code's docstring records the trade
- upstream MCP support falls short of §7.2 in places (cwd, env
  provisioning, `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` expansion) and has
  no credential path for remote servers wanting ADC-style user auth —
  noted inline at the seams; maintainers decide whether to close the gaps

## Processing ledger (append-only)

- (09-14) phase 1 done → 6748b0fd9..5f3e33632
- (09-14) phase 2 done — scope ruling: assume loader compliance
- (09-14) phase 3 done → 58020e782
- (09-15) phases 4–5 done → 905798528, 37160f37e; live smoke verified
  install + restart + skill answer via `fb` (report was external)
- (09-16) phase 6 done → bare-bones freeze; multi-MCP pinned
  (e182a66b4); SRP arc b4a149106; pruning pass 793abd606
- (09-16) block 7 opened (PR readiness) — this file compiles into the
  PR description when block 7 clears
- (09-16) round-2 live smoke PASS (run blind by a fresh agent) — all
  five steps hold; predicted limitations reproduced (MCP auth floor,
  no in-session reload)
