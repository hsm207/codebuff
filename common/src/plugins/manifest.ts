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
 * Plugin names: 1–64 characters of `a-z`, `0-9`, `-`, `.`; must start and
 * end alphanumeric; no consecutive hyphens or periods (spec §5.5).
 * Fragment map: the two lookaheads ban `--`/`..`; the first class requires
 * an alphanumeric start; the optional tail requires an alphanumeric end.
 */
const PLUGIN_NAME_PATTERN = /^(?!.*--)(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

/** Inclusive upper edge for plugin names (spec §5.5 Length). */
export const PLUGIN_NAME_MAX_LENGTH = 64

/**
 * Reads the manifest bytes at `<root>/plugin.json`, or the §5.1 refusal when
 * the package carries no manifest.
 */
function readPluginJson(root: string): { ok: true; raw: string } | { ok: false; reason: string } {
  try {
    return { ok: true, raw: readFileSync(path.join(root, 'plugin.json'), 'utf8') }
  } catch {
    return { ok: false, reason: 'no plugin.json at the plugin root (§5.1)' }
  }
}

/** Parses the manifest bytes, or the §5.2 refusal when they are not JSON. */
function parsePluginJson(raw: string): { ok: true; parsed: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, parsed: JSON.parse(raw) }
  } catch {
    return { ok: false, reason: 'plugin.json is not valid JSON (§5.2)' }
  }
}

/**
 * Applies the §5.2–§5.5 field policy to the parsed object. Returns the two
 * fields the manifest carries today, or the reason the plugin does not exist.
 */
function validateManifestFields(
  fields: Record<string, unknown>,
): { ok: true; manifest: PluginManifest } | { ok: false; reason: string } {
  if (fields.$schema !== PLUGIN_MANIFEST_SCHEMA_ID) {
    return { ok: false, reason: 'unsupported manifest $schema (§5.2)' }
  }

  if (typeof fields.name !== 'string') {
    return { ok: false, reason: 'manifest.name must be a string (§5.3)' }
  }

  if (!isPluginName(fields.name)) {
    return {
      ok: false,
      reason:
        'manifest.name violates the §5.5 name constraints ' +
        '(1-64 chars of a-z, 0-9, "-", "."; starts and ends alphanumeric; no "--" or "..")',
    }
  }

  return { ok: true, manifest: { $schema: fields.$schema, name: fields.name } }
}

/**
 * True when the name satisfies every §5.5 constraint: the pattern covers
 * charset, alphanumeric ends, and the no-consecutive-repeats rule; the length
 * cap is checked separately as the inclusive upper edge.
 */
function isPluginName(name: string): boolean {
  return PLUGIN_NAME_PATTERN.test(name) && name.length <= PLUGIN_NAME_MAX_LENGTH
}

/**
 * Loads and validates the manifest at `root/plugin.json`. Per spec §5.3, the
 * manifest alone gates plugin existence: an invalid one means the plugin does
 * not exist, so this is the only step whose failure kills discovery entirely.
 * Validation failures and spec-mandated reports come back as values —
 * `ok: false` with a reason, or `ok: true` with reports to render.
 */
export function loadManifest(root: string): LoadManifestResult {
  const file = readPluginJson(root)
  if (!file.ok) return { ok: false, reason: file.reason, reports: [] }

  const json = parsePluginJson(file.raw)
  if (!json.ok) return { ok: false, reason: json.reason, reports: [] }

  if (typeof json.parsed !== 'object' || json.parsed === null || Array.isArray(json.parsed)) {
    return { ok: false, reason: 'plugin.json must contain a top-level object (§5.2)', reports: [] }
  }

  const fields = validateManifestFields(json.parsed as Record<string, unknown>)
  if (!fields.ok) return { ok: false, reason: fields.reason, reports: [] }

  return { ok: true, manifest: fields.manifest, reports: [] }
}
