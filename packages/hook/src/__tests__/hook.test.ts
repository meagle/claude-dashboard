import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { processHookEvent, HookEvent } from '../hook';
import { readSessions } from '@claude-dashboard/shared';
import { Session } from '@claude-dashboard/shared';

function writeTranscript(dir: string, entries: object[]): string {
  const p = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return p;
}

function assistantEntry(text: string, model = 'claude-sonnet-4-6', usage: Record<string, number> = {}) {
  return {
    type: 'assistant',
    message: {
      model,
      content: [{ type: 'text', text }],
      usage: { input_tokens: 5000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 200, ...usage },
    },
  };
}

function userEntry(text: string) {
  return { type: 'user', message: { content: [{ type: 'text', text }] } };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-1',
    pid: 100,
    termSessionId: null,
    workingDir: '/tmp/test',
    dirName: 'test',
    branch: 'main',
    worktree: null,
    status: 'idle',
    currentTool: null,
    lastTool: null,
    lastToolAt: null,
    lastToolSummary: null,
    lastPrompt: null,
    lastMessage: null,
    currentTask: null,
    tasks: [],
    subagents: [],
    completionPct: 0,
    changedFiles: null,
    costUsd: null,
    turns: null,
    toolCount: 0,
    totalTokens: null,
    model: null,
    contextPct: null,
    bashStartedAt: null,
    gitSummary: null,
    gitAhead: null,
    transcriptPath: null,
    partialResponse: null,
    errorState: false,
    loopTool: null,
    loopCount: 0,
    startedAt: Date.now() - 5000,
    turnStartedAt: null,
    lastActivity: Date.now() - 5000,
    dismissed: false,
    ...overrides,
  };
}

describe('processHookEvent', () => {
  let dir: string;
  let sessionsFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    sessionsFile = path.join(dir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('pre-tool: creates session entry if none exists and sets status active', () => {
    const event: HookEvent = {
      type: 'pre-tool',
      sessionId: 'new-sess',
      pid: 999,
      termSessionId: null,
      workingDir: '/tmp/project',
      toolName: 'Bash',
      input: {},
    };
    processHookEvent(event, sessionsFile);
    const sessions = readSessions(sessionsFile);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('new-sess');
    expect(sessions[0].status).toBe('active');
    expect(sessions[0].currentTool).toBe('Bash');
  });

  it('post-tool: moves currentTool to lastTool and clears currentTool', () => {
    const existing = makeSession({ sessionId: 'sess-1', currentTool: 'Read', status: 'active' });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    const event: HookEvent = {
      type: 'post-tool',
      sessionId: 'sess-1',
      pid: 100,
      termSessionId: null,
      workingDir: '/tmp/test',
      toolName: 'Read',
      input: {},
      output: {},
    };
    processHookEvent(event, sessionsFile);
    const sessions = readSessions(sessionsFile);
    expect(sessions[0].currentTool).toBeNull();
    expect(sessions[0].lastTool).toBe('Read');
    expect(sessions[0].lastToolAt).toBeGreaterThan(0);
  });

  it('stop: sets status to done and clears currentTool', () => {
    const existing = makeSession({ sessionId: 'sess-1', currentTool: 'Bash', status: 'active' });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    const event: HookEvent = {
      type: 'stop',
      sessionId: 'sess-1',
      pid: 100,
      termSessionId: null,
      workingDir: '/tmp/test',
      transcriptPath: null,
    };
    processHookEvent(event, sessionsFile);
    const sessions = readSessions(sessionsFile);
    expect(sessions[0].status).toBe('done');
    expect(sessions[0].currentTool).toBeNull();
  });

  it('loop detection: sets errorState after 5 same consecutive tool firings', () => {
    const existing = makeSession({ sessionId: 'sess-1' });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    for (let i = 0; i < 5; i++) {
      processHookEvent(
        { type: 'pre-tool', sessionId: 'sess-1', pid: 100, termSessionId: null, workingDir: '/tmp/test', toolName: 'Bash', input: {} },
        sessionsFile
      );
      processHookEvent(
        { type: 'post-tool', sessionId: 'sess-1', pid: 100, termSessionId: null, workingDir: '/tmp/test', toolName: 'Bash', input: {}, output: {} },
        sessionsFile
      );
    }
    const sessions = readSessions(sessionsFile);
    expect(sessions[0].errorState).toBe(true);
  });

  it('notification: sets waiting_permission status on permission prompt', () => {
    const existing = makeSession({ sessionId: 'sess-1' });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    processHookEvent(
      {
        type: 'notification',
        sessionId: 'sess-1',
        pid: 100,
        termSessionId: null,
        workingDir: '/tmp/test',
        message: 'Waiting for tool approval',
        notificationType: 'permission_request',
      },
      sessionsFile
    );
    const sessions = readSessions(sessionsFile);
    expect(sessions[0].status).toBe('waiting_permission');
  });
});

describe('processHookEvent — user-prompt', () => {
  let dir: string;
  let sessionsFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    sessionsFile = path.join(dir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('creates a new session and sets status active', () => {
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'Hello' },
      sessionsFile
    );
    const sessions = readSessions(sessionsFile);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('active');
  });

  it('stores lastPrompt from the event', () => {
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'Write a test' },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].lastPrompt).toBe('Write a test');
  });

  it('reads model and contextPct from the previous turn transcript', () => {
    const tp = writeTranscript(dir, [
      userEntry('First prompt'),
      assistantEntry('First response', 'claude-haiku-4-5-20251001', { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
    ]);
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, prompt: 'Second prompt' },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.model).toBe('Haiku 4.5');
    expect(s.contextPct).toBe(5); // 10000 / 200000 = 5%
  });

  it('un-dismisses a dismissed session', () => {
    const existing = makeSession({ sessionId: 'up-1', dismissed: true });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 100, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'Resume' },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].dismissed).toBe(false);
  });

  it('resets loop detection on new prompt', () => {
    const existing = makeSession({ sessionId: 'up-1', loopTool: 'Bash', loopCount: 5, errorState: true });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 100, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'New task' },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.loopTool).toBeNull();
    expect(s.loopCount).toBe(0);
    expect(s.errorState).toBe(false);
  });
});

