import * as fs from 'fs';
import { DashboardConfig, DEFAULT_CONFIG } from './types';

export function readConfig(filePath: string): DashboardConfig {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const partial = JSON.parse(raw) as Partial<DashboardConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...partial,
      columns: { ...DEFAULT_CONFIG.columns, ...(partial.columns ?? {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
