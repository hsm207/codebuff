import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { loadManifest, type LoadManifestResult } from '../manifest'

/** The $schema id every valid 1.0.0 manifest must carry (spec §5.2). */
const CANONICAL_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

/** A plugin root whose plugin.json carries exactly the given bytes. */
function makePluginRoot(manifestJson: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'freebuff-plugin-'))
  writeFileSync(path.join(root, 'plugin.json'), manifestJson, 'utf8')
  return root
}

/**
 * Asserts the load succeeded, failing with the loader's reason otherwise,
 * and returns the manifest so tests assert on plugin values, never on the
 * result's shape.
 */
function expectManifestOk(result: LoadManifestResult) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result
}

describe('loadManifest', () => {
  test('minimal valid manifest (spec 1.0.0 §5.2 example) → ok with no reports', () => {
    const root = makePluginRoot(JSON.stringify({ $schema: CANONICAL_SCHEMA, name: 'minimal-plugin' }))

    const result = loadManifest(root)

    const { manifest, reports } = expectManifestOk(result)
    expect(manifest.name).toBe('minimal-plugin')
    expect(reports).toHaveLength(0)
  })
})
