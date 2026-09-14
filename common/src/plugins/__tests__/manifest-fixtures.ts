import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, spyOn } from 'bun:test'

import { SKILL_FILE_NAME, SKILLS_DIR_NAME } from '../../constants/skills'

import type { LoadManifestResult } from '../manifest'
import type { PluginReport } from '../report'
import type { LoadSkillsResult } from '../skills'

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

/** Manifest text that is not JSON at all (§5.2: the manifest MUST be JSON). */
export const NON_JSON_TEXT = 'this is not JSON'

/**
 * Manifest text that parses as JSON but whose top level is an array — the
 * non-object a `typeof` check alone would wave through (§5.2 requires an
 * object).
 */
export const TOP_LEVEL_ARRAY_JSON = '[]'

/**
 * Manifest text whose top level is a string primitive — rejected by the type
 * clause of the object rule (§5.2 requires an object).
 */
export const TOP_LEVEL_STRING_JSON = '"just a string"'

/**
 * Manifest text whose top level is null — JSON-valid, and the case `typeof`
 * alone reports as an object, so this row also pins that reading it cannot
 * crash.
 */
export const TOP_LEVEL_NULL_JSON = 'null'

/** A native skill directory name the reader accepts. */
export const SKILL_NAME = 'gcloud'

/** A second native skill directory name, so sibling rows can be asserted. */
export const OTHER_SKILL_NAME = 'finding-google-skills'

/** Temp directories created by the running test, removed when it finishes. */
const tempDirs: string[] = []

/** Spies created by the running test, restored when it finishes. */
const testSpies: ReturnType<typeof spyOn>[] = []

/**
 * Discards everything the running test created — spies first, then the temp
 * directories — so no fixture state crosses into the next test and nothing
 * survives the run. Tests register it once with `afterEach`.
 */
