import { green, red, yellow } from 'picocolors'

import {
  handlePluginInstall,
  type PluginInstallOptions,
} from './plugin-install'
import { loadMCPConfigSync, loadSkillsSync } from '@codebuff/sdk'

const USAGE = 'Usage: freebuff plugin install <url>'

/**
 * The names already present in the user's own skill and MCP roots — the
 * same roots the session reads at startup, so install cannot disagree
 * with the session about what a name conflict is.
 */
function userSkillNames(): Set<string> {
  try {
    return new Set(
      Object.keys(
        loadSkillsSync({
          cwd: process.cwd(),
          verbose: false,
          includeHomeSkills: true,
        }),
      ),
    )
  } catch {
    return new Set()
  }
}

function userMcpServerNames(): Set<string> {
  try {
    return new Set(
      Object.keys(loadMCPConfigSync({ verbose: false }).mcpServers),
    )
  } catch {
    return new Set()
  }
}

/**
 * The `freebuff plugin` command entry: everything after `plugin` on the
 * command line. The only subcommand is `install`; anything else prints
 * the usage line and exits nonzero.
 */
export async function runPluginCommand(rawArgs: string[]): Promise<void> {
  if (rawArgs[0] !== 'install') {
    console.log(yellow(USAGE))
    process.exitCode = 1
    return
  }
  await runPluginInstallCommand(rawArgs.slice(1))
}

/**
 * The `freebuff plugin install <url>` command: validates the arguments,
 * runs the install pipeline with the user's real roots — the name sets
 * the conflict check runs against come from the same skill and MCP roots
 * the session reads — and prints the outcome. The URL comes from the
 * dispatch site, which forwards everything after `install` on the
 * command line.
 */
export async function runPluginInstallCommand(
  args: string[],
  options: PluginInstallOptions = {},
): Promise<void> {
  if (args.length !== 1) {
    console.log(
      yellow(
        `${USAGE}\n\nExpected the plugin URL, e.g. https://github.com/owner/repo/path/to/plugin.`,
      ),
    )
    process.exitCode = 1
    return
  }

  const result = await handlePluginInstall(args[0]!, {
    ...options,
    existingSkillNames: options.existingSkillNames ?? userSkillNames,
    existingMcpServerNames:
      options.existingMcpServerNames ?? userMcpServerNames,
  })

  if (!result.success) {
    console.log(red(`✗ ${result.error}`))
    process.exitCode = 1
    return
  }

  console.log(
    green(
      `✔ ${result.pluginName} ${result.version} ← ${args[0]!.replace(/^https:\/\//, '')}`,
    ),
  )
  console.log(green(`  skills ${result.skillsCount} registered`))
  const servers = result.mcpServers ?? []
  if (servers.length > 0) {
    console.log(
      green(
        `  mcp ${servers.length} server${servers.length === 1 ? '' : 's'}: ${servers.join(', ')}`,
      ),
    )
  }
  if (result.dataDir) {
    console.log(green(`  data ${result.dataDir} (created)`))
  }
  if ((result.reports?.length ?? 0) > 0) {
    for (const report of result.reports ?? []) {
      console.log(yellow(`  ⚠ [${report.section}] ${report.message}`))
    }
  }
}
