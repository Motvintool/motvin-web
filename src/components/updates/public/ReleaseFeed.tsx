'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchReleaseNotes, type ReleaseNote } from '@/lib/firebase/updates';
import { ReleaseCard } from './ReleaseCard';

/**
 * Public updates feed — fetches release notes on mount and renders one
 * ReleaseCard per entry. Honours `?release=<slug>` by scrolling the matching
 * card into view, mirroring the reference script.110f497c05.js.
 */

const RELEASE_QUERY_KEY = 'release';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; notes: ReleaseNote[] }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

export function ReleaseFeed() {
  const searchParams = useSearchParams();
  const targetRelease = searchParams.get(RELEASE_QUERY_KEY) || '';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const notes = await fetchReleaseNotes();
        if (cancelled) return;
        if (!notes) {
          setState({ status: 'error', message: 'Firebase is not configured for this page.' });
          return;
        }
        if (notes.length === 0) {
          setState({ status: 'empty', message: 'No updates yet. Check back soon.' });
          return;
        }
        setState({ status: 'ready', notes });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        if (message === 'missing-firestore-index') {
          setState({
            status: 'error',
            message:
              'Updates Feed needs a Firestore index for date sorting before entries can load.',
          });
          return;
        }
        const code = String((err as { code?: unknown })?.code ?? '');
        if (code === 'permission-denied' || code === 'unauthenticated') {
          setState({
            status: 'error',
            message: 'Updates Feed is not readable with the current Firestore rules.',
          });
          return;
        }
        setState({
          status: 'error',
          message: 'Unable to load updates. Please try again later.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || !targetRelease) return;
    const target = feedRef.current?.querySelector<HTMLElement>(
      `[data-release-id="${CSS.escape(targetRelease)}"]`,
    );
    if (!target) return;
    target.classList.add('update-target');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state, targetRelease]);

  return (
    <main className="feed">
      <div className="container updates-shell" id="updatesFeed" ref={feedRef}>
        {state.status === 'loading' && (
          <div className="loading-state" id="loadingState">
            <div className="loading-spinner" />
            Loading updates...
          </div>
        )}
        {state.status === 'empty' && <div className="empty-state">{state.message}</div>}
        {state.status === 'error' && <div className="error-state">{state.message}</div>}
        {state.status === 'ready' &&
          state.notes.map((note, index) => (
            <ReleaseCard key={note.id} note={note} index={index} />
          ))}
      </div>
    </main>
  );
}
