import { useMemo, useState, useEffect, useRef } from 'react';
import { HistoryRow } from '../types';
import {
  StatTile, DayBars, Donut, Heatmap, Legend,
  fmtCost, fmtTokens, dayKey,
  DayBucket, DonutSegment,
} from './charts/ChartPrimitives';

/* ─── Types ────────────────────────────────────────────────────────────── */

export type HistoryChartsFilter =
  | { kind: 'project'; value: string }
  | { kind: 'model';   value: string }
  | { kind: 'day';     from: number; to: number };

/** Optional preset coming from the FilterBar. When set, the brush is
 *  reseeded to span this preset (clamped to data extent) any time the
 *  value changes. The user can still drag the brush handles afterward
 *  to fine-tune within that window. */
export type HistoryChartsPreset = 'today' | 'week' | 'month' | 'all';

interface HistoryChartsProps {
  rows: HistoryRow[];
  onFilter: (f: HistoryChartsFilter) => void;
  presetRange?: HistoryChartsPreset;
}

/* Map a FilterBar preset → brush window [from,to], clamped to data extent.
 * Mirrors `rangeFloor` in HistoryPanel.tsx so the chart brush and the list
 * filter agree on day boundaries. */
function presetToRange(
  preset: HistoryChartsPreset,
  fullRange: [number, number],
): [number, number] {
  const [lo, hi] = fullRange;
  if (preset === 'all') return fullRange;
  const now = new Date();
  let floor: number;
  if (preset === 'today') {
    floor = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  } else if (preset === 'week') {
    floor = dayKey(now.getTime() - 7 * 86_400_000);
  } else /* month */ {
    floor = dayKey(now.getTime() - 30 * 86_400_000);
  }
  return [Math.max(lo, floor), hi];
}

/* ─── Color assignment ─────────────────────────────────────────────────── */

const PROJECT_PALETTE = [
  'var(--color-accent)',
  'var(--color-tool)',
  'var(--color-branch)',
  'var(--color-alert)',
  'var(--color-badge-loop)',
  '#7fc4ff',
  '#d9a4ff',
];

const MODEL_COLORS: Record<string, string> = {
  Sonnet: 'var(--color-accent)',
  Opus:   'var(--color-tool)',
  Haiku:  'var(--color-branch)',
};

export function shortModel(model: string | null): string {
  if (!model) return 'Other';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('opus'))   return 'Opus';
  if (model.includes('haiku'))  return 'Haiku';
  return model.split('-').slice(0, 2).join(' ');
}

function buildProjectColors(rows: HistoryRow[]): Record<string, string> {
  const seen = new Set<string>();
  const order: string[] = [];
  const sums = new Map<string, number>();
  for (const r of rows) {
    sums.set(r.dirName, (sums.get(r.dirName) || 0) + (r.costUsd || 0));
  }
  [...sums.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([name]) => { if (!seen.has(name)) { seen.add(name); order.push(name); } });
  const map: Record<string, string> = {};
  order.forEach((name, i) => { map[name] = PROJECT_PALETTE[i % PROJECT_PALETTE.length]; });
  return map;
}

/* ─── Aggregation ──────────────────────────────────────────────────────── */

function aggregate(rows: HistoryRow[], range: [number, number]) {
  const [from, to] = range;
  const inRange = rows.filter(r => r.lastActivity >= from && r.lastActivity <= to);

  const dayMap = new Map<number, HistoryRow[]>();
  for (const r of inRange) {
    const k = dayKey(r.lastActivity);
    if (!dayMap.has(k)) dayMap.set(k, []);
    dayMap.get(k)!.push(r);
  }
  const dayMs = 86_400_000;
  const startDay = dayKey(from);
  const endDay = dayKey(to);
  const dayBuckets: { t: number; list: HistoryRow[] }[] = [];
  for (let t = startDay; t <= endDay; t += dayMs) {
    dayBuckets.push({ t, list: dayMap.get(t) || [] });
  }

  const totalCost   = inRange.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const totalTokens = inRange.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
  const totalTurns  = inRange.reduce((s, r) => s + (r.turns ?? 0), 0);
  const sessions    = inRange.length;

  return { inRange, dayBuckets, totalCost, totalTokens, totalTurns, sessions };
}

/* ─── SubToggle ────────────────────────────────────────────────────────── */

interface SubToggleProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

