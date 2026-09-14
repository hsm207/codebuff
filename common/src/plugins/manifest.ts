import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Manifest loading for Agent Plugins v1.0.0 — the Factory that gates plugin
 * existence (spec §5.3: an invalid manifest means the plugin does not exist;
 * nothing else may be discovered or executed).
 *
 * Spec: github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md
 */

/** The canonical manifest `$schema` id for Agent Plugins v1.0.0 (spec §5.2). */
export const PLUGIN_MANIFEST_SCHEMA_ID =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

/**
 * The parsed manifest (spec §5). Only these two fields are read today; the
 * manifest is the plugin's existence gate (§5.3), so anything invalid here
 * means no plugin at all.
 */
export interface PluginManifest {
  $schema: string
  name: string
}

/**
 * Reports are part of the load result, not console output: the spec's
 * "MUST report" is behavior the client performs, and freebuff renders
 * these to the user.
 */
export interface PluginReport {
  severity: 'error' | 'warning'
  section: string
  message: string
}

/**
 * The load outcome as values: either a valid manifest with any spec-mandated
 * reports, or the reason the plugin does not exist (spec §5.3). Callers
 * narrow on `ok`; reports ride along in both branches for rendering.
 */
export type LoadManifestResult =
  | { ok: true; manifest: PluginManifest; reports: PluginReport[] }
  | { ok: false; reason: string; reports: PluginReport[] }

/**
 * Loads and validates the manifest at `root/plugin.json`. Per spec §5.3, the
 * manifest alone gates plugin existence: an invalid one means the plugin does
 * not exist, so this is the only step whose failure kills discovery entirely.
 * Validation failures and spec-mandated reports come back as values —
 * `ok: false` with a reason, or `ok: true` with reports to render.
 */
export function loadManifest(root: string): LoadManifestResult {
  let raw: string
  try {
    raw = readFileSync(path.join(root, 'plugin.json'), 'utf8')
  } catch {
    return {
      ok: false,
      reason: 'no plugin.json at the plugin root (§5.1)',
      reports: [],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      reason: 'plugin.json is not valid JSON (§5.2)',
      reports: [],
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: 'plugin.json must contain a top-level object (§5.2)',
      reports: [],
    }
  }

  const fields = parsed as Record<string, unknown>

  if (fields.$schema !== PLUGIN_MANIFEST_SCHEMA_ID) {
    return {
      ok: false,
      reason: 'unsupported manifest $schema (§5.2)',
      reports: [],
    }
  }

  if (typeof fields.name !== 'string' || fields.name.length === 0) {
    return {
      ok: false,
      reason: 'manifest.name must be a non-empty string (§5.3)',
      reports: [],
    }
  }

  return {
    ok: true,
    manifest: { $schema: fields.$schema, name: fields.name },
    reports: [],
  }
}
