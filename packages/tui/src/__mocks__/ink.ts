import React from 'react';

// Minimal CJS mock of ink's Text and Box components for Jest testing.
// These pass through their children as plain React elements so the
// ink-testing-library mock can extract text content.

export const Text: React.FC<{
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
  children?: React.ReactNode;
}> = ({ children }) => React.createElement('span', {}, children);

export const Box: React.FC<{
  flexDirection?: string;
  gap?: number;
  children?: React.ReactNode;
}> = ({ children }) => React.createElement('div', {}, children);

export const render = () => ({ unmount: () => {}, rerender: () => {}, cleanup: () => {} });
export const useInput = () => {};
export const useApp = () => ({ exit: () => {} });
export const useStdin = () => ({ stdin: null, setRawMode: () => {}, isRawModeSupported: false });
