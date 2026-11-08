#!/usr/bin/env node
// MCP server (stdio) that lets one Claude Code session orchestrate Xirp sessions.
// It wraps the CLI bundled inside Xirp.app, which talks to the running Xirp daemon.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const bundledCli = '/Applications/Xirp.app/Contents/Resources/chirp-cli/xirp';
const xirpCli =
  process.env.XIRP_CLI ?? (existsSync(bundledCli) ? bundledCli : 'xirp');
const cliTimeoutMs = 180_000;

// The bundled CLI refuses to start unless its launcher sets the edition.
const cliEnv = {
  ...process.env,
  CHIRP_EDITION: process.env.CHIRP_EDITION ?? 'external',
};

const runXirp = args =>
  new Promise(resolve => {
    execFile(
      xirpCli,
      args,
      { env: cliEnv, timeout: cliTimeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = [stdout.trim(), stderr.trim()]
          .filter(Boolean)
          .join('\n');
        resolve({
          ok: !error,
          output: output || (error ? String(error.message) : 'done'),
        });
      }
    );
  });

// The CLI reads any argument that starts with "--" as a flag, even after a value flag.
const asCliValue = text => (text.startsWith('-') ? ` ${text}` : text);

const flag = (name, value) =>
  value === undefined || value === null || value === ''
    ? []
    : [`--${name}`, asCliValue(String(value))];
const switchFlag = (name, on) => (on ? [`--${name}`] : []);

