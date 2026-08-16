import { claudeCodeDescriptor } from './claudeCode';
import { cursorDescriptor } from './cursor';
import { codexDescriptor } from './codex';
import type { AgentDescriptor, PresenceSourceMeta, SourceMeta } from './types';
import { SOURCE_META, type SourceId } from './sourceMeta';

export * from './types';
export * from './sourceMeta';
export * from './parseUtils';
export * from './cost';
export * from './installUtils';
export * from './claudeCode';
export * from './cursor';
export * from './codex';

// The registry of hook-driven agents this dashboard understands. Adding a new agent means
// writing a descriptor module (see claudeCode.ts/cursor.ts/codex.ts for the shape) and
// listing it here — everything else (SOURCES, getAgentById, probeAgent,
// isKnownAgentProcessArgs) derives from this array.
export const HOOK_AGENTS: AgentDescriptor[] = [
  claudeCodeDescriptor,
  cursorDescriptor,
  codexDescriptor,
];

// Sources that report presence without going through the hook pipeline (e.g. Claude Desktop,
// detected by process/window presence rather than transcript events). Identity comes from
// SOURCE_META like every other source; only the id list lives here.
const PRESENCE_IDS: SourceId[] = ['desktop'];

export const PRESENCE_SOURCES: PresenceSourceMeta[] = PRESENCE_IDS.map((id) => ({
  id,
  ...SOURCE_META[id],
}));

// Single manifest of every source the UI can render a card for, hook-driven or presence-only.
export const SOURCES: SourceMeta[] = [
  ...HOOK_AGENTS.map((a) => ({ kind: 'hook' as const, id: a.id, ...SOURCE_META[a.id] })),
  ...PRESENCE_SOURCES.map((p) => ({ kind: 'presence' as const, ...p })),
];

// Lookup form of SOURCES. Typed over the full SourceId union, so consumers can index it
// without a null check; agents.test.ts pins that every SourceId really is populated.
export const SOURCE_BY_ID: Record<SourceId, SourceMeta> = SOURCES.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<SourceId, SourceMeta>,
);

export function getAgentById(id: string): AgentDescriptor | undefined {
  return HOOK_AGENTS.find((a) => a.id === id);
}

export function probeAgent(line: unknown): AgentDescriptor | undefined {
  return HOOK_AGENTS.find((a) => a.matchesTranscript(line));
}

// Command-line substrings that identify a process as a coding agent whose hook events this
// dashboard understands. Used to guard against pid reuse: a session's pid may be recycled by
// the OS to an unrelated process after the original agent exits, so liveness checks confirm
// the pid still belongs to a known agent rather than trusting `kill(pid, 0)` alone.
export function isKnownAgentProcessArgs(args: string): boolean {
  return HOOK_AGENTS.some((a) => a.processPattern.test(args));
}
