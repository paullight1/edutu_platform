#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BROWSER_BRIDGE_VERSION = 1;
const MCP_SERVER_INFO = {
  name: 'labx-browser-bridge',
  version: await resolveSidecarVersion(),
};
const MCP_PROTOCOL_VERSION = '2024-11-05';

async function resolveSidecarVersion() {
  const envVersion = process.env.LABX_VERSION?.trim();
  if (envVersion) {
    return envVersion;
  }

  for (const candidate of packageJsonCandidates()) {
    try {
      const parsed = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (typeof parsed.version === 'string' && parsed.version.trim()) {
        return parsed.version.trim();
      }
    } catch {
      // The packaged app does not necessarily include package.json.
    }
  }

  return '0.0.0-dev';
}

function packageJsonCandidates() {
  const candidates = [];
  let current = path.dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 5; depth += 1) {
    candidates.push(path.join(current, 'package.json'));
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  if (process.cwd()) {
    candidates.push(path.join(process.cwd(), 'package.json'));
  }

  return [...new Set(candidates)];
}

function usage() {
  return [
    'LabX Browser Sidecar',
    '',
    'Commands:',
    '  help',
    '  generate --input actions.json [--name "Recorded flow"]',
    '  snapshot --url http://localhost:5173 [--selector body]',
    '  mcp --workspace /path/to/project',
    '',
    'The snapshot command requires Playwright browsers. Run:',
    '  npx playwright install chromium',
  ].join('\n');
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function resolveWorkspace(workspace) {
  const trimmed = (workspace ?? '').trim();
  if (!trimmed) {
    throw new Error('Missing --workspace /path/to/project');
  }

  return path.resolve(trimmed);
}

function browserBridgePaths(workspace) {
  const root = path.join(workspace, '.labx', 'browser-bridge');
  return {
    workspace,
    root,
    state: path.join(root, 'state.json'),
    commands: path.join(root, 'commands'),
    results: path.join(root, 'results'),
    tools: path.join(workspace, '.labx', 'tools'),
    script: path.join(workspace, '.labx', 'tools', 'browser-sidecar.mjs'),
  };
}

function bridgeCommandFileName(id) {
  const value = String(id ?? '').trim();
  if (!value || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error('Browser bridge command IDs must be simple file names.');
  }

  return `${value}.json`;
}

function browserBridgeCommandFile(paths, id) {
  return path.join(paths.commands, bridgeCommandFileName(id));
}

function browserBridgeResultFile(paths, id) {
  return path.join(paths.results, bridgeCommandFileName(id));
}

async function ensureBrowserBridge(paths) {
  await fs.mkdir(paths.tools, { recursive: true });
  await fs.mkdir(paths.commands, { recursive: true });
  await fs.mkdir(paths.results, { recursive: true });
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`,
  );
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rm(filePath, { force: true }).catch(() => undefined);
  await fs.rename(tempPath, filePath);
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function waitForFile(filePath, timeoutMs = 30_000, pollMs = 150) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const parsed = await readJsonFile(filePath);
    if (parsed) {
      return parsed;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for browser bridge result: ${path.basename(filePath)}`);
}

async function writeBrowserCommandAndAwait(paths, command) {
  await ensureBrowserBridge(paths);
  const id = command.id || `browser-${randomUUID()}`;
  const createdAt = command.createdAt || new Date().toISOString();
  const payload = {
    version: BROWSER_BRIDGE_VERSION,
    id,
    kind: command.kind,
    createdAt,
    source: command.source ?? 'mcp',
    target: command.target ?? null,
    url: command.url ?? null,
    mode: command.mode ?? null,
  };

  await writeJsonAtomic(browserBridgeCommandFile(paths, id), payload);
  const result = normalizeBrowserBridgeResultRecord(await waitForFile(browserBridgeResultFile(paths, id)));
  if (!result || result.id !== id) {
    throw new Error(`Browser bridge returned an invalid result for ${id}`);
  }

  if (!result.ok) {
    throw new Error(result.message || 'Browser bridge command failed.');
  }

  return result;
}

