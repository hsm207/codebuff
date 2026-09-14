import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, spyOn } from 'bun:test'

import type { LoadManifestResult } from '../manifest'

/**
 * The plugin roots, manifest values, and load-result assertions the manifest
 * tests share. Colocated with them so the component tests of Phase 2 and 3
 * build their plugin roots the same way, and so the spec prose in
 * `manifest.test.ts` is not buried under fixture plumbing.
 */

/** The $schema id every valid 1.0.0 manifest must carry (spec §5.2). */
export const CANONICAL_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

/** A canonical-looking schema id for a spec version this client cannot load. */
export const UNSUPPORTED_SCHEMA =
  'https://agent-plugins.org/schemas/2.0.0/plugin.schema.json'

/** Longest allowed plugin name — 64 is the inclusive upper edge (spec §5.5). */
export const MAX_NAME_LENGTH = 64

/**
 * §5.4 metadata that is correct in JSON type but invalid by content — freebuff
 * carries it without judging Semantic Versioning, URLs, or SPDX identifiers.
 */
export const CONTENT_INVALID_METADATA = {
  version: 'banana',
  description: 'A plugin that does nothing yet',
  homepage: 'not a url',
  repository: 'also not a url',
  license: 'nope',
}

/** The §5.4 author object, carrying every field §5.4 permits. */
export const AUTHOR = {
  name: 'Google LLC',
  email: 'author@example.com',
  url: 'https://cloud.google.com',
}

/** The same author plus a field §5.4 does not permit. */
export const AUTHOR_WITH_FOREIGN_FIELD = {
  name: 'Google LLC',
  twitter: '@google',
}

/** The same author with a name whose JSON type is wrong, not its content. */
export const AUTHOR_WITH_NON_STRING_NAME = { name: 42 }

/** An author of the wrong JSON type — §5.4 declares an object. */
export const NON_OBJECT_AUTHOR = 'Google LLC'

/** A §5.4 keywords list as the spec declares it. */
export const KEYWORDS = ['google-cloud', 'gcloud']

/** The same keywords list with one element that is not a string. */
export const KEYWORDS_WITH_NON_STRING_ENTRY = ['google-cloud', 7]

/** Plugin roots created by the running test, removed when it finishes. */
const pluginRoots: string[] = []

/** Spies created by the running test, restored when it finishes. */
const testSpies: ReturnType<typeof spyOn>[] = []

/**
 * Discards everything the running test created — spies first, then the plugin
 * roots — so no fixture state crosses into the next test and no temp directory
 * survives the run. Tests register it once with `afterEach`.
 */
export function cleanUpManifestFixtures(): void {
  for (const spy of testSpies.splice(0)) spy.mockRestore()
  for (const root of pluginRoots.splice(0))
    rmSync(root, { recursive: true, force: true })
}

/**
 * Watches the network for the running test and returns the watcher, so a load
 * that retrieves the schema it names fails an assertion on that spy (spec §5.2
 * MUST NOT retrieve a schema while loading a plugin).
 */
export function watchNetworkAccess(): ReturnType<typeof spyOn> {
  const spy = spyOn(globalThis, 'fetch')
  testSpies.push(spy)
  return spy
}

/** A plugin root whose plugin.json carries exactly the given bytes. */
export function makePluginRoot(manifestJson: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'freebuff-plugin-'))
  pluginRoots.push(root)
  writeFileSync(path.join(root, 'plugin.json'), manifestJson, 'utf8')
  return root
}

/**
 * A plugin root whose manifest carries the required fields plus the given
 * extras, so a test body states only the field it is about.
 */
export function makeManifestRoot(
  extraFields: Record<string, unknown> = {},
): string {
  return makePluginRoot(
    JSON.stringify({
      $schema: CANONICAL_SCHEMA,
      name: 'minimal-plugin',
      ...extraFields,
    }),
  )
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
export function expectManifestOk(result: LoadManifestResult) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result
}

/**
 * Asserts the plugin does not exist (the fatal branch) and that the loader's
 * reason blames the field named by `blame`, so a rejection for the wrong
 * cause still fails the test.
 */
export function expectManifestRejected(
  result: LoadManifestResult,
  blame: string,
): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`expected rejection blaming ${blame}, got ok`)
  expect(result.reason).toContain(blame)
}
