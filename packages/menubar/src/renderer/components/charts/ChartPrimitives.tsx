/*
 * Inline-SVG chart primitives. No external charting deps — keeps the bundle
 * small and lets every chart inherit color tokens from CSS variables, which
 * means light/dark theming is automatic.
 *
 * All charts accept an optional onSelect(slice) callback so consumers can
 * implement click-to-filter behavior. Tooltips are local to each chart.
 */

import React, { useState, useMemo, useRef, useEffect } from "react";

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DayBucket {
  key: string;
  label: string;
  fullLabel?: string;
  total: number;
  segments: BarSegment[];
  t?: number;
}

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
}

export interface HeatmapHover {
  dow: number;
  hour: number;
  count: number;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

export function fmtCost(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 0.01) return "<$0.01";
  if (v < 10) return `$${v.toFixed(2)}`;
  if (v < 1000) return `$${v.toFixed(0)}`;
  return `$${(v / 1000).toFixed(1)}k`;
}

export function fmtTokens(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 1000) return `${v}`;
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(1)}M`;
}

export function fmtPct(delta: number | null | undefined): string {
  if (delta == null || !isFinite(delta)) return "";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(0)}%`;
}

export function dayKey(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ─── Sparkline ────────────────────────────────────────────────────────── */

interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}

