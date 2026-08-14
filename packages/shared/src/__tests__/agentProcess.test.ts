import { isKnownAgentProcessArgs } from '../agentProcess';

describe('isKnownAgentProcessArgs', () => {
  it('matches the claude CLI process', () => {
    expect(isKnownAgentProcessArgs('/usr/local/bin/node /usr/local/bin/claude')).toBe(true);
  });

  it('matches Cursor\'s own agent process', () => {
    expect(isKnownAgentProcessArgs('Cursor Helper (Plugin): extension-host Agents Window [1-1]')).toBe(true);
  });

  it('matches the codex CLI process', () => {
    expect(isKnownAgentProcessArgs('/usr/local/bin/node /usr/local/bin/codex')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isKnownAgentProcessArgs('CLAUDE')).toBe(true);
    expect(isKnownAgentProcessArgs('CURSOR')).toBe(true);
    expect(isKnownAgentProcessArgs('CODEX')).toBe(true);
  });

  it('returns false for unrelated processes', () => {
    expect(isKnownAgentProcessArgs('/usr/bin/ssh-agent')).toBe(false);
    expect(isKnownAgentProcessArgs('/Applications/Slack.app/Contents/MacOS/Slack')).toBe(false);
  });

  it('returns false for empty args', () => {
    expect(isKnownAgentProcessArgs('')).toBe(false);
  });
});
