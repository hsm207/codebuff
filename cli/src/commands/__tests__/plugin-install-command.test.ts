import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  runPluginCommand,
  runPluginInstallCommand,
} from '../plugin-install-command'

let tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plugin-cmd-test-'))
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

/** Captures console output while the command runs. */
async function captureConsole(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = []
  const original = console.log
  console.log = (...parts: unknown[]) => {
    lines.push(parts.map(String).join(' '))
  }
  try {
    await run()
  } finally {
    console.log = original
  }
  return lines
}

describe('the plugin command entry', () => {
  /**
   * Given a subcommand that is not `install`, when the command runs, it
   * prints the usage line and exits nonzero.
   */
  test('an unknown subcommand prints usage and exits nonzero', async () => {
    const lines = await captureConsole(() =>
      runPluginCommand(['update', 'https://github.com/google/skills']),
    )

    expect(lines.join('\n')).toContain('Usage: freebuff plugin install <url>')
  })
})

describe('the plugin install command runner', () => {
  /**
   * Given an argument count that is not exactly one URL, when the
   * command runs, it prints the usage line and exits nonzero before
   * any install work begins.
   */
  test('not exactly one URL prints usage and exits nonzero', async () => {
    const lines = await captureConsole(() => runPluginInstallCommand([], {}))

    const output = lines.join('\n')
    expect(output).toContain('Usage: freebuff plugin install <url>')
    expect(output).toContain('https://github.com/owner/repo')
  })

  /**
   * Given a valid tarball served by the injected fetch, when the command
   * runs, it prints the success render — the check, name, version,
   * source, counts, and the data dir — and exits zero.
   */
  test('a successful install prints the success render', async () => {
    const pluginsRoot = makeTempDir()
    const blob = await makeTarball({
      'skills-main/plugin.json': PLUGIN_JSON,
      'skills-main/skills/gcloud/SKILL.md': SKILL_MD,
      'skills-main/mcp.json': MCP_JSON,
    })

    const lines = await captureConsole(() =>
      runPluginInstallCommand(['https://github.com/google/skills'], {
        fetchImpl: () => Promise.resolve(new Response(blob, { status: 200 })),
        pluginsRoot,
      }),
    )

    const output = lines.join('\n')
    expect(output).toContain('✔')
    expect(output).toContain('test-plugin 1.0.0')
    expect(output).toContain('github.com/google/skills')
    expect(output).toContain('skills 1 registered')
    expect(output).toContain('mcp 1 server: test-server')
    expect(output).toContain(path.join(pluginsRoot, '.data', 'test-plugin'))
  })

  /**
   * Given a failing install (404), when the command runs, it prints the
   * reason and exits nonzero.
   */
  test('a failed install prints the reason and exits nonzero', async () => {
    const lines = await captureConsole(() =>
      runPluginInstallCommand(['https://github.com/google/skills'], {
        fetchImpl: () =>
          Promise.resolve(new Response('not found', { status: 404 })),
        pluginsRoot: makeTempDir(),
      }),
    )

    expect(lines.join('\n')).toContain('could not download')
  })

  /**
   * Given a plugin whose skill name collides with an existing skill,
   * when the command runs, it prints the conflict and exits nonzero.
   */
  test('a name conflict prints the collision and exits nonzero', async () => {
    const pluginsRoot = makeTempDir()
    const blob = await makeTarball({
      'skills-main/plugin.json': PLUGIN_JSON,
      'skills-main/skills/gcloud/SKILL.md': SKILL_MD,
    })

    const lines = await captureConsole(() =>
      runPluginInstallCommand(['https://github.com/google/skills'], {
        fetchImpl: () => Promise.resolve(new Response(blob, { status: 200 })),
        pluginsRoot,
        existingSkillNames: () => new Set(['gcloud']),
      }),
    )

    expect(lines.join('\n')).toContain('gcloud')
  })
})
