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
  it('sets --panel-idle-opacity CSS variable to configured value in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--panel-idle-opacity')).toBe('0.5');
  });

  it('applies panel-hover-fade class in detached mode for CSS hover transitions', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains('panel-hover-fade')).toBe(true);
  });

  it('does not apply panel-hover-fade class when not in detached mode', () => {
    window.location.hash = '';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains('panel-hover-fade')).toBe(false);
  });

  it('does not set --panel-idle-opacity when not in detached mode', () => {
    window.location.hash = '';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.25);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--panel-idle-opacity')).toBe('');
  });
});
