import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiSettingsInput, AiStatus } from '@/lib/inspirations/ingestJobs';

/**
 * The free AI, as the crawler sees it.
 *
 * The crawler owns the choice of server and model (tools/ios-crawler/src/ai.js)
 * and keeps it in .ai-settings.json beside itself, so the terminal and the
 * admin page always use the same one. This module asks the crawler for its
 * standing — `node crawl.js ai --json` — rather than probing the server a
 * second way, and writes the same settings file when the admin picks another
 * model. The key never leaves the server: the status says only whether one
 * is saved.
 */

const CRAWLER_DIR = join(process.cwd(), 'tools', 'ios-crawler');
const SETTINGS_FILE = join(CRAWLER_DIR, '.ai-settings.json');

type Saved = { provider?: string; url?: string; model?: string; key?: string; enabled?: boolean };

export function readSettings(): Saved {
  if (!existsSync(SETTINGS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Saved;
  } catch {
    return {};
  }
}

export function writeSettings(input: AiSettingsInput): Saved {
  const current = readSettings();
  const next: Saved = {
    provider: input.provider.trim(),
    url: input.url.trim(),
    model: input.model.trim(),
    // An empty key means "keep what is saved"; the field is never echoed
    // back, so the page cannot resend it.
    key: input.key?.trim() ? input.key.trim() : current.key ?? '',
    enabled: input.enabled !== false,
  };
  if (!next.key) delete next.key;
  writeFileSync(SETTINGS_FILE, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/** Asks the crawler where the AI stands. Takes a second or two. */
export function aiStatus(): Promise<AiStatus> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(CRAWLER_DIR, 'crawl.js'), 'ai', '--json'], {
      cwd: CRAWLER_DIR,
      env: { ...process.env, NO_COLOR: '1' },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf-8');
    });
    child.on('error', (error) => reject(new Error(`Could not start the crawler: ${error.message}`)));
    child.on('close', () => {
      const line = out.split('\n').find((entry) => entry.trim().startsWith('{'));
      if (!line) return reject(new Error(err.trim().split('\n')[0] || 'The crawler did not report the AI status.'));
      try {
        resolve(JSON.parse(line) as AiStatus);
      } catch {
        reject(new Error('The AI status could not be read.'));
      }
    });
  });
}
