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
  const feedRef = useRef<HTMLElement>(null);

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
    target.classList.add('is-target');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state, targetRelease]);

  return (
    <section className="upd-feed" id="updatesFeed" ref={feedRef} aria-label="Release notes" aria-busy={state.status === 'loading'}>
      {state.status === 'loading' && (
        // Two placeholder releases in the feed's own shape while it loads.
        <>
          {[0, 1].map((n) => (
            <div className="upd-entry is-skeleton" key={n} aria-hidden="true">
              <div className="upd-entry-side">
                <span className="upd-skel is-date" />
                <span className="upd-skel is-title" />
              </div>
              <div className="upd-card">
                <span className="upd-skel is-image" />
                <span className="upd-skel is-line" />
                <span className="upd-skel is-line is-short" />
              </div>
            </div>
          ))}
        </>
      )}
      {(state.status === 'empty' || state.status === 'error') && (
        <p className={`upd-state${state.status === 'error' ? ' is-error' : ''}`}>{state.message}</p>
      )}
      {state.status === 'ready' &&
        state.notes.map((note, index) => <ReleaseCard key={note.id} note={note} index={index} />)}
    </section>
  );
}
