'use client';

import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Pattern, Screen } from '@/lib/inspirations/types';
import { CollectionMenu } from '../CollectionMenu';
import { EmptyState } from '../EmptyState';
import { ArrowLeftIcon } from '../Icons';
import { SaveButton } from '../SaveButton';
import { ScreenGrid } from '../ScreenGrid';

/** /inspirations/pattern/[slug] — every stored screen that shows this pattern. */
export function PatternDetailView({ pattern, screens }: { pattern: Pattern; screens: Screen[] }) {
  return (
    <>
      <div className="ins-detail-top">
        <Link
          href={`${INSPIRATIONS_ROUTES.patterns}?category=${encodeURIComponent(pattern.category)}`}
          className="ins-back"
        >
          <ArrowLeftIcon size={15} /> {pattern.category}
        </Link>
      </div>

      <header className="ins-detail-head">
        <div className="ins-detail-title-wrap">
          <div className="ins-eyebrow">{pattern.category} pattern</div>
          <h1 className="ins-detail-title">{pattern.name}</h1>
          <p className="ins-detail-sub">{pattern.description}</p>
          {pattern.tags.length > 0 && (
            <div className="ins-info-tags" style={{ marginTop: 8 }}>
              {pattern.tags.map((t) => (
                <Link key={t} href={INSPIRATIONS_ROUTES.searchFor(t)} className="ins-tag">
                  {t}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="ins-detail-actions">
          <SaveButton type="pattern" id={pattern.id} variant="button" />
          <CollectionMenu type="pattern" id={pattern.id} variant="button" />
        </div>
      </header>

      <p className="ins-muted ins-examples-count">
        {screens.length} {screens.length === 1 ? 'example' : 'examples'}
      </p>
      <ScreenGrid screens={screens} empty={<EmptyState title="No stored screens show this pattern yet" />} />
    </>
  );
}
