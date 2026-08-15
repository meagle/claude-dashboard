import * as path from 'path';
import { readLastAssistantStats } from '../hook';

const fixture = (name: string) =>
  path.join(__dirname, 'fixtures', `${name}.transcript.jsonl`);

describe('golden transcript parse output', () => {
  for (const agent of ['claude-code', 'cursor', 'codex']) {
    it(`${agent}: mid-turn stats are stable`, () => {
      expect(readLastAssistantStats(fixture(agent), false)).toMatchSnapshot();
    });
    it(`${agent}: end-turn stats are stable`, () => {
      expect(readLastAssistantStats(fixture(agent), true)).toMatchSnapshot();
    });
  }
});
