#!/usr/bin/env node
// debug-toolbox triage driver: raw MCP-over-stdio control, independent of the
// Freebuff client. NOT a workaround for anything - it is the "is it the server
// or our client?" fork-in-the-road tool.
//
// When an MCP tool misbehaves inside Freebuff, run this FIRST:
//   1. probe the server directly (does tools/list even work?)
//   2. call the suspect tool with known-good arguments over raw stdio
//   - if this driver shows clean results, the server is innocent and the bug
//     lives in the Freebuff client (mcp/client.ts, ingestion, prompt-build)
//   - if this driver also fails, capture that output - it is upstream evidence
//
// Usage:
//   MCP_CMD=npx MCP_ARGS="-y @modelcontextprotocol/server-everything" \
//     node common/src/debug-toolbox/mcp-drive.mjs probe
//   TOOL_TEST='{"name":"get_sum","args":{"a":40,"b":2}}' ... mcp-drive.mjs probe
//
// Defaults to the chrome-devtools-mcp server (the one this session debugged).
import { spawn } from 'node:child_process';

const MODE = process.argv[2] || 'probe';
const SERVER_CMD = process.env.MCP_CMD || 'npx';
const SERVER_ARGS = process.env.MCP_ARGS
  ? process.env.MCP_ARGS.split(' ')
  : ['-y', 'chrome-devtools-mcp@latest'];

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

let nextId = 1;
const pending = new Map();
let child = null;
let buffer = '';
let stderrTail = '';

function send(method, params, timeoutMs = 60_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout (${timeoutMs}ms) waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function handleLine(line) {
  const s = line.trim();
  if (!s) return;
  let msg;
  try {
    msg = JSON.parse(s);
  } catch {
    return; // non-JSON stdout line; ignore
  }
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
    const p = pending.get(msg.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`server error: ${msg.error.message || JSON.stringify(msg.error)}`));
      else p.resolve(msg.result);
    }
  }
}

async function start() {
  log(`spawning: ${SERVER_CMD} ${SERVER_ARGS.join(' ')}`);
  child = spawn(SERVER_CMD, SERVER_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32', // npx is a .cmd shim on Windows
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      handleLine(line);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c) => {
    stderrTail = (stderrTail + c).slice(-4000);
  });
  child.on('exit', (code) => log(`!! server exited (code=${code})`));

  log('initialize...');
  const init = await send(
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'debug-toolbox-driver', version: '1.0.0' },
    },
    90_000,
  );
  log('initialize OK; server:', init?.serverInfo?.name, init?.serverInfo?.version);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
}

async function probe() {
  await start();
  const tools = await send('tools/list', {}, 30_000);
  const list = tools?.tools ?? [];
  log(`tools/list OK - ${list.length} tools`);
  for (const t of list) {
    const params = Object.keys(t.inputSchema?.properties ?? {}).join(', ');
    console.log(`- ${t.name}(${params})`);
  }

  // Optional call with real arguments: TOOL_TEST='{"name":"x","args":{...}}'
  if (process.env.TOOL_TEST) {
    const { name, args } = JSON.parse(process.env.TOOL_TEST);
    log(`tools/call ${name} ${JSON.stringify(args)}`);
    const res = await send('tools/call', { name, arguments: args }, 60_000);
    const content = res?.content ?? [];
    for (const c of content) {
      if (c.type === 'text') console.log('text:', c.text?.slice(0, 400));
      else if (c.type === 'resource')
        console.log('resource:', JSON.stringify({
          uri: c.resource?.uri,
          mimeType: c.resource?.mimeType,
          hasText: 'text' in (c.resource ?? {}),
          hasBlob: 'blob' in (c.resource ?? {}),
        }));
      else console.log(c.type, JSON.stringify(c).slice(0, 200));
    }
    log('isError:', Boolean(res?.isError));
  }
}

(async () => {
  try {
    if (MODE === 'probe') await probe();
    else throw new Error(`unknown mode '${MODE}' (try: probe)`);
    log('DONE');
  } catch (e) {
    console.error('DRIVER ERROR:', e?.message || e);
    if (stderrTail) console.error('--- server stderr tail ---\n' + stderrTail);
    process.exitCode = 1;
  } finally {
    try { child?.stdin?.end(); } catch {}
    try { child?.kill(); } catch {}
    setTimeout(() => process.exit(process.exitCode || 0), 500).unref();
  }
})();
