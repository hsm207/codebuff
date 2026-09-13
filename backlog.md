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
