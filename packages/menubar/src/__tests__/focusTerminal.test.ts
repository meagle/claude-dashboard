import { buildAppleScript } from '../focusTerminal';

describe('buildAppleScript', () => {
  it('builds script targeting the given PID', () => {
    const script = buildAppleScript(1234);
    expect(script).toContain('1234');
    expect(script).toContain('activate');
  });
});
