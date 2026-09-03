import fs from 'fs'
import os from 'os'
import path from 'path'

const TRACE_PATH = path.join(os.homedir(), 'freebuff-auth-trace.log')

/**
 * Append-only auth tracer for debugging the login loop.
 * Writes one JSON line per event to ~/freebuff-auth-trace.log.
 * Never throws: tracing must never break auth.
 */
export function traceAuth(label: string, data: Record<string, unknown>): void {
  try {
    const entry = JSON.stringify({
      t: new Date().toISOString(),
      label,
      ...data,
    })
    fs.appendFileSync(TRACE_PATH, entry + '\n')
  } catch {
    // swallow
  }
}
