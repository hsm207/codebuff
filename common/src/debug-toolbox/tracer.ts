import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'node:child_process'

const TRACE_PATH = path.join(os.homedir(), 'freebuff-trace.log')

/**
 * debug-toolbox: local-only JSONL tracer for troubleshooting sessions.
 *
 * See common/src/debug-toolbox/README.md before arming new call sites.
 *
 * Contract:
 * - Writes one JSON object per line to ~/freebuff-trace.log (outside the repo).
 * - NEVER throws, NEVER logs to the TUI, NEVER sends telemetry.
 * - Gated: set FREEBUFF_TOOLBOX=0 to silence entirely (default on).
 */

function enabled(): boolean {
  try {
    return process.env.FREEBUFF_TOOLBOX !== '0'
  } catch {
    return true
  }
}

export function toolboxTrace(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!enabled()) return
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

/** Which git state produced this log? Best-effort; never throws. */
export function toolboxSessionStart(): void {
  try {
    const run = (args: string) => {
      try {
        const r = spawnSync(args, { shell: true, timeout: 2000 })
        return String(r.stdout ?? '').trim()
      } catch {
        return ''
      }
    }
    const branch = run('git rev-parse --abbrev-ref HEAD')
    const describe = run('git describe --always --dirty')
    toolboxTrace('SESSION_START', {
      pid: process.pid,
      node: process.version,
      branch,
      describe,
      cwd: process.cwd(),
      note:
        'every log file self-identifies the branch/state that produced it; ' +
        'stale logs from other sessions/branches are the enemy (see README)',
    })
  } catch {
    // swallow
  }
}

/** Net for crashes that escape the structured logger. Local-only. */
export function toolboxExceptionNet(): void {
  if (!enabled()) return
  try {
    process.on('uncaughtException', (err) => {
      toolboxTrace('UNCAUGHT_EXCEPTION', {
        message: err?.message,
        stack: err?.stack,
      })
    })
    process.on('unhandledRejection', (reason) => {
      toolboxTrace('UNHANDLED_REJECTION', {
        message: (reason as Error)?.message ?? String(reason),
        stack: (reason as Error)?.stack,
      })
    })
  } catch {
    // swallow
  }
}
