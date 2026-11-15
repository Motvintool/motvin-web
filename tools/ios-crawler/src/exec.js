/** Thin promise wrapper around child_process, with a timeout on every call. */

import { spawn } from 'node:child_process';
import { log } from './log.js';

/**
 * Runs a command and resolves with its outcome. Never rejects on a non-zero
 * exit — callers decide whether an exit code is a failure, because plenty of
 * the tools here (simctl, idb) use exit codes for ordinary "not found" answers.
 */
export function run(command, args = [], options = {}) {
  const timeout = options.timeout ?? 60_000;
  return new Promise((resolve) => {
    log.debug(`$ ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      env: { ...process.env, ...(options.env || {}) },
      cwd: options.cwd,
    });

    const stdout = [];
    const stderr = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));

    // Always close stdin. Nothing here is interactive, and a child that waits
    // on input it will never get (the claude CLI does exactly this) stalls the
    // whole crawl behind a timeout.
    child.stdin.end(options.stdin ?? '');

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: '', stderr: error.message, buffer: Buffer.alloc(0), timedOut, failed: true });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const buffer = Buffer.concat(stdout);
      resolve({
        code,
        stdout: options.binary ? '' : buffer.toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
        buffer,
        timedOut,
        failed: code !== 0 || timedOut,
      });
    });
  });
}

/** Like `run`, but a non-zero exit throws with the captured stderr. */
export async function runOrThrow(command, args = [], options = {}) {
  const result = await run(command, args, options);
  if (result.failed) {
    const reason = result.timedOut ? `timed out after ${options.timeout ?? 60_000}ms` : result.stderr.trim() || `exit ${result.code}`;
    throw new Error(`${command} ${args.join(' ')} — ${reason}`);
  }
  return result;
}

/** Whether a binary is on PATH. */
export async function has(command) {
  const result = await run('command', ['-v', command], { timeout: 5000 });
  if (!result.failed) return true;
  // `command` is a shell builtin; fall back to which when spawn can't find it.
  const which = await run('which', [command], { timeout: 5000 });
  return !which.failed;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
