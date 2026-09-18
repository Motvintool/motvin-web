'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import {
  EMPTY_RATING,
  MAX_RATING,
  ratingsAvailable,
  readRating,
  submitRating,
  type AppRatingSummary,
} from '@/lib/firebase/ratings';
import { Stars } from './Stars';
import { useToast } from './Toast';

/**
 * An app's rating: the average everyone gave it, and — when signed in — the
 * control to give your own.
 *
 * Renders both its own label and value (`<dt>Rating</dt>` + `<dd>…</dd>`, an
 * `.ins-fact` row) rather than leaving the caller to guess in advance whether
 * there is anything to show. That guess used to be made synchronously off the
 * manifest's editorial seed — almost always null — before Firestore's real
 * average had even loaded, so a signed-out visitor could open an app that
 * other people had already rated and never see the column at all. The rating
 * is public; only the ability to set one is gated. So the decision has to
 * wait for the real data, and only this component ever has it.
 *
 * Signed-out visitors see the score but cannot set one. That is enforced by
 * the Firestore rules, not by hiding the stars: this component only decides
 * what to offer, and the rules decide what is allowed. Hiding the control is
 * about not promising something the user cannot do.
 *
 * `seed` is the editorial score from the manifest. It stands in until real
 * people have rated, and is dropped the moment anyone does — so an app is
 * never showing a hand-entered number alongside a live one.
 */
export function AppRating({
  appId,
  appName,
  seed,
  seedCount,
}: {
  appId: string;
  appName: string;
  seed?: number | null;
  seedCount?: number | null;
}) {
  const { user, ready } = useAuth();
  const { show } = useToast();
  const [summary, setSummary] = useState<AppRatingSummary>(EMPTY_RATING);
  const [hovered, setHovered] = useState(0);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  const uid = user && !user.isAnonymous ? user.uid : null;
  const canRate = Boolean(uid) && ratingsAvailable();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const next = await readRating(appId, uid);
    if (mounted.current) setSummary(next);
  }, [appId, uid]);

  // Re-reads when the signed-in user changes, so "your rating" follows the
  // account rather than the page load.
  useEffect(() => {
    if (!ratingsAvailable() || !ready) return;
    void load();
  }, [load, ready]);

  const rate = async (value: number) => {
    if (!uid || saving) return;
    setSaving(true);
    try {
      const next = await submitRating(appId, uid, value);
      if (mounted.current) setSummary(next);
      show(`You rated ${appName} ${value} of ${MAX_RATING}`);
    } catch (error) {
      show((error as Error).message || 'Could not save your rating');
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  // Live ratings win outright. The seed only fills the gap before the first
  // real vote, so the two are never averaged together.
  const hasLive = summary.count > 0;
  const average = hasLive ? summary.average : (seed ?? null);
  const count = hasLive ? summary.count : (seedCount ?? 0);

  // Nothing to show and nothing this visitor can do: no score exists anywhere
  // (live or seeded) and they cannot rate either. This is the one case where
  // the whole fact — label included — stays off the page.
  if (average === null && !canRate) return null;

  return (
    <div className="ins-fact">
      <dt>Rating</dt>
      <dd>
        <div className="ins-rating">
          {average !== null ? (
            <div className="ins-rating-score">
              <Stars value={average} />
              <span className="ins-rating-value">
                {average.toFixed(2)} ({count})
              </span>
            </div>
          ) : (
            <span className="ins-rating-none">Not rated yet</span>
          )}

          {canRate && (
            <div
              className="ins-rating-mine"
              onMouseLeave={() => setHovered(0)}
              role="group"
              aria-label={`Rate ${appName}`}
            >
              {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((value) => {
                const on = value <= (hovered || summary.mine || 0);
                return (
                  <button
                    key={value}
                    type="button"
                    className={`ins-rating-star ${on ? 'is-on' : ''}`}
                    aria-label={`Rate ${value} of ${MAX_RATING}`}
                    aria-pressed={summary.mine === value}
                    disabled={saving}
                    onMouseEnter={() => setHovered(value)}
                    onFocus={() => setHovered(value)}
                    onClick={() => void rate(value)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden focusable="false">
                      <path
                        d="M12 2.6l2.7 5.9 6.3.7-4.7 4.3 1.3 6.3L12 16.6l-5.6 3.2 1.3-6.3L3 9.2l6.3-.7z"
                        fill={on ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth={on ? 0 : 1.6}
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                );
              })}
              <span className="ins-rating-hint">{summary.mine ? 'Your rating' : 'Rate it'}</span>
            </div>
          )}
        </div>
      </dd>
    </div>
  );
}
