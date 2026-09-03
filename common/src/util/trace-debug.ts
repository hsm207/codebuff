import fs from 'fs'
import os from 'os'
import path from 'path'

const TRACE_PATH = path.join(os.homedir(), 'freebuff-trace.log')

/**
 * Minimal append-only JSONL tracer for local debugging.
 * Writes to ~/freebuff-trace.log and never throws.
 */
export function traceDebug(label: string, data: Record<string, unknown>): void {
  try {
    const entry = JSON.stringify({
      t: new Date().toISOString(),
      label,
      ...data,
    })
    fs.appendFileSync(TRACE_PATH, entry + '\n')
  } catch {
    // swallow - tracing must never break the app
  }
}

/** Shape probe: does this object behave like a real zod v4 schema? */
export function zodShapeProbe(s: unknown): Record<string, unknown> {
  if (s === undefined) return { kind: 'undefined' }
  if (s === null) return { kind: 'null' }
  const o = s as Record<string, unknown>
  return {
    kind: 'object',
    hasZod: '_zod' in o,
    hasSafeParse: typeof o.safeParse === 'function',
    hasAnd: typeof o.and === 'function',
    hasDescribe: typeof o.describe === 'function',
    keys: Object.keys(o).slice(0, 8),
    ctor: (s as object).constructor?.name,
  }
}
