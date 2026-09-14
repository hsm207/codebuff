# plugins loader

Model (locked 2026-09-14 with the human; DDD crunch grounded in Evans Ch 1/5/6):
- `Plugin` — value object: manifest + valid skill components + valid MCP server components. Contains only valid things; everything rejected survives only as a `Report`.
- `InstalledPlugin` — entity: identity = manifest `name` (spec §9.1 keys data dirs by name); carries `plugin`, `root`, `dataDir` (= `<dataRoot>/<name>`; client-managed = freebuff-managed).
- Tiny aggregate: the manifest alone gates existence (§5.3 fatal); every other failure is skip-and-report, never fatal to siblings.
- `loadManifest` (Factory, atomic), `loadPlugin` (Service), `Report` (value object — "MUST/SHOULD report" is mandatory domain behavior).
- `extensions` carried shape-only, never interpreted (§8.1); NOT a component — §7 defines exactly two component types.
- Modules: `common/src/plugins/{manifest,manifest-policy,skills,mcp-config,expand,loader}.ts` — manifest.ts = contract + I/O + orchestration; manifest-policy.ts = pure §5.2–§5.5 field rules.
- MCP stance (2026-09-14, human ruling): server shapes are validated by the existing `common/src/types/mcp.ts` schemas (`mcpConfigStdioSchema` / `mcpConfigRemoteSchema`), never re-declared. Where the spec asks for more than freebuff implements today we do **not** build it — we leave an inline note naming the § and the missing upstream capability, so the maintainers can see exactly where their own MCP support falls short of the spec and decide for themselves. Gaps to note at the seam: `cwd` (absent from `MCPConfig` and not passed to `StdioClientTransport`, so §7.2.1's default-to-plugin-root is unhonored), `PLUGIN_ROOT`/`PLUGIN_DATA` provisioning into the subprocess env (§9.1), and `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` expansion in args/env/cwd (§9.2 — the native `$VAR`→`process.env` substitution in `common/src/mcp/client.ts` is a different mechanism). Ours to enforce regardless, since they need no upstream capability: closed top level, variant exclusivity, `type` presence (the native schemas default it), reserved env names (§9.2), remote URL/header rules; whether a present-but-unhonorable `cwd` gets form-validated-then-ignored or is treated as an invalid entry is T23's call.
Test prose (2026-09-14, human ruling): every test reads as Given/When/Then — the docstring carries the GWT sentence, the title is trigger→outcome, the body is straight-line AAA; table-driven test.each only for large spec-enumerated sets (T2), never for dense object tables whose titles interpolate garbage.
DSL rationale (2026-09-14): the rejection contract is not the boolean complement of the success contract — "not ok-true" includes "the loader crashed", which the Factory forbids; hence paired helpers expectManifestOk / expectManifestRejected (the negative one also asserts the reason blames the field under test).
T7 merge note: fold the T4 permitted-but-unimplemented-fields row (no reports) into Test 7 when it lands — same fixture carries values verbatim + no-reports claim.
Spec source: github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md (v1.0.0 published; 1.1.0 draft). Local cache verified byte-identical 2026-09-14.

## Phase 1: manifest (Factory — common/src/plugins/manifest.ts)

- ✅ Test 1: loadManifest(root) on the §5.2 minimal manifest ($schema canonical 1.0.0 id, name "minimal-plugin") → ok, manifest.name === "minimal-plugin", no reports
- ✅ Test 2: §5.5 name constraints — invalid list (My-Plugin, -start, has--double, too.many..dots, empty, 65 chars) each → not ok + report naming `name`; valid list (my-plugin, acme.tools, lint3r, a) plus the 64-char inclusive edge → ok
- ✅ Test 3: §5.3 required fields — missing or wrong-typed $schema/name → not ok; no manifest object produced (Factory refuses)
- ✅ Test 4: §5.2 unknown top-level field → ok + report naming it; field NOT carried on the parsed manifest
- ✅ Test 5: §8.1 extensions — absent → undefined, no report; object → carried onto the manifest unchanged, no reports about its contents; non-object → ok + report, left undefined
- ✅ Test 6: §5.2 $schema selection — unrecognized version canonical URL → not ok + unsupported-version report; non-canonical http:// variant → not ok; no network fetch attempted
- ✅ Test 7: §5.4 metadata — content-invalid values (version "banana", homepage/repository "not a url", license "nope") → ok, carried verbatim, no reports (spec: MUST NOT reject solely on these); a field whose JSON type is wrong (version 42) → not ok (§5.2 fatality)
- Test 8: §5.4 author fatality + keywords type — unknown key, non-string value, whole-field non-object → not ok; {} → ok; keywords must be an array of strings, anything else (including a non-string element) → not ok
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

Adapter boundary (2026-09-14, grounded on google-cloud-developer's real `mcp.json`): the file is `{$schema: <version>/mcp.schema.json, mcpServers}`; the spec's variant name is `streamable-http` where native is `http`, and the native `type` carries a zod default while §7.2 requires the field. Mapping, `$schema`-vs-manifest-version selection, and §-cited reporting are ours; the server *shape* is upstream's.

- Test 17: closed mcp.json top level { $schema, mcpServers }; each server matches exactly one variant; empty mcpServers valid
- Test 18: missing mcp.json → no error; present but not a regular file → MCP disabled, skills still load
- Test 19: invalid JSON / unrecognized $schema / version mismatch vs manifest → MCP disabled for the plugin + report
- Test 20: one invalid server entry → skipped + report, sibling servers load
- Test 21: streamable-http → native http, sse → native sse (adapter module; common/src/mcp/client.ts untouched)
- Test 22: stdio command = bare token or ./path only; ../bin/server rejected; no expansion in command
- Test 23: cwd forms — omitted → plugin root; ./x, ${PLUGIN_ROOT}/x, ${PLUGIN_DATA}/x valid; any other form or post-resolution escape → entry invalid
- Test 24: remote rules — absolute http(s) URL, no userinfo/fragment, HTTPS off-loopback; duplicate-case header names invalid
- Test 25: env entry named PLUGIN_ROOT/PLUGIN_DATA → server entry invalid (§9.2)
- Test 26: only mcp.json loads — google-cloud-developer's `.mcp.json` is byte-identical to it (same blob sha at HEAD, so no decoy variant to distinguish) and `mcp_config.json` is another client's shape (`serverUrl`/`authProviderType`); loading that root yields exactly one server and no reports about either file

## Phase 4: env & expansion (sketch — re-derive from the model before starting)

- Test 27: ${PLUGIN_ROOT}/${PLUGIN_DATA} expanded in args, env values, cwd only; single non-recursive pass; unknown ${X} stays literal; env keys and command untouched
- Test 28: subprocess env = base + configured overlay, then PLUGIN_ROOT/PLUGIN_DATA set last; dataDir created before launch, contents persist across update

## Phase 5: session surface & install (clarified 2026-09-14 with the human)

Goal, in the human's words: `freebuff plugin install https://github.com/google/skills/plugins/cloud/google-cloud-developer` installs the skills + MCP server bundle that ships with that plugin; after a freebuff restart, a Google-Cloud question reaches the right skill and the right MCP server.

Command surface: commander (`cli/src/cli-args.ts`; the Freebuff branch declares one subcommand today — `[command]` choices `['login']`). `plugin install <url>` extends that surface as a nested commander command; `--cwd`/`--continue` untouched. In-session `/plugin` is out of scope for the merge shield unless the human wants it.

Install source (researched and decided 2026-09-14): **HTTPS tarball, no git binary, no new dependency.** `fetch('https://codeload.github.com/<o>/<r>/tar.gz/<ref>')` → `new Bun.Archive(blob)` → `extract(tmp, { glob: ['*/<subpath>/**'] })`. `Bun.Archive` is in the *pinned* runtime, not just locally: `.bun-version` is 1.3.14 and the API landed in Bun 1.3.6. Proved against the real target before writing it down — `HEAD` → 200, `application/x-gzip`, **1.45 MB**, and `archive.files('*/plugins/cloud/google-cloud-developer/**')` enumerates exactly the plugin's 18 files (7 root files, `rules/`, 5 skills of which 2 ship `references/`). codeload is not the REST API, so no 60 req/hour limit and no auth; public repos only, per the human's ruling. Path safety is built in — absolute/drive/UNC paths rejected, `..` normalized, unsafe symlink targets dropped — which matters because this is untrusted input.
How the field does it (survey 2026-09-14, for the record): Claude Code ships **both** — `git-subdir` ("clones sparsely to minimize bandwidth for monorepos") *and* `archive` ("zip archive downloaded over HTTPS. Works without git or npm on the user's machine") — while Gemini CLI clones by default and recommends GitHub Releases archives precisely to *avoid* a repository clone. The one git-shaped example is `npx skills add` (vercel-labs/skills) — google's own recommended command — which uses `simple-git`; that is a Node tool with no built-in tar, i.e. a reason, not a requirement. Rejected: `git` sparse clone (needs a git binary for something the runtime already does), GitHub contents API (60 req/hour), GitHub Releases (google/skills publishes none).
URL forms: repo root (`<url>`, trailing `.git`) and subdirectory (`…/<path>`, `…/tree/<ref>/<path>`); no ref = `HEAD`, which codeload resolves to the default branch. Configurable `<pluginsRoot>` via env so tests never touch the real `~/.agents`.
Ref/identity: the archive's top-level directory is `<repo>-<ref>`, so strip the first path segment rather than matching a literal name, and record the source URL + ref with the install (no commit sha is available this way; sha pinning would need the API, i.e. rate limits — future work).
Install order: fetch into a temp dir → `loadManifest` → **conflict check** → move to `<pluginsRoot>/<name>`; any failure → report, temp removed, nothing registered.
Conflict policy (human ruling 2026-09-14): if the plugin name is already installed, or any of its skill names or MCP server names already exist in the user's roots, **abort** — install never shadows, never merges, and cannot be half-applied. Worth knowing before the live run: `google-cloud-recipe-auth` is already in this machine's `~/.agents/skills` from the 2026-09-13 probe, so the e2e either starts from a clean roots fixture or asserts the abort — the second is a good T32 case either way.

Plugins root: `~/.agents/plugins/<name>`, the home root by default (human ruling 2026-09-14: every coding agent in the field keeps skills and MCP servers in the user's home `.agents`, and `~/.agents/plugins` is also the spec's own §9.1 example, beside the `~/.agents/skills` and `~/.agents/mcp.json` roots freebuff already reads). Installing into the project's `{project}/.agents` is a **future PR** — a scope flag, not this one. Data dir: `~/.agents/plugins/.data/<name>`, and the constant **must carry a comment** (human ruling) explaining that the dot is deliberate: §5.5 names must start alphanumeric, so `.data` can never collide with a plugin root, whereas a literal `data/` sibling could be a plugin *named* `data` — we decline to rely on "nobody will ever name their plugin `data`", however remote that chance is (§9.1 leaves the data location to the client). Discovery reads exactly `<pluginsRoot>/*/plugin.json` — one level, no recursion.

Session surface (what "restart and ask" needs):
- skills: `initializeSkillRegistry()` (`cli/src/utils/skill-registry.ts`) makes one `sdkLoadSkills({cwd, includeHomeSkills:true})` call today; plugin roots become extra `loadSkills({skillsPath: <root>/skills})` calls merged into the cache — SDK untouched, which is the merge shield. No precedence rule is needed (the question is retired): install aborts on a name conflict, so a plugin skill can never compete with the user's or the project's.
- MCP: `local-agent-registry.ts` loads the user's `.agents/mcp.json` into `mcpServersCache` (:75) and merges it into every local agent def (:365); plugin servers join that cache as converted native `MCPConfig`s, which is how `developer-knowledge` becomes reachable by every local agent. No shadowing is possible for the same reason — the conflict check runs before anything is written. The existing loader cannot be pointed at the plugin file: its schema is `z.object({mcpServers})` over the *native* `mcpConfigSchema`, so a spec `$schema` key is stripped and `type: "streamable-http"` fails the native enum → the whole file is rejected.
- persistence comes free: install runs in its own CLI process and exits, so the next start re-reads the roots — no in-process refresh, matching the labnote's long-lived-process caveat.

End-state target (grounded by fetching google/skills@main, not remembered): `plugin.json` (google-cloud-developer 1.1.2, Apache-2.0, author `{name,url}`, keywords[4]), 5 skills (finding-google-skills, gcloud, google-cloud-recipe-auth, google-cloud-recipe-onboarding, retrieving-developer-knowledge), 1 server (`developer-knowledge`, `streamable-http` → https://developerknowledge.googleapis.com/mcp). The same root carries `.claude-plugin/`, `.codex-plugin/`, `.mcp.json`, `mcp_config.json`, `gemini-extension.json`, `rules/` — all silently ignored, **zero reports**: a foreign plugin's extra files are invisible, not noise.
Proposed render: `✔ google-cloud-developer 1.1.2 ← github.com/google/skills/plugins/cloud/google-cloud-developer → <pluginsRoot>/google-cloud-developer`, then `skills 5 registered`, `mcp 1 server developer-knowledge (streamable-http)`, `data <pluginsRoot>/.data/google-cloud-developer (created)`, and a reports line that renders even when empty.
Honest limit to state in the test rather than paper over: `developer-knowledge` needs GCP credentials (the plugin's Gemini manifest declares `authProviderType: google_credentials`), so the live assertion is "configured and the connection is attempted", not "tools listed".

- Test 29: plugin skills join the session registry as a third root — the 5 plugin skills present in `getLoadedSkills()`, the two native roots untouched
- Test 30: plugin MCP servers join the session server map — `developer-knowledge` present as native `http` in `getLoadedMCPServers()`, adapter output accepted by `mcpConfigSchema`
- Test 31: install URL forms → (repo, subpath, ref): repo root, trailing `.git`, `/tree/<ref>/<path>`, plain subpath, default `HEAD`; a non-GitHub host or an ssh remote is rejected with a clear report (pure parse, no network, no `git`)
- Test 32: `freebuff plugin install <url>` on the google-cloud-developer URL — tarball fetch of the subdirectory (no git binary), lands at `<pluginsRoot>/google-cloud-developer` in a clean roots fixture, exit 0, renders the result above with zero reports (tmux e2e per AGENTS.md)
- Test 33: install failures all abort cleanly — unreachable URL, 404, no plugin.json at the subpath, invalid manifest, plugin name already installed, and a plugin skill or server name colliding with the user's roots → clear report and **nothing** written (no plugin dir, no skills registered, no servers, no data dir, temp removed)
- Test 34: a fresh process discovers what install wrote — 5 skills + 1 server, no in-process refresh assumed
- Test 35: the payoff — fresh session, a Google-Cloud question: the skill tool serves a plugin skill and the plugin's server is connected (live tmux; "connection attempted" is the failure-proof floor given the credentials caveat)

## Phase 6: refactorings (scheduled by the T5 audit, 2026-09-14)

- ✅ F2 immutable report assembly — `reports.push(...)` mutated a local array in `loadManifest` (clean-arch S1.4, clean-code S4.3)
- ✅ F5 `isPlainObject` extraction — the typeof/null/array check appeared twice and forced two `as Record<string, unknown>` casts (clean-code S2.1, S2.3)
- F3 composed report assertion — the non-object extensions test runs 11 physical lines (10-line cap) and four tests repeat the section+message probe (test-review S1.4, clean-code S5.2) → one `expectReportAbout(reports, { section, field })` helper
- ✅ F4 contract types moved inward — `PluginManifest` now lives with its rules in `manifest-policy.ts`, `PluginReport` in its own `report.ts` (every component produces them), and the I/O module imports both; no edge points outward any more (drove: policy imported its contract from the I/O module — clean-arch S3.1 DIP, S4.1 ADP, S4.2 SDP). `LoadManifestResult` stayed in `manifest.ts`: it is the load use case's own result and only consumes inward types
- ✅ F6 temp plugin roots are removed per test — `makePluginRoot` registers each root and an `afterEach` drains the registry with `rmSync(root, { recursive: true, force: true })`; verified 0 left after a full run (drove: `makePluginRoot` recreated a dir per test but discarded none — test-review S4.1). 597 dirs left over before the fix were deleted
- F7 report-order overspecification — "each unknown field gets its own report" asserts `reports[0]`/`[1]`, an order §5.2 does not mandate (test-review S5.2) → set comparison, keeping the two-distinct-reports strength
- F1 uncovered refusal paths — §5.1 no manifest, §5.2 non-JSON, §5.2 non-object top level have no tests (test-review S5.1) → already scheduled as Test 9 and Test 11 in Phase 1

## Missing operations (null versions)

- loadManifest(root) does not exist — Test 1 must fail loudly
- loadPlugin(root) Service does not exist — the Phase 1→2 seam must fail loudly
- spec→native MCP server mapping does not exist — Phase 3 must fail loudly
- placeholder expansion does not exist — Phase 4 must fail loudly
- plugin install <url> CLI command does not exist — Phase 5 must fail loudly (surface: commander, `cli/src/cli-args.ts`, Freebuff branch)
- the plugins root (`~/.agents/plugins`) and the `.data` root are undefined and nothing scans them — no InstalledPlugin can be discovered anywhere yet

## Tracking (agreed 2026-09-14)

- this file is the phase tracker: per-test ✅ markers applied as tests graduate, pruned at phase close
- working files (this file + backlog.md) ride **committed on the feature branch** — versioned with the work, restored to the driver branch before any PR
- the leak rule (check.ts) therefore fires on *pushed* PR-bound branches, not on local branches mid-work
- delete this section at promotion time along with the files themselves (strip = `git rebase --onto origin/main` + restore on driver)
- strip before the PR: the local formatter hook (`scripts/hooks/pre-commit` plus the local `core.hooksPath` setting) — prettier is declared upstream but never run there, so this hook is our tooling and not theirs
- docstrings tiered by visibility: public-facing declarations get one, full stop (duty, not taste — full contract: purpose, failure modes, invariants, spec citations); private helpers optional by default, earning one only for whys the code cannot express (esoteric/paper algorithm → explain + link source; convoluted bug workaround → explain + link issue) — otherwise comment blocks bury the code and break the file-size/density criteria. Content governed everywhere: ubiquitous language, no textbook dialect ("first-class", "composed assertion"), no restating the name — enrich with the contract instead. Inline comments stay the grimace category (extraction signal) — handbook Clean Code Ch 5. Production-only tiering: test fixtures stay docstring-mandatory (test-review Stage 2 Item 1). Audience = fellow programmers & the curious domain expert
- every test written is checked against all three checklists — clean-code, clean-architecture, test-review — as soon as it is written; strictly, no exceptions (human ruling 2026-09-14). Phase close adds the full audit plus the lessons index

- skill-registry takes the plugin root as a third source; the two native roots untouched
- one adapter module maps spec server variants → native mcpConfig shapes
- loader returns { installed: InstalledPlugin, reports } and the CLI renders reports; no logging from common/