describe('processHookEvent — stop with transcript', () => {
  let dir: string;
  let sessionsFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    sessionsFile = path.join(dir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('reads lastMessage, model, contextPct, and turns from transcript', () => {
    const tp = writeTranscript(dir, [
      userEntry('What is 2+2?'),
      assistantEntry('The answer is 4.', 'claude-haiku-4-5-20251001', { input_tokens: 20000 }),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 's1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.lastMessage).toBe('The answer is 4.');
    expect(s.model).toBe('Haiku 4.5');
    expect(s.contextPct).toBe(10); // 20000 / 200000 = 10%
    expect(s.turns).toBe(1);
    expect(s.status).toBe('done');
  });

  it('sums all cache fields to get total context in use', () => {
    // cache_read = tokens served from an existing cache breakpoint (not re-processed)
    // cache_creation = tokens written to a new cache checkpoint (freshly processed)
    // Both represent distinct portions of the context window, so we sum them.
    // inp=0, cache_read=60k, cache_creation=40k → 100000/200000 = 50%.
    const tp = writeTranscript(dir, [
      userEntry('Continue'),
      assistantEntry('Continuing.', 'claude-haiku-4-5-20251001', {
        input_tokens: 0,
        cache_read_input_tokens: 60000,
        cache_creation_input_tokens: 40000,
      }),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 's2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].contextPct).toBe(50); // (0 + 60000 + 40000) / 200000 = 50%
  });

  it('counts only user text turns (not tool_result entries)', () => {
    const tp = writeTranscript(dir, [
      userEntry('Prompt 1'),
      assistantEntry('Response 1'),
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
      userEntry('Prompt 2'),
      assistantEntry('Final response.'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 's3', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].turns).toBe(2);
  });

  it('displays correct model name for different model IDs', () => {
    const tp = writeTranscript(dir, [
      userEntry('Hi'),
      assistantEntry('Hello.', 'claude-haiku-4-5-20251001', { input_tokens: 5000 }),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 's4', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].model).toBe('Haiku 4.5');
  });
});

describe('processHookEvent — toolSummary via post-tool', () => {
  let dir: string;
  let sessionsFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    sessionsFile = path.join(dir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  function firePostTool(toolName: string, input: Record<string, unknown>) {
    processHookEvent(
      { type: 'post-tool', sessionId: 'ts-1', pid: 1, termSessionId: null, workingDir: dir, toolName, input, output: {} },
      sessionsFile
    );
  }

  it('summarises Bash with the command', () => {
    firePostTool('Bash', { command: 'git status' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('git status');
  });

  it('summarises Read with the file path', () => {
    firePostTool('Read', { file_path: '/src/index.ts' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('/src/index.ts');
  });

  it('summarises Glob with the pattern', () => {
    firePostTool('Glob', { pattern: '**/*.ts' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('**/*.ts');
  });

  it('summarises WebSearch with the query', () => {
    firePostTool('WebSearch', { query: 'vitest docs' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('vitest docs');
  });

  it('truncates long Bash commands to 60 chars with ellipsis', () => {
    const long = 'a'.repeat(80);
    firePostTool('Bash', { command: long });
    const summary = readSessions(sessionsFile)[0].lastToolSummary!;
    expect(summary).toHaveLength(61);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('returns null summary for unknown tools', () => {
    firePostTool('UnknownTool', { something: 'value' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBeNull();
  });
});
