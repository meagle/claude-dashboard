// Use window.require so Vite does not bundle the electron package.
// With nodeIntegration: true, window.require is available in the Electron renderer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const e = (window as any).require('electron') as typeof import('electron');
export const ipcRenderer = e.ipcRenderer;
export const clipboard = e.clipboard;
