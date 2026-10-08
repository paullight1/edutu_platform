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

async function writeBrowserCommandAndAwait(paths, command, timeoutMs = 30_000) {
  await ensureBrowserBridge(paths);
  const id = command.id || `browser-${randomUUID()}`;
  const createdAt = command.createdAt || new Date().toISOString();
  const record = {
    version: BROWSER_BRIDGE_VERSION,
    id,
    kind: command.kind,
    createdAt,
    source: command.source ?? 'mcp',
    target: command.target ?? null,
    url: command.url ?? null,
    mode: command.mode ?? null,
    viewport: command.viewport ?? null,
    tabIndex: command.tabIndex ?? null,
    payload: command.payload ?? null,
  };

  await writeJsonAtomic(browserBridgeCommandFile(paths, id), record);
  const result = normalizeBrowserBridgeResultRecord(
    await waitForFile(browserBridgeResultFile(paths, id), timeoutMs),
  );

  // The sidecar is the only consumer of its own results — clean up the pair
  // so files never accumulate during a long agent session.
  await fs.rm(browserBridgeCommandFile(paths, id), { force: true }).catch(() => undefined);
  await fs.rm(browserBridgeResultFile(paths, id), { force: true }).catch(() => undefined);

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
  const width = Number(readArg('--width')) || 1280;
  const height = Number(readArg('--height')) || 800;
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
    const page = await browser.newPage({ viewport: { width, height } });
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
    viewport: typeof record.viewport === 'string' && record.viewport.trim() ? record.viewport.trim() : null,
    tabIndex: typeof record.tabIndex === 'number' && Number.isFinite(record.tabIndex)
      ? Math.max(1, Math.floor(record.tabIndex))
      : null,
    payload: record.payload && typeof record.payload === 'object' ? record.payload : null,
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
    data: record.data ?? null,
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
      viewport: command.viewport,
      tabIndex: command.tabIndex,
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
      name: 'viewport',
      description: 'Change the browser viewport size or preset.',
      inputSchema: {
        type: 'object',
        properties: {
          viewport: { type: 'string', minLength: 1 },
        },
        required: ['viewport'],
        additionalProperties: false,
      },
    },
    {
      name: 'back',
      description: 'Move back in browser history.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'forward',
      description: 'Move forward in browser history.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'home',
      description: 'Open the browser home page.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'new-tab',
      description: 'Open a new browser tab.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'close-tab',
      description: 'Close the active browser tab.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'tab',
      description: 'Switch to a browser tab by 1-based index.',
      inputSchema: {
        type: 'object',
        properties: {
          tabIndex: { type: 'integer', minimum: 1 },
        },
        required: ['tabIndex'],
        additionalProperties: false,
      },
    },
    {
      name: 'toggle-recording',
      description: 'Toggle browser action recording.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'clear-recording',
      description: 'Clear recorded browser actions.',
      inputSchema: noArgsSchema,
    },
    {
      name: 'clear-context',
      description: 'Clear the browser agent context.',
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
    ...browserAutomationTools(),
  ];
}

/**
 * Automation verbs — executed against the LIVE in-app browser iframe with a
 * visible agent cursor. DOM driving requires the page to be same-origin
 * (localhost dev servers). On remote pages these return an actionable error;
 * `open`, `screenshot`, and `console` always work.
 */
function browserAutomationTools() {
  const targetProps = {
    selector: {
      type: 'string',
      minLength: 1,
      description: 'CSS selector of the target element (wins over x/y). Use read-page or query to discover selectors.',
    },
    x: { type: 'number', description: 'Iframe CSS-px X coordinate (used when selector is absent).' },
    y: { type: 'number', description: 'Iframe CSS-px Y coordinate.' },
  };

  return [
    {
      name: 'click',
      description:
        'Click an element in the LabX in-app browser (visible cursor moves and clicks). Same-origin pages only. Provide selector OR x/y.',
      inputSchema: {
        type: 'object',
        properties: { ...targetProps },
        additionalProperties: false,
      },
    },
    {
      name: 'hover',
      description: 'Hover the agent cursor over an element (fires pointer/mouse hover events). Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: { ...targetProps },
        additionalProperties: false,
      },
    },
    {
      name: 'type',
      description:
        'Type text into an input, textarea, or contenteditable element. Works with controlled (React/Svelte) inputs. Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: targetProps.selector,
          text: { type: 'string', description: 'Text to enter.' },
          clear: { type: 'boolean', description: 'Clear the field first (default true).' },
          submit: { type: 'boolean', description: 'Press Enter after typing (submits the surrounding form).' },
        },
        required: ['selector', 'text'],
        additionalProperties: false,
      },
    },
    {
      name: 'press',
      description: 'Press a keyboard key ("Enter", "Escape", "Tab", "ArrowDown", …) with optional modifiers. Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', minLength: 1 },
          selector: { ...targetProps.selector, description: 'Element to focus first (defaults to the focused element).' },
          modifiers: {
            type: 'array',
            items: { type: 'string', enum: ['Shift', 'Control', 'Alt', 'Meta'] },
          },
        },
        required: ['key'],
        additionalProperties: false,
      },
    },
    {
      name: 'scroll',
      description: 'Scroll the page (deltaY px, or to "top"/"bottom"), or scroll an element into view via selector. Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: targetProps.selector,
          deltaX: { type: 'number' },
          deltaY: { type: 'number' },
          to: { type: 'string', enum: ['top', 'bottom'] },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'move-cursor',
      description: 'Move the visible agent cursor to an element or coordinates without clicking. Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: { ...targetProps },
        additionalProperties: false,
      },
    },
    {
      name: 'wait-for',
      description: 'Wait until a selector becomes visible/attached/hidden (up to 20s). Use after actions that trigger async UI. Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: targetProps.selector,
          timeoutMs: { type: 'integer', minimum: 100, maximum: 20000 },
          state: { type: 'string', enum: ['visible', 'attached', 'hidden'] },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: 'read-page',
      description:
        'Read the LIVE page: title, URL, text, an outline of headings/landmarks, and interactive elements with ready-to-use selectors. This is the live-state source of truth. Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: {
          maxChars: { type: 'integer', minimum: 200, maximum: 40000 },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'query',
      description: 'List elements matching a CSS selector with their text, boxes, and suggested selectors. Same-origin pages only.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: targetProps.selector,
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: 'screenshot',
      description:
        'Screenshot the current page. NOTE: the image is a fresh headless render of the same URL — in-page state from earlier actions (typed text, open dialogs) is NOT shown; use read-page for live-state truth. Works for any http(s) URL.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', minLength: 1, description: 'Optional element to focus the capture on.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'console',
      description: 'Read console output and page errors captured from the live page (same-origin pages, captured after load).',
      inputSchema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug', 'all'] },
          limit: { type: 'integer', minimum: 1, maximum: 300 },
        },
        additionalProperties: false,
      },
    },
  ];
}

