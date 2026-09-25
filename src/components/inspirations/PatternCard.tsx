import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Pattern, Screen } from '@/lib/inspirations/types';
import { Screenshot } from './Screenshot';

/**
 * Pattern tile: up to four example screens in a tight 2x2, then name and the
 * number of stored screens that show the pattern. The thumbnails are optional;
 * the count always comes from the pattern's own screen ids.
 */
export function PatternCard({
  pattern,
  screens = [],
  textHighlights,
}: {
  pattern: Pattern;
  screens?: Screen[];
  /** Same shape as ScreenGrid's own prop — a "Text in Screenshot" search's
   * per-word boxes, keyed by screen id. */
  textHighlights?: Record<string, Array<{ left: number; top: number; width: number; height: number }>>;
}) {
  const examples = screens.slice(0, 4);
  return (
    <Link href={INSPIRATIONS_ROUTES.pattern(pattern)} className="ins-pattern-card">
      <div className="ins-pattern-grid" aria-hidden>
        {examples.map((s) => (
          <div className="ins-pattern-thumb" key={s.id}>
            <Screenshot screen={s} />
            {textHighlights?.[s.id]?.map((highlight, index) => (
              <span
                key={`${highlight.left}-${highlight.top}-${index}`}
                className="ins-card-text-highlight"
                aria-hidden
                style={{ left: `${highlight.left}%`, top: `${highlight.top}%`, width: `${highlight.width}%`, height: `${highlight.height}%` }}
              />
            ))}
          </div>
        ))}
        {examples.length < 4 &&
          Array.from({ length: 4 - examples.length }, (_, i) => <div className="ins-pattern-thumb ins-pattern-thumb--empty" key={`e${i}`} />)}
      </div>
      <div className="ins-pattern-meta">
        <p className="ins-pattern-name">{pattern.name}</p>
        <p className="ins-pattern-sub">
          {pattern.category} · {pattern.screenIds.length}{' '}
          {pattern.screenIds.length === 1 ? 'example' : 'examples'}
        </p>
      </div>
    </Link>
  );
}
