import { describe, it, expect } from "vitest";
import type { Session } from "@claude-dashboard/shared";
import { selectVisibleSessions } from "../sessionSelection";

const NOW = 1_000_000_000_000;
const MIN = 60 * 1000;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "s1",
    pid: 100,
    termSessionId: null,
    workingDir: "/tmp/proj",
    dirName: "proj",
    branch: null,
    worktree: null,
    status: "active",
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
    modelId: null,
    contextPct: null,
    contextTokens: null,
    bashStartedAt: null,
    gitSummary: null,
    gitAhead: null,
    transcriptPath: null,
    partialResponse: null,
    errorState: false,
    loopTool: null,
    loopCount: 0,
    startedAt: NOW - 10 * MIN,
    turnStartedAt: null,
    lastActivity: NOW,
    dismissed: false,
    ...overrides,
  };
}

const dead = () => false;
const alive = () => true;

describe("selectVisibleSessions", () => {
  // The regression this fixes: a done session whose process has exited (dead pid)
  // that is NOT yet stale must be RETAINED. The old code dropped any done+dead
  // session after 60s regardless of staleMinutes, which cleared Cursor/Codex
  // cards mid-session (their process exits after every turn).
  it("keeps a done, dead-pid session until the stale timeout (all agents consistent)", () => {
    const s = makeSession({
      source: "codex",
      status: "done",
      lastActivity: NOW - 2 * MIN, // 2 min ago: past the old 60s rule, well under stale
    });
    const out = selectVisibleSessions([s], { now: NOW, staleMinutes: 30, isAlive: dead });
    expect(out.map((x) => x.sessionId)).toEqual(["s1"]);
  });

  it("applies the same rule to an exited Claude session (consistency)", () => {
    const s = makeSession({
      source: "claude-code",
      status: "done",
      lastActivity: NOW - 5 * MIN,
    });
    const out = selectVisibleSessions([s], { now: NOW, staleMinutes: 30, isAlive: dead });
    expect(out).toHaveLength(1);
  });

  it("drops a session once it exceeds the stale timeout", () => {
    const s = makeSession({ lastActivity: NOW - 31 * MIN });
    const out = selectVisibleSessions([s], { now: NOW, staleMinutes: 30, isAlive: alive });
    expect(out).toHaveLength(0);
  });

  it("downgrades a still-active session with a dead pid to done, but keeps it", () => {
    const s = makeSession({ status: "active", lastActivity: NOW - 2 * MIN });
    const out = selectVisibleSessions([s], { now: NOW, staleMinutes: 30, isAlive: dead });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("done");
  });

  it("leaves an alive active session untouched", () => {
    const s = makeSession({ status: "active" });
    const out = selectVisibleSessions([s], { now: NOW, staleMinutes: 30, isAlive: alive });
    expect(out[0].status).toBe("active");
  });

  it("excludes dismissed sessions", () => {
    const s = makeSession({ dismissed: true });
    const out = selectVisibleSessions([s], { now: NOW, staleMinutes: 30, isAlive: alive });
    expect(out).toHaveLength(0);
  });

  it("dedupes by pid+termSessionId, keeping the newest by startedAt", () => {
    const older = makeSession({ sessionId: "old", pid: 42, termSessionId: "t1", startedAt: NOW - 20 * MIN });
    const newer = makeSession({ sessionId: "new", pid: 42, termSessionId: "t1", startedAt: NOW - 1 * MIN });
    const out = selectVisibleSessions([older, newer], { now: NOW, staleMinutes: 30, isAlive: alive });
    expect(out.map((x) => x.sessionId)).toEqual(["new"]);
  });
});
