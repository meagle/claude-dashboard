import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { ipcRenderer } from '../utils/electron';
import { App } from '../App';
import { CardConfig } from '../types';

const baseCardConfig: CardConfig = {
  showBranch: true,
  showGitSummary: true,
  showSubagents: true,
  showModel: true,
  compactPaths: true,
  showCost: false,
  showDoneFooter: true,
  showContextInMeta: false,
  footerStyle: 'default',
  theme: 'light',
  pinnedPanelOpacity: 1,
};

function setupSessionsHandler() {
  let handler: ((_: unknown, data: unknown) => void) | null = null;
  vi.mocked(ipcRenderer.on).mockImplementation((channel: string, h: unknown) => {
    if (channel === 'sessions-update') handler = h as typeof handler;
  });
  return { getHandler: () => handler };
}

function emitSessions(handler: ((_: unknown, data: unknown) => void) | null, pinnedPanelOpacity: number) {
  act(() => {
    handler?.(null, {
      sessions: [],
      cardConfig: { ...baseCardConfig, pinnedPanelOpacity },
      home: '/Users/test',
    });
  });
}

beforeEach(() => {
  vi.mocked(ipcRenderer.invoke).mockResolvedValue({});
  vi.mocked(ipcRenderer.send).mockReturnValue(undefined);
  vi.mocked(ipcRenderer.off).mockReturnValue(undefined as ReturnType<typeof ipcRenderer.off>);
});

afterEach(() => {
  window.location.hash = '';
  document.body.style.background = '';
});

describe('App pinned panel opacity', () => {
  it('applies configured idle opacity in detached mode when not hovered', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.5');
  });

  it('restores full opacity on mouseenter in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(wrapper.style.opacity).toBe('1');
  });

  it('returns to idle opacity on mouseleave in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseLeave(wrapper);
    expect(wrapper.style.opacity).toBe('0.5');
  });

  it('does not apply reduced opacity when not in detached mode', () => {
    window.location.hash = '';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.25);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('1');
  });
});
