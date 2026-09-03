#!/usr/bin/env bun
/**
 * debug-toolbox drift detector: verifies every armed call site still exists.
 *
 * Run from anywhere:  bun run common/src/debug-toolbox/check.ts
 * Exit 0 = all armed sites present; exit 1 = something went missing (usually
 * an upstream merge/rebase eating a marker - re-arm from patches/, see README).
 */
import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.join(import.meta.dir, '..', '..', '..')

interface Site {
  label: string
  marker: string
  file: string
  why: string
}

/** The armed call sites. When you arm a new one, add a row here. */
const ARMED_SITES: Site[] = [
  {
    label: 'mcp.ingest.toolResult',
    marker: '[toolbox:mcp.ingest.toolResult]',
    file: 'common/src/mcp/client.ts',
    why: 'tool-result ingestion - bug #3/#4 (text/binary resources as media) lived here',
  },
  {
    label: 'schema.mcp.store',
    marker: '[toolbox:schema.mcp.store]',
    file: 'packages/agent-runtime/src/mcp.ts',
    why: 'schema handed to persisted state - bug #2 (zod in state) lived here',
  },
  {
    label: 'schema.toolset.final',
    marker: '[toolbox:schema.toolset.final]',
    file: 'packages/agent-runtime/src/tools/prompts.ts',
    why: 'final schema reaching the model - bug #1 (clone amputation) surfaced here',
  },
  {
    label: 'state.toolDefinitions',
    marker: '[toolbox:state.toolDefinitions]',
    file: 'packages/agent-runtime/src/run-agent-step.ts',
    why: 'toolDefinitions entering agent state - bug #2 second boundary',
  },
  {
    label: 'cli.exceptionNet',
    marker: '[toolbox:cli.exceptionNet]',
    file: 'cli/src/index.tsx',
    why: 'global crash net - catches errors the structured logger never sees',
  },
]

function main(): number {
  console.log(`debug-toolbox check - repo root: ${REPO_ROOT}\n`)
  let ok = 0
  const missing: Site[] = []
  for (const site of ARMED_SITES) {
    const file = path.join(REPO_ROOT, site.file)
    let present = false
    try {
      present = fs.readFileSync(file, 'utf8').includes(site.marker)
    } catch {
      present = false
    }
    if (present) {
      ok++
      console.log(`  [armed]    ${site.label.padEnd(28)} ${site.file}`)
    } else {
      missing.push(site)
      console.log(`  [MISSING]  ${site.label.padEnd(28)} ${site.file}`)
      console.log(`             why it matters: ${site.why}`)
    }
  }
  console.log(`\n${ok}/${ARMED_SITES.length} armed sites present.`)
  if (missing.length > 0) {
    console.log(
      `\nDrift detected. Re-arm: git apply --3way common/src/debug-toolbox/patches/*.patch`,
    )
    console.log(`Then re-run this check. Full instructions: common/src/debug-toolbox/README.md`)
    return 1
  }
  console.log(`Trace file: ~/freebuff-trace.log (JSONL; FREEBUFF_TOOLBOX=0 silences)`)
  return 0
}

process.exit(main())
