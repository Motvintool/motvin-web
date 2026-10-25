/**
 * One writer at a time for the library's shared files (flows.json, apps.json,
 * sources.json, the screens' folders): an upload publishing while a review
 * applies its fixes — or two reviews at once — must not save over each
 * other's changes. A lock file next to the store says who holds it; a lock
 * whose process is gone, or that is very old, is taken over. Nested use in
 * one process (an apply that lines the folders up) just goes on.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDataDir } from './publish.js';

/** A lock held this long is taken as left behind by a crash. */
const STALE_MS = 15 * 60_000;
const WAIT_MS = 500;

let depth = 0;

const lockFile = (dataDir) => join(resolveDataDir(dataDir), '..', '.library.lock');

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Takes the lock if it is free (or left behind); false while another process holds it. */
function tryTake(file) {
  try {
    writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  let holder = null;
  try {
    holder = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    // Being written this very moment: wait a turn.
    return false;
  }
  if (!holder || !Number.isInteger(holder.pid) || !alive(holder.pid) || Date.now() - holder.at > STALE_MS) {
    rmSync(file, { force: true });
    return tryTake(file);
  }
  return false;
}

/** Runs `fn` holding the library lock, waiting for its turn. */
export async function withLibraryLock(dataDir, fn) {
  if (depth > 0) {
    depth += 1;
    try {
      return await fn();
    } finally {
      depth -= 1;
    }
  }
  const file = lockFile(dataDir);
  while (!tryTake(file)) await new Promise((done) => setTimeout(done, WAIT_MS));
  depth = 1;
  try {
    return await fn();
  } finally {
    depth = 0;
    rmSync(file, { force: true });
  }
}

/** The same for a short synchronous write. */
export function withLibraryLockSync(dataDir, fn) {
  if (depth > 0) {
    depth += 1;
    try {
      return fn();
    } finally {
      depth -= 1;
    }
  }
  const file = lockFile(dataDir);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  while (!tryTake(file)) Atomics.wait(pause, 0, 0, WAIT_MS);
  depth = 1;
  try {
    return fn();
  } finally {
    depth = 0;
    rmSync(file, { force: true });
  }
}
