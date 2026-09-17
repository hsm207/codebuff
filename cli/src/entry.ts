#!/usr/bin/env bun

//[toolbox:cli.warningNet]
import { toolboxWarningNet } from '@codebuff/common/debug-toolbox/tracer'
toolboxWarningNet()

import {
  isTerminalCommandBrokerInvocation,
  serveTerminalCommandBroker,
} from './utils/terminal-command-broker'

if (isTerminalCommandBrokerInvocation(process.argv)) {
  await serveTerminalCommandBroker()
} else {
  await import('./index')
}
