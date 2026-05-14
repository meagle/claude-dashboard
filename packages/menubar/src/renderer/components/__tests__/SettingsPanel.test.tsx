import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ipcRenderer } from '../../utils/electron';
import { SettingsPanel } from '../SettingsPanel';

const mockConfig = {
  staleSessionMinutes: 30,
  notifications: true,
  notificationSound: true,
  showBadgeCount: false,
  pinnedPanelOpacity: 1,
  columns: {
    gitBranch: true,
    changedFiles: true,
    subagents: false,
    lastAction: true,
    compactPaths: true,
    cost: false,
    footerStyle: 'default',
  },
  modelPricing: {
    fetched: {
      'claude-sonnet-4': { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
    },
    custom: [],
    fetchedAt: Date.now() - 1000,
  },
  modelContextWindows: {
    fetched: {
      'claude-sonnet-4-6': 1_000_000,
      'claude-opus-4-6': 1_000_000,
    },
    custom: [],
    fetchedAt: Date.now() - 1000,
  },
  modelColors: {
    'claude-sonnet-4-6': { color: '#D97757', badgeStyle: 'A' as const },
    'claude-opus-4-6':   { color: '#D97757', badgeStyle: 'A' as const },
  },
};

beforeEach(() => {
  vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
    if (channel === 'get-config') return Promise.resolve(mockConfig);
    return Promise.resolve(undefined);
  });
});

describe('SettingsPanel', () => {
  it('populates form from config on mount', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => {
      expect((document.getElementById('stale-minutes') as HTMLInputElement).value).toBe('30');
    });
  });

  it('reflects config toggle states', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => {
      const subagentsToggle = screen.getByRole('checkbox', { name: /subagent/i }) as HTMLInputElement;
      expect(subagentsToggle.checked).toBe(false);
    });
  });

  it('shows error message when save-config rejects', async () => {
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve(mockConfig);
      return Promise.reject(new Error('disk full'));
    });
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByText('Save'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText('disk full')).toBeInTheDocument();
    });
  });

  it('does not call onSave when save-config rejects', async () => {
    const onSave = vi.fn();
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve(mockConfig);
      return Promise.reject(new Error('permission denied'));
    });
    render(<SettingsPanel onSave={onSave} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByText('Save'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => screen.getByText('permission denied'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves footerStyle: grid when Grid segment is clicked', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByText('Grid'));
    fireEvent.click(screen.getByText('Grid'));
    await waitFor(() => {
      expect(vi.mocked(ipcRenderer.invoke)).toHaveBeenCalledWith(
        'save-config',
        expect.objectContaining({
          columns: expect.objectContaining({ footerStyle: 'grid' }),
        })
      );
    });
  });

  it('calls save-config with updated value when toggled and saved', async () => {
    const onSave = vi.fn();
    render(<SettingsPanel onSave={onSave} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByText('Save'));

    // Toggle subagents on
    fireEvent.click(screen.getByRole('checkbox', { name: /subagent/i }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('save-config', expect.objectContaining({
        columns: expect.objectContaining({ subagents: true }),
      }));
      expect(onSave).toHaveBeenCalled();
    });
  });

  it('renders a transparency range slider instead of segmented buttons', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.queryByText('None')).not.toBeInTheDocument();
    });
  });

  it('slider value reflects current opacity as transparency percentage', async () => {
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve({ ...mockConfig, pinnedPanelOpacity: 0.75 });
      return Promise.resolve(undefined);
    });
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => {
      const slider = screen.getByRole('slider') as HTMLInputElement;
      expect(slider.value).toBe('25'); // 25% transparent = opacity 0.75
    });
  });

  it('saves pinnedPanelOpacity 0.5 when slider changed to 50% transparency', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('slider'));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } });
    await waitFor(() => {
      expect(vi.mocked(ipcRenderer.invoke)).toHaveBeenCalledWith(
        'save-config',
        expect.objectContaining({ pinnedPanelOpacity: 0.5 })
      );
    });
  });

  it('reflects showBadgeCount: true from config', async () => {
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve({ ...mockConfig, showBadgeCount: true });
      return Promise.resolve(undefined);
    });
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => {
      const toggle = screen.getByRole('checkbox', { name: /agent count/i }) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });
  });

  it('saves showBadgeCount: true when badge toggle is switched on', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('checkbox', { name: /agent count/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /agent count/i }));
    await waitFor(() => {
      expect(vi.mocked(ipcRenderer.invoke)).toHaveBeenCalledWith(
        'save-config',
        expect.objectContaining({ showBadgeCount: true })
      );
    });
  });
});

