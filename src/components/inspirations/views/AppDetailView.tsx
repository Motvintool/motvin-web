'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { PATTERNS, SCREEN_BY_ID } from '@/lib/inspirations/data/build';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { ELEMENT_LABEL, INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, ElementKind, Screen } from '@/lib/inspirations/types';
import { AppLogo } from '../AppLogo';
import { CollectionMenu } from '../CollectionMenu';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { ArrowLeftIcon, ExternalIcon } from '../Icons';
import { PatternCard } from '../PatternCard';
import { SaveButton } from '../SaveButton';
import { ScreenGrid } from '../ScreenGrid';
import { useAsync } from '../useAsync';

type AppTab = 'overview' | 'screens' | 'flows' | 'ui-elements' | 'patterns';
const TABS: { id: AppTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'screens', label: 'Screens' },
  { id: 'flows', label: 'Flows' },
  { id: 'ui-elements', label: 'UI Elements' },
  { id: 'patterns', label: 'Patterns' },
];

/** /inspirations/app/[slug] — one product, all of its screens and flows. */
export function AppDetailView({ app }: { app: App }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawTab = params.get('tab');
  const tab: AppTab = TABS.some((t) => t.id === rawTab) ? (rawTab as AppTab) : 'overview';

  const { data: screens, loading } = useAsync(() => inspirationsApi.getAppScreens(app.id), `app-screens:${app.id}`);
  const { data: flows } = useAsync(() => inspirationsApi.getAppFlows(app.id), `app-flows:${app.id}`);

  const setTab = (t: AppTab) => router.replace(t === 'overview' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const screenIds = new Set((screens ?? []).map((s) => s.id));
  const appPatterns = PATTERNS.filter((p) => p.screenIds.some((id) => screenIds.has(id)));
  const elementCounts = new Map<ElementKind, number>();
  (screens ?? []).forEach((s) => s.elements.forEach((e) => elementCounts.set(e, (elementCounts.get(e) ?? 0) + 1)));

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
            {INDUSTRY_LABEL[app.industry]} · {app.platforms.map((p) => PLATFORM_LABEL[p]).join(' · ')} · {app.screenCount} screens · {app.flowCount} flows
          </p>
          <p className="ins-app-tagline">{app.tagline}</p>
        </div>
        <div className="ins-detail-actions">
          <SaveButton type="app" id={app.id} variant="button" />
          <CollectionMenu type="app" id={app.id} variant="button" />
          <a href={app.website} className="ins-btn" target="_blank" rel="noopener noreferrer">
            <ExternalIcon size={15} /> Visit website
          </a>
        </div>
      </header>

      <div className="ins-tabbar" role="tablist" aria-label="App content">
        {TABS.map((t) => {
          const count = t.id === 'screens' ? screens?.length : t.id === 'flows' ? flows?.length : t.id === 'patterns' ? appPatterns.length : t.id === 'ui-elements' ? elementCounts.size : undefined;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ins-tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {count !== undefined && <span className="ins-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {(tab === 'overview' || tab === 'screens') && (
        <section className="ins-tabpanel">
          {tab === 'overview' && flows && flows.length > 0 && (
            <>
              <div className="ins-section-head">
                <h2 className="ins-section-title">Flows</h2>
                <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={() => setTab('flows')}>See all</button>
              </div>
              <div className="ins-flow-grid">
                {flows.slice(0, 3).map((f) => (
                  <FlowCard key={f.id} flow={f} app={app} screens={f.screenIds.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s))} />
                ))}
              </div>
              <div className="ins-section-head">
                <h2 className="ins-section-title">Screens</h2>
              </div>
            </>
          )}
          <ScreenGrid screens={screens ?? []} loading={loading} showApp={false} empty={<EmptyState title="No screens captured yet" />} />
        </section>
      )}

      {tab === 'flows' && (
        <section className="ins-tabpanel">
          {flows && flows.length === 0 ? (
            <EmptyState title="No flows captured for this app yet" />
          ) : (
            <div className="ins-flow-grid">
              {(flows ?? []).map((f) => (
                <FlowCard key={f.id} flow={f} app={app} screens={f.screenIds.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s))} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'ui-elements' && (
        <section className="ins-tabpanel">
          <div className="ins-element-list">
            {Array.from(elementCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([kind, count]) => (
                <Link key={kind} href={`${INSPIRATIONS_ROUTES.uiElements}?kind=${kind}`} className="ins-element-row">
                  <span className="ins-element-name">{ELEMENT_LABEL[kind]}</span>
                  <span className="ins-element-count">{count} {count === 1 ? 'screen' : 'screens'}</span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {tab === 'patterns' && (
        <section className="ins-tabpanel">
          {appPatterns.length === 0 ? (
            <EmptyState title="No patterns matched for this app yet" />
          ) : (
            <div className="ins-pattern-grid-wrap">
              {appPatterns.map((p) => (
                <PatternCard key={p.id} pattern={p} screens={p.screenIds.filter((id) => screenIds.has(id)).map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s))} />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
