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

/**
 * debug-toolbox: route process-level warnings into the trace log instead of
 * raw stderr, where they tear through the TUI frame mid-render.
 *
 * Trigger, seen 2026-09-03: ai@7 logs its specificationVersion v2
 * compatibility warning (our vendored openai-compatible models declare v2;
 * see the provider-migration note in oss-labnotes) via process.emitWarning
 * on every streamText call. With no 'warning' listener, Node prints it raw
 * to stderr and the warning lands inside the TUI's rendered frame.
 *
 * Two layers:
 * 1. globalThis.AI_SDK_LOG_WARNINGS - the SDK's own logger hook. A function
 *    sink keeps the full structured record (provider, model, warnings[]) and
 *    also suppresses the SDK's one-time 'how to disable me' info line.
 * 2. process.on('warning') - catches any other library that emitWarnings
 *    directly; adding a listener also silences Node's default stderr print.
 *
 * Route, don't kill: nothing is discarded, it moves to ~/freebuff-trace.log.
 * Must run BEFORE any import that touches the ai package (call in entry.ts).
 */
export function toolboxWarningNet(): void {
  try {
    const sdkSink = (options: {
      provider?: string
      model?: string
      warnings?: Array<{ type?: string; message?: string; feature?: string; details?: string }>
    }) => {
      toolboxTrace('AI_SDK_WARNING', {
        provider: options.provider,
        model: options.model,
        warnings: options.warnings,
      })
    }
    ;(globalThis as Record<string, unknown>).AI_SDK_LOG_WARNINGS = sdkSink

    process.on('warning', (warning) => {
      toolboxTrace('PROCESS_WARNING', {
        name: warning?.name,
        message: warning?.message,
        stack: warning?.stack,
      })
    })
  } catch {
    // swallow - the net must never break the app
  }
}
