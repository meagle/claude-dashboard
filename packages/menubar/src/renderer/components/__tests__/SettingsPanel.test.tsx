import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ipcRenderer } from '../../utils/electron';
import { SettingsPanel } from '../SettingsPanel';

const mockConfig = {
  staleSessionMinutes: 30,
  notifications: true,
  notificationSound: true,
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
});
