# debug-toolbox

Local troubleshooting rig for this fork. Lives on `local/debug-infra` only —
**never merge this directory (or its call-site markers) into anything that goes
upstream.**

If you are reading this, the working tree you are in is almost certainly
`local/debug-infra`. Verify: `git branch --show-current`. The branch topology:

```
upstream/main (CodebuffAI/freebuff)
  └── fix/mcp-schema-and-media   <- 5 clean fix commits; THE upstream PR branch
        └── local/debug-infra    <- fix commits + THIS toolbox (daily driver)
```

Companion docs (outside this repo): the private `hsm207/oss-labnotes` repo,
folder `codebuff/` — see `divergence.md` (ledger of everything we carry beyond
upstream) and the dated post-mortems. That repo also documents the `fb.cmd`
shim and the build-from-source recipe.

## Why this exists

The MCP integration debugging session of 2026-09-03 (four session-killer bugs
fixed) was only diagnosable because of ad-hoc instrumentation. This toolbox is
that instrumentation, rebuilt cleanly, so the NEXT unfucking session starts
from a rig instead of archaeology. Lessons it encodes:

- Every trace log must self-identify what produced it (branch + state) —
  stale, un-attributable logs burned hours this session. `toolboxSessionStart()`
  writes a `SESSION_START` line with `git describe` for this reason.
- Silent fallbacks turn bugs into mysteries. The production `logger.warn` in
  `ensureJsonSchemaCompatible` (fix branch, commit 5) is the upstream-facing
  version of this lesson; the toolbox tracer is the local one.
- Deleting the trace log between runs is mandatory hygiene — grep'ing stale
  lines from a previous session produced two wrong conclusions. Do it:
  `rm ~/freebuff-trace.log` (or let `SESSION_START` lines tell you where the
  old session ended).

## Components

| File | What it is |
|---|---|
| `tracer.ts` | JSONL appender to `~/freebuff-trace.log`. Never throws, never touches the TUI, never ships telemetry. `FREEBUFF_TOOLBOX=0` silences. |
| `probes.ts` | Pure shape probes: `zodShapeProbe` (is this a live zod schema?), `toolResultProbe` (MCP content block), `messagePartsProbe` (prompt-build gauntlet). |
| `check.ts` | Drift detector: verifies all armed call sites still exist. `bun run common/src/debug-toolbox/check.ts` |
| `patches/` | One patch per armed site — the surgical cards. `git apply --3way patches/*.patch` re-arms after upstream drift. |
| `mcp-drive.mjs` | Raw MCP-over-stdio triage driver. The "is it the server or our client?" fork-in-the-road tool. |

## Armed call sites

| Marker | File | Why |
|---|---|---|
| `[toolbox:mcp.ingest.toolResult]` | `common/src/mcp/client.ts` | tool-result ingestion — bugs #3/#4 lived here |
| `[toolbox:schema.mcp.store]` | `packages/agent-runtime/src/mcp.ts` | schema entering persisted state — bug #2 |
| `[toolbox:schema.toolset.final]` | `packages/agent-runtime/src/tools/prompts.ts` | final schema reaching the model — bug #1 surfaced here |
| `[toolbox:state.toolDefinitions]` | `packages/agent-runtime/src/run-agent-step.ts` | toolDefinitions entering agent state — bug #2, second boundary |
| `[toolbox:cli.exceptionNet]` | `cli/src/index.tsx` | global crash net for errors the structured logger never sees |
| `[toolbox:cli.warningNet]` | `cli/src/entry.ts` | routes AI SDK + process warnings into the tracer - raw stderr writes were tearing the TUI frame (ai@7 v2-compatibility warning on every streamText) |

Verify all of them: `bun run common/src/debug-toolbox/check.ts` → expect 6/6.

## Arming a new call site

1. Import: `import { toolboxTrace } from '@codebuff/common/debug-toolbox/tracer'`
   (plus probes from `.../debug-toolbox/probes` as needed).
2. One line, with a marker comment:
   ```ts
   //[toolbox:your.label]
   toolboxTrace('your.label', { ...small data... })
   ```
   Keep it a ONE-LINER surrounded by production code — that is what makes
   future stripping trivial and merge conflicts tiny.
3. Add the marker + rationale to `ARMED_SITES` in `check.ts`.
4. Generate the patch card: `git diff -U3 -- <file> > common/src/debug-toolbox/patches/NNNN-your-label.patch`
   (hand-edit the diff to contain ONLY the toolbox lines).
5. Update this README's table.

## Re-arming after a rebase/merge

```bash
bun run common/src/debug-toolbox/check.ts        # what drifted?
git apply --3way common/src/debug-toolbox/patches/*.patch   # re-arm
bun run common/src/debug-toolbox/check.ts        # expect 5/5 (or N/N)
```

Conflicts from `--3way` are GOOD — they surface drift explicitly instead of
letting sites rot silently.

## Triage flow for a future unfucking session

1. `rm ~/freebuff-trace.log`, restart the app, reproduce once. Check the
   `SESSION_START` line — right branch? right describe?
2. `bun run common/src/debug-toolbox/check.ts` — did a rebase eat a call site?
3. If the problem involves an MCP server: `mcp-drive.mjs probe` (see its
   header comment) to split server-vs-client.
4. Grep the trace for the labels around the suspect boundary. The armed sites
   cover: schema handoff (server → state → toolset → model) and tool results
   (server → ingestion → message history).
5. When done: fold anything universally useful into the fix branch as proper
   `logger.debug` (upstream-worthy), keep the rest local.

## What NOT to do

- Do not merge this directory into `fix/mcp-schema-and-media` or `main`.
- Do not log secrets, full message histories, or user code into the tracer —
  log shapes, sizes, previews (probes already do this).
- Do not let toolbox code throw into production paths (everything here swallows).
- Do not trust a trace log you did not start: check for a fresh `SESSION_START`.
