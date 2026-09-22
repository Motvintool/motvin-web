'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { elementLabel, INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, ElementKind, Flow, Pattern, Screen } from '@/lib/inspirations/types';
import { AppLogo } from '../AppLogo';
import { AppMenu } from '../AppMenu';
import { AppRating } from '../AppRating';
import { CollectionMenu } from '../CollectionMenu';
import { EmptyState } from '../EmptyState';
import { FlowsBrowser } from '../FlowsBrowser';
import { ArrowLeftIcon } from '../Icons';
import { PatternCard } from '../PatternCard';

import { SaveButton } from '../SaveButton';

import { ScreenGrid } from '../ScreenGrid';

type AppTab = 'screens' | 'flows' | 'ui-elements' | 'patterns';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'screens', label: 'Screens' },
  { id: 'flows', label: 'Flows' },
  { id: 'ui-elements', label: 'UI Elements' },
  { id: 'patterns', label: 'Patterns' },
];

/** /inspirations/app/[slug] — one product, all of its stored screens and flows. */
export function AppDetailView({
  app,
  screens,
  flows,
  patterns,
}: {
  app: App;
  screens: Screen[];
  flows: Flow[];
  patterns: Pattern[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawTab = params.get('tab');
  const tab: AppTab = TABS.some((t) => t.id === rawTab) ? (rawTab as AppTab) : 'screens';
  const setTab = (t: AppTab) => router.replace(t === 'screens' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const screenIds = new Set(screens.map((s) => s.id));
  const screenById = new Map(screens.map((s) => [s.id, s]));
  const appsMap = new Map([[app.id, app]]);

  const elementCounts = new Map<ElementKind, number>();
  screens.forEach((s) => s.elements.forEach((e) => elementCounts.set(e, (elementCounts.get(e) ?? 0) + 1)));

  return (
    <>
      <div className="ins-detail-top">
        <Link href={INSPIRATIONS_ROUTES.explore} className="ins-back">
          <ArrowLeftIcon size={15} /> Apps
        </Link>
      </div>

      {/*
        Masthead, read top to bottom: mark, then what the product is, then the
        facts about it, then what you can do with it. Stacking rather than
        packing everything onto one line is what gives a detail page a sense of
        arrival — this is a destination, not another row in a list.
      */}
      <header className="ins-masthead">
        <div className="ins-masthead-main">
        <AppLogo app={app} size={96} className="ins-masthead-logo" />

        <h1 className="ins-masthead-title">
          {app.name}
          {app.tagline && (
            <>
              <span className="ins-masthead-dash"> — </span>
              <span className="ins-masthead-tagline">{app.tagline}</span>
            </>
          )}
        </h1>

        {app.license && (
          <p className="ins-masthead-note">
            Screens shown under {app.license} · credit {app.attribution}
          </p>
        )}

        {/* Label above value, in columns. A run of "a · b · c" hides which
            fact is which; labelling them makes the page scannable. */}
        <dl className="ins-masthead-facts">
          <div className="ins-fact">
            <dt>Platform</dt>
            <dd>{app.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(', ')}</dd>
          </div>

          <div className="ins-fact">
            <dt>Category</dt>
            <dd>{INDUSTRY_LABEL[app.industry] ?? app.industry}</dd>
          </div>

          {/* Last, and live from Firestore. The rating itself is public — every
              visitor sees what everyone else scored an app, signed in or not —
              so AppRating decides for itself, after the real data has loaded,
              whether there is anything to show. Only the ability to add a
              rating is gated on being signed in.

              Screen and flow counts used to sit here too; they are already in
              the tab row above and in "Showing N", so repeating them made the
              same number appear three times on one screen. */}
          <AppRating appId={app.id} appName={app.name} seed={app.rating} seedCount={app.ratingCount} />
        </dl>
        </div>

        <div className="ins-masthead-actions">
          <SaveButton type="app" id={app.id} variant="button" />
          <CollectionMenu type="app" id={app.id} variant="button" />
          {/* Website moved into the menu — three named buttons plus an overflow
              reads better than four competing for the same row. */}
          <AppMenu app={app} screens={screens} />
        </div>
      </header>

      <div className="ins-tabbar ins-tabbar--counted" role="tablist" aria-label="App content">
        {TABS.map((t) => {
          const count =
            t.id === 'screens'
              ? screens.length
              : t.id === 'flows'
                ? flows.length
                : t.id === 'patterns'
                  ? patterns.length
                  : t.id === 'ui-elements'
                    ? elementCounts.size
                    : undefined;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {count !== undefined && count > 0 && <span className="ins-tab-count">{count}</span>}
            </button>
          );
        })}

        {/* Right-aligned so the tab row carries both the navigation and the
            size of what you are looking at. */}
        <p className="ins-tabbar-showing">
          Showing{' '}
          {tab === 'flows'
            ? `${flows.length} ${flows.length === 1 ? 'flow' : 'flows'}`
            : tab === 'patterns'
              ? `${patterns.length} ${patterns.length === 1 ? 'pattern' : 'patterns'}`
              : tab === 'ui-elements'
                ? `${elementCounts.size} ${elementCounts.size === 1 ? 'element' : 'elements'}`
                : `${screens.length} ${screens.length === 1 ? 'screen' : 'screens'}`}
        </p>
      </div>

      {tab === 'screens' && (
        <section className="ins-tabpanel ins-app-detail-panel">
          <ScreenGrid
            screens={screens}
            apps={appsMap}
            showApp={false}
            showMeta={false}
            selectable
            empty={<EmptyState title="No screens stored for this app yet" />}
          />
        </section>
      )}

      {tab === 'flows' && (
        <section className="ins-tabpanel">
          {flows.length === 0 ? (
            <EmptyState title="No flows stored for this app yet" />
          ) : (
            // Inside one product the categories are what you navigate by, so
            // this view groups them in a list rather than listing them flat as
            // the all-flows page does.
            <FlowsBrowser
              entries={flows.map((f) => ({
                flow: f,
                screens: f.screenIds.map((id) => screenById.get(id)).filter((s): s is Screen => Boolean(s)),
              }))}
              apps={new Map([[app.id, app]])}
            />
          )}
        </section>
      )}

      {tab === 'ui-elements' && (
        <section className="ins-tabpanel">
          {elementCounts.size === 0 ? (
            <EmptyState title="No components recorded for this app's screens yet" />
          ) : (
            <div className="ins-element-list">
              {Array.from(elementCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([kind, count]) => (
                  <Link key={kind} href={`${INSPIRATIONS_ROUTES.uiElements}?kind=${kind}`} className="ins-element-row">
                    <span className="ins-element-name">{elementLabel(kind)}</span>
                    <span className="ins-element-count">
                      {count} {count === 1 ? 'screen' : 'screens'}
                    </span>
                  </Link>
                ))}
            </div>
          )}
        </section>
      )}

      {tab === 'patterns' && (
        <section className="ins-tabpanel">
          {patterns.length === 0 ? (
            <EmptyState title="No patterns matched this app's screens yet" />
          ) : (
            <div className="ins-pattern-grid-wrap">
              {patterns.map((p) => (
                <PatternCard
                  key={p.id}
                  pattern={p}
                  screens={p.screenIds
                    .filter((id) => screenIds.has(id))
                    .map((id) => screenById.get(id))
                    .filter((s): s is Screen => Boolean(s))
                    .slice(0, 4)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
