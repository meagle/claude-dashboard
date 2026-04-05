import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readSessions, pruneStaleSessions, writeSessions, Session } from '@claude-dashboard/shared';

describe('useSessionsFile hook behavior', () => {
  let tempDir: string;
  let sessionsFile: string;

  const createSession = (id: string, lastActivity: number): Session => ({
    sessionId: id,
    pid: 1000,
    workingDir: '/test',
    dirName: 'test',
    branch: null,
    worktree: null,
    status: 'active',
    currentTool: null,
    lastTool: null,
    lastToolAt: null,
    currentTask: null,
    tasks: [],
    subagents: [],
    completionPct: 0,
    changedFiles: null,
    costUsd: null,
    errorState: false,
    startedAt: lastActivity - 60000,
    lastActivity,
    dismissed: false,
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-sessions-'));
    sessionsFile = path.join(tempDir, 'sessions.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  test('readSessions returns empty array when file does not exist', () => {
    const result = readSessions(sessionsFile);
    expect(result).toEqual([]);
  });

  test('readSessions returns parsed sessions when file exists', () => {
    const now = Date.now();
    const sessions = [createSession('session-1', now), createSession('session-2', now)];
    writeSessions(sessionsFile, sessions);
    const result = readSessions(sessionsFile);
    expect(result).toHaveLength(2);
    expect(result[0].sessionId).toBe('session-1');
    expect(result[1].sessionId).toBe('session-2');
  });

  test('pruneStaleSessions filters out sessions older than staleMinutes', () => {
    const now = Date.now();
    const sessions = [
      createSession('fresh', now),
      createSession('stale', now - 15 * 60 * 1000), // 15 minutes ago
    ];
    const staleMinutes = 10;
    const result = pruneStaleSessions(sessions, staleMinutes);
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('fresh');
  });

  test('pruneStaleSessions keeps all sessions when none are stale', () => {
    const now = Date.now();
    const sessions = [
      createSession('session-1', now),
      createSession('session-2', now - 5 * 60 * 1000), // 5 minutes ago
    ];
    const staleMinutes = 10;
    const result = pruneStaleSessions(sessions, staleMinutes);
    expect(result).toHaveLength(2);
  });

  test('useSessionsFile hook logic: init state reads and prunes sessions', () => {
    const now = Date.now();
    const sessions = [
      createSession('fresh', now),
      createSession('stale', now - 15 * 60 * 1000),
    ];
    writeSessions(sessionsFile, sessions);

    // Simulate what the hook does in useState initializer
    const initial = pruneStaleSessions(readSessions(sessionsFile), 10);
    expect(initial).toHaveLength(1);
    expect(initial[0].sessionId).toBe('fresh');
  });

  test('useSessionsFile hook logic: refresh callback reads and prunes sessions', () => {
    const now = Date.now();
    const sessions = [createSession('fresh', now)];
    writeSessions(sessionsFile, sessions);

    // Simulate what the hook refresh callback does
    const refreshed = pruneStaleSessions(readSessions(sessionsFile), 10);
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].sessionId).toBe('fresh');
  });

  test('useSessionsFile is exported as a function', () => {
    // Import the hook module
    const module = require('../useSessionsFile');
    expect(typeof module.useSessionsFile).toBe('function');
  });
});
