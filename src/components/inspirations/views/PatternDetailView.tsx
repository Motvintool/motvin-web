'use client';

import Link from 'next/link';
import { SCREEN_BY_ID } from '@/lib/inspirations/data/build';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Pattern, Screen } from '@/lib/inspirations/types';
import { CollectionMenu } from '../CollectionMenu';
import { EmptyState } from '../EmptyState';
import { ArrowLeftIcon } from '../Icons';
import { SaveButton } from '../SaveButton';
import { ScreenGrid } from '../ScreenGrid';

/** /inspirations/pattern/[slug] — many real examples of one pattern. */
export function PatternDetailView({ pattern }: { pattern: Pattern }) {
  const screens = pattern.screenIds.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s));
  return (
    <>
      <div className="ins-detail-top">
        <Link href={`${INSPIRATIONS_ROUTES.patterns}?category=${encodeURIComponent(pattern.category)}`} className="ins-back">
          <ArrowLeftIcon size={15} /> {pattern.category}
        </Link>
      </div>
      <header className="ins-detail-head">
        <div className="ins-detail-title-wrap">
          <div className="ins-eyebrow">{pattern.category} pattern</div>
          <h1 className="ins-detail-title">{pattern.name}</h1>
          <p className="ins-detail-sub">{pattern.description}</p>
          <div className="ins-info-tags" style={{ marginTop: 8 }}>
            {pattern.tags.map((t) => (
              <Link key={t} href={INSPIRATIONS_ROUTES.searchFor(t)} className="ins-tag">{t}</Link>
            ))}
          </div>
        </div>
        <div className="ins-detail-actions">
          <SaveButton type="pattern" id={pattern.id} variant="button" />
          <CollectionMenu type="pattern" id={pattern.id} variant="button" />
        </div>
      </header>
      <p className="ins-muted ins-examples-count">{screens.length} examples</p>
      <ScreenGrid screens={screens} empty={<EmptyState title="No examples captured yet" />} />
    </>
  );
}
