# Crispy Leaf — Collapsible Header Mode Design

**Date:** 2026-05-15  
**Status:** Implemented

## Problem

The floating panel has no "monitor-only" mode. When you want a quick glance at session
counts without caring about details, the full card or compact views waste screen space.

## Solution

Add a dedicated collapse button to the header (chevron-down / chevron-right, left of the
brand mark). Clicking it collapses the panel to header-only — showing just the brand,
status pills, and controls. The existing `resize-to-fit` IPC mechanism handles window
height automatically.

Also replace the "loop" status pill (errorState sessions) with an "inactive" pill that
counts done + idle sessions, everywhere. Errorstate sessions are no longer surfaced as a
pill.

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Toggle mechanism | Separate collapse button | Keep existing card/compact cycle intact |
| Button placement | Left of brand mark in header | Collapse = less below the title; natural |
| Collapsed icon | Chevron-right | Tree/sidebar paradigm: right = hidden |
| Expanded icon | Chevron-down | Content is below; arrow points to it |
| Third pill | Combined done + idle ("inactive") | Cleaner than two pills; not urgent info |
| Pill color | `text-badge-done` (gray) | Inactive sessions need no visual urgency |
| State persistence | `localStorage` key `panelCollapsed` | Matches existing `viewMode` pattern |
| Pill scope | Everywhere (not just collapsed mode) | More useful info always |
| Cross-window sync | StorageEvent listener for `panelCollapsed` | Matches `viewMode` sync behavior |

## Component Changes

- **`Header.tsx`**: new `isCollapsed`/`onCollapseToggle` props; `CHEVRON_DOWN_ICON` / `CHEVRON_RIGHT_ICON` SVGs; collapse button as first element in left cluster; `Counts.inactive` field; `computeCounts` counts done+idle, skips errorState before total; inactive StatusPill replaces loop StatusPill.
- **`App.tsx`**: `isCollapsed` state (lazy-initialized from `localStorage`); `handleCollapseToggle`; `{!isCollapsed && content}` guard; new props passed to Header; StorageEvent sync for `panelCollapsed` key.
