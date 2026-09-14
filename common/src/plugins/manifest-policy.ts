import type { PluginManifest, PluginReport } from './manifest'

/**
 * Manifest field rules for Agent Plugins v1.0.0 (spec §5.2–§5.5) — pure
 * functions over the parsed manifest object. No filesystem access here;
 * `loadManifest` in manifest.ts reads the file and applies these rules.
 *
 * Spec: github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md
 */

/** The canonical manifest `$schema` id for Agent Plugins v1.0.0 (spec §5.2). */
export const PLUGIN_MANIFEST_SCHEMA_ID =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

/** Inclusive upper edge for plugin names (spec §5.5 Length). */
export const PLUGIN_NAME_MAX_LENGTH = 64

/**
 * Plugin names: 1–64 characters of `a-z`, `0-9`, `-`, `.`; must start and
 * end alphanumeric; no consecutive hyphens or periods (spec §5.5).
 * Fragment map: the two lookaheads ban `--`/`..`; the first class requires
 * an alphanumeric start; the optional tail requires an alphanumeric end.
 */
const PLUGIN_NAME_PATTERN = /^(?!.*--)(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

/**
 * The closed §5.2 top-level set — the only fields a conforming manifest may
 * carry. Anything outside it is reported and ignored, never given semantics.
 */
const MANIFEST_FIELDS = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
])

/**
 * True when the name satisfies every §5.5 rule: the pattern covers
 * charset, alphanumeric ends, and the no-consecutive-repeats rule; the length
 * cap is checked separately as the inclusive upper edge.
 */
function isValidPluginName(name: string): boolean {
  return PLUGIN_NAME_PATTERN.test(name) && name.length <= PLUGIN_NAME_MAX_LENGTH
}

/**
 * Unknown top-level fields are a non-fatal §5.2 violation: one report per
 * field, and the manifest still loads when otherwise valid. The caller must
 * return these reports even when it also rejects the manifest — the spec's
 * report requirement applies whenever a manifest is examined, not only when
 * a plugin loads.
 */
export function reportUnknownFields(fields: Record<string, unknown>): PluginReport[] {
  const unknown = Object.keys(fields).filter((field) => !MANIFEST_FIELDS.has(field))
  return unknown.map((field) => ({
    severity: 'warning',
    section: '§5.2',
    message: `unknown top-level field "${field}" ignored`,
  }))
}

/**
 * Applies the §5.2–§5.5 field rules to the parsed object. Returns the two
 * fields the manifest carries today, or the reason the plugin does not exist.
 */
export function validateManifestFields(
  fields: Record<string, unknown>,
): { ok: true; manifest: PluginManifest } | { ok: false; reason: string } {
  if (fields.$schema !== PLUGIN_MANIFEST_SCHEMA_ID) {
    return { ok: false, reason: 'unsupported manifest $schema (§5.2)' }
  }

  if (typeof fields.name !== 'string') {
    return { ok: false, reason: 'manifest.name must be a string (§5.3)' }
  }

  if (!isValidPluginName(fields.name)) {
    return {
      ok: false,
      reason:
        'manifest.name violates the §5.5 name constraints ' +
        '(1-64 chars of a-z, 0-9, "-", "."; starts and ends alphanumeric; no "--" or "..")',
    }
  }

  return { ok: true, manifest: { $schema: fields.$schema, name: fields.name } }
}

