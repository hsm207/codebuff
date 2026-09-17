# PR draft — agent plugin support (SUPERSEDED by PR #1372)

Opened as https://github.com/CodebuffAI/freebuff/pull/1372 on
2026-09-17 from fork:fix/agent-plugin-support (pushed from
local tmp-plugin-pr). The body below was posted verbatim. Kept for
the record only; raise changes as PR comments now.

Branch: `tmp-plugin-pr`, one commit on origin/main (dea6619dd).
Commit message and PR body are separate genres; the body below is
written in the author voice per conventions/voice.md, structured like
PR #1259. Uncommitted, for review.

---

## PR title

Support agent plugins (Agent Plugins spec v1.0.0)

## PR body

This implements the [Agent Plugins spec
v1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md)
and closes #1349. An agent plugin bundles a manifest (plugin.json),
skills, and MCP server config, and this PR adds a one-command install
for such bundles. After a restart the plugin's skills and MCP servers
join the session.

    fb plugin install https://github.com/google/skills/plugins/cloud/google-cloud-developer

I verified the feature end to end against that plugin: its five skills
are served, its MCP server is discovered and routed through the
project's existing MCP client, and nothing collides with the user's
own skills or servers.

### How it works

- Domain model (common/src/plugins/): a Plugin value object, whose
  manifest is validated per
  [§5](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#5-manifest),
  and an InstalledPlugin entity rooted at a client-managed plugins
  root. The entity shape leaves room for a plugin update flow later.
- Validation: the specification text is authoritative if it conflicts
  with the official JSON
  [schema](https://github.com/agentplugins/agent-plugins-spec/blob/main/schemas/1.0.0/plugin.schema.json)
  ([§5.2](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#52-manifest-object)),
  so section 5's rules are implemented as a direct rule engine rather
  than zod transforms. MCP entries reuse the existing MCP config
  types, and streamable-http maps onto the CLI's http transport.
- Install: fetch the GitHub archive (no git clone), extract to a
  staging dir, validate before installing, abort on any name conflict
  with the user's existing skills or servers, then move into the
  plugins root atomically. Only https://github.com URLs are accepted;
  anything else is refused before any network or filesystem work.
- Session wiring: plugin skills and MCP servers load after the user's
  own. Install aborts on conflicts, so nothing is shadowed.

### The four spec gaps

- [§5.2](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#52-manifest-object)
  never defines "object". I validate the three checks that match the
  spec's examples (non-null, non-array, plain) and note the assumption
  at the enforcement site.
- Skill files are read by the existing SDK loader without
  re-validation. A present-but-invalid skill can currently load as
  absent, which [§7.1](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#71-skills)
  wants reported; flagged inline.
- Env provisioning and `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` expansion
  ([§9.1](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#91-subprocess-environment),
  [§9.2](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#92-placeholder-expansion))
  are not implemented; flagged inline where the spec expects them.
- Remote MCP servers wanting user credentials (OAuth, ADC) cannot
  connect, exactly as on main today: the existing MCP client has no
  credential path for remote servers.
  [§7.2.2](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#722-loading-rules)
  rule 5 maps this to a connection failure, never invalid config.

### Testing

62 unit tests cover the manifest, skills and MCP policy in common;
command, registry and child-process suites cover the cli side. The
live verification above also confirmed gitlab URLs are refused
cleanly. Automated end-to-end tests through the real binary are a
small follow-up: the e2e scaffolding is unusable from a public
checkout.

---

## Drafting notes (not for the PR)

- Voice compliance: first person singular, one em dash budget (used
  zero), bullets for siblings, no offers of internal tooling.
- Headers (round 2): the operator caught 'The pieces' and 'Spec
  deltas, stated plainly' as invented - neither is in PR #1259. The
  skeleton now mirrors #1259's actual headers: 'The six bug families'
  → 'The four spec gaps' (number + concrete noun), 'Branch shape' →
  'How it works', 'Testing' unchanged, and the closing 'Note:' as a
  plain paragraph instead of a header. 'Stated plainly' was
  self-praising metadiscourse; deleted without replacement.
- Round 3 (operator): keep the PR short, no unnecessary details. The
  closing Note paragraph is deleted entirely (out-of-scope list,
  plugin-vs-plugin precedence, and the tsc-parity note all dropped;
  the tsc finding stays in field-notes/2026-09-17-01, the precedence
  point in the focus list - raise in PR comments only if reviewers
  ask). '(its own words)' dropped; the authority claim now quotes the
  spec's own sentence and every section citation links to its anchor
  in the published spec document, verified against
  spec/1.0.0.md (anchors: 5-manifest, 52-manifest-object, 71-skills,
  722-loading-rules, 91-subprocess-environment, 92-placeholder-expansion).
- The MCP limitation is framed as upstream's existing behavior reused
  unchanged, not something this PR handles specially, per the
  operator's ruling.
- Deleted from the previous draft: the toolbox/self-check "available
  on request" section (internal leak) and the TL;DR/For-discussion
  spec format (wrong genre).
