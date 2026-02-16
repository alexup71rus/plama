import { mkdirSync } from 'fs';
import os from 'os';
import { join } from 'path';

const DEFAULT_APP_NAME = 'Plama';

function getAppName(): string {
  const fromEnv = process.env.PLAMA_APP_NAME?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_APP_NAME;
}

function resolveNonElectronDataDir(appName: string): string {
  const homeDir = os.homedir();

  switch (process.platform) {
    case 'darwin':
      return join(homeDir, 'Library', 'Application Support', appName);
    case 'win32': {
      const appData = process.env.APPDATA?.trim();
      if (appData) return join(appData, appName);
      return join(homeDir, 'AppData', 'Roaming', appName);
    }
    default: {
      const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
      if (xdgConfigHome) return join(xdgConfigHome, appName);
      return join(homeDir, '.config', appName);
    }
  }
}

export function resolveDataDir(): string {
  const forced = process.env.PLAMA_DATA_DIR?.trim();
  if (forced) return forced;

  return resolveNonElectronDataDir(getAppName());
}

export function ensureDataDir(): string {
  const dir = resolveDataDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
