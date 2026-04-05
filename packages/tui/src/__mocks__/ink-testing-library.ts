import React from 'react';

/**
 * Recursively extract text content from a React element tree,
 * calling function components to get their rendered output.
 */
function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || node === false) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join('');
  }
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<Record<string, unknown>>;
    const type = element.type;
    // If it's a function component, call it to get the rendered output
    if (typeof type === 'function') {
      try {
        const rendered = (type as (props: Record<string, unknown>) => React.ReactNode)(element.props);
        return extractText(rendered);
      } catch {
        return '';
      }
    }
    // For host elements (span, div, etc.), traverse children
    const props = element.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return '';
}

export function render(element: React.ReactElement) {
  const text = extractText(element);
  return {
    lastFrame: () => text,
    rerender: () => {},
    unmount: () => {},
    cleanup: () => {},
    frames: [text],
    stdin: null,
    stderr: null,
    stdout: null,
  };
}

export const cleanup = () => {};
