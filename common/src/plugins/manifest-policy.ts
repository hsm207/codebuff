import type { PluginReport } from './report'

/**
 * The manifest contract and field rules for Agent Plugins v1.0.0
 * (spec §5.2–§8.1) — pure functions over the parsed manifest object, with no
 * filesystem access. `loadManifest` in manifest.ts reads the file and applies
 * these rules.
 *
 * The rules are written by hand instead of declared as a schema (zod, or the
 * spec's own machine-readable JSON Schema). §5.2 makes exactly two violations
 * non-fatal: an unknown top-level field is reported while loading continues,
 * and a non-object `extensions` is reported and ignored — while every other
 * violation rejects the plugin. No schema declaration captures that split. The
 * spec also ranks its text above the schema ("The specification text is
 * authoritative if it conflicts with the schema"), so a declaration would be a
 * second copy of these rules, free to drift from the one we answer to; writing
 * and testing them directly is less work than bending zod to the text.
 *
 * Spec: github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md
 */

/**
 * The §5.4 author object. Every field is optional, but the object is closed:
 * a fourth field, or a value that is not a string, invalidates the manifest.
 * That is the one §5.4 constraint stricter than the JSON-type rule below.
 */
export interface PluginAuthor {
  name?: string
  email?: string
  url?: string
}

/**
 * The parsed manifest (spec §5). An invalid manifest means the plugin does
 * not exist — no components may be discovered or executed (§5.3). Metadata
 * values are carried as the author declared them: their JSON type is
 * checked, never their content (§5.4).
 */
export interface PluginManifest {
  $schema: string
  name: string
  /**
   * Client extension data (§8.1): carried verbatim when present and
   * object-shaped; freebuff reads no namespace values. Undefined when
   * absent or when a non-object value was reported and ignored.
   */
  extensions?: Record<string, unknown>
  version?: string
  description?: string
  author?: PluginAuthor
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
}

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
const PLUGIN_NAME_PATTERN =
  /^(?!.*--)(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

/**
 * The closed §5.2 top-level set — the only fields a conforming manifest may
 * carry. Keys outside it are reported, and are not copied onto the parsed
 * manifest (§5.2).
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

/** The §5.4 metadata fields whose JSON type is a string, in spec order. */
const STRING_METADATA_FIELDS = [
  'version',
  'description',
  'homepage',
  'repository',
  'license',
] as const

/** One field name from the §5.4 string metadata table. */
type StringMetadataField = (typeof STRING_METADATA_FIELDS)[number]

/** The §5.4 author object fields, in spec order. */
const AUTHOR_FIELDS = ['name', 'email', 'url'] as const

/** One field name from the §5.4 author object. */
type AuthorField = (typeof AUTHOR_FIELDS)[number]

/** True when `field` is one of the three names §5.4 permits in author. */
function isAuthorField(field: string): field is AuthorField {
  return AUTHOR_FIELDS.some((known) => known === field)
}

/**
 * True for a JSON object: not a primitive, not null, not an array. The null
 * check is required because `typeof null === 'object'`.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
export function reportUnknownFields(
  fields: Record<string, unknown>,
): PluginReport[] {
  const unknown = Object.keys(fields).filter(
    (field) => !MANIFEST_FIELDS.has(field),
  )
  return unknown.map((field) => ({
    severity: 'warning',
    section: '§5.2',
    message: `unknown top-level field "${field}" ignored`,
  }))
}

/**
 * Reads the §5.4 metadata strings the manifest carries. A field that is
 * present must be a string — metadata is validated by JSON type and nothing
 * else, so a value is never judged for Semantic Versioning, URL, or SPDX
 * validity.
 */
function readStringMetadata(
  fields: Record<string, unknown>,
):
  | { ok: true; values: Partial<Record<StringMetadataField, string>> }
  | { ok: false; reason: string } {
  const values: Partial<Record<StringMetadataField, string>> = {}
  for (const field of STRING_METADATA_FIELDS) {
    const value = fields[field]
    if (value === undefined) continue
    if (typeof value !== 'string') {
      return { ok: false, reason: `manifest.${field} must be a string (§5.4)` }
    }
    values[field] = value
  }
  return { ok: true, values }
}

/**
 * Reads the §5.4 author object, the one metadata field §5.4 constrains
 * beyond JSON type: only name, email, and url, each a string.
 */
function readAuthor(
  value: unknown,
): { ok: true; author?: PluginAuthor } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true }
  if (!isPlainObject(value)) {
    return { ok: false, reason: 'manifest.author must be an object (§5.4)' }
  }

  const author: PluginAuthor = {}
  for (const [field, fieldValue] of Object.entries(value)) {
    if (!isAuthorField(field)) {
      return {
        ok: false,
        reason: `manifest.author has an unknown field "${field}" (§5.4)`,
      }
    }
    if (typeof fieldValue !== 'string') {
      return {
        ok: false,
        reason: `manifest.author.${field} must be a string (§5.4)`,
      }
    }
    author[field] = fieldValue
  }
  return { ok: true, author }
}

/**
 * Reads the §5.4 keywords list. §5.4 declares it `string[]` and §5.2 makes a
 * permitted field that does not match its declared type fatal, so a
 * non-string element rejects the plugin — the permissive §5.4 sentence
 * forbids judging content, never types.
 */
function readKeywords(
  value: unknown,
): { ok: true; keywords?: string[] } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true }
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    return {
      ok: false,
      reason: 'manifest.keywords must be an array of strings (§5.4)',
    }
  }
  return { ok: true, keywords: value }
}

/**
 * Applies the §5.2–§5.5 field rules to the parsed object. Returns the
 * manifest fields freebuff carries, or the reason the plugin does not exist.
 */
export function validateManifestFields(
  fields: Record<string, unknown>,
): { ok: true; manifest: PluginManifest } | { ok: false; reason: string } {
  if (typeof fields.$schema !== 'string') {
    return { ok: false, reason: 'manifest.$schema must be a string (§5.3)' }
  }

  if (fields.$schema !== PLUGIN_MANIFEST_SCHEMA_ID) {
    return {
      ok: false,
      reason: `unsupported manifest $schema "${fields.$schema}" (§5.2)`,
    }
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

  const metadata = readStringMetadata(fields)
  if (!metadata.ok) return { ok: false, reason: metadata.reason }

  const author = readAuthor(fields.author)
  if (!author.ok) return { ok: false, reason: author.reason }

  const keywords = readKeywords(fields.keywords)
  if (!keywords.ok) return { ok: false, reason: keywords.reason }

  return {
    ok: true,
    manifest: {
      $schema: fields.$schema,
      name: fields.name,
      ...metadata.values,
      ...(author.author && { author: author.author }),
      ...(keywords.keywords && { keywords: keywords.keywords }),
    },
  }
}

/**
 * A non-object extensions value is a non-fatal §8.1 violation: report, ignore,
 * continue loading. Namespace values are not validated: freebuff implements no
 * extension namespaces (§8.1).
 */
export function validateExtensions(fields: Record<string, unknown>): {
  reports: PluginReport[]
  extensions: Record<string, unknown> | undefined
} {
  const value = fields.extensions
  if (value === undefined) return { reports: [], extensions: undefined }

  if (!isPlainObject(value)) {
    return {
      reports: [
        {
          severity: 'warning',
          section: '§8.1',
          message:
            'manifest.extensions must be an object of namespace entries; value ignored',
        },
      ],
      extensions: undefined,
    }
  }

  return { reports: [], extensions: value }
}
