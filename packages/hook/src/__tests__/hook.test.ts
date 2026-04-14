import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { processHookEvent, HookEvent } from '../hook';
import { readSessions } from '@claude-dashboard/shared';
import { Session } from '@claude-dashboard/shared';

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
