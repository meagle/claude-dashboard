// Resolves a session's `source` into what the UI shows for it: name, accent color, glyph.
//
// Name and color come from the shared SOURCE_META (see packages/shared/src/agents/sourceMeta.ts)
// so agent identity is defined once and the descriptors, the hook and the renderer can't drift.
// Only the iconKey → SVG mapping lives here, since the glyphs are renderer-side.
import type { ReactNode } from 'react';
import { SOURCE_META, isSourceId, sourceDisplayName } from '@claude-dashboard/shared/types';
import {
  CLAUDE_ICON,
  CURSOR_ICON,
  CODEX_ICON,
  AGENT_FALLBACK_ICON,
} from '../components/icons';

export interface AgentIdentity {
  name: string;
  color: string;
  icon: ReactNode;
}

// Neutral grey for an unrecognized source — deliberately not any agent's brand color.
export const FALLBACK_AGENT_COLOR = '#8a8a8a';

const ICON_BY_KEY: Record<string, ReactNode> = {
  claude: CLAUDE_ICON,
  cursor: CURSOR_ICON,
  codex: CODEX_ICON,
};

export function agentIdentity(source: string | undefined): AgentIdentity {
  const meta = isSourceId(source) ? SOURCE_META[source] : undefined;
  return {
    // sourceDisplayName already falls back to the agent-agnostic 'Agent'.
    name: sourceDisplayName(source),
    color: meta?.color ?? FALLBACK_AGENT_COLOR,
    icon: (meta && ICON_BY_KEY[meta.iconKey]) ?? AGENT_FALLBACK_ICON,
  };
}
