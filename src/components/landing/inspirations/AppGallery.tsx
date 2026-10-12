'use client';

import Link from 'next/link';

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

function Card({ item, hidden }: { item: GalleryItem; hidden?: boolean }) {
  return (
    <Link
      href={item.href}
      className={`lpi-gallery-card${item.wide ? ' is-wide' : ''}`}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : `${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}`}
    >
      {/* Keyed by picture, so a new result fades in rather than snapping. */}
      {item.src ? <img key={item.src} className="lpi-gallery-shot" src={item.src} alt="" draggable={false} /> : null}
      {item.logo ? <img className="lpi-gallery-logo" src={item.logo} alt="" width={72} height={72} /> : null}
      <span className="lpi-gallery-open" aria-hidden="true">
        {item.title} <span>↗</span>
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
              <Card item={item} key={`${copy}-${i}`} hidden={copy === 1 || i >= items.length} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
