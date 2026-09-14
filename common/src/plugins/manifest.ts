import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  PLUGIN_MANIFEST_SCHEMA_ID,
  PLUGIN_NAME_MAX_LENGTH,
  reportUnknownFields,
  validateManifestFields,
} from './manifest-policy'

/**
 * Manifest loading for Agent Plugins v1.0.0 — the Factory that decides
 * whether a plugin exists (spec §5.3: an invalid manifest means the plugin
 * does not exist; nothing else may be discovered or executed). This module
 * owns the I/O and orchestration; the §5.2–§5.5 field rules live in
 * manifest-policy.ts.
 *
 * Spec: github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md
 */

export { PLUGIN_MANIFEST_SCHEMA_ID, PLUGIN_NAME_MAX_LENGTH }

/**
 * The parsed manifest (spec §5). Only these two fields are read today; the
 * manifest is the plugin's existence condition (§5.3), so anything invalid here
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
 * branch on `ok`; reports are present in both branches for rendering.
 */
export type LoadManifestResult =
  | { ok: true; manifest: PluginManifest; reports: PluginReport[] }
  | { ok: false; reason: string; reports: PluginReport[] }

/**
 * Loads and validates the manifest at `root/plugin.json`. Per spec §5.3, the
 * manifest alone decides whether the plugin exists: an invalid one means the
 * plugin does not exist, so this is the only step whose failure stops
 * discovery entirely.
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

  const entries = json.parsed as Record<string, unknown>
  const reports = reportUnknownFields(entries)

  const fields = validateManifestFields(entries)
  if (!fields.ok) return { ok: false, reason: fields.reason, reports }

  return { ok: true, manifest: fields.manifest, reports }
}

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
