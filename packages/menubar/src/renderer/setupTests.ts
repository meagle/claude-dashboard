import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Provide window.require('electron') for components that use utils/electron.ts.
// With nodeIntegration: true, window.require is available in the real app.
// In jsdom tests we set it up here so modules load without errors.
// jsdom doesn't implement ResizeObserver; stub it so chart components load.
(window as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

(window as any).require = (mod: string) => {
  if (mod === 'electron') {
    return {
      ipcRenderer: { on: vi.fn(), off: vi.fn(), send: vi.fn(), invoke: vi.fn() },
      clipboard: { writeText: vi.fn() },
    };
  }
  throw new Error(`Unexpected require('${mod}') in tests`);
};
