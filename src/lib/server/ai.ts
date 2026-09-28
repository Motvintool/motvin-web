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

// ─── Cached standing, for callers that ask often ─────────────────────────────

type Cached = { at: number; status: AiStatus | null; pending: Promise<AiStatus> | null };
const cache: Cached = ((globalThis as unknown as { __motvinAiStatus?: Cached }).__motvinAiStatus ??= { at: 0, status: null, pending: null });

/** The standing, at most `maxAgeMs` old; one probe at a time. */
export async function cachedAiStatus(maxAgeMs = 60_000): Promise<AiStatus | null> {
  if (cache.status && Date.now() - cache.at < maxAgeMs) return cache.status;
  if (!cache.pending) {
    cache.pending = aiStatus()
      .then((status) => {
        cache.status = status;
        cache.at = Date.now();
        return status;
      })
      .finally(() => {
        cache.pending = null;
      });
  }
  try {
    return await cache.pending;
  } catch {
    return cache.status;
  }
}

/** Forgets the cached standing — after the settings change. */
export function forgetAiStatus() {
  cache.status = null;
  cache.at = 0;
}

/**
 * One question to the model, through the crawler's `ask` command so the
 * same model, settings and JSON handling apply as in a run.
 */
export function askModel(
  system: string,
  user: string,
  maxTokens = 400,
  onToken?: (piece: string) => void,
  options: { raw?: boolean } = {},
): Promise<{ text: string | null; model?: string; reason?: string; streamed?: boolean }> {
  const TOKEN_MARKER = 'MOTVIN_TOKEN';
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(CRAWLER_DIR, 'crawl.js'), 'ask', '--max-tokens', String(maxTokens), ...(onToken ? ['--stream'] : []), ...(options.raw ? ['--raw'] : [])], {
      cwd: CRAWLER_DIR,
      env: { ...process.env, NO_COLOR: '1' },
    });
    let out = '';
    let err = '';
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.startsWith(TOKEN_MARKER)) {
          try {
            onToken?.(JSON.parse(line.slice(TOKEN_MARKER.length).trim()) as string);
          } catch {
            // A malformed piece is dropped; the whole answer arrives at the end.
          }
        } else {
          out += `${line}\n`;
        }
        index = buffer.indexOf('\n');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf-8');
    });
    child.on('error', (error) => reject(new Error(`Could not start the crawler: ${error.message}`)));
    child.on('close', () => {
      if (buffer.trim()) out += `${buffer}\n`;
      const line = out.split('\n').find((entry) => entry.trim().startsWith('{'));
      if (!line) return reject(new Error(err.trim().split('\n')[0] || 'The model did not answer.'));
      try {
        resolve(JSON.parse(line) as { text: string | null; model?: string; reason?: string; streamed?: boolean });
      } catch {
        reject(new Error('The model reply could not be read.'));
      }
    });
    child.stdin.end(JSON.stringify({ system, user }));
  });
}
