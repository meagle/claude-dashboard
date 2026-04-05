import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readConfig } from '../config';
import { DEFAULT_CONFIG } from '../types';

describe('readConfig', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-config-'));
    filePath = path.join(dir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('returns DEFAULT_CONFIG when file does not exist', () => {
    expect(readConfig(filePath)).toEqual(DEFAULT_CONFIG);
  });

  it('merges partial config with defaults', () => {
    fs.writeFileSync(filePath, JSON.stringify({ theme: 'light' }), 'utf8');
    const result = readConfig(filePath);
    expect(result.theme).toBe('light');
    expect(result.staleSessionMinutes).toBe(DEFAULT_CONFIG.staleSessionMinutes);
    expect(result.columns).toEqual(DEFAULT_CONFIG.columns);
  });

  it('returns DEFAULT_CONFIG when file is invalid JSON', () => {
    fs.writeFileSync(filePath, 'not json', 'utf8');
    expect(readConfig(filePath)).toEqual(DEFAULT_CONFIG);
  });
});
