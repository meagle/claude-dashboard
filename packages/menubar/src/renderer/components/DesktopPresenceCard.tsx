import React from "react";
import { shell } from "../utils/electron";
import { ViewMode } from "./Header";
import { CLAUDE_ICON_PATH } from "./icons";

const CLAUDE_ORANGE = "#D97757";

function ClaudeIcon({ size }: { size: number }) {
  const radius = Math.round(size * 0.22);
  const iconSize = Math.round(size * 0.6);
  return (
    <span
      style={{
        width: size,
        height: size,
        background: CLAUDE_ORANGE,
        borderRadius: radius,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden
      >
        <path d={CLAUDE_ICON_PATH} />
      </svg>
    </span>
  );
}

interface DesktopPresenceCardProps {
  viewMode?: ViewMode;
}

export function DesktopPresenceCard({ viewMode = "card" }: DesktopPresenceCardProps) {
  const isCompact = viewMode === "compact";

  return (
    <div
      className={`relative flex items-center overflow-hidden cursor-pointer transition-colors duration-150 hover:bg-surface ${
        isCompact
          ? "gap-2 pl-3 pr-2.5 py-2 border-b border-line/60 bg-surface/40"
          : "gap-3 pl-4 pr-3 py-2.5 rounded-lg border border-line/80 bg-surface/70 backdrop-blur-sm hover:border-edge"
      }`}
      onClick={() => shell.openPath("/Applications/Claude.app")}
      data-session="desktop-presence"
    >
      {/* Solid orange left accent bar — never animated */}
      <span
        className={`absolute left-0 top-0 bottom-0 ${isCompact ? "w-[3px]" : "w-1"}`}
        style={{ background: CLAUDE_ORANGE }}
        aria-hidden="true"
      />

      <ClaudeIcon size={isCompact ? 20 : 32} />

      <div className={`flex flex-col flex-1 min-w-0 ${isCompact ? "gap-px" : "gap-[3px]"}`}>
        <span className={`font-bold font-mono text-brighter truncate ${isCompact ? "text-[11px]" : "text-[13px]"}`}>
          Claude Desktop
        </span>
        <span className={`font-mono text-soft truncate ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
          App is running
        </span>
      </div>

      {/* Running pill */}
      <span
        className={`shrink-0 font-mono font-semibold rounded-badge whitespace-nowrap leading-none ${
          isCompact ? "text-[10px] px-1.5 py-[2px]" : "text-[11px] px-2 py-[3px]"
        }`}
        style={{
          color: CLAUDE_ORANGE,
          background: "rgba(217,119,87,0.12)",
          border: "1px solid rgba(217,119,87,0.3)",
        }}
      >
        ● Running
      </span>
    </div>
  );
}
