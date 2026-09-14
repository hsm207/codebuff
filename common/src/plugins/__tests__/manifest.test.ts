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
 * covers a crash, which the loader never does — and the rejection helper
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

  })

  describe('unknown top-level fields (spec §5.2)', () => {
    /**
     * Given a valid manifest carrying one unknown top-level field, when
     * loaded, the plugin still loads (§5.2 MUST continue), a report names
     * the field, and the field is not carried onto the parsed manifest
     * (§5.2 MUST NOT assign semantics).
     */
    test('one unknown field is reported and ignored, plugin still loads', () => {
      const root = makePluginRoot(
        JSON.stringify({ $schema: CANONICAL_SCHEMA, name: 'minimal-plugin', bogus: 1 }),
      )

      const result = loadManifest(root)

      const { manifest, reports } = expectManifestOk(result)
      expect(manifest).not.toHaveProperty('bogus')
      expect(reports).toHaveLength(1)
      expect(reports[0].section).toBe('§5.2')
      expect(reports[0].message).toContain('bogus')
    })

    /**
     * Given a valid manifest carrying two unknown top-level fields, when
     * loaded, one report names each field (§5.2 "report ... each unknown
     * field").
     */
    test('each unknown field gets its own report', () => {
      const root = makePluginRoot(
        JSON.stringify({
          $schema: CANONICAL_SCHEMA,
          name: 'minimal-plugin',
          bogus: 1,
          wat: 'x',
        }),
      )

      const result = loadManifest(root)

      const { reports } = expectManifestOk(result)
      expect(reports).toHaveLength(2)
      const reported = reports.map((report) => report.message)
      expect(reported[0]).toContain('bogus')
      expect(reported[1]).toContain('wat')
    })

    /**
     * Given a manifest with an unknown field and a fatal violation (name
     * missing), when loaded, the plugin is rejected (§5.3 fatality wins)
     * and the unknown-field report is still included in the rejection
     * result (§5.2 report requirement is not conditioned on the plugin
     * loading).
     */
    test('unknown-field report is included in a fatal rejection', () => {
      const root = makePluginRoot(JSON.stringify({ $schema: CANONICAL_SCHEMA, bogus: 1 }))

      const result = loadManifest(root)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected rejection')
      expect(result.reason).toContain('name')
      expect(result.reports).toHaveLength(1)
      expect(result.reports[0].message).toContain('bogus')
    })

    /**
     * Given a manifest carrying permitted-but-unimplemented fields
     * (version, description, license), when loaded, no unknown-field report
     * is emitted — the §5.2 permitted set is the full ten-field list, not
     * just the fields freebuff reads today.
     */
    test('permitted-but-unimplemented fields produce no reports', () => {
      const root = makePluginRoot(
        JSON.stringify({
          $schema: CANONICAL_SCHEMA,
          name: 'minimal-plugin',
          version: '1.2.0',
          description: 'Brief plugin description',
          license: 'MIT',
        }),
      )

      const result = loadManifest(root)

      const { reports } = expectManifestOk(result)
      expect(reports).toHaveLength(0)
    })
  })
})
