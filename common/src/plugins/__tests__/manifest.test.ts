import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { loadManifest, type LoadManifestResult } from '../manifest'

/** The $schema id every valid 1.0.0 manifest must carry (spec §5.2). */
const CANONICAL_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

/** Longest allowed plugin name — 64 is the inclusive upper edge (spec §5.5). */
const MAX_NAME_LENGTH = 64

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
 *
 * Rejection rows use expectManifestRejected rather than negating this one:
 * a rejection is not the boolean complement of success — "not ok" also
 * covers a crash, which the Factory forbids — and the rejection helper
 * additionally asserts the reason blames the field under test.
 */
function expectManifestOk(result: LoadManifestResult) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result
}

/**
 * Asserts the plugin does not exist (the fatal branch) and that the loader's
 * reason blames the field named by `blame`, so a rejection for the wrong
 * cause still fails the test.
 */
function expectManifestRejected(result: LoadManifestResult, blame: string): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`expected rejection blaming ${blame}, got ok`)
  expect(result.reason).toContain(blame)
}

describe('loadManifest', () => {
  test('minimal valid manifest (spec 1.0.0 §5.2 example) → ok with no reports', () => {
    const root = makePluginRoot(JSON.stringify({ $schema: CANONICAL_SCHEMA, name: 'minimal-plugin' }))

    const result = loadManifest(root)

    const { manifest, reports } = expectManifestOk(result)
    expect(manifest.name).toBe('minimal-plugin')
    expect(reports).toHaveLength(0)
  })

  describe('name constraints (spec §5.5)', () => {
    test.each([
      ['my-plugin', 'spec valid list'],
      ['acme.tools', 'spec valid list'],
      ['lint3r', 'spec valid list'],
      ['a', 'spec valid list'],
      ['a'.repeat(MAX_NAME_LENGTH), '64 chars — inclusive edge (derived)'],
    ])('name %j → ok (%s)', (name) => {
      const root = makePluginRoot(JSON.stringify({ $schema: CANONICAL_SCHEMA, name }))

      const result = loadManifest(root)

      const { manifest } = expectManifestOk(result)
      expect(manifest.name).toBe(name)
    })

    test.each([
      ['My-Plugin', 'uppercase (spec invalid list)'],
      ['-start', 'leading hyphen (spec invalid list)'],
      ['has--double', 'consecutive hyphens (spec invalid list)'],
      ['too.many..dots', 'consecutive periods (spec invalid list)'],
      ['', 'empty (spec invalid list)'],
      ['end-', 'trailing hyphen (derived from start/end rule)'],
      ['.lead', 'leading period (derived from start/end rule)'],
      ['a'.repeat(MAX_NAME_LENGTH + 1), '65 chars — one past the edge (derived)'],
    ])('name %j → rejected (%s)', (name) => {
      const root = makePluginRoot(JSON.stringify({ $schema: CANONICAL_SCHEMA, name }))

      const result = loadManifest(root)

      expectManifestRejected(result, 'name')
    })
  })

  describe('required fields (spec §5.3)', () => {
    /**
     * Given a manifest without $schema, when loaded, the plugin is rejected
     * with the reason naming $schema.
     */
    test('a manifest without $schema is rejected, naming $schema', () => {
      const root = makePluginRoot(JSON.stringify({ name: 'minimal-plugin' }))

      const result = loadManifest(root)

      expectManifestRejected(result, '$schema')
    })

    /**
     * Given a manifest without name, when loaded, the plugin is rejected
     * with the reason naming name.
     */
    test('a manifest without name is rejected, naming name', () => {
      const root = makePluginRoot(JSON.stringify({ $schema: CANONICAL_SCHEMA }))

      const result = loadManifest(root)

      expectManifestRejected(result, 'name')
    })

    /**
     * Given a manifest whose name is not a string, when loaded, the plugin
     * is rejected with the reason naming name.
     */
    test('a manifest with a non-string name is rejected, naming name', () => {
      const root = makePluginRoot(JSON.stringify({ $schema: CANONICAL_SCHEMA, name: 42 }))

      const result = loadManifest(root)

      expectManifestRejected(result, 'name')
    })

    /**
     * Given a manifest whose $schema is not a string, when loaded, the
     * plugin is rejected with the reason naming $schema.
     */
    test('a manifest with a non-string $schema is rejected, naming $schema', () => {
      const root = makePluginRoot(JSON.stringify({ $schema: null, name: 'minimal-plugin' }))

      const result = loadManifest(root)

      expectManifestRejected(result, '$schema')
    })

    /**
     * Given a manifest whose $schema is the empty string, when loaded, the
     * plugin is rejected with the reason naming $schema (§5.3: "is empty").
     */
    test('a manifest with an empty $schema is rejected, naming $schema', () => {
      const root = makePluginRoot(JSON.stringify({ $schema: '', name: 'minimal-plugin' }))

      const result = loadManifest(root)

      expectManifestRejected(result, '$schema')
    })
  })
})
