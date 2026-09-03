/**
 * debug-toolbox shape probes: pure functions that summarize suspect objects
 * into small, loggable records. All probes must be safe on anything (they run
 * inside traceDebug-style try/catch at call sites) and must never throw.
 *
 * See common/src/debug-toolbox/README.md before arming new call sites.
 */

/** Does this object behave like a real zod v4 schema? */
export function zodShapeProbe(s: unknown): Record<string, unknown> {
  try {
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
  } catch {
    return { kind: 'probe-threw' }
  }
}

/** One-line summary of a tool result content block (mcp client boundary). */
export function toolResultProbe(c: unknown): Record<string, unknown> {
  try {
    const block = c as {
      type?: string
      mimeType?: string
      resource?: { uri?: string; mimeType?: string; text?: unknown }
      text?: string
    }
    if (block?.type === 'resource' && block.resource) {
      return {
        kind: 'resource',
        uri: block.resource.uri,
        mimeType: block.resource.mimeType,
        hasText: 'text' in block.resource,
        textPreview:
          typeof block.resource.text === 'string'
            ? block.resource.text.slice(0, 80)
            : undefined,
      }
    }
    if (block?.type === 'text') {
      return { kind: 'text', preview: block.text?.slice(0, 80) }
    }
    return { kind: block?.type ?? 'unknown' }
  } catch {
    return { kind: 'probe-threw' }
  }
}

/** Summarize every content part of a codebuff message (prompt-build gauntlet). */
export function messagePartsProbe(parts: unknown): Record<string, unknown> {
  try {
    const arr = Array.isArray(parts) ? parts : [parts]
    const summary = arr.map((p) => {
      const part = p as { type?: string; mediaType?: string; data?: unknown }
      if (part?.type === 'media' || part?.type === 'file') {
        const d = part.data
        const size =
          typeof d === 'string'
            ? d.length
            : d instanceof Uint8Array
              ? d.byteLength
              : undefined
        return {
          t: part.type,
          mt: part.mediaType,
          size,
          looksBase64:
            typeof d === 'string' && d.length > 0
              ? /^[A-Za-z0-9+/=\r\n]+$/.test(d.slice(0, 512))
              : undefined,
        }
      }
      return { t: part?.type }
    })
    return { count: arr.length, parts: summary.slice(0, 12) }
  } catch {
    return { count: -1, kind: 'probe-threw' }
  }
}
