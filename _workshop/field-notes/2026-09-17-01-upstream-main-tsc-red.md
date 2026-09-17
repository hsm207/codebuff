# Upstream main is tsc-red after the 2026-09-17 snapshot syncs

origin/main @ dea6619dd fails `tsc --noEmit` in 5 of 5 packages we
touch, 32 errors total (common 4, agent-runtime 6, cli 16, sdk 6,
llm-providers 0). Root cause chain: their sync bumped ai
7.0.99 -> 7.0.105; the new SDK narrowed TextPart.providerOptions to
SharedV4ProviderOptions; upstream's own withCacheControl in
common/src/util/messages.ts (constraint `T & { providerOptions?:
ProviderMetadata }`) now rejects their own call sites.

Evidence, two-sided (validate-the-instrument):
- pristine origin/main in a throwaway worktree, frozen lockfile:
  same counts in all 5 packages (cli tests too: the exportConversation,
  OSC 52, /model-alias and /new-rotation failures all reproduce on
  main - 7 pass / 2 fail in export-conversation.test.ts, etc.)
- our rebased branch: identical counts - our changes introduce zero
  new typecheck errors and zero new test failures
- the failing test files are byte-identical to origin/main and none
  of their subjects are in our changed-file set

Consequence for block 7: the "tsc at the 10/1 baselines" item is met -
our deltas over origin/main are clean. Upstream's pre-existing red is
theirs to fix; do not absorb their 32 errors into our PR. Options for
the PR description: state the baseline explicitly (suite green in our
scoped sets; tsc parity with origin/main, whose known red is counted)
or fix forward as a separate upstream-addressed commit. Ruled: note
the parity, fix nothing of theirs in this PR.

Rebase record: 118 commits replayed onto dea6619dd, zero conflicts.
One overlapping file (run-agent-step.ts, their todo-loop guard vs our
to-json-schema move + toolboxTrace) merged cleanly by git; both sides
verified present in the result. Backup branch:
backup/feat-agent-plugins-pre-rebase-2026-09-17 (delete after PR
merges).
