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
  modelColors: {},
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
  it('sends detached-hover true on mouseenter in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement);
    expect(vi.mocked(ipcRenderer.send)).toHaveBeenCalledWith('detached-hover', true);
  });

  it('sends detached-hover false on mouseleave in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    fireEvent.mouseLeave(container.firstElementChild as HTMLElement);
    expect(vi.mocked(ipcRenderer.send)).toHaveBeenCalledWith('detached-hover', false);
  });

  it('does not send detached-hover events when not in detached mode', () => {
    window.location.hash = '';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    vi.mocked(ipcRenderer.send).mockClear();
    fireEvent.mouseEnter(container.firstElementChild as HTMLElement);
    fireEvent.mouseLeave(container.firstElementChild as HTMLElement);
    expect(vi.mocked(ipcRenderer.send)).not.toHaveBeenCalledWith('detached-hover', expect.anything());
  });

  it('does not apply panel-hover-fade class in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains('panel-hover-fade')).toBe(false);
  });

  it('sends detached-hover true when mouse leaves but settings panel is open', async () => {
    window.location.hash = '#detached';
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve({ staleSessionMinutes: 30, notifications: true, notificationSound: true, showBadgeCount: false, pinnedPanelOpacity: 0.5, columns: { gitBranch: true, changedFiles: true, subagents: false, lastAction: true, compactPaths: true, cost: false, footerStyle: 'default' } });
      return Promise.resolve(undefined);
    });
    const { getHandler } = setupSessionsHandler();
    const { container, getByTitle } = render(<App />);
    emitSessions(getHandler(), 0.5);

    // Open settings
    await act(async () => { fireEvent.click(getByTitle('Settings')); });
    vi.mocked(ipcRenderer.send).mockClear();

    // Mouse leaves — should still be opaque because settings is open
    fireEvent.mouseLeave(container.firstElementChild as HTMLElement);
    expect(vi.mocked(ipcRenderer.send)).toHaveBeenCalledWith('detached-hover', true);
  });
});