function SubToggle<T extends string>({ value, onChange, options }: SubToggleProps<T>) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 text-ui-sm font-mono rounded transition-colors duration-150 ${
            value === opt.value ? 'bg-edge text-brighter' : 'text-fainter hover:text-bright'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ─── BrushedTimeline ──────────────────────────────────────────────────── */

interface BrushedTimelineProps {
  rows: HistoryRow[];
  range: [number, number];
  onRange: (r: [number, number]) => void;
  projectColors: Record<string, string>;
  segmentBy: 'model' | 'project';
  onSelectDay: (b: DayBucket) => void;
  selectedDay: string | null;
}

type DragState = 'left' | 'right' | { kind: 'pan'; startPct: number; startRange: [number, number] } | null;

function BrushedTimeline({
  rows, range, onRange, projectColors, segmentBy, onSelectDay, selectedDay,
}: BrushedTimelineProps) {
  const allBuckets = useMemo<DayBucket[]>(() => {
    if (rows.length === 0) return [];
    const minT = dayKey(Math.min(...rows.map(r => r.lastActivity)));
    const maxT = dayKey(Math.max(...rows.map(r => r.lastActivity)));
    const dayMs = 86_400_000;
    const buckets: DayBucket[] = [];
    const map = new Map<number, HistoryRow[]>();
    for (const r of rows) {
      const k = dayKey(r.lastActivity);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    for (let t = minT; t <= maxT; t += dayMs) {
      const list = map.get(t) || [];
      const segMap = new Map<string, { key: string; label: string; value: number; color: string }>();
      for (const r of list) {
        const segKey = segmentBy === 'model' ? shortModel(r.model) : r.dirName;
        const color = segmentBy === 'model'
          ? (MODEL_COLORS[segKey] || 'var(--color-fainter)')
          : (projectColors[segKey] || 'var(--color-fainter)');
        const cur = segMap.get(segKey) || { key: segKey, label: segKey, value: 0, color };
        cur.value += r.costUsd || 0;
        segMap.set(segKey, cur);
      }
      const total = [...segMap.values()].reduce((s, x) => s + x.value, 0);
      const date = new Date(t);
      buckets.push({
        key: String(t),
        t,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        fullLabel: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        segments: [...segMap.values()].sort((a, b) => b.value - a.value),
        total,
      });
    }
    return buckets;
  }, [rows, segmentBy, projectColors]);

  const visible = useMemo(
    () => allBuckets.filter(b => (b.t ?? 0) >= range[0] && (b.t ?? 0) <= range[1]),
    [allBuckets, range]
  );

  const fullStart = allBuckets[0]?.t ?? Date.now();
  const fullEnd   = allBuckets[allBuckets.length - 1]?.t ?? Date.now();
  const fullSpan  = Math.max(1, fullEnd - fullStart);
  const brushL = ((range[0] - fullStart) / fullSpan) * 100;
  const brushR = ((range[1] - fullStart) / fullSpan) * 100;

  const [drag, setDrag] = useState<DragState>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;
    function onMove(e: MouseEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = fullStart + pct * fullSpan;
      if (activeDrag === 'left') {
        onRange([Math.min(t, range[1] - 86_400_000), range[1]]);
      } else if (activeDrag === 'right') {
        onRange([range[0], Math.max(t, range[0] + 86_400_000)]);
      } else if (activeDrag.kind === 'pan') {
        const delta = (pct - activeDrag.startPct) * fullSpan;
        let from = activeDrag.startRange[0] + delta;
        let to   = activeDrag.startRange[1] + delta;
        if (from < fullStart) { to += fullStart - from; from = fullStart; }
        if (to > fullEnd)     { from -= to - fullEnd;   to = fullEnd; }
        onRange([from, to]);
      }
    }
    function onUp() { setDrag(null); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, range, onRange, fullStart, fullSpan, fullEnd]);

  return (
    <div>
      <DayBars
        buckets={visible}
        height={120}
        yLabel="Cost"
        formatY={fmtCost}
        onSelect={onSelectDay}
        highlightKey={selectedDay}
      />

      <div className="flex items-center gap-2 mt-1 mb-1">
        <span className="text-fainter text-ui-sm font-mono">
          {new Date(range[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          <span className="opacity-60"> → </span>
          {new Date(range[1]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          <span className="opacity-60"> · {Math.round((range[1] - range[0]) / 86_400_000) + 1}d</span>
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          {[
            { k: '7d',  days: 7 },
            { k: '30d', days: 30 },
            { k: '90d', days: 90 },
            { k: 'all', days: null as number | null },
          ].map(p => (
            <button
              key={p.k}
              type="button"
              onClick={() => {
                if (p.days == null) { onRange([fullStart, fullEnd]); return; }
                const to = fullEnd;
                onRange([Math.max(fullStart, to - p.days * 86_400_000), to]);
              }}
              className="text-fainter hover:text-bright text-ui-sm font-mono px-1.5 py-0.5 rounded transition-colors hover:bg-line"
            >
              {p.k}
            </button>
          ))}
        </span>
      </div>

      <div className="relative h-7 mt-0.5 select-none" ref={containerRef}>
        <svg viewBox={`0 0 100 100`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-60">
          {allBuckets.map((b, i) => {
            const max = Math.max(0.0001, ...allBuckets.map(x => x.total));
            const x = (i / allBuckets.length) * 100;
            const w = (1 / allBuckets.length) * 100;
            const h = (b.total / max) * 100;
            return <rect key={b.key} x={x} y={100 - h} width={w * 0.85} height={h} fill="var(--color-fainter)" />;
          })}
        </svg>
        <div
          className="absolute top-0 bottom-0 cursor-grab"
          style={{
            left: `${brushL}%`, width: `${brushR - brushL}%`,
            background: 'color-mix(in oklch, var(--color-accent) 18%, transparent)',
            borderLeft: '1px solid var(--color-accent)',
            borderRight: '1px solid var(--color-accent)',
          }}
          onMouseDown={(e) => {
            const rect = containerRef.current!.getBoundingClientRect();
            const startPct = (e.clientX - rect.left) / rect.width;
            setDrag({ kind: 'pan', startPct, startRange: [...range] });
          }}
        />
        <div
          className="absolute top-0 bottom-0 w-1.5 cursor-ew-resize"
          style={{ left: `calc(${brushL}% - 3px)`, background: 'var(--color-accent)' }}
          onMouseDown={() => setDrag('left')}
        />
        <div
          className="absolute top-0 bottom-0 w-1.5 cursor-ew-resize"
          style={{ left: `calc(${brushR}% - 3px)`, background: 'var(--color-accent)' }}
          onMouseDown={() => setDrag('right')}
        />
      </div>
    </div>
  );
}

/* ─── HistoryCharts ────────────────────────────────────────────────────── */

export function HistoryCharts({ rows, onFilter, presetRange }: HistoryChartsProps) {
  const [mode, setMode] = useState<'summary' | 'analyze'>('summary');
  const [segmentBy, setSegmentBy] = useState<'model' | 'project'>('model');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const projectColors = useMemo(() => buildProjectColors(rows), [rows]);

  const fullRange = useMemo<[number, number]>(() => {
    if (rows.length === 0) return [Date.now(), Date.now()];
    return [
      dayKey(Math.min(...rows.map(r => r.lastActivity))),
      dayKey(Math.max(...rows.map(r => r.lastActivity))),
    ];
  }, [rows]);

  // Initial brush span: preset (if provided) → preset window; else full range.
  const [range, setRange] = useState<[number, number]>(() =>
    presetRange ? presetToRange(presetRange, fullRange) : fullRange
  );
  // Reseed when data extent changes.
  useEffect(() => { setRange(fullRange); }, [fullRange[0], fullRange[1]]);
  // Reseed when the FilterBar preset changes. Tracking presetRange in deps
  // means this fires only on user pick, not on every render.
  useEffect(() => {
    if (!presetRange) return;
    setRange(presetToRange(presetRange, fullRange));
  }, [presetRange, fullRange[0], fullRange[1]]);

  const agg = useMemo(() => aggregate(rows, range), [rows, range]);

  const sparkBy = (selector: (r: HistoryRow) => number | null | undefined) =>
    agg.dayBuckets.map(b => b.list.reduce((s, r) => s + (selector(r) || 0), 0));
  const sparkCost     = sparkBy(r => r.costUsd);
  const sparkTokens   = sparkBy(r => r.totalTokens);
  const sparkSessions = agg.dayBuckets.map(b => b.list.length);
  const sparkTurns    = sparkBy(r => r.turns);

  function delta(values: number[]): number | null {
    if (values.length < 14) return null;
    const recent = values.slice(-7).reduce((a, b) => a + b, 0);
    const prior  = values.slice(-14, -7).reduce((a, b) => a + b, 0);
    if (prior === 0) return recent > 0 ? 1 : null;
    return (recent - prior) / prior;
  }

  const projectSegments = useMemo<DonutSegment[]>(() => {
    const map = new Map<string, DonutSegment>();
    for (const r of agg.inRange) {
      const cur = map.get(r.dirName) || { key: r.dirName, label: r.dirName, value: 0, color: projectColors[r.dirName] };
      cur.value += r.costUsd || 0;
      map.set(r.dirName, cur);
    }
    return [...map.values()].filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  }, [agg.inRange, projectColors]);

  const modelSegments = useMemo<DonutSegment[]>(() => {
    const map = new Map<string, DonutSegment>();
    for (const r of agg.inRange) {
      const k = shortModel(r.model);
      const cur = map.get(k) || { key: k, label: k, value: 0, color: MODEL_COLORS[k] || 'var(--color-fainter)' };
      cur.value += r.costUsd || 0;
      map.set(k, cur);
    }
    return [...map.values()].filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  }, [agg.inRange]);

  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of agg.inRange) {
      const d = new Date(r.lastActivity);
      grid[d.getDay()][d.getHours()] += 1;
    }
    return grid;
  }, [agg.inRange]);

  const hourBuckets = useMemo<DayBucket[]>(() => {
    const counts: number[] = Array(24).fill(0);
    for (const r of agg.inRange) {
      counts[new Date(r.lastActivity).getHours()] += 1;
    }
    return counts.map((c, h) => ({
      key: `h-${h}`,
      label: h % 6 === 0 ? `${h}` : '',
      fullLabel: `${h.toString().padStart(2,'0')}:00`,
      total: c,
      segments: [{ key: 'sessions', label: 'sessions', value: c, color: 'var(--color-accent)' }],
    }));
  }, [agg.inRange]);

  const projectLeaderboard = useMemo(() => {
    const map = new Map<string, { dirName: string; sessions: number; cost: number; tokens: number; turns: number }>();
    for (const r of agg.inRange) {
      const cur = map.get(r.dirName) || { dirName: r.dirName, sessions: 0, cost: 0, tokens: 0, turns: 0 };
      cur.sessions += 1;
      cur.cost += r.costUsd || 0;
      cur.tokens += r.totalTokens || 0;
      cur.turns += r.turns || 0;
      map.set(r.dirName, cur);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [agg.inRange]);

  const handleDaySelect = (bucket: DayBucket) => {
    setSelectedDay(bucket.key === selectedDay ? null : bucket.key);
    if (bucket.t != null) {
      onFilter({ kind: 'day', from: bucket.t, to: bucket.t + 86_400_000 - 1 });
    }
  };

  return (
    <div className="flex flex-col gap-3 px-2.5 py-2 overflow-y-auto flex-1 min-h-0">
      <div className="flex items-center gap-2">
        <SubToggle
          value={mode}
          onChange={setMode}
          options={[{ value: 'summary', label: 'Summary' }, { value: 'analyze', label: 'Analyze' }]}
        />
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-fainter text-ui-sm font-mono">stack by</span>
          <SubToggle
            value={segmentBy}
            onChange={setSegmentBy}
            options={[{ value: 'model', label: 'Model' }, { value: 'project', label: 'Project' }]}
          />
        </span>
      </div>

      <div className={`grid gap-1.5 ${mode === 'analyze' ? 'grid-cols-4' : 'grid-cols-2'}`}>
        <StatTile label="Cost"   value={fmtCost(agg.totalCost)}   delta={delta(sparkCost)}   spark={sparkCost}   accent />
        <StatTile label="Tokens" value={fmtTokens(agg.totalTokens)} delta={delta(sparkTokens)} spark={sparkTokens} />
        {mode === 'analyze' && (
          <>
            <StatTile label="Sessions" value={agg.sessions.toLocaleString()}    delta={delta(sparkSessions)} spark={sparkSessions} accent />
            <StatTile label="Turns"    value={agg.totalTurns.toLocaleString()} delta={delta(sparkTurns)}    spark={sparkTurns} />
          </>
        )}
      </div>

      <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-2">
        <div className="flex items-center mb-1">
          <span className="text-fainter text-ui-sm font-mono uppercase tracking-wider">Cost by day</span>
          <span className="ml-auto">
            <Legend
              items={(segmentBy === 'model' ? modelSegments : projectSegments).slice(0, 5).map(s => ({
                key: s.key, label: s.label, color: s.color,
              }))}
            />
          </span>
        </div>
        <BrushedTimeline
          rows={rows}
          range={range}
          onRange={setRange}
          projectColors={projectColors}
          segmentBy={segmentBy}
          onSelectDay={handleDaySelect}
          selectedDay={selectedDay}
        />
      </div>

      {mode === 'summary' ? (
        <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-2.5">
          <div className="flex items-start gap-3">
            <Donut
              segments={projectSegments}
              size={104}
              centerLabel={fmtCost(agg.totalCost)}
              centerSub="total cost"
              onSelect={(seg) => onFilter({ kind: 'project', value: seg.key })}
            />
            <div className="flex-1 min-w-0">
              <div className="text-fainter text-ui-sm font-mono uppercase tracking-wider mb-1">Cost by project</div>
              <div className="flex flex-col gap-1">
                {projectSegments.slice(0, 5).map(seg => {
                  const pct = (seg.value / Math.max(0.0001, agg.totalCost)) * 100;
                  return (
                    <button
                      key={seg.key}
                      type="button"
                      onClick={() => onFilter({ kind: 'project', value: seg.key })}
                      className="flex items-center gap-2 text-left group/bar"
                    >
                      <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
                      <span className="text-soft text-ui font-mono truncate flex-1 group-hover/bar:text-bright">{seg.label}</span>
                      <span className="text-bright text-ui-sm font-mono tabular-nums">{fmtCost(seg.value)}</span>
                      <span className="text-fainter text-ui-sm font-mono tabular-nums w-9 text-right">{pct.toFixed(0)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-2.5">
              <div className="text-fainter text-ui-sm font-mono uppercase tracking-wider mb-1.5">By model</div>
              <div className="flex items-center gap-2">
                <Donut
                  segments={modelSegments}
                  size={84}
                  thickness={12}
                  centerLabel={fmtCost(agg.totalCost)}
                  centerSub="cost"
                  onSelect={(seg) => onFilter({ kind: 'model', value: seg.key })}
                />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {modelSegments.map(seg => (
                    <button
                      key={seg.key}
                      type="button"
                      onClick={() => onFilter({ kind: 'model', value: seg.key })}
                      className="flex items-center gap-1.5 text-left"
                    >
                      <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
                      <span className="text-soft text-ui-sm font-mono flex-1 truncate hover:text-bright">{seg.label}</span>
                      <span className="text-bright text-ui-sm font-mono tabular-nums">{fmtCost(seg.value)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-2">
              <div className="text-fainter text-ui-sm font-mono uppercase tracking-wider mb-1.5">By project</div>
              <Donut
                segments={projectSegments}
                size={84}
                thickness={12}
                centerLabel={`${projectSegments.length}`}
                centerSub="projects"
                onSelect={(seg) => onFilter({ kind: 'project', value: seg.key })}
              />
            </div>
          </div>

          <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-2">
            <div className="flex items-center mb-1">
              <span className="text-fainter text-ui-sm font-mono uppercase tracking-wider">Activity · day × hour</span>
              <span className="ml-auto text-fainter text-ui-sm font-mono">sessions</span>
            </div>
            <Heatmap cells={heatmap} />
          </div>

          <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-2">
            <div className="text-fainter text-ui-sm font-mono uppercase tracking-wider mb-1">By hour of day</div>
            <DayBars buckets={hourBuckets} height={70} yLabel="Sessions" formatY={(v) => `${v}`} />
          </div>

          <div className="rounded-md border border-line bg-surface px-2.5 pt-2 pb-2">
            <div className="text-fainter text-ui-sm font-mono uppercase tracking-wider mb-1.5">Top projects</div>
            <div className="flex flex-col gap-0.5">
              <div className="grid grid-cols-[1fr_42px_44px_38px] gap-2 text-fainter text-ui-sm font-mono pb-0.5 border-b border-line/60">
                <span>project</span>
                <span className="text-right">cost</span>
                <span className="text-right">tokens</span>
                <span className="text-right">runs</span>
              </div>
              {projectLeaderboard.slice(0, 6).map(p => (
                <button
                  key={p.dirName}
                  type="button"
                  onClick={() => onFilter({ kind: 'project', value: p.dirName })}
                  className="grid grid-cols-[1fr_42px_44px_38px] gap-2 items-center py-0.5 text-left rounded hover:bg-line/40 px-1 -mx-1"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: projectColors[p.dirName] }} />
                    <span className="text-bright text-ui font-mono truncate">{p.dirName}</span>
                  </span>
                  <span className="text-bright text-ui-sm font-mono tabular-nums text-right">{fmtCost(p.cost)}</span>
                  <span className="text-soft text-ui-sm font-mono tabular-nums text-right">{fmtTokens(p.tokens)}</span>
                  <span className="text-fainter text-ui-sm font-mono tabular-nums text-right">{p.sessions}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="text-fainter text-ui-sm text-center font-mono opacity-70 py-1">
        Click any bar, slice, or row to filter the list view
      </div>
    </div>
  );
}
