import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Pattern, Screen } from '@/lib/inspirations/types';
import { Screenshot } from './MockScreen';

/**
 * Pattern tile: four example screens in a tight 2×2, then name + count.
 */
export function PatternCard({ pattern, screens }: { pattern: Pattern; screens: Screen[] }) {
  const examples = screens.slice(0, 4);
  return (
    <Link href={INSPIRATIONS_ROUTES.pattern(pattern)} className="ins-pattern-card">
      <div className="ins-pattern-grid" aria-hidden>
        {examples.map((s) => (
          <div className="ins-pattern-thumb" key={s.id}>
            <Screenshot screen={s} />
          </div>
        ))}
        {examples.length < 4 &&
          Array.from({ length: 4 - examples.length }, (_, i) => <div className="ins-pattern-thumb ins-pattern-thumb--empty" key={`e${i}`} />)}
      </div>
      <div className="ins-pattern-meta">
        <p className="ins-pattern-name">{pattern.name}</p>
        <p className="ins-pattern-sub">
          {pattern.category} · {pattern.screenIds.length} examples
        </p>
      </div>
    </Link>
  );
}
