# PR description raw material (compile when block 7 clears)

- checkout note: upstream's e2e scaffolding cannot run from a public
  clone; coverage argument: 84 tests + one live smoke on record
  (37160f37e)
- §-deltas: MCP §7.2 transport mapping (`streamable-http` → freebuff
  `http`); §5.2 "object" interpreted as plain JSON-serializable object;
  §5.3 name-collision policy = abort the install
- scope: bare-bones — parse the manifest per §5, reuse the existing
  readers for skills/MCP, one install command, usable after restart
- discussion points for the maintainers: backlog #5 (plugin-vs-plugin
  name reuse), #6 (shadow precedence)
