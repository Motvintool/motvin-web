'use client';

/**
 * Recordings dropped on the Motvin agent, handed to "Agent Upload" — the one
 * place a recording is uploaded, so a version of the same day is replaced
 * rather than mixed into. The files wait here (in memory) until the batch
 * panel opens and takes them; the admin view switches to that tab.
 */

const EVENT = 'motvin:recordings';
let waiting: File[] = [];

export function handOffRecordings(files: File[]) {
  waiting = [...waiting, ...files];
  window.dispatchEvent(new Event(EVENT));
}

/** The recordings waiting for the batch panel, taken once. */
export function takeRecordings(): File[] {
  const files = waiting;
  waiting = [];
  return files;
}

export const hasRecordings = () => waiting.length > 0;

/** Calls back whenever recordings are handed over. */
export function onRecordings(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}
