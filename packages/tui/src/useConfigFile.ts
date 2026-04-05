import { useState, useEffect } from 'react';
import chokidar from 'chokidar';
import { readConfig, DashboardConfig } from '@claude-dashboard/shared';

export function useConfigFile(filePath: string): DashboardConfig {
  const [config, setConfig] = useState<DashboardConfig>(() => readConfig(filePath));

  useEffect(() => {
    const refresh = () => setConfig(readConfig(filePath));
    const watcher = chokidar.watch(filePath, { ignoreInitial: false });
    watcher.on('add', refresh);
    watcher.on('change', refresh);
    return () => {
      watcher.close();
    };
  }, [filePath]);

  return config;
}
