import { spawn } from 'node:child_process';
import { env } from '../config/env.js';

let toolsAvailable: boolean | null = null;

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/** Cached check that mongodump and mongorestore are on PATH (or MONGODUMP_BIN / MONGORESTORE_BIN). */
export async function isMongoDbToolsAvailable(): Promise<boolean> {
  if (toolsAvailable !== null) return toolsAvailable;
  const [dumpOk, restoreOk] = await Promise.all([
    commandExists(env.mongodumpBin),
    commandExists(env.mongorestoreBin),
  ]);
  toolsAvailable = dumpOk && restoreOk;
  return toolsAvailable;
}

export async function assertMongoDbToolsAvailable(): Promise<void> {
  if (await isMongoDbToolsAvailable()) return;
  throw new Error(
    'Platform backup requires mongodump and mongorestore (mongodb-database-tools). ' +
      'Install them locally, set MONGODUMP_BIN/MONGORESTORE_BIN, or use the Docker API image.',
  );
}

/** Test helper */
export function resetMongoDbToolsCache(): void {
  toolsAvailable = null;
}
