import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { processHookEvent, HookEvent, modelPricingFromConfig, calcTurnCost, resolveCwd, resolveSessionId } from '../hook';
import { readSessions, modelContextWindowFromConfig } from '@claude-dashboard/shared';
import { Session, DashboardConfig } from '@claude-dashboard/shared';

function writeTranscript(dir: string, entries: object[]): string {
  const p = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return p;
}

function assistantEntry(text: string, model = 'claude-sonnet-4-6', usage: Record<string, number> = {}, stopReason = 'end_turn') {
  return {
    type: 'assistant',
    message: {
      model,
      stop_reason: stopReason,
      content: [{ type: 'text', text }],
      usage: { input_tokens: 5000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 200, ...usage },
    },
  };
}

function userEntry(text: string) {
  return { type: 'user', message: { content: [{ type: 'text', text }] } };
}

// Cursor's native agent (not the `claude` CLI) fires the same hooks but writes
// transcripts in its own schema: `role` instead of `type`, no model/usage, and a
// standalone `{"type":"turn_ended"}` line marking the end of each turn.
function cursorUserEntry(text: string) {
  return { role: 'user', message: { content: [{ type: 'text', text: `<user_query>\n${text}\n</user_query>` }] } };
}

function cursorAssistantEntry(text: string) {
  return { role: 'assistant', message: { content: [{ type: 'text', text }] } };
}

const cursorTurnEnded = { type: 'turn_ended', status: 'success' };

// Codex CLI's rollout transcript format (confirmed live, Codex CLI 0.147.0): newline-
// delimited {timestamp, type, payload} lines, structurally distinct from both Claude
// Code's and Cursor's flat {type|role, message} entries.
function codexTurnContext(model: string) {
  return { timestamp: new Date().toISOString(), type: 'turn_context', payload: { model } };
}

function codexUserMessage(text: string) {
  return { timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'user_message', message: text } };
}

function codexAgentMessage(text: string, phase: 'commentary' | 'final_answer' = 'final_answer') {
  return { timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'agent_message', message: text, phase } };
}

// Codex's INTERACTIVE (`codex-tui`) mode wraps messages differently than `codex exec`
// mode above — confirmed live against a real interactive session (Codex CLI 0.147.0,
// originator "codex-tui"): event_msg's payload.type is "item_completed", wrapping an
// `item` object with `item.type: "UserMessage"|"AgentMessage"` (PascalCase) rather than
// the flat `user_message`/`agent_message` payload.type seen from `codex exec`. The two
// item types even disagree on their content block's inner `type` casing ("text" vs
// "Text"), so parsing reads `.text` directly without checking that field.
function codexUserMessageItem(text: string) {
  return {
    timestamp: new Date().toISOString(),
    type: 'event_msg',
    payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text }] } },
  };
}

function codexAgentMessageItem(text: string, phase: 'commentary' | 'final_answer' = 'final_answer') {
  return {
    timestamp: new Date().toISOString(),
    type: 'event_msg',
    payload: { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text }], phase } },
  };
}

