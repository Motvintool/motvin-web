'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { elementLabel, INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, ElementKind, Flow, Pattern, Screen } from '@/lib/inspirations/types';
import { AppLogo } from '../AppLogo';
import { CollectionMenu } from '../CollectionMenu';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { ArrowLeftIcon, ExternalIcon } from '../Icons';
import { PatternCard } from '../PatternCard';
import { SaveButton } from '../SaveButton';
import { ScreenGrid } from '../ScreenGrid';

type AppTab = 'overview' | 'screens' | 'flows' | 'ui-elements' | 'patterns';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
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
  const tab: AppTab = TABS.some((t) => t.id === rawTab) ? (rawTab as AppTab) : 'overview';
  const setTab = (t: AppTab) => router.replace(t === 'overview' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const screenIds = new Set(screens.map((s) => s.id));
  const screenById = new Map(screens.map((s) => [s.id, s]));
  const appsMap = new Map([[app.id, app]]);

  const elementCounts = new Map<ElementKind, number>();
  screens.forEach((s) => s.elements.forEach((e) => elementCounts.set(e, (elementCounts.get(e) ?? 0) + 1)));

  return (
    <>
      <div className="ins-detail-top">
        <Link href={INSPIRATIONS_ROUTES.apps} className="ins-back">
          <ArrowLeftIcon size={15} /> Apps
        </Link>
      </div>

      <header className="ins-app-head">
        <AppLogo app={app} size={56} />
        <div className="ins-app-head-text">
          <h1 className="ins-detail-title">{app.name}</h1>
          <p className="ins-detail-sub">
            {INDUSTRY_LABEL[app.industry] ?? app.industry} ·{' '}
            {app.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(' · ')} · {app.screenCount}{' '}
            {app.screenCount === 1 ? 'screen' : 'screens'} · {app.flowCount}{' '}
            {app.flowCount === 1 ? 'flow' : 'flows'}
          </p>
          {app.tagline && <p className="ins-app-tagline">{app.tagline}</p>}
          {app.license && (
            <p className="ins-app-license">
              Screens shown under {app.license} · credit {app.attribution}
            </p>
          )}
        </div>
        <div className="ins-detail-actions">
          <SaveButton type="app" id={app.id} variant="button" />
          <CollectionMenu type="app" id={app.id} variant="button" />
          {app.website && (
            <a href={app.website} className="ins-btn" target="_blank" rel="noopener noreferrer">
              <ExternalIcon size={15} /> Visit website
            </a>
          )}
        </div>
      </header>

      <div className="ins-tabbar" role="tablist" aria-label="App content">
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
      </div>

      {(tab === 'overview' || tab === 'screens') && (
        <section className="ins-tabpanel">
          {tab === 'overview' && flows.length > 0 && (
            <>
              <div className="ins-section-head">
                <h2 className="ins-section-title">Flows</h2>
                <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={() => setTab('flows')}>
                  See all
                </button>
              </div>
              <div className="ins-flow-grid">
                {flows.slice(0, 3).map((f) => (
                  <FlowCard
                    key={f.id}
                    flow={f}
                    app={app}
                    screens={f.screenIds.map((id) => screenById.get(id)).filter((s): s is Screen => Boolean(s))}
                  />
                ))}
              </div>
              <div className="ins-section-head">
                <h2 className="ins-section-title">Screens</h2>
              </div>
            </>
          )}
          <ScreenGrid
            screens={screens}
            apps={appsMap}
            showApp={false}
            empty={<EmptyState title="No screens stored for this app yet" />}
          />
        </section>
      )}

      {tab === 'flows' && (
        <section className="ins-tabpanel">
          {flows.length === 0 ? (
            <EmptyState title="No flows stored for this app yet" />
          ) : (
            <div className="ins-flow-grid">
              {flows.map((f) => (
                <FlowCard
                  key={f.id}
                  flow={f}
                  app={app}
                  screens={f.screenIds.map((id) => screenById.get(id)).filter((s): s is Screen => Boolean(s))}
                />
              ))}
            </div>
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
