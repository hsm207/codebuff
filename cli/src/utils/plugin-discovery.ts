import { readdirSync } from 'node:fs'

import type { Dirent } from 'node:fs'
import path from 'node:path'

import { loadSkillsSync } from '@codebuff/sdk'

import { loadPlugin } from '@codebuff/common/plugins/load-plugin'

import { getPluginsRoot } from './plugins-root'

import type { LoadPluginResult } from '@codebuff/common/plugins/load-plugin'
import type { MCPConfig } from '@codebuff/common/types/mcp'
import type { SkillsMap } from '@codebuff/common/types/skill'

/**
 * Overrides for tests: `readSkillsDir` reads one skills directory (the
 * SDK's sync loader in production), `pluginsRoot` is where installed
 * plugins live (default `getPluginsRoot()`).
 */
export interface PluginSkillsOptions {
  readSkillsDir?: (skillsPath: string) => SkillsMap
  pluginsRoot?: string
}

/**
 * Every plugin found under `<pluginsRoot>/*` — one level deep, no
 * recursion — loaded through the common composition. A directory without
 * a loadable manifest contributes nothing (§5.3: the manifest decides
 * whether the plugin exists), so a stray or corrupt directory can never
 * take the session down.
 */
export function loadInstalledPlugins(
  pluginsRoot: string,
  readSkillsDir?: (skillsDir: string) => SkillsMap,
): LoadPluginResult[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(pluginsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) =>
      loadPlugin(
        path.join(pluginsRoot, entry.name),
        readSkillsDir ?? (() => ({})),
      ),
    )
}

/**
 * Skills from every installed plugin, merged into one map — the value the
 * skill registry assigns over its cache after the user's and project's
 * own skills load. Plugins register last and can never shadow either
 * root: install already aborted on any name conflict. An unreadable
 * plugins root contributes an empty map; a plugin with no skills, too.
 */
export function pluginSkills(options: PluginSkillsOptions = {}): SkillsMap {
  const readSkillsDir = options.readSkillsDir ?? sdkReadSkillsDir
  const merged: SkillsMap = {}

  for (const result of loadInstalledPlugins(
    options.pluginsRoot ?? getPluginsRoot(),
    readSkillsDir,
  )) {
    if (result.ok) {
      Object.assign(merged, result.plugin.skills)
    }
  }
  return merged
}

/**
 * The production reader: the SDK's sync loader pointed at one directory.
 */
const sdkReadSkillsDir = (skillsPath: string): SkillsMap =>
  loadSkillsSync({ skillsPath, verbose: false })

/**
 * MCP servers from every installed plugin, merged into one map — the
 * value the agent registry assigns over its server cache after the
 * user's own mcp.json loads. An agent plugin's MCP servers cannot shadow
 * one of the user's: install aborted on any name conflict. The map holds
 * the same freebuff shapes the user's own mcp.json parses into, so the
 * session cannot tell an agent plugin's MCP server from one the user
 * wrote themselves. An unreadable
 * plugins root contributes an empty map; a plugin with no servers, too.
 */
export function pluginMcpServers(
  options: { pluginsRoot?: string } = {},
): Record<string, MCPConfig> {
  const merged: Record<string, MCPConfig> = {}

  for (const result of loadInstalledPlugins(
    options.pluginsRoot ?? getPluginsRoot(),
  )) {
    if (result.ok) {
      Object.assign(merged, result.plugin.mcpServers)
    }
  }
  return merged
}
