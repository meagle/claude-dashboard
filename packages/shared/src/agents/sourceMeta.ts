// packages/shared/src/agents/sourceMeta.ts — the single source of agent display identity.
//
// Consumed by BOTH sides: the descriptors spread these fields onto themselves (so identity is
// defined once, not duplicated per descriptor) and the Vite renderer imports it via
// typesEntry.ts. That second consumer is why this file must stay Node-free — a plain object
// plus pure functions, never an fs/path/electron import — since the renderer must not pull in
// the fs-heavy `@claude-dashboard/shared` index.
import type { Session } from '../types';

// The non-optional form of Session['source']: every source the dashboard can render a card for.
export type SourceId = NonNullable<Session['source']>;

export interface SourceIdentity {
  displayName: string;
  color: string;    // hex, used for the UI chip
  iconKey: string;  // renderer maps this to an SVG (see agentIdentity.ts)
}

// Keyed by SourceId, so a new member of Session['source'] without an entry here — or an entry
// whose key isn't in the union — is a compile error rather than a card that renders untitled.
export const SOURCE_META: Record<SourceId, SourceIdentity> = {
  'claude-code': { displayName: 'Claude Code', color: '#D97757', iconKey: 'claude' },
  cursor: { displayName: 'Cursor', color: '#6b7cff', iconKey: 'cursor' },
  codex: { displayName: 'Codex', color: '#10a37f', iconKey: 'codex' },
  desktop: { displayName: 'Claude Desktop', color: '#D97757', iconKey: 'claude' },
};

export function isSourceId(id: string | undefined): id is SourceId {
  return !!id && Object.prototype.hasOwnProperty.call(SOURCE_META, id);
}

// Display name for any source string, including ones written by an older/newer hook than this
// build knows about. Falls back to a generic, agent-agnostic label rather than "Claude".
export function sourceDisplayName(source: string | undefined): string {
  return isSourceId(source) ? SOURCE_META[source].displayName : 'Agent';
}
