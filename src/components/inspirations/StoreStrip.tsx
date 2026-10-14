'use client';

import type { ReactNode } from 'react';
import type { Platform } from '@/lib/inspirations/types';
import type { StoreStats } from '@/lib/inspirations/storeStats';
import { useStoreStats } from './useStoreStats';

/**
 * A slim banner under the masthead with the app's live store numbers: a store
 * pill, then one line of text. iOS gets rank, rating, price, size and last
 * update (see storeStats.ts for what the store publishes). Shows a
 * skeleton while loading and nothing for Web Apps, Webs or when the store has no numbers.
 *
 * `trailing` (the Palette pill) sits at the strip's right end; with it, the
 * strip still shows for an app without store numbers, holding just that.
 */

type Stat = { key: string; prefix?: string; star?: boolean; value: string; suffix?: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statsFor(s: StoreStats): Stat[] {
  const out: Stat[] = [];
  if (s.rating) out.push({ key: 'rating', star: true, value: s.rating.toFixed(1), suffix: s.ratings ? `(${s.ratings} ratings)` : undefined });
  else if (s.ratings) out.push({ key: 'ratings', value: s.ratings, suffix: 'ratings' });
  if (s.size) out.push({ key: 'size', prefix: 'Size', value: s.size });
  if (s.updated && formatDate(s.updated)) out.push({ key: 'updated', prefix: 'Updated', value: formatDate(s.updated) });
  return out;
}

export function StoreStrip({
  name,
  platform,
  trailing,
}: {
  name: string;
  platform: Platform;
  trailing?: ReactNode;
}) {
  const { store, stats } = useStoreStats(name, platform);
  const loading = Boolean(store) && stats === undefined;
  const items = store && stats ? statsFor(stats) : [];
  const hasStore = Boolean(store) && (loading || items.length > 0);
  if (!hasStore && !trailing) return null;

  const storeName = 'App Store';

  return (
    <section className="ins-storebar" aria-label={hasStore ? `${storeName} stats` : undefined} aria-busy={loading}>
      <div className="ins-storebar-row">
      {hasStore && (
      <div className="ins-storebar-left">
        <span className="ins-storebar-pill">
          <img src="/ASSET/Icons/Motvin/store-appstore.svg" alt="" width={24} height={24} />
          Appstore
        </span>
        {loading ? (
          <span className="ins-skel ins-skel--line ins-storebar-skel" aria-hidden />
        ) : (
          <ul className="ins-storebar-list">
            {items.map((it) => (
              <li key={it.key} className="ins-storebar-item">
                {it.star && <img src="/ASSET/Icons/Motvin/store-star.svg" alt="" width={13} height={13} className="ins-storebar-star" />}
                {it.prefix && <span className="ins-storebar-muted">{it.prefix}</span>}
                <b>{it.value}</b>
                {it.suffix && <span className="ins-storebar-muted">{it.suffix}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
      {trailing && <div className="ins-storebar-trailing">{trailing}</div>}
      </div>
    </section>
  );
}
