import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { pluginSkills } from '../plugin-discovery'

import {
  cleanUpPluginTestDirs,
  makeTempDir,
  PLUGIN_JSON,
  SKILL_MD,
} from '../../__tests__/helpers/plugin-fixtures'
import { noSkillsReader } from './plugin-test-readers'

import type { SkillsMap } from '@codebuff/common/types/skill'

afterEach(cleanUpPluginTestDirs)

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
    const pluginsRoot = makeTempDir('plugin-registry-test-')
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
   * Given a valid plugin and the no-op reader, when the walk runs with no
   * skills read, the plugin still loads and contributes no skills
   */
  test('a plugin loads with no skills read when the reader reads none', () => {
    const pluginsRoot = makeTempDir('plugin-registry-test-')
    writePluginRoot(path.join(pluginsRoot, 'test-plugin'))

    const readDirs: string[] = []
    const readSkillsDir = (skillsPath: string): SkillsMap => {
      readDirs.push(skillsPath)
      return noSkillsReader(skillsPath)
    }

    const skills = pluginSkills({ readSkillsDir, pluginsRoot })

    expect(skills).toEqual({})
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
      pluginsRoot: path.join(
        makeTempDir('plugin-registry-test-'),
        'does-not-exist',
      ),
    })

    expect(skills).toEqual({})
    expect(readDirs).toEqual([])
  })

  /**
   * Given a plugins root holding `.data` (client-managed state, here
   * misused by parking a *valid* plugin directly inside it) plus a
   * directory without a manifest and one with an invalid manifest, when
   * the walk runs, none of them are read and the valid neighbor still
   * loads (§5.3: the manifest decides existence).
   */
  test('non-plugin and invalid entries contribute nothing', () => {
    const pluginsRoot = makeTempDir('plugin-registry-test-')
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
