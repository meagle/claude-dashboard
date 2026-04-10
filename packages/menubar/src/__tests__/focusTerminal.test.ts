import { focusTerminal } from '../focusTerminal';

describe('focusTerminal', () => {
  it('does not throw for valid pid', () => {
    expect(() => focusTerminal(0, null)).not.toThrow();
  });
});
