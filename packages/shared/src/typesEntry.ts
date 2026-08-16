// packages/shared/src/typesEntry.ts — types-only, safe for the Vite renderer
// (zero runtime fs/path imports; only type re-exports + two const enums of values)
export type {
  Session, TaskSummary, SubagentSummary, ModelPricingEntry,
  DashboardConfig, ArchivedSession,
} from './types';
export type { SourceMeta, AgentDescriptor, PresenceSourceMeta } from './agents/types';
export type { SourceId, SourceIdentity } from './agents/sourceMeta';
export { KNOWN_CONTEXT_WINDOWS, DEFAULT_CONTEXT_WINDOW } from './types';
// Agent display identity for the renderer. sourceMeta.ts is deliberately Node-free (plain
// object + pure functions), so this stays safe to pull into the Vite bundle.
export { SOURCE_META, sourceDisplayName, isSourceId } from './agents/sourceMeta';