function normalizeAction(action) {
  if (action.kind) return action;

  const kind = action.type === 'annotation' || action.type === 'note'
    ? 'annotate'
    : action.type;

  return {
    id: action.id,
    kind,
    url: action.url,
    selector: action.selector ?? null,
    value: action.type === 'click' ? null : action.detail,
    note: action.type === 'annotation' || action.type === 'note'
      ? action.detail ?? action.label
      : null,
    createdAt: action.createdAt,
  };
}

function generatePlaywrightTest(actions, testName = 'LabX recorded browser flow') {
  const lines = [
    "import { test, expect } from '@playwright/test';",
    '',
    `test(${JSON.stringify(testName)}, async ({ page }) => {`,
  ];

  let navigated = false;
  for (const rawAction of actions) {
    const action = normalizeAction(rawAction);

    if (action.kind === 'navigate') {
      lines.push(`  await page.goto(${JSON.stringify(action.url)});`);
      navigated = true;
    } else if (action.kind === 'click' && action.selector) {
      if (!navigated) {
        lines.push(`  await page.goto(${JSON.stringify(action.url)});`);
        navigated = true;
      }
      lines.push(`  await page.locator(${JSON.stringify(action.selector)}).click();`);
    } else if (action.kind === 'type' && action.selector) {
      if (!navigated) {
        lines.push(`  await page.goto(${JSON.stringify(action.url)});`);
        navigated = true;
      }
      lines.push(`  await page.locator(${JSON.stringify(action.selector)}).fill(${JSON.stringify(action.value ?? '')});`);
    } else if (action.kind === 'inspect' && action.selector) {
      if (!navigated) {
        lines.push(`  await page.goto(${JSON.stringify(action.url)});`);
        navigated = true;
      }
      lines.push(`  await expect(page.locator(${JSON.stringify(action.selector)})).toBeVisible();`);
    } else if (action.kind === 'annotate') {
      const note = action.note ?? action.value;
      if (note) lines.push(`  // Annotation: ${String(note).replace(/\s+/g, ' ').trim()}`);
    }
  }

  lines.push('});');
  return lines.join('\n');
}

async function generate() {
  const input = readArg('--input') ?? process.argv[3] ?? null;
  if (!input) {
    throw new Error('Missing --input actions.json');
  }

  const positionalName = process.argv.slice(4).join(' ');
  const name = readArg('--name') ?? (positionalName || 'LabX recorded browser flow');
  const raw = await fs.readFile(input, 'utf8');
  const parsed = JSON.parse(raw);
  const actions = Array.isArray(parsed) ? parsed : parsed.actions;

  if (!Array.isArray(actions)) {
    throw new Error('Input must be an array of actions or an object with an actions array.');
  }

  process.stdout.write(generatePlaywrightTest(actions, name));
}

