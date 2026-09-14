import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  isPlainObject,
  reportUnknownFields,
  validateExtensions,
  validateManifestFields,
  type PluginManifest,
} from './manifest-policy'
import type { PluginReport } from './report'

/**
 * Reads and validates `plugin.json` for Agent Plugins v1.0.0. An invalid
 * manifest means the plugin does not exist, and nothing else may be
 * discovered or executed (spec §5.3). This module reads the file and parses
 * the JSON; the manifest contract and field rules live in manifest-policy.ts.
 *
 * Spec: github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md
 */

/**
 * Either a valid manifest with any spec-mandated reports, or the reason the
 * plugin does not exist (spec §5.3). Reports are present in both branches,
 * so callers can render them whichever way the load went.
 */
export type LoadManifestResult =
  | { ok: true; manifest: PluginManifest; reports: PluginReport[] }
  | { ok: false; reason: string; reports: PluginReport[] }

/**
 * Loads and validates the manifest at `root/plugin.json`. Per spec §5.3, the
 * manifest alone decides whether the plugin exists: an invalid one means the
 * plugin does not exist, so this is the only step whose failure stops
 * discovery entirely.
 * Failures and spec-mandated reports are returned in the result:
 * `ok: false` with a reason, or `ok: true` with reports to render.
 */
export function loadManifest(root: string): LoadManifestResult {
  const file = readPluginJson(root)
  if (!file.ok) return { ok: false, reason: file.reason, reports: [] }

  const json = parsePluginJson(file.raw)
  if (!json.ok) return { ok: false, reason: json.reason, reports: [] }

  const parsed = json.parsed
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'plugin.json must contain a top-level object (§5.2)', reports: [] }
  }

  const extensions = validateExtensions(parsed)
  const reports = [...reportUnknownFields(parsed), ...extensions.reports]

  const fields = validateManifestFields(parsed)
  if (!fields.ok) return { ok: false, reason: fields.reason, reports }

  return {
    ok: true,
    manifest: { ...fields.manifest, extensions: extensions.extensions },
    reports,
  }
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
