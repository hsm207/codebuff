import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { handlePluginInstall } from '../plugin-install'

import type { PluginInstallOptions } from '../plugin-install'

let tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plugin-install-test-'))
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
  'description: A test skill.',
  '---',
  '',
  'Skill body.',
  '',
].join('\n')

const MCP_JSON = JSON.stringify({
  $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  mcpServers: {
    'test-server': { type: 'streamable-http', url: 'https://example.com/mcp' },
  },
})

/** A gzipped tarball shaped like a codeload download: <repo>-<ref>/... */
async function makeTarball(entries: Record<string, string>): Promise<Blob> {
  const tarPath = path.join(makeTempDir(), 'bundle.tar.gz')
  await Bun.Archive.write(tarPath, entries, { compress: 'gzip' })
  return new Blob([readFileSync(tarPath)])
}

function fetchReturning(blob: Blob): PluginInstallOptions['fetchImpl'] {
  return () => Promise.resolve(new Response(blob, { status: 200 }))
}

describe('plugin install (T32 wiring / T33 aborts)', () => {
  /**
   * Given a fetched tarball carrying a valid plugin, when installed, the
   * plugin root lands under the plugins root named after the manifest,
   * the data dir is provisioned, and the result carries what the render
   * needs — name, version, counts.
   */
  test('installs a valid plugin tarball', async () => {
    const pluginsRoot = makeTempDir()
    const blob = await makeTarball({
      'skills-main/plugin.json': PLUGIN_JSON,
      'skills-main/skills/gcloud/SKILL.md': SKILL_MD,
      'skills-main/mcp.json': MCP_JSON,
    })

    const result = await handlePluginInstall(
      'https://github.com/google/skills',
      {
        fetchImpl: fetchReturning(blob),
        pluginsRoot,
        existingSkillNames: () => new Set(),
        existingMcpServerNames: () => new Set(),
      },
    )

    if (!result.success) throw new Error(`expected success: ${result.error}`)
    expect(result.pluginName).toBe('test-plugin')
    expect(result.version).toBe('1.0.0')
    expect(result.skillsCount).toBe(1)
    expect(result.mcpServers).toEqual(['test-server'])
    expect(
      existsSync(path.join(pluginsRoot, 'test-plugin', 'plugin.json')),
    ).toBe(true)
    expect(existsSync(path.join(pluginsRoot, '.data', 'test-plugin'))).toBe(
      true,
    )
  })

  /**
   * Given a 404 from the archive endpoint, when installed, the command
   * fails with the reason and nothing is written under the plugins root.
   */
  test('a failed fetch aborts clean', async () => {
    const pluginsRoot = makeTempDir()
    const fetchFailing: PluginInstallOptions['fetchImpl'] = () =>
      Promise.resolve(new Response('not found', { status: 404 }))

    const result = await handlePluginInstall(
      'https://github.com/google/skills',
      { fetchImpl: fetchFailing, pluginsRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(readdirSync(pluginsRoot)).toEqual([])
  })

  /**
   * Given a tarball whose subpath holds no plugin.json, when installed,
   * the load fails — the manifest alone decides whether the plugin exists
   * (§5.3) — and nothing is written.
   */
  test('a missing manifest aborts clean', async () => {
    const pluginsRoot = makeTempDir()
    const blob = await makeTarball({
      'skills-main/README.md': 'no plugin here',
    })

    const result = await handlePluginInstall(
      'https://github.com/google/skills/tree/main/nowhere',
      { fetchImpl: fetchReturning(blob), pluginsRoot },
    )

    expect(result.success).toBe(false)
    expect(readdirSync(pluginsRoot)).toEqual([])
  })

  /**
   * Given a tarball whose manifest is invalid, when installed, the load
   * fails with the manifest reason and nothing is written.
   */
  test('an invalid manifest aborts clean', async () => {
    const pluginsRoot = makeTempDir()
    const blob = await makeTarball({
      'skills-main/plugin.json': '{"name": 42}',
    })

    const result = await handlePluginInstall(
      'https://github.com/google/skills',
      { fetchImpl: fetchReturning(blob), pluginsRoot },
    )

    expect(result.success).toBe(false)
    expect(readdirSync(pluginsRoot)).toEqual([])
  })

  /**
   * Given a plugin whose name is already installed, when installed, the
   * conflict aborts before anything moves — install never shadows (human
   * ruling) — and the existing install is untouched.
   */
  test('an already-installed name aborts clean', async () => {
    const pluginsRoot = makeTempDir()
    const existing = path.join(pluginsRoot, 'test-plugin')
    await Bun.write(path.join(existing, 'plugin.json'), PLUGIN_JSON)

    const blob = await makeTarball({
      'skills-main/plugin.json': PLUGIN_JSON,
    })

    const result = await handlePluginInstall(
      'https://github.com/google/skills',
      { fetchImpl: fetchReturning(blob), pluginsRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('already installed')
    expect(existsSync(path.join(existing, 'plugin.json'))).toBe(true)
  })

  /**
   * Given a plugin whose skill name collides with a skill in the user's
   * roots, when installed, the conflict aborts with the name and nothing
   * is written.
   */
  test('a colliding skill name aborts clean', async () => {
    const pluginsRoot = makeTempDir()

    const blob = await makeTarball({
      'skills-main/plugin.json': PLUGIN_JSON,
      'skills-main/skills/gcloud/SKILL.md': SKILL_MD,
    })

    const result = await handlePluginInstall(
      'https://github.com/google/skills',
      {
        fetchImpl: fetchReturning(blob),
        pluginsRoot,
        existingSkillNames: () => new Set(['gcloud']),
      },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('gcloud')
    expect(existsSync(path.join(pluginsRoot, 'test-plugin'))).toBe(false)
  })

  /**
   * Given a plugin whose server name collides with the user's mcp.json,
   * when installed, the conflict aborts with the name and nothing is
   * written.
   */
  test('a colliding MCP server name aborts clean', async () => {
    const pluginsRoot = makeTempDir()

    const blob = await makeTarball({
      'skills-main/plugin.json': PLUGIN_JSON,
      'skills-main/mcp.json': MCP_JSON,
    })

    const result = await handlePluginInstall(
      'https://github.com/google/skills',
      {
        fetchImpl: fetchReturning(blob),
        pluginsRoot,
        existingMcpServerNames: () => new Set(['test-server']),
      },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('test-server')
    expect(existsSync(path.join(pluginsRoot, 'test-plugin'))).toBe(false)
  })
})