async function snapshot() {
  const url = readArg('--url') ?? process.argv[3] ?? null;
  if (!url) {
    throw new Error('Missing --url');
  }

  const selector = readArg('--selector') ?? 'body';
  let chromium;

  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed for the LabX browser sidecar. Run npm install -D @playwright/test, then npx playwright install chromium.');
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to launch Chromium for browser snapshot. Run npx playwright install chromium. ${message}`);
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    const locator = page.locator(selector).first();
    const box = await locator.boundingBox();
    const text = await locator.innerText({ timeout: 5_000 }).catch(() => '');
    const screenshot = await page.screenshot({ fullPage: false, type: 'png' });

    process.stdout.write(JSON.stringify({
      url: page.url(),
      selector,
      box,
      text: text.slice(0, 500),
      screenshotBase64: screenshot.toString('base64'),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

function normalizeBrowserBridgeStateFile(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  if (!record.state || typeof record.state !== 'object') {
    return null;
  }

  return {
    version: typeof record.version === 'number' ? record.version : BROWSER_BRIDGE_VERSION,
    projectPath: typeof record.projectPath === 'string' ? record.projectPath : '',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    state: record.state,
  };
}

function normalizeBrowserBridgeCommandRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const kind = typeof record.kind === 'string' ? record.kind.trim() : '';
  if (!id || !kind) {
    return null;
  }

  return {
    version: typeof record.version === 'number' ? record.version : BROWSER_BRIDGE_VERSION,
    id,
    kind,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    source: typeof record.source === 'string' && record.source.trim() ? record.source.trim() : 'mcp',
    target: typeof record.target === 'string' && record.target.trim() ? record.target.trim() : null,
    url: typeof record.url === 'string' && record.url.trim() ? record.url.trim() : null,
    mode: typeof record.mode === 'string' && record.mode.trim() ? record.mode.trim() : null,
  };
}

function normalizeBrowserBridgeResultRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) {
    return null;
  }

  return {
    id,
    ok: Boolean(record.ok),
    message: typeof record.message === 'string' ? record.message : '',
    appliedAt: typeof record.appliedAt === 'string' ? record.appliedAt : new Date().toISOString(),
  };
}

async function listPendingBrowserBridgeCommands(paths) {
  const entries = await fs.readdir(paths.commands, { withFileTypes: true }).catch(() => []);
  const commands = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const raw = await readJsonFile(path.join(paths.commands, entry.name));
    const command = normalizeBrowserBridgeCommandRecord(raw);
    if (!command) {
      continue;
    }

    const resultPath = browserBridgeResultFile(paths, command.id);
    const resultExists = await fs.access(resultPath).then(() => true).catch(() => false);
    if (resultExists) {
      continue;
    }

    commands.push({
      id: command.id,
      kind: command.kind,
      createdAt: command.createdAt,
      source: command.source,
      target: command.target,
      url: command.url,
      mode: command.mode,
      resultExists,
    });
  }

  commands.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  return commands;
}

async function readBrowserBridgeState(paths) {
  return normalizeBrowserBridgeStateFile(await readJsonFile(paths.state));
}

function browserBridgeTools() {
  const noArgsSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  return [
    {
      name: 'open',
      description: 'Open a URL or search term in the LabX in-app browser.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', minLength: 1 },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    {
      name: 'panel',
      description: 'Open the LabX browser panel.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'mode',
      description: 'Switch the LabX browser mode.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['browse', 'annotate', 'inspect'] },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    },
    {
      name: 'reload',
      description: 'Reload the current browser page.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'attach',
      description: 'Attach the current browser context to the LabX Agentic Terminal.',
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['active-pane', 'visible-panes', 'workspace-panes'],
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'status',
      description: 'Read the current browser bridge state and pending queue.',
      inputSchema: noArgsSchema,
    },
  ];
}

async function callBrowserBridgeTool(name, args, paths) {
  switch (name) {
    case 'open': {
      const url = typeof args?.url === 'string' ? args.url.trim() : '';
      if (!url) {
        throw new Error('The open tool requires a url.');
      }

      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'open',
        url,
      });

      return {
        commandId: result.id,
        kind: 'open',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'panel': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'panel',
      });

      return {
        commandId: result.id,
        kind: 'panel',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'mode': {
      const mode = typeof args?.mode === 'string' ? args.mode.trim() : '';
      if (!['browse', 'annotate', 'inspect'].includes(mode)) {
        throw new Error('The mode tool requires browse, annotate, or inspect.');
      }

      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'mode',
        mode,
      });

      return {
        commandId: result.id,
        kind: 'mode',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'reload': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'reload',
      });

      return {
        commandId: result.id,
        kind: 'reload',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'attach': {
      const target = typeof args?.target === 'string' ? args.target.trim() : null;
      if (target && !['active-pane', 'visible-panes', 'workspace-panes'].includes(target)) {
        throw new Error('The attach tool target must be active-pane, visible-panes, or workspace-panes.');
      }

      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'attach',
        target,
      });

      return {
        commandId: result.id,
        kind: 'attach',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'status': {
      const state = await readBrowserBridgeState(paths);
      const pendingCommands = await listPendingBrowserBridgeCommands(paths);
      const scriptExists = await fs.access(paths.script).then(() => true).catch(() => false);

      return {
        workspacePath: paths.workspace,
        bridgeRoot: paths.root,
        statePath: paths.state,
        commandsDir: paths.commands,
        resultsDir: paths.results,
        toolsDir: paths.tools,
        scriptPath: paths.script,
        scriptExists,
        state,
        summary: state ? {
          projectPath: state.projectPath,
          updatedAt: state.updatedAt,
          mode: state.state.mode,
          currentUrl: state.state.currentUrl,
          previewStatus: state.state.previewStatus,
          activeTabId: state.state.activeTabId,
          tabCount: Array.isArray(state.state.tabs) ? state.state.tabs.length : 0,
          agentContextCount: Array.isArray(state.state.agentContext) ? state.state.agentContext.length : 0,
          annotationCount: Array.isArray(state.state.annotations) ? state.state.annotations.length : 0,
          recordedActionCount: Array.isArray(state.state.recordedActions) ? state.state.recordedActions.length : 0,
          isRecording: Boolean(state.state.isRecording),
        } : null,
        pendingCommandCount: pendingCommands.length,
        pendingCommands,
      };
    }
    default:
      throw new Error(`Unknown browser bridge tool: ${name}`);
  }
}

function sendMcpMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function sendMcpResponse(id, result) {
  sendMcpMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function sendMcpError(id, code, message, data = undefined) {
  sendMcpMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

async function handleMcpMessage(message, paths) {
  if (!message || typeof message !== 'object') {
    return;
  }

  const { id, method } = message;
  const isNotification = id === undefined || id === null;

  try {
    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'initialize') {
      if (!isNotification) {
        sendMcpResponse(id, {
          protocolVersion: message.params?.protocolVersion ?? MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: MCP_SERVER_INFO,
        });
      }
      return;
    }

    if (method === 'ping') {
      if (!isNotification) {
        sendMcpResponse(id, {});
      }
      return;
    }

    if (method === 'tools/list') {
      if (!isNotification) {
        sendMcpResponse(id, {
          tools: browserBridgeTools(),
        });
      }
      return;
    }

    if (method === 'tools/call') {
      if (isNotification) {
        return;
      }

      try {
        const result = await callBrowserBridgeTool(message.params?.name, message.params?.arguments ?? {}, paths);
        sendMcpResponse(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Browser bridge tool failed.';
        sendMcpResponse(id, {
          content: [
            {
              type: 'text',
              text: messageText,
            },
          ],
          isError: true,
        });
      }
      return;
    }

    if (!isNotification) {
      sendMcpError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    if (!isNotification) {
      sendMcpError(
        id,
        -32603,
        error instanceof Error ? error.message : 'Internal browser bridge error.',
      );
    }
  }
}

async function runMcp() {
  const workspace = resolveWorkspace(readArg('--workspace'));
  const paths = browserBridgePaths(workspace);
  await ensureBrowserBridge(paths);

  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let buffer = Buffer.alloc(0);
  const delimiter = Buffer.from('\r\n\r\n');

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk, 'utf8')]);
    void drain();
  });

  async function drain() {
    while (true) {
      const headerEnd = buffer.indexOf(delimiter);
      if (headerEnd === -1) {
        return;
      }

      const headerText = buffer.slice(0, headerEnd).toString('utf8');
      const match = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + delimiter.length);
        continue;
      }

      const contentLength = Number(match[1]);
      const bodyStart = headerEnd + delimiter.length;
      if (buffer.length < bodyStart + contentLength) {
        return;
      }

      const body = buffer.slice(bodyStart, bodyStart + contentLength).toString('utf8');
      buffer = buffer.slice(bodyStart + contentLength);

      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }

      void handleMcpMessage(message, paths);
    }
  }
}

async function main() {
  const command = process.argv[2] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (command === 'generate') {
    await generate();
    return;
  }

  if (command === 'snapshot') {
    await snapshot();
    return;
  }

  if (command === 'mcp') {
    await runMcp();
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exit(1);
});