export function cleanUpManifestFixtures(): void {
  for (const spy of testSpies.splice(0)) spy.mockRestore()
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
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

/** A plugin root whose plugin.json holds exactly the given manifest text. */
export function makePluginRoot(manifestJson: string): string {
  const root = makeTempDir('freebuff-plugin-')
  writeFileSync(path.join(root, 'plugin.json'), manifestJson, 'utf8')
  return root
}

/** A plugin root that carries no plugin.json at all (§5.1). */
export function makeRootWithoutManifest(): string {
  return makeTempDir('freebuff-plugin-')
}

/**
 * A plugin root whose manifest carries the required fields plus the given
 * extras, so a test body states only the field it is about.
 */
export function makeManifestRoot(
  extraFields: Record<string, unknown> = {},
): string {
  return makePluginRoot(minimalManifestJson(extraFields))
}

/**
 * A plugin root whose `plugin.json` is a reparse point resolving to a valid
 * manifest outside the root. The target directory's name extends the root's
 * own, so a comparison that stopped at a path prefix would wrongly admit it:
 * §4.1.1 compares filesystem-resolved paths, not their spelling.
 */
export function makeEscapingManifestRoot(): string {
  const root = makeTempDir('freebuff-plugin-')
  const outside = `${root}-outside`
  tempDirs.push(outside)
  mkdirSync(outside)
  writeFileSync(
    path.join(outside, 'plugin.json'),
    minimalManifestJson(),
    'utf8',
  )
  symlinkSync(outside, path.join(root, 'plugin.json'), 'junction')
  return root
}

/**
 * A plugin root reached through a reparse point, with its manifest inside the
 * resolved root — the arrangement §4.1.1 permits, and the one a check that
 * resolved only the manifest would reject. That is the everyday case on a
 * platform whose temp directory is itself a symlink.
 */
export function makeReparsePointRoot(): string {
  const target = makePluginRoot(minimalManifestJson())
  const root = path.join(makeTempDir('freebuff-plugin-link-'), 'root')
  symlinkSync(target, root, 'junction')
  return root
}

/**
 * A plugin root with a valid manifest and no `skills/` directory — the
 * absence §6.2 forbids treating as an error (a plugin may ship no skills).
 */
export function makeRootWithoutSkills(): string {
  return makeManifestRoot()
}

/**
 * A plugin root whose `skills/` holds one valid native skill — a directory
 * named for the skill, containing a SKILL.md whose frontmatter name matches
 * the directory.
 */
export function makeRootWithSkill(skillName = SKILL_NAME): string {
  const root = makeManifestRoot()
  writeSkillDir(root, skillName)
  return root
}

/**
 * A plugin root whose `skills/` itself is a reparse point resolving to a
 * skills directory outside the plugin root — §4.1.1's second boundary, where
 * the fixed component location escapes.
 */
export function makeEscapingSkillsRoot(): string {
  const root = makeManifestRoot()
  const outside = `${root}-outside`
  tempDirs.push(outside)
  mkdirSync(path.join(outside, SKILLS_DIR_NAME), { recursive: true })
  writeSkillDir(outside, SKILL_NAME)
  symlinkSync(
    path.join(outside, SKILLS_DIR_NAME),
    path.join(root, SKILLS_DIR_NAME),
    'junction',
  )
  return root
}

/**
 * A plugin root where one skill resolves outside the plugin root — §4.1.1's
 * third boundary. Windows junctions cannot point at a file (probed: the
 * junction is created but every stat/read on it then throws ENOENT), so the
 * skill *directory* is the reparse point and the SKILL.md inside its target
 * is a real file — which is what makes the escape dangerous: the reader
 * would load that skill from outside the root without this walk. A sibling
 * valid skill is present, so a test can show the escape costs one skill,
 * not the component.
 */
export function makeEscapingSkillRoot(): string {
  const root = makeManifestRoot()
  writeSkillDir(root, SKILL_NAME)
  const outside = `${root}-outside`
  tempDirs.push(outside)
  writeSkillDir(outside, OTHER_SKILL_NAME)
  symlinkSync(
    path.join(outside, SKILLS_DIR_NAME, OTHER_SKILL_NAME),
    path.join(root, SKILLS_DIR_NAME, OTHER_SKILL_NAME),
    'junction',
  )
  return root
}

/** The SKILL.md text for a skill named `skillName` that the reader accepts. */
function skillFileContent(skillName: string): string {
  return [
    '---',
    `name: ${skillName}`,
    'description: A skill fixture for the plugin loader tests.',
    '---',
    '',
    'Body of the fixture skill.',
  ].join('\n')
}

/**
 * Writes one skill directory under `<root>/skills` — the directory named for
 * the skill, holding a SKILL.md whose frontmatter name matches it.
 */
function writeSkillDir(root: string, skillName: string): void {
  const skillDir = path.join(root, SKILLS_DIR_NAME, skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    path.join(skillDir, SKILL_FILE_NAME),
    skillFileContent(skillName),
    'utf8',
  )
}

/** The §5.2 minimal manifest as JSON text, with the given fields added. */
function minimalManifestJson(
  extraFields: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    $schema: CANONICAL_SCHEMA,
    name: 'minimal-plugin',
    ...extraFields,
  })
}

/** A registered temp directory the running test may fill. */
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
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
 * Asserts the skills load succeeded and returns the skill map, so tests
 * assert on skill values, never on the result's shape.
 */
export function expectSkillsOk(result: LoadSkillsResult) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result.skills
}

/**
 * Asserts the skills component type was invalidated and returns the reports,
 * so a row that also asserts on them does not need its own narrowing branch.
 * `blame` must name the § the invalidation cites, so an invalidation for the
 * wrong cause still fails the test.
 */
export function expectSkillsComponentInvalid(
  result: LoadSkillsResult,
  blame: string,
): PluginReport[] {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`expected component invalid, got ok`)
  expect(result.reason).toContain(blame)
  return result.reports
}

/**
 * Asserts the plugin does not exist (the fatal branch) and that the loader's
 * reason names the cause given by `blame` — a field for field rules, the
 * refused shape or manifest text for the §5.2 structural rules — so a
 * rejection for the wrong cause still fails the test. Returns the rejection,
 * so a row that also asserts on the reports it carries does not need its own
 * narrowing branch.
 */
export function expectManifestRejected(
  result: LoadManifestResult,
  blame: string,
): Extract<LoadManifestResult, { ok: false }> {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`expected rejection blaming ${blame}, got ok`)
  expect(result.reason).toContain(blame)
  return result
}
