import type { DashboardConfig } from '../types';

export interface CanonicalUsage {
  input: number;      // full-rate input tokens, cache-exclusive
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface TranscriptStats {
  text: string | null;
  model: string | null;
  modelId: string | null;
  contextPct: number | null;
  contextTokens: number | null;
  turns: number | null;
  costUsd: number | null;
  totalTokens: number | null;
  schema: string | null; // descriptor id, or null if nothing recognized yet
}

export interface HookPayloadFields {
  sessionId: string[];   // payload keys to try, in order (e.g. ['session_id','conversation_id'])
  cwd: string[];         // e.g. ['cwd'] ; may resolve arrays (workspace_roots[0]) — see cwdFromPayload
}

export interface AgentDescriptor {
  id: string;                         // === Session.source
  displayName: string;                // 'Claude Code' | 'Cursor' | 'Codex'
  color: string;                      // hex, used for the UI chip
  iconKey: string;                    // renderer maps this to an SVG (see agentIdentity.ts)
  processPattern: RegExp;             // pid-reuse liveness guard for this agent

  // Runtime (hook side)
  matchesTranscript(firstParsedLine: unknown): boolean; // stale-install probe fallback
  parse(lines: string[], endTurnOnly: boolean, cfg?: DashboardConfig): TranscriptStats;
  toolSummary(toolName: string, input: Record<string, unknown>): string | null;
  payload: HookPayloadFields;
  cwdFromPayload(payload: Record<string, unknown>, fallback: string): string;
  sessionIdFromPayload(payload: Record<string, unknown>, fallback: string): string;

  // Install (main side) — mutate the parsed config object in place / return it.
  isInstalled(homedir: string): boolean;                // is this agent present on the machine?
  configPath(homedir: string): string;
  defaultConfig(): Record<string, unknown>;             // shape when file is absent
  installHooks(config: Record<string, unknown>, hookCmd: (arg: string) => string): void;
}

export interface PresenceSourceMeta {
  id: string;             // e.g. 'desktop'  (=== Session.source)
  displayName: string;    // 'Claude Desktop'
  color: string;
  iconKey: string;
}

export type SourceMeta =
  | ({ kind: 'hook' } & Pick<AgentDescriptor, 'id' | 'displayName' | 'color' | 'iconKey'>)
  | ({ kind: 'presence' } & PresenceSourceMeta);
