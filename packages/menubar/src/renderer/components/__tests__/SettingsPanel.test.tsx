import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ipcRenderer } from '../../utils/electron';
import { SettingsPanel } from '../SettingsPanel';

const mockConfig = {
  staleSessionMinutes: 30,
  notifications: true,
  notificationSound: true,
  columns: {
    gitBranch: true,
    changedFiles: true,
    subagents: false,
    lastAction: true,
    compactPaths: true,
    cost: false,
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
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => {
      expect((document.getElementById('stale-minutes') as HTMLInputElement).value).toBe('30');
    });
  });

  it('reflects config toggle states', async () => {
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} />);
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
    render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} />);
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
    render(<SettingsPanel onSave={onSave} onCancel={vi.fn()} />);
    await waitFor(() => screen.getByText('Save'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => screen.getByText('permission denied'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls save-config with updated value when toggled and saved', async () => {
    const onSave = vi.fn();
    render(<SettingsPanel onSave={onSave} onCancel={vi.fn()} />);
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
});
