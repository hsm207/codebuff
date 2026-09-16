# backlog.md

## 1. Support the Agent Plugins spec (plugin.json / mcp.json / skills)

Captured: 2026-09-13
Why: google/skills bundles "Skills + MCP servers" for agent harnesses and rival CLIs install it in one command; freebuff can consume neither half as a unit. Filed upstream as #1349.
Success criteria: a spec-conformant plugin loads through a CLI surface - its skills appear in the registry and its mcp.json servers connect.

## 2. Kill the shim: migrate provider models to spec v3

Captured: 2026-09-13
Why: the compatibility warning is routed away by the toolbox, not eliminated; the version drift it masks is documented in the divergence ledger (provider 2->4, provider-utils 3->5).
Success criteria: provider models serialize per spec v3 natively and the routed warning no longer fires.

## 3. allOf schemas collapse to passthrough in convertJsonSchemaToZod

Captured: 2026-09-13
Why: buildToolDescription's allOf test fails; servers relying on allOf keywords get wrong tool descriptions.
Success criteria: the allOf buildToolDescription test passes without special-casing.

## 4. Restore or remove agents-graveyard/researcher

Captured: 2026-09-13
Why: the missing module breaks 2 typechecks and 2 test-file loads, poisoning every baseline run.
Success criteria: typecheck baseline contains no agents-graveyard errors.

## 5. Plugin-vs-plugin name reuse policy (upstream discussion)

Captured: 2026-09-16, from the bare-bones freeze ruling
Why: install checks conflicts only against the user's roots — plugin B claiming a name plugin A already installed does not abort. Options: extend the conflict sets (a small command-layer change) or document plugin-last-wins. Decide with upstream during PR review.
Success criteria: the policy is either implemented or documented upstream.

## 6. Formalize shadow precedence across roots (upstream discussion)

Captured: 2026-09-15
Why: plugins join after the user's and project's own skills and MCP servers by design, but the precedence question deserves an explicit upstream ruling, not a docstring note.
Success criteria: precedence is stated in upstream docs or changed in code.

## 7. `fb plugin update`

Captured: 2026-09-14, from the DDD crunch (the InstalledPlugin entity was shaped to make this possible)
Why: install covers initial placement; update needs re-fetch, diff and a conflict re-check. The InstalledPlugin entity exists so this can land without reshaping the domain.
Success criteria: `fb plugin update <name>` refreshes an installed plugin in place, aborting on new conflicts.

## 8. Automated CLI end-to-end test through a real binary

Captured: 2026-09-15, deferred from the install block
Why: upstream's e2e scaffolding is unusable from a public checkout, so the payoff test is a manual smoke (done live, 2026-09-15). Success: a fresh-process CLI test runs in CI, or upstream enables the scaffolding.
Success criteria: CI or a documented local command runs the real binary end to end.

## 9. Plugin skills ledger - report silently-dropped skills

Captured: 2026-09-16, graduated from the session list (was Test 14/15, deferred 2026-09-14)
Why: the SDK reader is silent on three spec-distinct outcomes (§6.2 present-but-wrong-kind, §7.1 report-the-invalid-skill), so `skills 5 registered` can print while a sixth was dropped. Needs a report-only enumeration of `skills/` diffed against the reader's output - a ledger, not a validator.
Success criteria: a plugin with one unreadable skill loads with a report naming it; the render never overcounts.

## 10. Plugin env & expansion (spec §9.1/§9.2)

Captured: 2026-09-16, graduated from the session list (was Test 27/28, deferred 2026-09-14)
Why: install provisions `<dataRoot>/<name>` but nothing reads it yet - `PLUGIN_ROOT`/`PLUGIN_DATA` subprocess env provisioning and `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` expansion in args/env/cwd are unimplemented (upstream capability gaps noted inline in the MCP adapter).
Success criteria: an installed plugin's server command receives the provisioned env and expanded placeholders.
