import React from 'react';
import { render } from 'ink-testing-library';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders full bar at 100%', () => {
    const { lastFrame } = render(<ProgressBar pct={100} width={4} />);
    expect(lastFrame()).toContain('████');
  });

  it('renders empty bar at 0%', () => {
    const { lastFrame } = render(<ProgressBar pct={0} width={4} />);
    expect(lastFrame()).toContain('░░░░');
  });

  it('renders half-filled bar at 50%', () => {
    const { lastFrame } = render(<ProgressBar pct={50} width={4} />);
    expect(lastFrame()).toContain('██░░');
  });
});
