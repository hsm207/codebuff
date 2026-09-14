# plugins loader

Model (locked 2026-09-14 with the human; DDD crunch grounded in Evans Ch 1/5/6):
- `Plugin` — value object: manifest + valid skill components + valid MCP server components. Contains only valid things; everything rejected survives only as a `Report`.
- `InstalledPlugin` — entity: identity = manifest `name` (spec §9.1 keys data dirs by name); carries `plugin`, `root`, `dataDir` (= `<dataRoot>/<name>`; client-managed = freebuff-managed).
- Tiny aggregate: the manifest alone gates existence (§5.3 fatal); every other failure is skip-and-report, never fatal to siblings.
- `loadManifest` (Factory, atomic), `loadPlugin` (Service), `Report` (value object — "MUST/SHOULD report" is mandatory domain behavior).
- `extensions` carried shape-only, never interpreted (§8.1); NOT a component — §7 defines exactly two component types.
- Modules: `common/src/plugins/{manifest,skills,mcp-config,expand,loader}.ts`.
Spec source: github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md (v1.0.0 published; 1.1.0 draft). Local cache verified byte-identical 2026-09-14.

## Phase 1: manifest (Factory — common/src/plugins/manifest.ts)

- ✅ Test 1: loadManifest(root) on the §5.2 minimal manifest ($schema canonical 1.0.0 id, name "minimal-plugin") → ok, manifest.name === "minimal-plugin", no reports
- ✅ Test 2: §5.5 name constraints — invalid list (My-Plugin, -start, has--double, too.many..dots, empty, 65 chars) each → not ok + report naming `name`; valid list (my-plugin, acme.tools, lint3r, a) plus the 64-char inclusive edge → ok
- Test 3: §5.3 required fields — missing or wrong-typed $schema/name → not ok; no manifest object produced (Factory refuses)
- Test 4: §5.2 unknown top-level field → ok + report naming it; field NOT carried on the parsed manifest
- Test 5: §8.1 extensions — absent → undefined; object → carried verbatim, never interpreted; non-object → ok + report, left undefined
- Test 6: §5.2 $schema selection — unrecognized version canonical URL → not ok + unsupported-version report; non-canonical http:// variant → not ok; no network fetch attempted
- Test 7: §5.4 over-rejection guard — version "banana", homepage "not a url", license "nope" → ok, carried verbatim (spec: MUST NOT reject solely on these)
- Test 8: §5.4 author fatality — unknown key, non-string value, whole-field non-object → not ok; {} → ok
- Test 9: §5.2 manifest bytes — invalid JSON → not ok; top-level array/string/number → not ok
- Test 10: §4.1.1 containment — plugin.json symlink/junction resolving outside the root → not ok (Windows fixture: junctions, no privilege needed)
- Test 11: §5.1 absence — no plugin.json in root → not ok + "no manifest" report

## Phase 2: skills (sketch — re-derive from the model before starting)

- Test 12: discovers skills/*/SKILL.md exactly one level deep via the existing skill parser
- Test 13: missing skills/ → zero skills, no error (§6.2)
- Test 14: skills/ present but not a directory → skill component type invalid, other component types still load
- Test 15: one malformed SKILL.md → skipped + report, sibling skills load
- Test 16: SKILL.md resolving outside the root → skipped (§4.1.3)

## Phase 3: MCP config (sketch — re-derive from the model before starting)

- Test 17: closed mcp.json top level { $schema, mcpServers }; each server matches exactly one variant; empty mcpServers valid
- Test 18: missing mcp.json → no error; present but not a regular file → MCP disabled, skills still load
- Test 19: invalid JSON / unrecognized $schema / version mismatch vs manifest → MCP disabled for the plugin + report
- Test 20: one invalid server entry → skipped + report, sibling servers load
- Test 21: streamable-http → native http, sse → native sse (adapter module; common/src/mcp/client.ts untouched)
- Test 22: stdio command = bare token or ./path only; ../bin/server rejected; no expansion in command
- Test 23: cwd forms — omitted → plugin root; ./x, ${PLUGIN_ROOT}/x, ${PLUGIN_DATA}/x valid; any other form or post-resolution escape → entry invalid
- Test 24: remote rules — absolute http(s) URL, no userinfo/fragment, HTTPS off-loopback; duplicate-case header names invalid
- Test 25: env entry named PLUGIN_ROOT/PLUGIN_DATA → server entry invalid (§9.2)
- Test 26: decoy .mcp.json ignored — only mcp.json loads (learned from google-cloud-developer's actual layout)

## Phase 4: env & expansion (sketch — re-derive from the model before starting)

- Test 27: ${PLUGIN_ROOT}/${PLUGIN_DATA} expanded in args, env values, cwd only; single non-recursive pass; unknown ${X} stays literal; env keys and command untouched
- Test 28: subprocess env = base + configured overlay, then PLUGIN_ROOT/PLUGIN_DATA set last; dataDir created before launch, contents persist across update

## Phase 5: session surface & install (sketch — re-derive from the model before starting)

- Test 29: plugin skills registered in the session skill registry as a third root
- Test 30: plugin MCP servers connect in a live session
- Test 31: plugin install <git-url> fetches into the plugins root; installed plugin loads end-to-end (InstalledPlugin realized)
- Test 32: install failure → clear report, nothing registered

## Missing operations (null versions)

- loadManifest(root) does not exist — Test 1 must fail loudly
- loadPlugin(root) Service does not exist — the Phase 1→2 seam must fail loudly
- spec→native MCP server mapping does not exist — Phase 3 must fail loudly
- placeholder expansion does not exist — Phase 4 must fail loudly
- plugin install <url> CLI command does not exist — Phase 5 must fail loudly
- plugins root + dataRoot are undefined — no InstalledPlugin can be discovered anywhere yet

## Tracking (agreed 2026-09-14)

- this file is the phase tracker: per-test ✅ markers applied as tests graduate, pruned at phase close
- working files (this file + backlog.md) ride **committed on the feature branch** — versioned with the work, restored to the driver branch before any PR
- the leak rule (check.ts) therefore fires on *pushed* PR-bound branches, not on local branches mid-work
- delete this section at promotion time along with the files themselves (strip = `git rebase --onto origin/main` + restore on driver)
- docstrings tiered by visibility: public-facing declarations get one, full stop (duty, not taste — full contract: purpose, failure modes, invariants, spec citations); private helpers optional by default, earning one only for whys the code cannot express (esoteric/paper algorithm → explain + link source; convoluted bug workaround → explain + link issue) — otherwise comment blocks bury the code and break the file-size/density criteria. Content governed everywhere: ubiquitous language, no textbook dialect ("first-class", "composed assertion"), no restating the name — enrich with the contract instead. Inline comments stay the grimace category (extraction signal) — handbook Clean Code Ch 5. Production-only tiering: test fixtures stay docstring-mandatory (test-review Stage 2 Item 1). Audience = fellow programmers & the curious domain expert
- audit each phase against the clean-code and test-review checklists plus the lessons index at phase close (standard set 2026-09-14, T1 audit)

- skill-registry takes the plugin root as a third source; the two native roots untouched
- one adapter module maps spec server variants → native mcpConfig shapes
- loader returns { installed: InstalledPlugin, reports } and the CLI renders reports; no logging from common/
