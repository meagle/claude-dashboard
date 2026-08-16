import React from "react";
import { agentIdentity } from "../utils/agentIdentity";

interface AgentChipProps {
  source: string | undefined;
  /** Icon-only, for the tighter compact row. The name still ships as the title/aria-label. */
  compact?: boolean;
}

// The card's primary "what is this" signal: which agent this session belongs to.
// Tinted with the agent's own color (from SOURCE_META) so a crowded list is scannable
// by color alone before you read any text.
export function AgentChip({ source, compact = false }: AgentChipProps) {
  const { name, color, icon } = agentIdentity(source);

  return (
    <span
      data-testid="agent-chip"
      title={name}
      aria-label={name}
      className={
        "inline-flex items-center shrink-0 rounded-badge border leading-none " +
        (compact ? "p-[2px]" : "gap-1 px-1.5 py-0.5")
      }
      style={{
        color,
        // Hex + alpha suffix: a faint wash of the agent color, readable in both themes.
        borderColor: `${color}59`,
        backgroundColor: `${color}1f`,
      }}
    >
      {icon}
      {!compact && <span>{name}</span>}
    </span>
  );
}
