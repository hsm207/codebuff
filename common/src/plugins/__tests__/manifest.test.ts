import { afterEach, describe, expect, test } from 'bun:test'

import { loadManifest } from '../manifest'

import {
  CANONICAL_SCHEMA,
  cleanUpManifestFixtures,
  expectManifestOk,
  expectManifestRejected,
  makePluginRoot,
  NON_JSON_TEXT,
} from './manifest-fixtures'

afterEach(cleanUpManifestFixtures)

describe('loadManifest', () => {
  test('minimal valid manifest (spec 1.0.0 §5.2 example) → ok with no reports', () => {
    const root = makePluginRoot(
      JSON.stringify({ $schema: CANONICAL_SCHEMA, name: 'minimal-plugin' }),
    )

    const result = loadManifest(root)

    const { manifest, reports } = expectManifestOk(result)
    expect(manifest.name).toBe('minimal-plugin')
    expect(reports).toHaveLength(0)
  })

  /**
   * Given a plugin.json that is not valid JSON, when loaded, the plugin is
   * rejected with a reason saying the manifest is not valid JSON (§5.2: the
   * manifest MUST be JSON).
   */
  test('a plugin.json that is not valid JSON is rejected', () => {
    const root = makePluginRoot(NON_JSON_TEXT)

    const result = loadManifest(root)

    expectManifestRejected(result, 'not valid JSON')
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
      const root = makePluginRoot(
        JSON.stringify({ $schema: CANONICAL_SCHEMA, name: 42 }),
      )

      const result = loadManifest(root)

      expectManifestRejected(result, 'name')
    })

    /**
     * Given a manifest whose $schema is not a string, when loaded, the
     * plugin is rejected with the reason naming $schema.
     */
    test('a manifest with a non-string $schema is rejected, naming $schema', () => {
      const root = makePluginRoot(
        JSON.stringify({ $schema: null, name: 'minimal-plugin' }),
      )

      const result = loadManifest(root)

      expectManifestRejected(result, '$schema')
    })
  })
})
