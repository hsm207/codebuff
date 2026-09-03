import { getErrorObject } from '@codebuff/common/util/error'
import { traceDebug, zodShapeProbe } from '@codebuff/common/util/trace-debug'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import { MCP_TOOL_SEPARATOR } from './mcp-constants'

import type { AgentTemplate } from './templates/types'
import type { RequestMcpToolDataFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { OptionalFields } from '@codebuff/common/types/function-params'
import type {
  CustomToolDefinitions,
  ProjectFileContext,
} from '@codebuff/common/util/file'

export async function getMCPToolData(
  params: OptionalFields<
    {
      toolNames: AgentTemplate['toolNames']
      mcpServers: AgentTemplate['mcpServers']
      writeTo: ProjectFileContext['customToolDefinitions']
      requestMcpToolData: RequestMcpToolDataFn
      logger?: Logger
    },
    'writeTo'
  >,
): Promise<CustomToolDefinitions> {
  const withDefaults = { writeTo: {}, ...params }
  const { toolNames, mcpServers, writeTo, requestMcpToolData, logger } =
    withDefaults

  // User-facing toolNames use '/' as separator (e.g., 'supabase/list_tables')
  // but internally we use MCP_TOOL_SEPARATOR ('__') for LLM API compatibility
  const USER_INPUT_SEPARATOR = '/'
  const requestedToolsByMcp: Record<string, string[] | undefined> = {}
  for (const t of toolNames) {
    if (!t.includes(USER_INPUT_SEPARATOR)) {
      continue
    }
    const [mcpName, ...remaining] = t.split(USER_INPUT_SEPARATOR)
    const toolName = remaining.join(USER_INPUT_SEPARATOR)
    if (!requestedToolsByMcp[mcpName]) {
      requestedToolsByMcp[mcpName] = []
    }
    requestedToolsByMcp[mcpName].push(toolName)
  }

  const promises: Promise<any>[] = []
  for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) {
    promises.push(
      (async () => {
        try {
          const mcpData = await requestMcpToolData({
            mcpConfig,
            toolNames: requestedToolsByMcp[mcpName] ?? null,
          })

          for (const { name, description, inputSchema } of mcpData) {
            traceDebug('mcp_tool_schema_in', {
              server: mcpName,
              tool: name,
              schemaType: typeof inputSchema,
              props: Object.keys((inputSchema as any)?.properties ?? {}),
              raw: JSON.stringify(inputSchema).slice(0, 300),
            })
            // The conversion doubles as a health probe: a schema the
            // converter cannot handle gets the server's tools disabled via the
            // catch below instead of exploding later mid-turn.
            let converted: any
            try {
              converted = convertJsonSchemaToZod(inputSchema as any) as any
            } catch (convErr) {
              traceDebug('mcp_convert_threw', {
                server: mcpName,
                tool: name,
                error: String(convErr),
              })
              throw convErr
            }
            traceDebug('mcp_tool_schema_out', {
              server: mcpName,
              tool: name,
              shape: zodShapeProbe(converted),
            })
            // Store the raw JSON Schema from the server, NOT the converted Zod
            // schema. Tool definitions are persisted in run state / session
            // state and must stay JSON-serializable; Zod instances are cyclic
            // and make any JSON.stringify over that state detonate. Consumers
            // convert at point of use (ensureZodSchema / toTokenCountInputSchema).
            writeTo[mcpName + MCP_TOOL_SEPARATOR + name] = {
              inputSchema: inputSchema as {},
              endsAgentStep: true,
              description,
            }
          }
        } catch (error) {
          // A failed MCP server (e.g. a stdio server that can't be spawned)
          // should disable just its own tools, not abort the whole turn. The
          // error from the client carries the actionable detail (command +
          // captured stderr).
          logger?.warn(
            { error: getErrorObject(error), mcpServer: mcpName },
            `Failed to load tools from MCP server "${mcpName}"; its tools will be unavailable for this step.`,
          )
        }
      })(),
    )
  }
  await Promise.all(promises)

  return writeTo
}
