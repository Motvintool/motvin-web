'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import type { Industry, ScreenType } from '@/lib/inspirations/types';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { SearchIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { ScreenGrid } from '../ScreenGrid';
import { ScreenGridSkeleton } from '../Skeletons';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

type ResultTab = 'all' | 'apps' | 'screens' | 'flows' | 'patterns';

const TABS: { id: ResultTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'apps', label: 'Apps' },
  { id: 'screens', label: 'Screens' },
  { id: 'flows', label: 'Flows' },
  { id: 'patterns', label: 'Patterns' },
];

/** /inspirations/search?q=… — mixed results with per-type tabs. */
export function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();
  const apps = useApps();

  const query = params.get('q')?.trim() ?? '';
  const rawTab = params.get('type');
  const tab: ResultTab = TABS.some((t) => t.id === rawTab) ? (rawTab as ResultTab) : 'all';

  const { data, loading } = useAsync(() => inspirationsApi.search(query), `search:${query}`);

  const setTab = (t: ResultTab) => {
    const sp = new URLSearchParams(params.toString());
    if (t === 'all') sp.delete('type');
    else sp.set('type', t);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  if (!query) {
    // Starting points come from what the store holds, so nothing here promises
    // content that is not in the library.
    const starters = [
      ...meta.taxonomy.screenTypes.slice(0, 4).map((t) => SCREEN_TYPE_LABEL[t as ScreenType] ?? t),
      ...meta.taxonomy.industries.slice(0, 4).map((i) => INDUSTRY_LABEL[i as Industry] ?? i),
    ];
    return (
      <>
        <PageHeading title="Search" />
        {starters.length > 0 ? (
          <div className="ins-trending">
            {starters.map((s) => (
              <a key={s} href={INSPIRATIONS_ROUTES.searchFor(s)} className="ins-chip">
                <SearchIcon size={12} /> {s}
              </a>
            ))}
          </div>
        ) : (
          <EmptyState title="The library is empty" description="There is nothing to search yet." />
        )}
      </>
    );
  }

  const countFor = (t: ResultTab) => {
    if (!data) return undefined;
    if (t === 'all') return data.total;
    if (t === 'apps') return data.apps.length;
    if (t === 'screens') return data.screenTotal ?? data.screens.length;
    if (t === 'flows') return data.flows.length;
    return data.patterns.length;
  };

  return (
    <>
      <PageHeading
        title={
          <>
            Results for <span className="ins-title-query">“{query}”</span>
          </>
        }
      />

      <div className="ins-tabbar" role="tablist" aria-label="Result type">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {countFor(t.id) !== undefined && <span className="ins-tab-count">{countFor(t.id)}</span>}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <ScreenGridSkeleton count={10} />
      ) : data.total === 0 ? (
        <EmptyState
          title="Nothing matched that search"
          description="Try a broader phrase, or browse everything in the library."
          action={{ label: 'Browse everything', href: INSPIRATIONS_ROUTES.explore }}
        />
      ) : (
        <div className="ins-results">
          {(tab === 'all' || tab === 'apps') && data.apps.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <SectionHead title="Apps" onMore={() => setTab('apps')} />}
              <div className="ins-app-grid">
                {(tab === 'all' ? data.apps.slice(0, 4) : data.apps).map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'screens') && data.screens.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && (
                <SectionHead title="Screens" onMore={() => setTab('screens')} />
              )}
              <ScreenGrid screens={tab === 'all' ? data.screens.slice(0, 15) : data.screens} />
            </section>
          )}

          {(tab === 'all' || tab === 'flows') && data.flows.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <SectionHead title="Flows" onMore={() => setTab('flows')} />}
              <div className="ins-flow-grid">
                {(tab === 'all' ? data.flows.slice(0, 3) : data.flows).map((flow) => (
                  <FlowCard key={flow.id} flow={flow} app={apps.get(flow.appId)} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'patterns') && data.patterns.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <SectionHead title="Patterns" onMore={() => setTab('patterns')} />}
              <div className="ins-pattern-grid-wrap">
                {(tab === 'all' ? data.patterns.slice(0, 4) : data.patterns).map((p) => (
                  <PatternCard key={p.id} pattern={p} />
                ))}
              </div>
            </section>
          )}

          {tab !== 'all' && countFor(tab) === 0 && (
            <EmptyState title={`No ${tab} matched`} action={{ label: 'See all results', onClick: () => setTab('all') }} />
          )}
        </div>
      )}
    </>
  );
}

function SectionHead({ title, onMore }: { title: string; onMore: () => void }) {
  return (
    <div className="ins-section-head">
      <h2 className="ins-section-title">{title}</h2>
      <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={onMore}>
        See all
      </button>
    </div>
  );
}
