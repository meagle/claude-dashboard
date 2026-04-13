import { Session, TaskSummary, SubagentSummary } from '../types';

describe('Session type shape', () => {
  it('accepts a valid session object', () => {
    const session: Session = {
      sessionId: 'abc123',
      pid: 1234,
      termSessionId: null,
      workingDir: '/Users/meagle/projects/myapp',
      dirName: 'myapp',
      branch: 'main',
      worktree: null,
      status: 'active',
      currentTool: 'Bash',
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
      startedAt: Date.now(),
      turnStartedAt: null,
      lastActivity: Date.now(),
      dismissed: false,
    };
    expect(session.sessionId).toBe('abc123');
    expect(session.status).toBe('active');
  });

  it('accepts all valid status values', () => {
    const statuses: Session['status'][] = [
      'active', 'waiting_permission', 'waiting_input', 'idle', 'done'
    ];
    expect(statuses).toHaveLength(5);
  });
});

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readSessions, writeSessions, pruneStaleSessions } from '../sessions';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-1',
    pid: 100,
    termSessionId: null,
    workingDir: '/tmp/test',
    dirName: 'test',
    branch: 'main',
    worktree: null,
    status: 'active',
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
    startedAt: Date.now(),
    turnStartedAt: null,
    lastActivity: Date.now(),
    dismissed: false,
    ...overrides,
  };
}

describe('sessions I/O', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'));
    filePath = path.join(dir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('returns empty array when file does not exist', () => {
    expect(readSessions(filePath)).toEqual([]);
  });

  it('round-trips a session through write/read', () => {
    const sessions = [makeSession()];
    writeSessions(filePath, sessions);
    expect(readSessions(filePath)).toEqual(sessions);
  });

  it('writes atomically (tmp then rename)', () => {
    const sessions = [makeSession()];
    writeSessions(filePath, sessions);
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('prunes sessions older than staleMinutes', () => {
    const fresh = makeSession({ sessionId: 'fresh', lastActivity: Date.now() });
    const stale = makeSession({
      sessionId: 'stale',
      lastActivity: Date.now() - 31 * 60 * 1000,
    });
    const result = pruneStaleSessions([fresh, stale], 30);
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('fresh');
  });

  it('does not prune sessions that are exactly at the boundary', () => {
    const borderline = makeSession({
      sessionId: 'border',
      lastActivity: Date.now() - 30 * 60 * 1000 + 1000,
    });
    const result = pruneStaleSessions([borderline], 30);
    expect(result).toHaveLength(1);
  });
});
