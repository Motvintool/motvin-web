'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_COLLECTION_NAME } from '@/lib/inspirations/store';
import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { useLibrary } from './useLibrary';

/** The stack only has room to show a few faces before they'd be unreadable. */
const MAX_LOGOS = 3;
/** How long the success state (Figma node 1039:40918) stays up before the
 * selection actually clears and the bar disappears — long enough to read,
 * short enough that it doesn't feel stuck. */
const SUCCESS_DURATION_MS = 1600;

/**
 * Floating bar for saving a selection — apps or screens — into a collection.
 * One flow either way: name it (pre-filled with the shared default board so
 * leaving it untouched is a one-click save) and submit. Screens used to have
 * their own shortcut here that skipped straight into a separate flat "Saved"
 * pool with no naming step; that pool had nowhere left to be viewed once the
 * standalone Saved page was removed, so it's gone — every save, app or
 * screen, goes through the one collection-based path Collections shows.
 * Figma: node 1067:48859 ("float-collection"), node 1039:40918
 * ("float-collection-success") for the confirmation it swaps to on save.
 *
 * `apps` is expected most-recent-first (AppsGrid reverses the selection
 * Set's insertion order) so the logo stack's frontmost face is whichever app
 * was just checked, not whichever happened to render first in the grid.
 */
export function FloatCollectionBar({
  apps,
  screens,
  screenApp,
  onClose,
  onSaved,
}: {
  apps?: App[];
  screens?: Screen[];
  screenApp?: App;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getOrCreateCollectionByName, toggleInCollection } = useLibrary();
  // Pre-filled rather than a placeholder — same name the store auto-creates
  // for a plain bookmark, so leaving it untouched here lands in that same
  // board rather than spawning a lookalike duplicate.
  const [name, setName] = useState(DEFAULT_COLLECTION_NAME);
  const [saved, setSaved] = useState(false);

  // The success state is a confirmation, not a modal you dismiss — it clears
  // itself (via onSaved, which drops the selection and unmounts this whole
  // component) rather than waiting on any further input.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(onSaved, SUCCESS_DURATION_MS);
    return () => clearTimeout(timer);
  }, [saved, onSaved]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // Reuses a board with this exact name if one already exists — the
    // pre-filled default name is meant to keep landing in the same board,
    // not spawn a fresh lookalike every time it's submitted unchanged.
    const collection = getOrCreateCollectionByName(trimmed);
    if (screens) {
      for (const screen of screens) toggleInCollection(collection.id, { type: 'screen', id: screen.id });
    } else {
      for (const app of apps ?? []) toggleInCollection(collection.id, { type: 'app', id: app.id });
    }
    setSaved(true);
  };

  // Oldest-of-the-visible-set first, most recent last — so the most recently
  // checked app paints on top (it's last in the DOM) at the frontmost
  // position (left: 8, closest to the container's left edge), exactly like a
  // real stack of things being added one at a time. The container hugs
  // however many of these there are (capped at MAX_LOGOS) rather than always
  // reserving room for three, so the offsets have to scale with the actual
  // count too — a fixed 8/30/52 (right for exactly three) left a lone logo
  // sitting at 52 in a 54px-wide box, almost entirely clipped off the edge
  // instead of sitting flush in the one slot available.
  const visualApps = apps ?? (screens && screenApp ? screens.map(() => screenApp) : []);
  const visible = visualApps.slice(0, MAX_LOGOS).reverse();
  const logosWidth = 54 + (visible.length - 1) * 22;

  if (saved) {
    return (
      <div className="ins-float-collection" role="status" aria-live="polite">
        <div className="ins-float-collection-success">
          <span className="ins-float-collection-success-check" aria-hidden>
            <span />
          </span>
          Saved to collection
        </div>
      </div>
    );
  }

  return (
    <div className="ins-float-collection" role="region" aria-label="Save selected items to a collection">
      <form className="ins-float-collection-bar" onSubmit={onSubmit}>
        <div className="ins-float-collection-logos" style={{ width: logosWidth }}>
          {visible.map((app, i) => (
            <span
              key={app.id}
              className="ins-float-collection-logo"
              style={{ left: 8 + (visible.length - 1 - i) * 22 }}
            >
              <AppLogo app={app} size={38} />
            </span>
          ))}
        </div>
        <img
          src="/ASSET/Icons/Motvin/float-collection-arrow.svg"
          alt=""
          className="ins-float-collection-arrow"
          width={27}
          height={20}
        />
        <input
          type="text"
          className="ins-float-collection-input"
          placeholder="Collection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
          aria-label="Collection name"
        />
        <button type="submit" className="ins-float-collection-save" disabled={!name.trim()}>
          Save
        </button>
      </form>
      <button type="button" className="ins-float-collection-close" aria-label="Cancel selection" onClick={onClose}>
        <img src="/ASSET/Icons/Motvin/float-collection-close.svg" alt="" width={20} height={20} />
      </button>
    </div>
  );
}
