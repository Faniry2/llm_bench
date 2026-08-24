import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function maskSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/sk-[a-zA-Z0-9]{6,}/g, (m) => `${m.slice(0, 6)}****${m.slice(-4)}`);
  }
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.toLowerCase() === 'authorization' || k.toLowerCase() === 'apikey') {
        out[k] = '****';
      } else {
        out[k] = maskSecrets(v);
      }
    }
    return out;
  }
  return value;
}

function logDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

export async function appendRunLog(runId: string, entry: Record<string, unknown>): Promise<void> {
  try {
    const dir = logDir();
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `run-${runId}.jsonl`);
    const masked = maskSecrets({ ts: new Date().toISOString(), ...entry });
    await fs.appendFile(file, `${JSON.stringify(masked)}\n`, 'utf-8');
  } catch {
    // logging must never crash a run
  }
}