const tools = [
  {
    name: 'xirp_list_projects',
    description:
      'List the projects (repositories) registered in Xirp, with their ids and paths.',
    inputSchema: { type: 'object', properties: {} },
    args: () => ['project', 'list', '--json'],
  },
  {
    name: 'xirp_list_sessions',
    description:
      'List Xirp sessions with status, branch, worktree and last user message. By default lists the project of the current directory; pass all=true for every project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project id, name or path.' },
        status: {
          type: 'string',
          description: 'Comma-separated statuses, e.g. "running,idle".',
        },
        search: {
          type: 'string',
          description: 'Match name, goal, branch or last user message.',
        },
        all: {
          type: 'boolean',
          description: 'List sessions of every project.',
        },
        limit: { type: 'number' },
      },
    },
    args: a => [
      'session',
      'list',
      '--json',
      ...flag('project', a.project),
      ...flag('status', a.status),
      ...flag('search', a.search),
      ...switchFlag('all', a.all),
      ...flag('limit', a.limit),
    ],
  },
  {
    name: 'xirp_get_session',
    description:
      'Show one session: status, lifecycle, activity (e.g. waiting for input), terminal outcome, goal, branch, worktree, cost. Poll this to know when a child session is done.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Session id (a unique prefix works).',
        },
      },
      required: ['id'],
    },
    args: a => ['session', 'get', a.id, '--json'],
  },
  {
    name: 'xirp_create_session',
    description:
      'Start a new coding-agent session in Xirp with an initial prompt. By default it gets its own git worktree on an auto-generated branch and runs in the background. When this server runs inside a Xirp session, the new session becomes its child and can message it back.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Initial prompt for the coding agent.',
        },
        project: {
          type: 'string',
          description:
            'Project id, name or path. Defaults to the current directory.',
        },
        name: { type: 'string', description: 'Session title shown in Xirp.' },
        harness: {
          type: 'string',
          description: 'Coding agent: claude, codex, gemini, cursor, pi.',
        },
        model: {
          type: 'string',
          description: 'Model override; requires harness.',
        },
        auto_mode: {
          type: 'boolean',
          description:
            'Claude Auto permission mode; requires harness "claude".',
        },
        new_branch: {
          type: 'string',
          description: 'Branch name for the new worktree.',
        },
        base_branch: {
          type: 'string',
          description:
            'Base for the new branch. Defaults to the default branch.',
        },
        worktree: {
          type: 'string',
          description: 'Reuse an existing worktree id instead of creating one.',
        },
        no_worktree: {
          type: 'boolean',
          description: 'Run on the project root checkout.',
        },
        depends_on: {
          type: 'string',
          description: 'Queue until this session id or branch finishes.',
        },
        parent: {
          type: 'string',
          description:
            'Parent session id for messaging. Defaults to the calling Xirp session.',
        },
        foreground: {
          type: 'boolean',
          description: 'Focus the new session in the Xirp window.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'key:value tags.',
        },
      },
      required: ['goal'],
    },
    args: a => [
      'session',
      'new',
      '--json',
      ...flag('goal', a.goal),
      ...flag('project', a.project),
      ...flag('name', a.name),
      ...flag('harness', a.harness),
      ...flag('model', a.model),
      ...switchFlag('auto-mode', a.auto_mode),
      ...flag('new-branch', a.new_branch),
      ...flag('base-branch', a.base_branch),
      ...flag('worktree', a.worktree),
      ...switchFlag('no-worktree', a.no_worktree),
      ...flag('depends-on', a.depends_on),
      ...flag('parent', a.parent),
      ...switchFlag('foreground', a.foreground),
      ...(a.tags ?? []).flatMap(tag => flag('tag', tag)),
    ],
  },
  {
    name: 'xirp_send_message',
    description:
      "Type text into a session's terminal and press Enter, as if the user typed it. Use it to answer a session's question or give it a follow-up instruction.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        enter: {
          type: 'boolean',
          description: 'Press Enter after the text. Defaults to true.',
        },
      },
      required: ['id', 'text'],
    },
    args: a => [
      'session',
      'message',
      a.id,
      asCliValue(a.text),
      ...switchFlag('no-enter', a.enter === false),
    ],
  },
  {
    name: 'xirp_stop_session',
    description: 'Stop a running session. Its worktree and branch are kept.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    args: a => ['session', 'stop', a.id, '--json'],
  },
  {
    name: 'xirp_api_list',
    description:
      'List the Xirp daemon API message types (e.g. to find one that reads a session transcript). Use with xirp_api_describe and xirp_api_send for anything the other tools do not cover.',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string' } },
    },
    args: a => ['api', 'list', '--json', ...flag('category', a.category)],
  },
  {
    name: 'xirp_api_describe',
    description:
      'Show the parameters and reply types of one Xirp daemon API message type.',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string' } },
      required: ['type'],
    },
    args: a => ['api', 'describe', a.type, '--json'],
  },
  {
    name: 'xirp_api_send',
    description:
      'Send one message to the Xirp daemon API and return its reply. Messages can change or delete data and are not confirmed; describe the type first.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Message type, e.g. "sessions:list".',
        },
        params: { type: 'object', description: 'Message parameters.' },
      },
      required: ['type'],
    },
    args: a => [
      'api',
      'send',
      a.type,
      '--json',
      JSON.stringify(a.params ?? {}),
    ],
  },
];

const toolsByName = new Map(tools.map(tool => [tool.name, tool]));

const handlers = {
  initialize: params => ({
    protocolVersion: params?.protocolVersion ?? '2025-06-18',
    capabilities: { tools: {} },
    serverInfo: { name: 'xirp', version: '1.0.0' },
  }),
  ping: () => ({}),
  'tools/list': () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }),
  'tools/call': async params => {
    const tool = toolsByName.get(params?.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${params?.name}` }],
        isError: true,
      };
    }
    const { ok, output } = await runXirp(tool.args(params.arguments ?? {}));
    return { content: [{ type: 'text', text: output }], isError: !ok };
  },
};

const send = message =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

const handle = async line => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const isNotification = request.id === undefined;
  const handler = handlers[request.method];
  if (!handler) {
    if (!isNotification)
      send({
        id: request.id,
        error: { code: -32601, message: `Unknown method ${request.method}` },
      });
    return;
  }
  try {
    const result = await handler(request.params);
    if (!isNotification) send({ id: request.id, result });
  } catch (error) {
    if (!isNotification)
      send({
        id: request.id,
        error: { code: -32603, message: String(error?.message ?? error) },
      });
  }
};

createInterface({ input: process.stdin }).on('line', line => {
  if (line.trim()) handle(line);
});
