'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { IMAGE_SIZE, optimizedImage } from '@/lib/inspirations/optimizedImage';

export type GalleryItem = {
  key: string;
  src: string | null;
  /** Web screens are wide; phone screens tall. */
  wide: boolean;
  href: string;
  title: string;
  subtitle: string;
  logo: string | null;
};

const PLACEHOLDERS = 6;

/** Width of the screenshot inside a card, in CSS pixels. */
const SHOT_WIDTH = { phone: IMAGE_SIZE.card, wide: 568 };

/** The resized picture a card shows for an item. */
function shotImage(item: GalleryItem) {
  return item.src ? optimizedImage(item.src, item.wide ? SHOT_WIDTH.wide : SHOT_WIDTH.phone) : null;
}

/** Loads and decodes a card's picture, resolving once it can be painted at once. */
function preload(item: GalleryItem): Promise<void> {
  const shot = shotImage(item);
  if (!shot) return Promise.resolve();
  const img = new Image();
  if (shot.srcSet) img.srcset = shot.srcSet;
  img.src = shot.src;
  return img.decode().catch(() => undefined);
}

function Card({ item, hidden, index }: { item: GalleryItem; hidden?: boolean; index: number }) {
  // What the card is showing. A new item only takes over once its picture
  // has loaded, so the card never flashes empty or half-drawn in between.
  const [shown, setShown] = useState<GalleryItem>(item);

  useEffect(() => {
    let cancelled = false;
    const swap = () => {
      if (cancelled) return;
      // Same screen as before (the search re-renders on every keystroke):
      // nothing to do.
      setShown((prev) => (prev.src === item.src && prev.key === item.key ? prev : item));
    };
    void preload(item).then(swap);
    return () => {
      cancelled = true;
    };
  }, [item]);

  const current = shown;
  const shot = shotImage(current);

  return (
    <Link
      href={current.href}
      className={`lpi-gallery-card${current.wide ? ' is-wide' : ''}`}
      style={{ '--i': index } as CSSProperties}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : `${current.title}${current.subtitle ? `, ${current.subtitle}` : ''}`}
    >
      {/* Keyed by picture, so a new result fades in rather than snapping. */}
      {shot && current.src ? (
        <img key={current.src} className="lpi-gallery-shot" {...shot} alt="" draggable={false} />
      ) : null}
      {current.logo ? <img className="lpi-gallery-logo" src={current.logo} alt="" width={72} height={72} /> : null}
      <span className="lpi-gallery-open" aria-hidden="true">
        {current.title} <span>↗</span>
      </span>
    </Link>
  );
}

/** Carousel of screen cards. Drifts on its own and pauses on hover. */
export function AppGallery({ items, label }: { items: GalleryItem[]; label: string }) {
  if (!items.length) {
    return (
      <section className="lpi-gallery" aria-hidden="true">
        <div className="lpi-gallery-track is-static">
          {Array.from({ length: PLACEHOLDERS }, (_, i) => (
            <div className="lpi-gallery-card is-placeholder" key={i} />
          ))}
        </div>
      </section>
    );
  }

  // Enough cards to be wider than the screen before the set repeats; the
  // second copy makes the loop seamless. Cards are keyed by position, so when
  // the items change the cards stay put and only their pictures swap.
  const set: GalleryItem[] = [];
  while (set.length < 8) set.push(...items);

  return (
    <section className="lpi-gallery" aria-label={label}>
      <div className="lpi-gallery-track">
        {[0, 1].map((copy) => (
          <div className="lpi-gallery-set" key={copy}>
            {set.map((item, i) => (
              <Card item={item} key={`${copy}-${i}`} index={i} hidden={copy === 1 || i >= items.length} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