const AUTOMATION_TOOL_KINDS = new Set([
  'click',
  'hover',
  'type',
  'press',
  'scroll',
  'move-cursor',
  'wait-for',
  'read-page',
  'query',
  'screenshot',
  'console',
]);

async function callBrowserAutomationTool(name, args, paths) {
  const payload = {};
  for (const key of ['selector', 'x', 'y', 'text', 'clear', 'submit', 'key', 'modifiers', 'deltaX', 'deltaY', 'to', 'timeoutMs', 'state', 'limit', 'level', 'maxChars']) {
    if (args?.[key] !== undefined) {
      payload[key] = args[key];
    }
  }

  if ((name === 'click' || name === 'hover' || name === 'move-cursor') && !payload.selector && (typeof payload.x !== 'number' || typeof payload.y !== 'number')) {
    throw new Error(`The ${name} tool requires a selector or both x and y coordinates.`);
  }

  // wait-for may legitimately take up to its own timeout; give the file wait margin.
  const timeoutMs = name === 'wait-for'
    ? Math.min(20_000, Math.max(100, Number(payload.timeoutMs) || 5000)) + 10_000
    : 30_000;

  const result = await writeBrowserCommandAndAwait(paths, { kind: name, payload }, timeoutMs);
  return {
    commandId: result.id,
    kind: name,
    status: 'ok',
    message: result.message,
    appliedAt: result.appliedAt,
    data: result.data ?? null,
  };
}

async function callBrowserBridgeTool(name, args, paths) {
  if (AUTOMATION_TOOL_KINDS.has(name)) {
    return callBrowserAutomationTool(name, args, paths);
  }

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
    case 'viewport': {
      const viewport = typeof args?.viewport === 'string' ? args.viewport.trim() : '';
      if (!viewport) {
        throw new Error('The viewport tool requires a viewport value.');
      }

      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'viewport',
        viewport,
      });

      return {
        commandId: result.id,
        kind: 'viewport',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'back': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'back',
      });

      return {
        commandId: result.id,
        kind: 'back',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'forward': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'forward',
      });

      return {
        commandId: result.id,
        kind: 'forward',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'home': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'home',
      });

      return {
        commandId: result.id,
        kind: 'home',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'new-tab': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'new-tab',
      });

      return {
        commandId: result.id,
        kind: 'new-tab',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'close-tab': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'close-tab',
      });

      return {
        commandId: result.id,
        kind: 'close-tab',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'tab': {
      const tabIndex = typeof args?.tabIndex === 'number' ? Math.floor(args.tabIndex) : NaN;
      if (!Number.isInteger(tabIndex) || tabIndex < 1) {
        throw new Error('The tab tool requires a tabIndex of 1 or greater.');
      }

      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'tab',
        tabIndex,
      });

      return {
        commandId: result.id,
        kind: 'tab',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'toggle-recording': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'toggle-recording',
      });

      return {
        commandId: result.id,
        kind: 'toggle-recording',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'clear-recording': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'clear-recording',
      });

      return {
        commandId: result.id,
        kind: 'clear-recording',
        status: 'ok',
        message: result.message,
        appliedAt: result.appliedAt,
      };
    }
    case 'clear-context': {
      const result = await writeBrowserCommandAndAwait(paths, {
        kind: 'clear-context',
      });

      return {
        commandId: result.id,
        kind: 'clear-context',
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

/**
 * Serialize a tool result into MCP content blocks. Screenshots become a real
 * image block (so models actually SEE them) plus a text block with the
 * live-state notes; everything else is JSON text.
 */
function buildToolCallContent(result) {
  const screenshotBase64 = result?.data?.screenshotBase64;
  if (typeof screenshotBase64 === 'string' && screenshotBase64.length) {
    const { screenshotBase64: _omitted, ...rest } = result.data;
    return [
      {
        type: 'image',
        data: screenshotBase64,
        mimeType: 'image/png',
      },
      {
        type: 'text',
        text: JSON.stringify({ ...result, data: rest }, null, 2),
      },
    ];
  }

  return [
    {
      type: 'text',
      text: JSON.stringify(result, null, 2),
    },
  ];
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
        sendMcpResponse(id, { content: buildToolCallContent(result) });
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
