import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { mcpConfigSchema } from '@codebuff/common/types/mcp'

import { pluginMcpServers } from '../plugin-discovery'

let tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plugin-mcp-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

function writePluginRoot(pluginDir: string, mcpServers: object): void {
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'test-plugin',
      version: '1.0.0',
      description: 'a test plugin',
    }),
  )
  writeFileSync(
    path.join(pluginDir, 'mcp.json'),
    JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers,
    }),
  )
}

describe('plugin MCP servers for the session server map', () => {
  /**
   * Given an installed plugin declaring a spec streamable-http server,
   * when the plugin half of the server map loads, the server comes back
   * under its own name in the freebuff shape the session's server
   * schema accepts, with the plugin-only fields gone.
   */
  test("an agent plugin's MCP server arrives in the freebuff shape", () => {
    const pluginsRoot = makeTempDir()
    writePluginRoot(pluginsRoot + '/test-plugin', {
      'developer-knowledge': {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
      },
    })

    const servers = pluginMcpServers({ pluginsRoot })

    const parsed = mcpConfigSchema.safeParse(servers['developer-knowledge'])
    expect(parsed.success).toBe(true)
    expect(servers['developer-knowledge']).toEqual({
      type: 'http',
      url: 'https://example.com/mcp',
      params: {},
      headers: {},
    })
  })

  /**
   * Given two installed plugins each declaring a server, when the plugin
   * half of the server map loads, both come back in one map.
   */
  test('servers from several plugins merge into one map', () => {
    const pluginsRoot = makeTempDir()
    writePluginRoot(pluginsRoot + '/plugin-a', {
      'server-a': { type: 'streamable-http', url: 'https://a.example/mcp' },
    })
    writePluginRoot(pluginsRoot + '/plugin-b', {
      'server-b': {
        type: 'streamable-http',
        url: 'https://b.example/mcp',
      },
    })

    const servers = pluginMcpServers({ pluginsRoot })

    expect(Object.keys(servers).sort()).toEqual(['server-a', 'server-b'])
  })

  /**
   * Given no plugins root at all (a fresh machine), when the plugin half
   * of the server map loads, the result is empty — absence contributes
   * nothing.
   */
  test('a missing plugins root contributes nothing', () => {
    const servers = pluginMcpServers({
      pluginsRoot: path.join(makeTempDir(), 'does-not-exist'),
    })

    expect(servers).toEqual({})
  })
})
