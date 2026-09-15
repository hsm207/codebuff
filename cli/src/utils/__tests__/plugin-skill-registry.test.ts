import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { pluginSkills } from '../plugin-discovery'

import type { SkillsMap } from '@codebuff/common/types/skill'

let tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plugin-registry-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

const PLUGIN_JSON = JSON.stringify({
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'test-plugin',
  version: '1.0.0',
  description: 'a test plugin',
})

const SKILL_MD = [
  '---',
  'name: gcloud',
  'description: A plugin skill.',
  '---',
  '',
  'Skill body.',
  '',
].join('\n')

/**
 * Writes one plugin root: manifest plus a single skill directory. The
 * manifest name defaults to `test-plugin`; pass another to distinguish
 * two roots in one plugins dir.
 */
function writePluginRoot(pluginDir: string, name = 'test-plugin'): void {
  mkdirSync(path.join(pluginDir, 'skills', 'gcloud'), { recursive: true })
  writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    PLUGIN_JSON.replace('"test-plugin"', `"${name}"`),
  )
  writeFileSync(path.join(pluginDir, 'skills', 'gcloud', 'SKILL.md'), SKILL_MD)
}

/** The SDK's own shape, so the fake reader answers with real definitions. */
function skillNamed(name: string, fromDir: string): SkillsMap {
  return {
    [name]: {
      name,
      description: `A plugin skill. (${fromDir})`,
      content: SKILL_MD,
      filePath: path.join(fromDir, name, 'SKILL.md'),
    },
  }
}

describe('plugin skills for the session registry', () => {
  /**
   * Given an installed plugin under the plugins root, when the plugin
   * half of the registry loads, the plugin's skills come back and the
   * reader was handed exactly `<pluginRoot>/skills` — the read-in-place
   * seam, with the reader injected so no test touches the real home.
   */
  test('a plugin skill comes back via its skills dir', () => {
    const pluginsRoot = makeTempDir()
    writePluginRoot(path.join(pluginsRoot, 'test-plugin'))

    const readDirs: string[] = []
    const readSkillsDir = (skillsPath: string): SkillsMap => {
      readDirs.push(skillsPath)
      return skillNamed('gcloud', skillsPath)
    }

    const skills = pluginSkills({ readSkillsDir, pluginsRoot })

    expect(readDirs).toEqual([path.join(pluginsRoot, 'test-plugin', 'skills')])
    expect(skills['gcloud']?.description).toContain('A plugin skill')
  })

  /**
   * Given no plugins root at all (a fresh machine), when the plugin half
   * of the registry loads, the result is empty and the reader is never
   * asked — absence contributes nothing.
   */
  test('a missing plugins root contributes nothing', () => {
    const readDirs: string[] = []
    const readSkillsDir = (skillsPath: string): SkillsMap => {
      readDirs.push(skillsPath)
      return {}
    }

    const skills = pluginSkills({
      readSkillsDir,
      pluginsRoot: path.join(makeTempDir(), 'does-not-exist'),
    })

    expect(skills).toEqual({})
    expect(readDirs).toEqual([])
  })

  /**
   * Given a plugins root holding `.data` — client-managed state, here
   * misused by someone parking a *valid* plugin directly inside it — plus
   * a directory without a manifest and one with an invalid manifest, when
   * the plugin half of the registry loads, none of them are read, and the
   * valid neighbor still loads (§5.3: the manifest decides existence).
   * The dot in `.data` is what keeps it out: §5.5 requires plugin names
   * to start alphanumeric, so no real plugin root can be a dot-directory.
   */
  test('non-plugin and invalid entries contribute nothing', () => {
    const pluginsRoot = makeTempDir()
    writePluginRoot(path.join(pluginsRoot, 'test-plugin'))
    writePluginRoot(path.join(pluginsRoot, '.data'), 'decoy-plugin')
    mkdirSync(path.join(pluginsRoot, 'not-a-plugin'), { recursive: true })
    mkdirSync(path.join(pluginsRoot, 'broken'), { recursive: true })
    writeFileSync(
      path.join(pluginsRoot, 'broken', 'plugin.json'),
      '{"name": 42}',
    )

    const readDirs: string[] = []
    const readSkillsDir = (skillsPath: string): SkillsMap => {
      readDirs.push(skillsPath)
      return {}
    }

    const skills = pluginSkills({ readSkillsDir, pluginsRoot })

    expect(readDirs).toEqual([path.join(pluginsRoot, 'test-plugin', 'skills')])
    expect(skills).toEqual({})
  })
})