export function Sparkline({
  values,
  color = "var(--color-accent)",
  height = 22,
  fill = true,
}: SparklineProps) {
  if (!values || values.length === 0) {
    return <svg height={height} className="block w-full" />;
  }
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 100;
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as [number, number];
  });
  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${path} L${w},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
    >
      {fill && <path d={area} fill={color} fillOpacity="0.18" />}
      <path
        d={path}
        stroke={color}
        strokeWidth="1.25"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ─── StatTile ─────────────────────────────────────────────────────────── */

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  spark?: number[];
  accent?: boolean;
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  spark,
  accent = false,
}: StatTileProps) {
  const deltaColor =
    delta == null ? "text-fainter" : delta >= 0 ? "text-branch" : "text-danger";
  const sparkColor = accent ? "var(--color-tool)" : "var(--color-accent)";
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-1.5 flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-fainter text-ui-sm font-mono uppercase tracking-wider truncate">
          {label}
        </span>
        {delta != null && (
          <span
            className={`ml-auto shrink-0 text-ui-sm font-mono ${deltaColor}`}
          >
            {fmtPct(delta)}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-brighter font-bold text-[18px] font-mono tabular-nums leading-none truncate">
          {value}
        </span>
        {sub && (
          <span className="text-fainter text-ui-sm font-mono truncate">
            {sub}
          </span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-1 -mx-0.5 opacity-90">
          <Sparkline values={spark} color={sparkColor} height={18} />
        </div>
      )}
    </div>
  );
}

/* ─── DayBars ──────────────────────────────────────────────────────────── */
/* Vertical bars per day, stacked by category (model or project). */

interface DayBarsProps {
  buckets: DayBucket[];
  height?: number;
  yLabel?: string;
  formatY?: (v: number) => string;
  onSelect?: (bucket: DayBucket) => void;
  highlightKey?: string | null;
}

export function DayBars({
  buckets,
  height = 110,
  yLabel,
  formatY = fmtCost,
  onSelect,
  highlightKey,
}: DayBarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [tooltipPos, setTooltipPos] = useState<{
    left: number; top: number; showBelow: boolean;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setW(cw);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);
  const padTop = 8;
  const padBottom = 18;
  const chartH = height - padTop - padBottom;

  // Measure the real rendered tooltip width to position it accurately.
  // useLayoutEffect runs before paint so the tooltip is never visibly misplaced.
  useEffect(() => {
    if (hover == null || !containerRef.current || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }
    const slot = buckets.length > 0 ? w / buckets.length : 0;
    const barCenterPx = hover * slot + slot / 2;
    const margin = 8;
    const actualW = tooltipRef.current.offsetWidth;
    const rect = containerRef.current.getBoundingClientRect();
    const screenX = rect.left + barCenterPx;
    const left = Math.max(margin, Math.min(screenX - actualW / 2, window.innerWidth - actualW - margin));
    const screenBarTop = rect.top + padTop;
    const screenBarBottom = rect.top + padTop + chartH;
    const showBelow = screenBarTop < 240;
    setTooltipPos({ left, top: showBelow ? screenBarBottom : screenBarTop, showBelow });
  });

  const max = useMemo(
    () => Math.max(0.0001, ...buckets.map((b) => b.total)),
    [buckets],
  );
  // Cap bar width so few-entry charts don't blow up to absurd-width bars.
  const slot = buckets.length > 0 ? w / buckets.length : 0;
  const maxBarW = 28;
  const barW = Math.min(maxBarW, slot * 0.78);

  return (
    <div className="relative" ref={containerRef}>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="block w-full"
        style={{ height }}
      >
        {/* Y baseline */}
        <line
          x1="0"
          y1={padTop + chartH}
          x2={w}
          y2={padTop + chartH}
          stroke="var(--color-line)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* Bars */}
        {buckets.map((b, i) => {
          const x = i * slot + (slot - barW) / 2;
          let yCursor = padTop + chartH;
          const isHovered = hover === i;
          const isSelected = highlightKey != null && b.key === highlightKey;
          const dim = highlightKey != null && !isSelected ? 0.35 : 1;
          return (
            <g
              key={b.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect && onSelect(b)}
              style={{ cursor: onSelect ? "pointer" : "default", opacity: dim }}
            >
              {/* Hover/click target — full column width incl. gap */}
              <rect
                x={i * slot}
                y={padTop}
                width={slot}
                height={chartH}
                fill="transparent"
              />
              {b.segments.map((seg) => {
                const segH = (seg.value / max) * chartH;
                yCursor -= segH;
                return (
                  <rect
                    key={seg.key}
                    x={x}
                    y={yCursor}
                    width={barW}
                    height={Math.max(0, segH)}
                    fill={seg.color}
                    opacity={isHovered || isSelected ? 1 : 0.85}
                  />
                );
              })}
              {(isHovered || isSelected) && (
                <rect
                  x={x - 0.5}
                  y={padTop}
                  width={barW + 1}
                  height={chartH}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
        {/* X labels — pick a stride that keeps ~42px between labels */}
        {(() => {
          const minLabelPx = 42;
          const stride = Math.max(1, Math.ceil(minLabelPx / Math.max(1, slot)));
          return buckets.map((b, i) => {
            if (i % stride !== 0) return null;
            const x = i * slot + slot / 2;
            return (
              <text
                key={`x-${b.key}`}
                x={x}
                y={height - 4}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-fainter)"
                fontFamily="JetBrains Mono, monospace"
              >
                {b.label}
              </text>
            );
          });
        })()}
      </svg>

      {/* Tooltip — fixed so it escapes any overflow/clip ancestor.
          Rendered invisible first; useEffect measures real width and sets position. */}
      {hover != null && buckets[hover] && (
        <div
          ref={tooltipRef}
          className="fixed pointer-events-none rounded-md border border-edge bg-surface px-2 py-1.5 shadow-lg z-50"
          style={{
            left: tooltipPos?.left ?? 0,
            top: tooltipPos?.top ?? 0,
            transform: tooltipPos?.showBelow ? "none" : "translateY(-100%)",
            minWidth: 140,
            maxWidth: 260,
            visibility: tooltipPos ? "visible" : "hidden",
          }}
        >
          <div className="text-bright text-ui font-bold mb-0.5">
            {buckets[hover].fullLabel ?? buckets[hover].label}
          </div>
          <div className="text-soft text-ui-sm font-mono mb-1">
            {yLabel}: {formatY(buckets[hover].total)}
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {buckets[hover].segments.map((seg) => (
              <div key={seg.key} className="flex items-center gap-1.5 text-ui-sm">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ background: seg.color }}
                />
                <span className="text-soft truncate flex-1">{seg.label}</span>
                <span className="text-bright font-mono tabular-nums">
                  {formatY(seg.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Donut ────────────────────────────────────────────────────────────── */

interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  onSelect?: (seg: DonutSegment) => void;
  highlightKey?: string | null;
}

export function Donut({
  segments,
  size = 96,
  thickness = 14,
  centerLabel,
  centerSub,
  onSelect,
  highlightKey,
}: DonutProps) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  let angle = -Math.PI / 2;

  const arcs = segments.map((seg, i) => {
    const portion = seg.value / total;
    const a0 = angle;
    const a1 = angle + portion * Math.PI * 2;
    angle = a1;
    const large = portion > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const path = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
    return { path, seg, i, a0, a1 };
  });

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map(({ path, seg, i }) => {
          const isHover = hover === i;
          const isSelected = highlightKey != null && seg.key === highlightKey;
          const dim = highlightKey != null && !isSelected ? 0.3 : 1;
          return (
            <path
              key={seg.key}
              d={path}
              stroke={seg.color}
              strokeWidth={isHover || isSelected ? thickness + 2 : thickness}
              fill="none"
              opacity={dim}
              strokeLinecap="butt"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect && onSelect(seg)}
              style={{
                cursor: onSelect ? "pointer" : "default",
                transition: "stroke-width 120ms",
              }}
            />
          );
        })}
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-brighter font-bold text-[13px] font-mono tabular-nums leading-none">
          {hover != null ? segments[hover].label : centerLabel}
        </div>
        <div className="text-fainter text-ui-sm font-mono tabular-nums mt-0.5">
          {hover != null
            ? `${((segments[hover].value / total) * 100).toFixed(0)}%`
            : centerSub}
        </div>
      </div>
    </div>
  );
}

/* ─── Heatmap ──────────────────────────────────────────────────────────── */

interface HeatmapProps {
  cells: number[][];
  onSelect?: (cell: HeatmapHover) => void;
  selected?: { dow: number; hour: number } | null;
}

export function Heatmap({ cells, onSelect, selected }: HeatmapProps) {
  const [hover, setHover] = useState<HeatmapHover | null>(null);
  const max = Math.max(1, ...cells.flat());
  const COLS = 24;
  const ROWS = 7;
  const cellW = 100 / COLS;
  const cellH = 100 / ROWS;
  const DOW = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="relative w-full">
      {/* Hour labels above */}
      <div className="flex pl-5 pr-1 mb-1 text-[9px] text-fainter font-mono tabular-nums select-none">
        {[0, 6, 12, 18, 23].map((h) => (
          <span
            key={h}
            className="flex-1 text-center"
            style={{ flex: h === 23 ? "0 0 auto" : 1 }}
          >
            {h.toString().padStart(2, "0")}
          </span>
        ))}
      </div>
      <div className="flex">
        {/* Row labels */}
        <div className="flex flex-col w-4 mr-1 text-[9px] text-fainter font-mono select-none">
          {DOW.map((d, i) => (
            <span
              key={i}
              className="flex-1 flex items-center justify-end pr-0.5"
              style={{ minHeight: 12 }}
            >
              {d}
            </span>
          ))}
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="flex-1"
          style={{ height: 84 }}
        >
          {cells.map((row, y) =>
            row.map((v, x) => {
              const intensity = v / max;
              const isHover = hover && hover.dow === y && hover.hour === x;
              const isSelected =
                selected && selected.dow === y && selected.hour === x;
              const fill =
                v === 0
                  ? "var(--color-line)"
                  : `color-mix(in oklch, var(--color-accent) ${15 + intensity * 75}%, var(--color-base))`;
              return (
                <rect
                  key={`${x}-${y}`}
                  x={x * cellW + 0.15}
                  y={y * cellH + 0.15}
                  width={cellW - 0.3}
                  height={cellH - 0.3}
                  fill={fill}
                  stroke={
                    isSelected || isHover
                      ? "var(--color-accent)"
                      : "transparent"
                  }
                  strokeWidth={isSelected || isHover ? 0.6 : 0}
                  vectorEffect="non-scaling-stroke"
                  onMouseEnter={() => setHover({ dow: y, hour: x, count: v })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() =>
                    onSelect && onSelect({ dow: y, hour: x, count: v })
                  }
                  style={{ cursor: onSelect ? "pointer" : "default" }}
                />
              );
            }),
          )}
        </svg>
      </div>
      {/* Tooltip */}
      {hover && (
        <div className="mt-1 text-ui-sm text-soft font-mono">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][hover.dow]}{" "}
          {hover.hour.toString().padStart(2, "0")}:00
          <span className="text-fainter"> · </span>
          <span className="text-bright">
            {hover.count} session{hover.count === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Legend ───────────────────────────────────────────────────────────── */

interface LegendProps {
  items: LegendItem[];
  onClick?: (item: LegendItem) => void;
  highlightKey?: string | null;
}

export function Legend({ items, onClick, highlightKey }: LegendProps) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {items.map((it) => {
        const dim = highlightKey != null && it.key !== highlightKey ? 0.4 : 1;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onClick && onClick(it)}
            className="inline-flex items-center gap-1 leading-none transition-opacity"
            style={{ opacity: dim, cursor: onClick ? "pointer" : "default" }}
          >
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: it.color }}
            />
            <span className="text-fainter text-ui-sm font-mono">
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
