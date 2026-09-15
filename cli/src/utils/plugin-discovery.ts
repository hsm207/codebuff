import { readdirSync } from 'node:fs'

import type { Dirent } from 'node:fs'
import path from 'node:path'

import { loadSkillsSync } from '@codebuff/sdk'

import { loadPlugin } from '@codebuff/common/plugins/load-plugin'

import { getPluginsRoot } from './plugins-root'

import type {
  InstalledPlugin,
  LoadPluginResult,
} from '@codebuff/common/plugins/load-plugin'
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
 * The loadable plugins under the root, in name order, with the refused
 * directories dropped — the unwrapping the two walks below would
 * otherwise each repeat. Without a reader the composition reads no
 * skills, which is what the MCP walk wants and the reason `pluginSkills`
 * must resolve its reader before calling here.
 */
function loadedPlugins(
  pluginsRoot: string,
  readSkillsDir?: (skillsDir: string) => SkillsMap,
): InstalledPlugin[] {
  return loadInstalledPlugins(pluginsRoot, readSkillsDir).flatMap((result) =>
    result.ok ? [result.plugin] : [],
  )
}

/**
 * Skills from every installed plugin, merged into one map — the value the
 * skill registry assigns over its cache after the user's and project's
 * own skills load. The registry's join is plugin-last, so a plugin skill
 * wins over a same-name skill added to the user's roots after install
 * (install's conflict check only saw names at install time). An
 * unreadable plugins root contributes an empty map; a plugin with no
 * skills, too.
 */
export function pluginSkills(options: PluginSkillsOptions = {}): SkillsMap {
  const plugins = loadedPlugins(
    options.pluginsRoot ?? getPluginsRoot(),
    options.readSkillsDir ?? sdkReadSkillsDir,
  )

  return Object.assign({}, ...plugins.map((plugin) => plugin.skills))
}

/**
 * The production reader: the SDK's sync loader pointed at one directory.
 */
const sdkReadSkillsDir = (skillsPath: string): SkillsMap =>
  loadSkillsSync({ skillsPath, verbose: false })

/**
 * MCP servers from every installed plugin, merged into one map — the
 * value the agent registry assigns over its server cache after the
 * user's own mcp.json loads. The registry's join is plugin-last, so a
 * plugin server wins over a same-name server added to the user's own
 * mcp.json after install (install's conflict check only saw names at
 * install time). The map holds the same freebuff shapes the user's own
 * mcp.json parses into, so the session cannot tell an agent plugin's
 * MCP server from one the user wrote themselves. An unreadable plugins
 * root contributes an empty map; a plugin with no servers, too.
 */
export function pluginMcpServers(
  options: { pluginsRoot?: string } = {},
): Record<string, MCPConfig> {
  const plugins = loadedPlugins(options.pluginsRoot ?? getPluginsRoot())

  return Object.assign({}, ...plugins.map((plugin) => plugin.mcpServers))
}
