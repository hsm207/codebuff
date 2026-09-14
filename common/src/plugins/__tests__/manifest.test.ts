import { afterEach, describe, expect, test } from 'bun:test'

import { loadManifest } from '../manifest'

import {
  AUTHOR,
  AUTHOR_WITH_FOREIGN_FIELD,
  AUTHOR_WITH_NON_STRING_NAME,
  CANONICAL_SCHEMA,
  cleanUpManifestFixtures,
  CONTENT_INVALID_METADATA,
  expectManifestOk,
  expectManifestRejected,
  KEYWORDS,
  KEYWORDS_WITH_NON_STRING_ENTRY,
  makeManifestRoot,
  makePluginRoot,
  MAX_NAME_LENGTH,
  NON_OBJECT_AUTHOR,
  UNSUPPORTED_SCHEMA,
  watchNetworkAccess,
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

  describe('name constraints (spec §5.5)', () => {
    test.each([
      ['my-plugin', 'spec valid list'],
      ['acme.tools', 'spec valid list'],
      ['lint3r', 'spec valid list'],
      ['a', 'spec valid list'],
      ['a'.repeat(MAX_NAME_LENGTH), '64 chars — inclusive edge (derived)'],
    ])('name %j → ok (%s)', (name) => {
      const root = makePluginRoot(
        JSON.stringify({ $schema: CANONICAL_SCHEMA, name }),
      )

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
      [
        'a'.repeat(MAX_NAME_LENGTH + 1),
        '65 chars — one past the edge (derived)',
      ],
    ])('name %j → rejected (%s)', (name) => {
      const root = makePluginRoot(
        JSON.stringify({ $schema: CANONICAL_SCHEMA, name }),
      )

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

  describe('$schema selection (spec §5.2)', () => {
    /**
     * Given a manifest declaring a specification version this client does not
     * support, when loaded, the plugin is rejected and the reason names the
     * version it declared (§5.2 SHOULD report the unsupported version).
     */
    test('an unsupported version is rejected, naming the version it declared', () => {
      const root = makePluginRoot(
        JSON.stringify({ $schema: UNSUPPORTED_SCHEMA, name: 'minimal-plugin' }),
      )

      const result = loadManifest(root)

      expectManifestRejected(result, UNSUPPORTED_SCHEMA)
    })

    /**
     * Given a client loading a plugin, when the manifest is read, nothing
     * reaches for the network to fetch the schema it names (§5.2 MUST NOT
     * retrieve a schema while loading a plugin).
     */
    test('loading a plugin does not retrieve the declared schema', () => {
      const fetchSpy = watchNetworkAccess()

      const root = makePluginRoot(
        JSON.stringify({ $schema: UNSUPPORTED_SCHEMA, name: 'minimal-plugin' }),
      )

      loadManifest(root)

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('metadata fields (spec §5.4)', () => {
    /**
     * Given a manifest whose metadata is correct in JSON type but invalid by
     * content, when loaded, the plugin loads, every value reaches the manifest
     * verbatim, and no report is emitted (§5.4 MUST NOT reject on the content
     * of version, homepage, repository, or license).
     */
    test('content-invalid metadata is carried verbatim, with no reports', () => {
      const root = makeManifestRoot(CONTENT_INVALID_METADATA)

      const result = loadManifest(root)

      const { manifest, reports } = expectManifestOk(result)
      expect(manifest).toMatchObject(CONTENT_INVALID_METADATA)
      expect(reports).toHaveLength(0)
    })

    /**
     * Given a manifest whose version is not a string, when loaded, the plugin
     * is rejected — metadata is validated by JSON type (§5.4), and a type
     * mismatch is fatal (§5.2).
     */
    test('a metadata field with the wrong JSON type is rejected', () => {
      const root = makeManifestRoot({ version: 42 })

      const result = loadManifest(root)

      expectManifestRejected(result, 'version')
    })

    /**
     * Given a manifest carrying the author object and the keywords list, when
     * loaded, both reach the manifest with the values the author wrote.
     */
    test('a valid author and keywords are carried verbatim', () => {
      const root = makeManifestRoot({ author: AUTHOR, keywords: KEYWORDS })

      const result = loadManifest(root)

      const { manifest } = expectManifestOk(result)
      expect(manifest.author).toEqual(AUTHOR)
      expect(manifest.keywords).toEqual(KEYWORDS)
    })

    /**
     * Given a manifest whose author carries a field outside name, email, and
     * url, when loaded, the plugin is rejected — §5.4 permits no other author
     * field.
     */
    test('an author field outside name, email, and url is rejected', () => {
      const root = makeManifestRoot({ author: AUTHOR_WITH_FOREIGN_FIELD })

      const result = loadManifest(root)

      expectManifestRejected(result, 'author')
    })

    /**
     * Given a manifest whose author carries a non-string value, when loaded,
     * the plugin is rejected — every author field holds a string (§5.4).
     */
    test('an author value that is not a string is rejected', () => {
      const root = makeManifestRoot({ author: AUTHOR_WITH_NON_STRING_NAME })

      const result = loadManifest(root)

      expectManifestRejected(result, 'author')
    })

    /**
     * Given a manifest whose author is not an object, when loaded, the plugin
     * is rejected — §5.4 declares author an object.
     */
    test('a non-object author is rejected', () => {
      const root = makeManifestRoot({ author: NON_OBJECT_AUTHOR })

      const result = loadManifest(root)

      expectManifestRejected(result, 'author')
    })

    /**
     * Given a manifest whose keywords list holds a non-string element, when
     * loaded, the plugin is rejected — §5.4 declares keywords a string[], and
     * §5.2 makes a field that does not match its declared type fatal.
     */
    test('keywords holding a non-string element is rejected', () => {
      const root = makeManifestRoot({
        keywords: KEYWORDS_WITH_NON_STRING_ENTRY,
      })

      const result = loadManifest(root)

      expectManifestRejected(result, 'keywords')
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
        JSON.stringify({
          $schema: CANONICAL_SCHEMA,
          name: 'minimal-plugin',
          bogus: 1,
        }),
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
      const root = makePluginRoot(
        JSON.stringify({ $schema: CANONICAL_SCHEMA, bogus: 1 }),
      )

      const result = loadManifest(root)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected rejection')
      expect(result.reason).toContain('name')
      expect(result.reports).toHaveLength(1)
      expect(result.reports[0].message).toContain('bogus')
    })
  })

  describe('extensions field (spec §8.1)', () => {
    /**
     * Given a manifest without extensions, when loaded, the manifest
     * carries no extensions value and no report is emitted (§8.1: the
     * field is optional).
     */
    test('absent extensions loads with no value and no reports', () => {
      const root = makePluginRoot(
        JSON.stringify({ $schema: CANONICAL_SCHEMA, name: 'minimal-plugin' }),
      )

      const result = loadManifest(root)

      const { manifest, reports } = expectManifestOk(result)
      expect(manifest.extensions).toBeUndefined()
      expect(reports).toHaveLength(0)
    })

    /**
     * Given a manifest whose extensions is an object of namespace entries
     * (the §8.1 example), when loaded, the object reaches the manifest
     * unchanged and no report is emitted about its contents (§8.1).
     */
    test('extensions object is carried onto the manifest unchanged, with no reports', () => {
      const extensions = { 'com.example.client': { setting: true } }
      const root = makePluginRoot(
        JSON.stringify({
          $schema: CANONICAL_SCHEMA,
          name: 'minimal-plugin',
          extensions,
        }),
      )

      const result = loadManifest(root)

      const { manifest, reports } = expectManifestOk(result)
      expect(manifest.extensions).toEqual(extensions)
      expect(reports).toHaveLength(0)
    })

    /**
     * Given a manifest whose extensions is a string, when loaded, the
     * plugin still loads (§8.1: MUST continue), a report names extensions,
     * and the manifest carries no extensions value.
     */
    test('non-object extensions is reported and ignored', () => {
      const root = makePluginRoot(
        JSON.stringify({
          $schema: CANONICAL_SCHEMA,
          name: 'minimal-plugin',
          extensions: 'nope',
        }),
      )

      const result = loadManifest(root)

      const { manifest, reports } = expectManifestOk(result)
      expect(manifest.extensions).toBeUndefined()
      expect(reports).toHaveLength(1)
      expect(reports[0].section).toBe('§8.1')
      expect(reports[0].message).toContain('extensions')
    })
  })
})