function codexTokenCount(totalTokens: number, contextWindow = 258400, overrides: Partial<{ input_tokens: number; cached_input_tokens: number; cache_write_input_tokens: number; output_tokens: number }> = {}) {
  return {
    timestamp: new Date().toISOString(),
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: overrides.input_tokens ?? totalTokens - 100,
          cached_input_tokens: overrides.cached_input_tokens ?? 0,
          cache_write_input_tokens: overrides.cache_write_input_tokens ?? 0,
          output_tokens: overrides.output_tokens ?? 100,
          total_tokens: totalTokens,
        },
        model_context_window: contextWindow,
      },
    },
  };
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
      payloadModel: null,
      payloadModelId: null,
      payloadUsage: null,
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

  it('forces waiting_permission status via forceStatus, ignoring message text (Codex PermissionRequest)', () => {
    const existing = makeSession({ sessionId: 's1' });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    processHookEvent(
      { type: 'notification', sessionId: 's1', pid: 1, termSessionId: null, workingDir: dir, message: 'unrelated text with no keyword', forceStatus: 'waiting_permission' },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].status).toBe('waiting_permission');
  });

  it('still uses message-text sniffing when forceStatus is absent (existing Claude Notification behavior)', () => {
    const existing = makeSession({ sessionId: 's1' });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    processHookEvent(
      { type: 'notification', sessionId: 's1', pid: 1, termSessionId: null, workingDir: dir, message: 'needs input', notificationType: 'input_needed' },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].status).toBe('waiting_input');
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
      { type: 'user-prompt', sessionId: 'up-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'Hello' , payloadModel: null, payloadModelId: null },
      sessionsFile
    );
    const sessions = readSessions(sessionsFile);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('active');
  });

  it('stores lastPrompt from the event', () => {
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'Write a test' , payloadModel: null, payloadModelId: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].lastPrompt).toBe('Write a test');
  });

  it('ignores prompts that are system XML injections (start with <)', () => {
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: '<task-notification><task-id>abc</task-id></task-notification>' , payloadModel: null, payloadModelId: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].lastPrompt).toBeNull();
  });

  it('reads model and contextPct from the previous turn transcript', () => {
    const tp = writeTranscript(dir, [
      userEntry('First prompt'),
      assistantEntry('First response', 'claude-haiku-4-5-20251001', { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
    ]);
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, prompt: 'Second prompt' , payloadModel: null, payloadModelId: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.model).toBe('Haiku 4.5');
    expect(s.modelId).toBe('claude-haiku-4-5-20251001');
    expect(s.contextPct).toBe(5); // 10000 / 200000 = 5%
    expect(s.contextTokens).toBe(10000);
  });

  it('un-dismisses a dismissed session', () => {
    const existing = makeSession({ sessionId: 'up-1', dismissed: true });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 100, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'Resume' , payloadModel: null, payloadModelId: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].dismissed).toBe(false);
  });

  it('resets loop detection on new prompt', () => {
    const existing = makeSession({ sessionId: 'up-1', loopTool: 'Bash', loopCount: 5, errorState: true });
    fs.writeFileSync(sessionsFile, JSON.stringify([existing]));
    processHookEvent(
      { type: 'user-prompt', sessionId: 'up-1', pid: 100, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'New task' , payloadModel: null, payloadModelId: null },
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
      { type: 'stop', sessionId: 's1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
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
      { type: 'stop', sessionId: 's2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
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
      { type: 'stop', sessionId: 's3', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
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
      { type: 'stop', sessionId: 's4', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].model).toBe('Haiku 4.5');
  });

  it('reads lastMessage and turns from a Cursor-schema transcript', () => {
    const tp = writeTranscript(dir, [
      cursorUserEntry('hi'),
      cursorAssistantEntry('Hi! How can I help you today?'),
      cursorTurnEnded,
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'cursor-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.lastMessage).toBe('Hi! How can I help you today?');
    expect(s.turns).toBe(1);
    expect(s.status).toBe('done');
    // Cursor transcripts carry no model/usage — those stay unavailable rather than crashing.
    expect(s.model).toBeNull();
    expect(s.contextPct).toBeNull();
    expect(s.costUsd).toBeNull();
    // Tags the session so the UI can hide model/cost/context fields it'll never populate.
    expect(s.source).toBe('cursor');
  });

  // Confirmed live: a real interactive cursor-agent session's transcript had exactly one
  // turn_ended marker across two turns, trailing only the second (which also errored) — not
  // one per turn. Requiring the marker on Stop meant the first turn's response was silently
  // dropped and each later card showed the *previous* turn's text instead of the current one.
  it('reads the final response on stop even when no turn_ended marker is present yet', () => {
    const tp = writeTranscript(dir, [
      cursorUserEntry('hi'),
      cursorAssistantEntry('Hi — what do you want to work on?'),
      // No turn_ended line — this is the real, confirmed shape of a first turn.
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'cursor-3', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.lastMessage).toBe('Hi — what do you want to work on?');
    expect(s.status).toBe('done');
  });

  it('reads the second turn\'s own response, not the first turn\'s, when only the second has a turn_ended marker', () => {
    const tp = writeTranscript(dir, [
      cursorUserEntry('hi'),
      cursorAssistantEntry('Hi — what do you want to work on?'),
      cursorUserEntry('hello'),
      cursorAssistantEntry('Hi again — what can I help with?'),
      cursorTurnEnded,
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'cursor-4', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.lastMessage).toBe('Hi again — what can I help with?');
  });

  // Confirmed live against a real cursor-agent interactive session: its `stop` payload's
  // transcript_path can be null even though the transcript file genuinely exists on disk
  // (already known from an earlier event on the same session) — falls back to it instead
  // of losing the response.
  it('falls back to the session\'s already-known transcript path when a Cursor stop payload omits transcript_path', () => {
    // Transcript starts with just the user's message — matches how Cursor actually writes
    // it (the assistant's response isn't on disk yet when user-prompt fires).
    const tp = writeTranscript(dir, [cursorUserEntry('hi')]);
    processHookEvent(
      { type: 'user-prompt', sessionId: 'cursor-2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, prompt: 'hi', payloadModel: null, payloadModelId: null },
      sessionsFile
    );
    // This is the state at the point 'stop' fires: response is on disk now, but (per the
    // real observed payload) transcript_path itself is missing from the stop event.
    fs.appendFileSync(tp, JSON.stringify(cursorAssistantEntry('Hi — what do you want to work on?')) + '\n' + JSON.stringify(cursorTurnEnded) + '\n');
    processHookEvent(
      { type: 'stop', sessionId: 'cursor-2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.lastMessage).toBe('Hi — what do you want to work on?');
    expect(s.status).toBe('done');
  });

  it('tags source as cursor from a pre-tool event too, not just stop', () => {
    const tp = writeTranscript(dir, [
      cursorUserEntry('list files'),
      cursorAssistantEntry('Sure, one moment.'),
    ]);
    processHookEvent(
      { type: 'pre-tool', sessionId: 'cursor-4', pid: 1, termSessionId: null, workingDir: dir, toolName: 'Shell', input: {} },
      sessionsFile
    );
    // pre-tool reads session.transcriptPath, which is only set by a prior user-prompt event.
    const sessions = readSessions(sessionsFile);
    sessions[0].transcriptPath = tp;
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions));
    processHookEvent(
      { type: 'pre-tool', sessionId: 'cursor-4', pid: 1, termSessionId: null, workingDir: dir, toolName: 'Shell', input: {} },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].source).toBe('cursor');
  });

  it('does not tag a Claude Code session as cursor', () => {
    const tp = writeTranscript(dir, [
      userEntry('Hi'),
      assistantEntry('Hello.'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'claude-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].source).toBeUndefined();
  });

  it('only accepts the Cursor assistant entry immediately before turn_ended as the final message', () => {
    // Simulates a turn with an intermediate assistant message before the true final one.
    const tp = writeTranscript(dir, [
      cursorUserEntry('do a thing'),
      cursorAssistantEntry('Working on it...'),
      cursorAssistantEntry('Done, here is the result.'),
      cursorTurnEnded,
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'cursor-2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].lastMessage).toBe('Done, here is the result.');
  });

  it('counts multiple Cursor turns correctly', () => {
    const tp = writeTranscript(dir, [
      cursorUserEntry('first'),
      cursorAssistantEntry('First reply'),
      cursorTurnEnded,
      cursorUserEntry('second'),
      cursorAssistantEntry('Second reply'),
      cursorTurnEnded,
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'cursor-3', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp , payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.lastMessage).toBe('Second reply');
    expect(s.turns).toBe(2);
  });
});

describe('processHookEvent — Cursor payload usage (no transcript data)', () => {
  let dir: string;
  let sessionsFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    sessionsFile = path.join(dir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('reads model, contextPct, and totalTokens straight from the stop payload', () => {
    processHookEvent(
      {
        type: 'stop', sessionId: 'c1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null,
        payloadModel: 'composer-2.5-fast', payloadModelId: 'composer-2.5',
        payloadUsage: { inputTokens: 35297, outputTokens: 18, cacheReadTokens: 34592, cacheWriteTokens: 0 },
      },
      sessionsFile,
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.model).toBe('composer-2.5-fast');
    expect(s.modelId).toBe('composer-2.5');
    // (35297 input + 34592 cache_read + 0 cache_write) / 200000 default window = 35%
    expect(s.contextPct).toBe(35);
    expect(s.contextTokens).toBe(69889);
    expect(s.totalTokens).toBe(35315); // input + output, not counting cache
  });

  // Confirmed live: cursor-agent's interactive-mode stop payload sends `model`
  // ("cursor-grok-4.6-high-fast") with no `model_id` field at all — contextPct/modelId
  // must still compute from `model` alone rather than staying null forever.
  it('falls back to payloadModel for contextPct/modelId when payloadModelId is absent', () => {
    processHookEvent(
      {
        type: 'stop', sessionId: 'c1b', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null,
        payloadModel: 'cursor-grok-4.6-high-fast', payloadModelId: null,
        payloadUsage: { inputTokens: 32703, outputTokens: 174, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      sessionsFile,
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.model).toBe('cursor-grok-4.6-high-fast');
    expect(s.modelId).toBe('cursor-grok-4.6-high-fast');
    // 32703 / 200000 default window = 16%
    expect(s.contextPct).toBe(16);
    expect(s.contextTokens).toBe(32703);
  });

  it('leaves cost null when no pricing is configured for the model', () => {
    processHookEvent(
      {
        type: 'stop', sessionId: 'c2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null,
        payloadModel: 'composer-2.5-fast', payloadModelId: 'composer-2.5',
        payloadUsage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      sessionsFile,
    );
    expect(readSessions(sessionsFile)[0].costUsd).toBeNull();
  });

  it('computes cost when custom pricing is configured for the model prefix', () => {
    const cfg = {
      modelPricing: { fetched: {}, custom: [{ prefix: 'composer', input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 }] },
    } as unknown as DashboardConfig;
    processHookEvent(
      {
        type: 'stop', sessionId: 'c3', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null,
        payloadModel: 'composer-2.5-fast', payloadModelId: 'composer-2.5',
        payloadUsage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      sessionsFile,
      cfg,
    );
    expect(readSessions(sessionsFile)[0].costUsd).toBe(3);
  });

  it('accumulates totalTokens and cost across multiple turns', () => {
    const cfg = {
      modelPricing: { fetched: {}, custom: [{ prefix: 'composer', input: 1, cacheWrite: 1, cacheRead: 1, output: 1 }] },
    } as unknown as DashboardConfig;
    const event = (sid: string, input: number) => ({
      type: 'stop' as const, sessionId: sid, pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null,
      payloadModel: 'composer-2.5-fast', payloadModelId: 'composer-2.5',
      payloadUsage: { inputTokens: input, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    processHookEvent(event('c4', 1_000_000), sessionsFile, cfg);
    processHookEvent(event('c4', 1_000_000), sessionsFile, cfg);
    const s = readSessions(sessionsFile)[0];
    expect(s.totalTokens).toBe(2_000_000);
    expect(s.costUsd).toBe(2);
  });

  it('ignores payload model/usage when the transcript already provided stats', () => {
    const tp = writeTranscript(dir, [
      userEntry('Hi'),
      assistantEntry('Hello.', 'claude-haiku-4-5-20251001', { input_tokens: 5000 }),
    ]);
    processHookEvent(
      {
        type: 'stop', sessionId: 'c5', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp,
        payloadModel: 'composer-2.5-fast', payloadModelId: 'composer-2.5',
        payloadUsage: { inputTokens: 999, outputTokens: 999, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      sessionsFile,
    );
    // Claude Code transcript stats take precedence over the payload fallback.
    expect(readSessions(sessionsFile)[0].model).toBe('Haiku 4.5');
  });

  it('reads model from the user-prompt payload too', () => {
    processHookEvent(
      {
        type: 'user-prompt', sessionId: 'c6', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: null, prompt: 'hi',
        payloadModel: 'composer-2.5-fast', payloadModelId: 'composer-2.5',
      },
      sessionsFile,
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.model).toBe('composer-2.5-fast');
    expect(s.modelId).toBe('composer-2.5');
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

  // Real captured cursor-agent CLI preToolUse payload: {"tool_name":"Shell","tool_input":{"command":"...","cwd":"","timeout":30000}}
  it('summarises Shell (Cursor CLI\'s shell tool name) with the command', () => {
    firePostTool('Shell', { command: 'ls -la' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('ls -la');
  });

  // Real captured cursor-agent CLI preToolUse payload: {"tool_name":"Write","tool_input":{"path":"...","contents":"..."}}
  // — Cursor's Write tool sends `path`, not Claude Code's `file_path`.
  it('summarises Write with Cursor\'s `path` field when `file_path` is absent', () => {
    firePostTool('Write', { path: '/src/new-file.ts', contents: 'hello' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('/src/new-file.ts');
  });

  it('prefers file_path over path for Write when both are present', () => {
    firePostTool('Write', { file_path: '/src/a.ts', path: '/src/b.ts' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('/src/a.ts');
  });

  // Real captured Codex CLI PreToolUse payload:
  // {"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Update File: /path/to/sample.txt\n@@\n+round 2\n*** End Patch"}}
  it('summarises apply_patch (Codex CLI\'s patch tool) with the touched file path', () => {
    firePostTool('apply_patch', {
      command: '*** Begin Patch\n*** Update File: /path/to/sample.txt\n@@\n+round 2\n*** End Patch',
    });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('/path/to/sample.txt');
  });

  it('summarises apply_patch for a new file (Add File)', () => {
    firePostTool('apply_patch', {
      command: '*** Begin Patch\n*** Add File: /path/to/new.txt\n+hello\n*** End Patch',
    });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBe('/path/to/new.txt');
  });

  it('returns null for apply_patch when command has no recognizable File line', () => {
    firePostTool('apply_patch', { command: 'not a real patch' });
    expect(readSessions(sessionsFile)[0].lastToolSummary).toBeNull();
  });
});

describe('modelPricingFromConfig', () => {
  const baseConfig: DashboardConfig = {
    columns: { elapsedTime: true, gitBranch: true, changedFiles: true, cost: false, subagents: true, lastAction: true, compactPaths: true, doneFooter: true, footerStyle: 'default' },
    staleSessionMinutes: 30,
    maxHeight: 700,
    theme: 'light',
    notifications: true,
    notificationSound: true,
    showBadgeCount: false,
  };

  it('returns hardcoded price when no config override', () => {
    const p = modelPricingFromConfig('claude-sonnet-4-6', baseConfig);
    expect(p).not.toBeNull();
    expect(p!.input).toBe(3);
    expect(p!.output).toBe(15);
  });

  it('returns fetched price when config has fetched entry for prefix', () => {
    const cfg: DashboardConfig = {
      ...baseConfig,
      modelPricing: {
        fetched: { 'claude-sonnet-4': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 } },
        custom: [],
      },
    };
    const p = modelPricingFromConfig('claude-sonnet-4-6', cfg);
    expect(p!.input).toBe(2);
    expect(p!.output).toBe(10);
  });

  it('custom entry overrides fetched entry for same prefix', () => {
    const cfg: DashboardConfig = {
      ...baseConfig,
      modelPricing: {
        fetched: { 'claude-sonnet-4': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 } },
        custom: [{ prefix: 'claude-sonnet-4', input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 }],
      },
    };
    const p = modelPricingFromConfig('claude-sonnet-4-6', cfg);
    expect(p!.input).toBe(1);
    expect(p!.output).toBe(5);
  });

  it('custom entry with unknown prefix matches model id', () => {
    const cfg: DashboardConfig = {
      ...baseConfig,
      modelPricing: {
        fetched: {},
        custom: [{ prefix: 'my-proxy', input: 0.5, cacheWrite: 0.6, cacheRead: 0.05, output: 2 }],
      },
    };
    const p = modelPricingFromConfig('my-proxy-v2', cfg);
    expect(p!.input).toBe(0.5);
  });

  it('returns null for unknown model with no config override', () => {
    const p = modelPricingFromConfig('unknown-model-xyz', baseConfig);
    expect(p).toBeNull();
  });
});

describe('modelContextWindowFromConfig', () => {
  const baseConfig: DashboardConfig = {
    columns: { elapsedTime: true, gitBranch: true, changedFiles: true, cost: false, subagents: true, lastAction: true, compactPaths: true, doneFooter: true, footerStyle: 'default' },
    staleSessionMinutes: 30,
    maxHeight: 700,
    theme: 'light',
    notifications: true,
    notificationSound: true,
    showBadgeCount: false,
  };

  it('returns 200000 default when no config and no known window', () => {
    expect(modelContextWindowFromConfig('claude-haiku-4-5', baseConfig)).toBe(200_000);
  });

  it('returns hardcoded 1M for models in KNOWN_CONTEXT_WINDOWS when no config override', () => {
    expect(modelContextWindowFromConfig('claude-opus-4-6', baseConfig)).toBe(1_000_000);
    expect(modelContextWindowFromConfig('claude-sonnet-4-6', baseConfig)).toBe(1_000_000);
  });

  it('returns fetched value when config has fetched entry matching prefix', () => {
    const cfg: DashboardConfig = {
      ...baseConfig,
      modelContextWindows: {
        fetched: { 'claude-sonnet-4-6': 200_000 },
        custom: [],
      },
    };
    expect(modelContextWindowFromConfig('claude-sonnet-4-6-20250514', cfg)).toBe(200_000);
  });

  it('custom entry overrides fetched entry for same prefix', () => {
    const cfg: DashboardConfig = {
      ...baseConfig,
      modelContextWindows: {
        fetched: { 'claude-sonnet-4-6': 1_000_000 },
        custom: [{ prefix: 'claude-sonnet-4-6', contextWindow: 200_000 }],
      },
    };
    expect(modelContextWindowFromConfig('claude-sonnet-4-6-20250514', cfg)).toBe(200_000);
  });

  it('prefix matching — model variant matches parent prefix', () => {
    const cfg: DashboardConfig = {
      ...baseConfig,
      modelContextWindows: {
        fetched: { 'claude-haiku-4': 100_000 },
        custom: [],
      },
    };
    expect(modelContextWindowFromConfig('claude-haiku-4-5-20251001', cfg)).toBe(100_000);
  });

  it('custom entry with unknown prefix matches model by prefix', () => {
    const cfg: DashboardConfig = {
      ...baseConfig,
      modelContextWindows: {
        fetched: {},
        custom: [{ prefix: 'my-proxy', contextWindow: 50_000 }],
      },
    };
    expect(modelContextWindowFromConfig('my-proxy-v2', cfg)).toBe(50_000);
  });

  it('falls back to DEFAULT_CONTEXT_WINDOW for unknown model with no config', () => {
    expect(modelContextWindowFromConfig('unknown-model-xyz', baseConfig)).toBe(200_000);
  });

  it('falls back to DEFAULT_CONTEXT_WINDOW when no config provided', () => {
    expect(modelContextWindowFromConfig('unknown-model-xyz')).toBe(200_000);
  });
});

describe('resolveCwd', () => {
  it('prefers payload.cwd (Claude Code always sends this)', () => {
    expect(resolveCwd({ cwd: '/Users/alice/code/myproject' }, '/fallback')).toBe('/Users/alice/code/myproject');
  });

  // Real Cursor `beforeSubmitPrompt`/`stop` payload never has `cwd`, and `workspace_roots`
  // is empty for a window with no folder open — this is what we actually captured.
  it('falls back to the hook process cwd when Cursor sends neither cwd nor workspace_roots', () => {
    const cursorPayload = {
      conversation_id: 'b40ae5e3-e12c-44d3-943c-82ffb6211d11',
      model: 'composer-2.5-fast',
      model_id: 'composer-2.5',
      composer_mode: 'agent',
      prompt: 'hi',
      hook_event_name: 'beforeSubmitPrompt',
      cursor_version: '3.15.19',
      workspace_roots: [],
    };
    expect(resolveCwd(cursorPayload, '/Users/meagle/.claude')).toBe('/Users/meagle/.claude');
  });

  it('uses the first workspace_roots entry when cwd is absent but a folder is open', () => {
    const cursorPayload = {
      hook_event_name: 'beforeSubmitPrompt',
      workspace_roots: ['/Users/meagle/code/my-project'],
    };
    expect(resolveCwd(cursorPayload, '/Users/meagle/.claude')).toBe('/Users/meagle/code/my-project');
  });

  it('ignores an empty-string workspace_roots entry', () => {
    expect(resolveCwd({ workspace_roots: [''] }, '/fallback')).toBe('/fallback');
  });

  it('falls back when workspace_roots is missing entirely', () => {
    expect(resolveCwd({}, '/fallback')).toBe('/fallback');
  });
});

describe('resolveSessionId', () => {
  it('prefers payload.session_id (Claude Code always sends this)', () => {
    expect(resolveSessionId({ session_id: 'abc-123' }, 'fallback')).toBe('abc-123');
  });

  // Real captured Cursor `beforeSubmitPrompt` payload has no `session_id` field at all —
  // only `conversation_id` (see the resolveCwd tests above for the same fixture shape).
  it('falls back to payload.conversation_id when session_id is absent (Cursor payload shape)', () => {
    const cursorPayload = {
      conversation_id: 'b40ae5e3-e12c-44d3-943c-82ffb6211d11',
      model: 'composer-2.5-fast',
      hook_event_name: 'beforeSubmitPrompt',
    };
    expect(resolveSessionId(cursorPayload, 'unknown')).toBe('b40ae5e3-e12c-44d3-943c-82ffb6211d11');
  });

  it('prefers session_id over conversation_id when both are present', () => {
    expect(resolveSessionId({ session_id: 'abc-123', conversation_id: 'xyz-789' }, 'fallback')).toBe('abc-123');
  });

  it('falls back to the provided default when neither field is present', () => {
    expect(resolveSessionId({}, 'unknown')).toBe('unknown');
  });
});

describe('processHookEvent — Codex rollout schema', () => {
  let dir: string;
  let sessionsFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    sessionsFile = path.join(dir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('tags source as codex and reads the final_answer message on stop', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('list files'),
      codexAgentMessage('Working on it...', 'commentary'),
      codexAgentMessage('Here are the files.', 'final_answer'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'codex-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.source).toBe('codex');
    expect(s.lastMessage).toBe('Here are the files.');
    expect(s.status).toBe('done');
  });

  // Reproduces a real bug found via live interactive `codex` usage: a plain "hi" with
  // no tool calls, transcript shape captured from an actual codex-tui session.
  it('reads lastMessage/turns from interactive-mode item_completed events, not just exec-mode flat events', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-luna'),
      codexUserMessageItem('hi'),
      codexAgentMessageItem('Hi! What would you like to work on?', 'final_answer'),
      codexTokenCount(13075, 258400, { input_tokens: 13061, cached_input_tokens: 8960, output_tokens: 14 }),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'codex-tui-1', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.lastMessage).toBe('Hi! What would you like to work on?');
    expect(s.turns).toBe(1);
    expect(s.status).toBe('done');
    // Before the fix, failing to find `text` made readLastAssistantStatsWithRetry give up
    // after 6 retries and discard the ENTIRE stats object — including contextPct/totalTokens,
    // which readCodexStats had actually computed correctly on every attempt. Assert those
    // survive too, not just the message text.
    expect(s.contextTokens).toBe(13075);
    expect(s.contextPct).toBe(5);
    expect(s.totalTokens).toBe(13075);
    expect(s.modelId).toBe('gpt-5.6-luna');
  });

  it('ignores commentary-phase item_completed text on stop, only accepting final_answer', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-luna'),
      codexUserMessageItem('do a thing'),
      codexAgentMessageItem('final answer text', 'final_answer'),
      codexAgentMessageItem('trailing commentary that should not win', 'commentary'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'codex-tui-2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].lastMessage).toBe('final answer text');
  });

  it('accepts commentary-phase item_completed text as a live partial response during pre-tool', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-luna'),
      codexUserMessageItem('do a thing'),
      codexAgentMessageItem('working on it, running a command now', 'commentary'),
    ]);
    processHookEvent(
      { type: 'pre-tool', sessionId: 'codex-tui-3', pid: 1, termSessionId: null, workingDir: dir, toolName: 'Bash', input: { command: 'ls' } },
      sessionsFile
    );
    const sessions = readSessions(sessionsFile);
    sessions[0].transcriptPath = tp;
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions));
    processHookEvent(
      { type: 'pre-tool', sessionId: 'codex-tui-3', pid: 1, termSessionId: null, workingDir: dir, toolName: 'Bash', input: { command: 'ls' } },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].partialResponse).toBe('working on it, running a command now');
  });

  it('ignores commentary-phase text on stop, only accepting final_answer', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('do a thing'),
      codexAgentMessage('final answer text', 'final_answer'),
      codexAgentMessage('trailing commentary that should not win', 'commentary'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'codex-2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    // Scanning backwards, the trailing commentary is seen first but rejected (not final_answer);
    // the final_answer entry before it is accepted instead.
    expect(readSessions(sessionsFile)[0].lastMessage).toBe('final answer text');
  });

  it('accepts commentary-phase text as a live partial response during pre-tool', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('do a thing'),
      codexAgentMessage('working on it, running a command now', 'commentary'),
    ]);
    processHookEvent(
      { type: 'pre-tool', sessionId: 'codex-3', pid: 1, termSessionId: null, workingDir: dir, toolName: 'Bash', input: { command: 'ls' } },
      sessionsFile
    );
    // pre-tool reads session.transcriptPath, set by a prior user-prompt event — same
    // pattern as the existing Cursor pre-tool test above.
    const sessions = readSessions(sessionsFile);
    sessions[0].transcriptPath = tp;
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions));
    processHookEvent(
      { type: 'pre-tool', sessionId: 'codex-3', pid: 1, termSessionId: null, workingDir: dir, toolName: 'Bash', input: { command: 'ls' } },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].partialResponse).toBe('working on it, running a command now');
  });

  it('counts turns from user_message events', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('first'),
      codexAgentMessage('first reply', 'final_answer'),
      codexUserMessage('second'),
      codexAgentMessage('second reply', 'final_answer'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'codex-4', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.turns).toBe(2);
    expect(s.lastMessage).toBe('second reply');
  });

  it('computes contextPct/contextTokens from token_count using the reported model_context_window', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('hi'),
      codexTokenCount(25840, 258400), // 10% of the reported context window
      codexAgentMessage('hello', 'final_answer'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'codex-5', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    const s = readSessions(sessionsFile)[0];
    expect(s.contextTokens).toBe(25840);
    expect(s.contextPct).toBe(10);
    expect(s.totalTokens).toBe(25840);
    expect(s.modelId).toBe('gpt-5.6-terra');
  });

  it('leaves costUsd null when no pricing is configured for the model', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('hi'),
      codexTokenCount(5000, 258400),
      codexAgentMessage('hello', 'final_answer'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'codex-6', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].costUsd).toBeNull();
  });

  it('computes costUsd when custom pricing is configured for the model prefix', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('hi'),
      codexTokenCount(5000, 258400, { input_tokens: 4000, output_tokens: 1000 }),
      codexAgentMessage('hello', 'final_answer'),
    ]);
    const cfg: DashboardConfig = {
      columns: { elapsedTime: true, gitBranch: true, changedFiles: true, cost: false, subagents: true, lastAction: true, compactPaths: true, doneFooter: true, footerStyle: 'default' },
      staleSessionMinutes: 30, maxHeight: 700, theme: 'light', notifications: true, notificationSound: true, showBadgeCount: false,
      modelPricing: { fetched: {}, custom: [{ prefix: 'gpt-5.6', input: 2, cacheWrite: 0, cacheRead: 0.5, output: 8 }] },
    };
    processHookEvent(
      { type: 'stop', sessionId: 'codex-7', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile,
      cfg
    );
    // (4000 * 2 + 1000 * 8) / 1_000_000 = 0.016
    expect(readSessions(sessionsFile)[0].costUsd).toBe(0.016);
  });

  it('does not double-count cached tokens in cost (input_tokens is cache-inclusive for Codex)', () => {
    const tp = writeTranscript(dir, [
      codexTurnContext('gpt-5.6-terra'),
      codexUserMessage('hi'),
      codexTokenCount(5000, 258400, { input_tokens: 4000, cached_input_tokens: 1000, output_tokens: 1000 }),
      codexAgentMessage('hello', 'final_answer'),
    ]);
    const cfg: DashboardConfig = {
      columns: { elapsedTime: true, gitBranch: true, changedFiles: true, cost: false, subagents: true, lastAction: true, compactPaths: true, doneFooter: true, footerStyle: 'default' },
      staleSessionMinutes: 30, maxHeight: 700, theme: 'light', notifications: true, notificationSound: true, showBadgeCount: false,
      modelPricing: { fetched: {}, custom: [{ prefix: 'gpt-5.6', input: 2, cacheWrite: 0, cacheRead: 0.5, output: 8 }] },
    };
    processHookEvent(
      { type: 'stop', sessionId: 'codex-8', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile,
      cfg
    );
    // Correct (uncached-portion + cache-read + output): (3000*2 + 1000*0.5 + 1000*8) / 1_000_000 = 0.0145
    // Buggy (double-counted): (4000*2 + 1000*0.5 + 1000*8) / 1_000_000 = 0.0165 — this test fails against that.
    expect(readSessions(sessionsFile)[0].costUsd).toBe(0.0145);
  });

  it('does not misdetect a Claude Code transcript as Codex', () => {
    const tp = writeTranscript(dir, [
      userEntry('Hi'),
      assistantEntry('Hello.'),
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'claude-2', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].source).toBeUndefined();
  });

  it('does not misdetect a Cursor transcript as Codex', () => {
    const tp = writeTranscript(dir, [
      cursorUserEntry('hi'),
      cursorAssistantEntry('Hi!'),
      cursorTurnEnded,
    ]);
    processHookEvent(
      { type: 'stop', sessionId: 'cursor-5', pid: 1, termSessionId: null, workingDir: dir, transcriptPath: tp, payloadModel: null, payloadModelId: null, payloadUsage: null },
      sessionsFile
    );
    expect(readSessions(sessionsFile)[0].source).toBe('cursor');
  });
});
