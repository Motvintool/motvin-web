'use client';

import { useSyncExternalStore } from 'react';

/**
 * Which assistant's button the library owner sees in the corner: Motvin Buddy (the visitor's guide) or
 * Motvin Agent (the admin assistant). One at a time; the switch above the button flips it, and opening
 * either one makes it the one shown. Kept in this browser, so it stays put across pages and reloads.
 */
export type AssistantChoice = 'buddy' | 'agent';

const KEY = 'motvin:assistant';
const listeners = new Set<() => void>();

function read(): AssistantChoice {
  try {
    return localStorage.getItem(KEY) === 'agent' ? 'agent' : 'buddy';
  } catch {
    return 'buddy';
  }
}

export function setAssistantChoice(next: AssistantChoice) {
  if (read() === next) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private mode or blocked storage: the choice still holds until the page reloads.
  }
  memory = next;
  listeners.forEach((fn) => fn());
}

let memory: AssistantChoice | null = null;

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      memory = null;
      fn();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function useAssistantChoice(): AssistantChoice {
  return useSyncExternalStore(
    subscribe,
    () => memory ?? (memory = read()),
    () => 'buddy',
  );
}
