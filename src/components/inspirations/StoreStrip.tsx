'use client';

import type { Platform } from '@/lib/inspirations/types';
import type { StoreStats } from '@/lib/inspirations/storeStats';
import { useStoreStats } from './useStoreStats';

/**
 * A slim banner under the masthead with the app's live store numbers: a store
 * pill, then one line of text. iOS gets rank, rating, price, size and last
 * update (see storeStats.ts for what the store publishes). Shows a
 * skeleton while loading and nothing for Web Apps, Webs or when the store has no numbers.
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

export function StoreStrip({ name, platform }: { name: string; platform: Platform }) {
  const { store, stats } = useStoreStats(name, platform);
  if (!store) return null;
  const loading = stats === undefined;
  const items = stats ? statsFor(stats) : [];
  if (!loading && !items.length) return null;

  const storeName = 'App Store';

  return (
    <section className="ins-storebar" aria-label={`${storeName} stats`} aria-busy={loading}>
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
    </section>
  );
}