describe('SettingsPanel — tab navigation', () => {
  it('shows General, Cost, and Models tabs', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cost' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Models' })).toBeInTheDocument();
    });
  });

  it('shows stale timeout on General tab by default', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Stale session timeout/i)).toBeInTheDocument();
    });
  });

  it('does not show session cost toggle on General tab', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'General' }));
    expect(screen.queryByLabelText(/Show session cost/i)).not.toBeInTheDocument();
  });

  it('switches to Cost tab and shows pricing table', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Cost' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cost' }));
    await waitFor(() => {
      expect(screen.getByText('claude-sonnet-4')).toBeInTheDocument();
    });
  });

  it('shows Show session cost toggle on Cost tab', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Cost' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cost' }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Show session cost/i)).toBeInTheDocument();
    });
  });

  it('switches to Models tab and shows fetched context windows', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => {
      expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
      expect(screen.getAllByText('1,000,000').length).toBeGreaterThan(0);
    });
  });

  it('does not show stale timeout on Models tab', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => screen.getByText('claude-sonnet-4-6'));
    expect(screen.queryByText(/Stale session timeout/i)).not.toBeInTheDocument();
  });
});

describe('SettingsPanel — Models tab overrides', () => {
  beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve(mockConfig);
      return Promise.resolve(undefined);
    });
  });

  it('shows orange dot on overridden context window', async () => {
    const configWithOverride = {
      ...mockConfig,
      modelContextWindows: {
        fetched: { 'claude-sonnet-4-6': 1_000_000 },
        custom: [{ prefix: 'claude-sonnet-4-6', contextWindow: 200_000 }],
        fetchedAt: Date.now() - 1000,
      },
    };
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve(configWithOverride);
      return Promise.resolve(undefined);
    });
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => screen.getByText('200,000'));
    // Orange dot is visible (not opacity-0)
    const dots = document.querySelectorAll('.bg-\\[\\#d97706\\]');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('shows Reset overrides button when custom entries exist', async () => {
    const configWithOverride = {
      ...mockConfig,
      modelContextWindows: {
        fetched: { 'claude-sonnet-4-6': 1_000_000 },
        custom: [{ prefix: 'claude-sonnet-4-6', contextWindow: 200_000 }],
        fetchedAt: Date.now() - 1000,
      },
    };
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve(configWithOverride);
      return Promise.resolve(undefined);
    });
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset overrides' })).toBeInTheDocument();
    });
  });

  it('shows confirmation step when Reset overrides is clicked', async () => {
    const configWithOverride = {
      ...mockConfig,
      modelContextWindows: {
        fetched: { 'claude-sonnet-4-6': 1_000_000 },
        custom: [{ prefix: 'claude-sonnet-4-6', contextWindow: 200_000 }],
        fetchedAt: Date.now() - 1000,
      },
    };
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve(configWithOverride);
      return Promise.resolve(undefined);
    });
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset overrides' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset overrides' }));
    await waitFor(() => {
      expect(screen.getByText('Clear all overrides?')).toBeInTheDocument();
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });
  });

  it('saves empty custom array when reset is confirmed', async () => {
    const configWithOverride = {
      ...mockConfig,
      modelContextWindows: {
        fetched: { 'claude-sonnet-4-6': 1_000_000 },
        custom: [{ prefix: 'claude-sonnet-4-6', contextWindow: 200_000 }],
        fetchedAt: Date.now() - 1000,
      },
    };
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'get-config') return Promise.resolve(configWithOverride);
      return Promise.resolve(undefined);
    });
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset overrides' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset overrides' }));
    await waitFor(() => screen.getByText('Yes'));
    fireEvent.click(screen.getByText('Yes'));
    await waitFor(() => {
      expect(vi.mocked(ipcRenderer.invoke)).toHaveBeenCalledWith(
        'save-config',
        expect.objectContaining({
          modelContextWindows: expect.objectContaining({ custom: [] }),
        })
      );
    });
  });

  it('renders color hex input for each model row in Models tab', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Models'));
    await waitFor(() => {
      const hexInputs = screen.getAllByDisplayValue('#D97757');
      expect(hexInputs.length).toBeGreaterThan(0);
    });
  });

  it('renders A/B/C style buttons for each model row in Models tab', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Models'));
    await waitFor(() => {
      const aBtns = screen.getAllByText('A');
      expect(aBtns.length).toBeGreaterThan(0);
    });
  });
});
