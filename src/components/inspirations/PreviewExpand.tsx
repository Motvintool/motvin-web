'use client';

import { useSyncExternalStore } from 'react';

/**
 * Expand: a preview (screen, flow, compare) filling the window edge to edge like a page, or back to the
 * floating sheet. One choice for all three, kept in this browser, so an expanded preview opens expanded.
 */
const KEY = 'motvin:preview-expanded';
const listeners = new Set<() => void>();
let memory: boolean | null = null;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useExpandedPreview(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => memory ?? (memory = read()),
    () => false,
  );
}

function toggleExpandedPreview() {
  const next = !(memory ?? read());
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    // Blocked storage: the choice still holds until the page reloads.
  }
  memory = next;
  listeners.forEach((fn) => fn());
}

/** The round button before Shortcuts / Present: two corners pointing out; expanded, pointing back in. */
export function ExpandButton() {
  const expanded = useExpandedPreview();
  const label = expanded ? 'Exit full width' : 'Expand to full width';
  return (
    <button type="button" className="ins-preview-expand" aria-label={label} aria-pressed={expanded} title={label} onClick={toggleExpandedPreview}>
      {/* Shortcuts' 1.5px line on a 16px grid. */}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {expanded ? (
          <path d="M6.5 1.75v4.75H1.75M9.5 14.25V9.5h4.75M1.75 1.75 6.5 6.5M14.25 14.25 9.5 9.5" />
        ) : (
          <path d="M10 1.75h4.25V6M6 14.25H1.75V10M14.25 1.75 9.25 6.75M1.75 14.25l5-5" />
        )}
      </svg>
    </button>
  );
}
