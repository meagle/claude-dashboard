import React from 'react';
import { render } from 'ink-testing-library';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders green dot for active', () => {
    const { lastFrame } = render(<StatusBadge status="active" errorState={false} />);
    expect(lastFrame()).toContain('●');
  });

  it('renders lock icon for waiting_permission', () => {
    const { lastFrame } = render(<StatusBadge status="waiting_permission" errorState={false} />);
    expect(lastFrame()).toContain('🔐');
  });

  it('renders question mark for waiting_input', () => {
    const { lastFrame } = render(<StatusBadge status="waiting_input" errorState={false} />);
    expect(lastFrame()).toContain('❓');
  });

  it('renders done checkmark', () => {
    const { lastFrame } = render(<StatusBadge status="done" errorState={false} />);
    expect(lastFrame()).toContain('✅');
  });

  it('appends error badge when errorState is true', () => {
    const { lastFrame } = render(<StatusBadge status="active" errorState={true} />);
    expect(lastFrame()).toContain('🔴');
  });
});
