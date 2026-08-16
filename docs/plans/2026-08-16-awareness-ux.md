# Awareness UX Implementation Plan (Part C)

> **Status:** Not started. This is the deferred UX half of the agent-adapter work. Part A (the per-agent refactor) shipped in v0.3.0 (PR #2). Execute this on a feature branch off `master`.
>
> **For agentic workers:** Use `superpowers:subagent-driven-development` (or `executing-plans`) to implement task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Make a multi-agent fleet scannable at a glance — surface *which* agent each card is and add cheap, robust actions — plus fold in the low-risk cleanups deferred from Part A.

> **Scope note (2026-08-16):** Repo grouping was cut from this plan and moved to [Deferred](#deferred-repo-grouping) at the bottom. The renderer currently shows no agent identity at all (`SessionCard.tsx` renders only `appName`), so agent chips + agent-agnostic copy are the real gap; grouping solves a crowding problem the existing compact view mode already covers at a fraction of the cost.

**Architecture:** Build on the Part A agent-descriptor layer (`packages/shared/src/agents/`). Agent identity (name/color/icon) already lives on each descriptor; expose a Node-free slice of it so the renderer can consume it without pulling the fs-heavy shared index. Awareness-first: no fragile remote-control.

**Tech Stack:** React + Vite renderer (Vitest), Electron main (tsc/tsup), shared (tsc/Jest).

## Global Constraints
- **Awareness-first, cheap-control-only.** No permission-approval / terminal-injection features (fragile, out of the hook's reach). Only actions that reuse proven paths.
- **Agent identity is the card's primary "what is this" signal**; host app (iTerm/VS Code) is secondary.
- **All user-facing copy must be agent-agnostic** — display names come from the descriptor, never hardcoded "Claude".
- **Renderer bundle safety:** the renderer must NOT import the fs-heavy `@claude-dashboard/shared` index. Consume types via `@claude-dashboard/shared/types` and agent display metadata via a Node-free module (Task 1).
- Keep the existing test discipline: add tests for new logic; menubar uses Vitest, shared/hook use Jest.
- After user-facing changes, update `README.md` (there's a per-agent card-field table to extend).

---

## Task 1: Fold-in cleanups from Part A + Node-free source metadata

Groups the deferred Part-A minors with the metadata plumbing the UI needs, since they're the same area.

**Files:**
- Create: `packages/shared/src/agents/sourceMeta.ts` — Node-free `SOURCE_META` map + `sourceDisplayName(id)`.
- Modify: `packages/shared/src/agents/index.ts` — build `SOURCES` from `SOURCE_META`; add a compile-checked `SOURCE_BY_ID`.
- Modify: `packages/shared/src/typesEntry.ts` — re-export `SOURCE_META`/`sourceDisplayName` (Node-free) for the renderer.
- Modify: `packages/hook/src/hook.ts` — replace `agent.id as Session['source']` casts with a checked lookup.
- Modify: `packages/shared/src/agents/types.ts` — remove the unused `payload: HookPayloadFields` field (dead metadata; `cwdFromPayload`/`sessionIdFromPayload` are the real path).
- Test: `packages/shared/src/__tests__/agents.test.ts` — assert every `HOOK_AGENTS` id is in `Session['source']`; assert `SOURCE_META` covers every source.

**Interfaces produced:**
- `SOURCE_META: Record<SourceId, { displayName: string; color: string; iconKey: string }>` — Node-free (no fs/electron imports), the single source of agent display identity for BOTH the descriptors and the renderer.
- `sourceDisplayName(source: string): string` — safe display name with a sensible fallback.
- ~~`SOURCE_BY_ID` / a `toSource(id): Session['source']` helper that fails to compile if an id isn't in the union.~~ **Built stronger:** `AgentDescriptor.id` is now typed `SourceId` (= `NonNullable<Session['source']>`) directly, so a bad id is a compile error *in the descriptor file* and hook.ts needs no helper and no cast at all. `SOURCE_BY_ID: Record<SourceId, SourceMeta>` still ships as the lookup form of `SOURCES`; `isSourceId()` is the runtime narrowing guard.

- [x] **Step 1:** Extract the `{displayName, color, iconKey}` currently inline on each descriptor into `SOURCE_META` (keyed by id), plus the `desktop` presence entry. Descriptors and `PRESENCE_SOURCES` reference `SOURCE_META` so identity is defined once.
- [x] **Step 2:** Add `sourceDisplayName(id)` (returns `SOURCE_META[id]?.displayName ?? 'Agent'`). Re-export both from `typesEntry.ts` (confirm they stay Node-free — a plain object + function, no fs).
- [x] **Step 3:** Remove the dead `payload` field from `AgentDescriptor` and the three descriptors; confirm nothing reads it (grep) and the build stays green.
- [x] **Step 4:** Replace hook.ts's `agent.id as Session['source']` casts with the checked helper; add the `ids ⊆ union` test so a future out-of-union id fails CI instead of silently writing a bad `source`.
- [ ] **Step 5:** Run shared Jest + hook Jest + full build; commit.

---

## Task 2: Agent identity chips + agent-agnostic copy

**Files:**
- Create: `packages/menubar/src/renderer/utils/agentIdentity.ts` — `agentIdentity(source) → { name, color, Icon }` (name/color from `SOURCE_META`; `Icon` maps `iconKey` → a renderer SVG).
- Create: `packages/menubar/src/renderer/components/AgentChip.tsx` (+ test).
- Modify: `SessionCard.tsx` (primary identity in the breadcrumb; demote `appName`), `CompactSessionRow.tsx` (icon-only chip).
- Modify: `packages/menubar/src/main.ts` (notification copy via `sourceDisplayName`), `trayIcon.ts` (tooltip: "Agent sessions: N"), `SessionList.tsx` (empty state: "No active agent sessions").

- [x] **Step 1:** `agentIdentity.ts` maps `source → {name, color, Icon}`, reusing `CLAUDE_ICON` for claude-code/desktop and small inline glyphs for cursor/codex; fallback to a terminal glyph. Pulls name/color from the shared `SOURCE_META` (single source; no duplication).
- [x] **Step 2:** `AgentChip` — icon+label+color chip (`data-testid="agent-chip"`), `compact` prop renders icon-only. Test: known source shows name; compact hides label; unknown source falls back to "Agent".
- [x] **Step 3:** Render `<AgentChip source={s.source}/>` as primary identity in `SessionCard` breadcrumb; move `appName` to a lighter secondary treatment. `<AgentChip compact/>` in `CompactSessionRow` line 1.
- [x] **Step 4:** De-Claude copy: notification title/body use `sourceDisplayName(s.source)`; tray tooltip agent-agnostic; empty state reworded. Update the affected component tests.
- [ ] **Step 5:** Run menubar Vitest + build; update README card-field table if identity changes what's shown; commit.

---

## Task 3: Cheap-control actions (robust only)

**Files:**
- Modify: `main.ts` — notification `click` → `focusTerminal`; IPC `reveal-in-finder` (`shell.showItemInFolder`) + `open-in-editor` (`shell.openPath`).
- Modify: `SessionCard.tsx` — hover "Reveal" / "Open" buttons (`stopPropagation`), + test.

- [ ] **Step 1:** Make notifications actionable — `n.on('click', () => focusTerminal(s.pid, s.termSessionId))`. *(Highest value here: one line, and it closes the notification→terminal loop.)*
- [ ] **Step 2:** Add the two IPC handlers (guard empty dir).
- [ ] **Step 3:** Add hover actions to `SessionCard` next to dismiss (`opacity-0 group-hover:opacity-100`), wired to the IPC; test they send the right channel + `workingDir`.
- [ ] **Step 4:** Run Vitest + build; README note; commit.

> Steps 2–4 are optional/marginal — `focus-terminal` and `copy-path` already cover the common moves. Drop them if the branch is getting long.

**Explicitly out of scope:** approving permission prompts / sending input / redirecting agents from the panel — requires terminal injection, which is fragile and outside the hook's observe-only reach.

---

## Task 4: Verify + docs

> **Interim real-app verification (2026-08-16, after Task 2):** chips confirmed rendering in the
> actual Electron app for all four sources — Claude Code `#D97757`, Cursor `#6b7cff`, Codex
> `#10a37f`, and the grey `Agent` fallback for an unknown source — in both card and compact views.
> Two launch gotchas worth keeping: the app must be given its own `--user-data-dir` (macOS resolves
> `userData` via `NSHomeDirectory()`, which ignores `$HOME`, so a dev instance otherwise collides
> with the installed app's single-instance lock and exits 0 with no window), and seeding test
> sessions means overriding `$HOME` (Node's `os.homedir()` does respect it) rather than writing to
> the real `~/.config/claude-dashboard/sessions.json`.

- [ ] Full build + full suite green.
- [ ] Real-app verification via the `run` skill (drive the actual Electron app; screenshot cards showing agent chips for more than one agent) — browser-Playwright can't render this app (renderer needs Electron IPC).
- [ ] README: refresh the per-agent card-field table + document chips and the reveal/open actions.
- [ ] Whole-branch review, then open a PR.

## Self-Review checklist
- Renderer never imports the fs-heavy shared index (types + `SOURCE_META` only).
- No hardcoded "Claude" in user-facing copy.
- Agent identity defined once (`SOURCE_META`), consumed by descriptors + renderer.
- No permission/injection control snuck in.

---

## Deferred: repo grouping

**Cut on 2026-08-16.** Revisit when the flat list actually stops working — i.e. when 6+ concurrent sessions is routine and the compact view mode (`SessionList.tsx`, `viewMode === 'compact'`) is no longer enough. `SessionList` is small (~114 lines), so this bolts on cleanly later.

Sketch as originally planned:

- Create `packages/menubar/src/renderer/utils/grouping.ts` (+ test) — `groupByRepo(sessions, threshold=6) → { flat: boolean; groups: { key, label, sessions }[] }`. Repo key = `dirName` (fall back to `workingDir`); desktop presence excluded from grouping; `flat: true` below threshold.
- Create `packages/menubar/src/renderer/components/SessionGroup.tsx` — header shows repo label, per-agent colored dots (unique sources in the group), and a "N waiting" count when any session is `waiting_*`; collapse state persisted in `localStorage` keyed by `group:<key>`.
- Modify `SessionList.tsx` — flat path unchanged when `flat`; else render groups (keep the `AnimatePresence` card animation inside each). Desktop card stays appended once at the bottom. Secondary "group by agent" toggle.
- Constraint if revived: **bursty-aware** — auto-flatten below ~6 sessions, only group when crowded. Repo is the primary grouping key; agent is a secondary toggle.
