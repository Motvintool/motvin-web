'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { APP_BY_ID, SCREENS, SCREEN_BY_ID } from '@/lib/inspirations/data/build';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { TRENDING_QUERIES } from '@/lib/inspirations/search';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from '@/lib/inspirations/taxonomy';
import type { Screen } from '@/lib/inspirations/types';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { SearchIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { ScreenGrid } from '../ScreenGrid';
import { ScreenGridSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';

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
    return (
      <>
        <PageHeading title="Search" description="Describe what you're looking for — an industry, a screen type, a platform, a style." />
        <div className="ins-trending">
          {TRENDING_QUERIES.map((q) => (
            <a key={q} href={INSPIRATIONS_ROUTES.searchFor(q)} className="ins-chip">
              <SearchIcon size={12} /> {q}
            </a>
          ))}
        </div>
      </>
    );
  }

  const intent = data?.intent;
  const understood = intent
    ? [
        ...intent.industries.map((i) => INDUSTRY_LABEL[i]),
        ...intent.screenTypes.map((t) => SCREEN_TYPE_LABEL[t]),
        ...intent.platforms.map((p) => PLATFORM_LABEL[p]),
        ...intent.styles.map((s) => STYLE_LABEL[s]),
      ]
    : [];

  const countFor = (t: ResultTab) =>
    !data ? undefined : t === 'all' ? data.total : t === 'apps' ? data.apps.length : t === 'screens' ? data.screens.length : t === 'flows' ? data.flows.length : data.patterns.length;

  return (
    <>
      <PageHeading
        title={<>Results for <span className="ins-title-query">“{query}”</span></>}
        description={
          understood.length > 0 ? (
            <span className="ins-understood">
              Understood as {understood.map((u) => <span key={u} className="ins-tag">{u}</span>)}
            </span>
          ) : undefined
        }
      />
      <div className="ins-tabbar" role="tablist" aria-label="Result type">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ins-tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
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
          description="Try a broader phrase like “fintech dashboard” or “mobile onboarding”."
          action={{ label: 'Browse everything', href: INSPIRATIONS_ROUTES.explore }}
        />
      ) : (
        <div className="ins-results">
          {(tab === 'all' || tab === 'apps') && data.apps.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <SectionHead title="Apps" count={data.apps.length} onMore={() => setTab('apps')} />}
              <div className="ins-app-grid">
                {(tab === 'all' ? data.apps.slice(0, 4) : data.apps).map((app) => (
                  <AppCard key={app.id} app={app} preview={SCREENS.filter((s) => s.appId === app.id).slice(0, 3)} />
                ))}
              </div>
            </section>
          )}
          {(tab === 'all' || tab === 'screens') && data.screens.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <SectionHead title="Screens" count={data.screens.length} onMore={() => setTab('screens')} />}
              <ScreenGrid screens={tab === 'all' ? data.screens.slice(0, 15) : data.screens} />
            </section>
          )}
          {(tab === 'all' || tab === 'flows') && data.flows.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <SectionHead title="Flows" count={data.flows.length} onMore={() => setTab('flows')} />}
              <div className="ins-flow-grid">
                {(tab === 'all' ? data.flows.slice(0, 3) : data.flows).map((flow) => (
                  <FlowCard key={flow.id} flow={flow} app={APP_BY_ID.get(flow.appId)} screens={flow.screenIds.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s))} />
                ))}
              </div>
            </section>
          )}
          {(tab === 'all' || tab === 'patterns') && data.patterns.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <SectionHead title="Patterns" count={data.patterns.length} onMore={() => setTab('patterns')} />}
              <div className="ins-pattern-grid-wrap">
                {(tab === 'all' ? data.patterns.slice(0, 4) : data.patterns).map((p) => (
                  <PatternCard key={p.id} pattern={p} screens={p.screenIds.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s))} />
                ))}
              </div>
            </section>
          )}
          {tab !== 'all' && countFor(tab) === 0 && <EmptyState title={`No ${tab} matched`} action={{ label: 'See all results', onClick: () => setTab('all') }} />}
        </div>
      )}
    </>
  );
}

function SectionHead({ title, count, onMore }: { title: string; count: number; onMore: () => void }) {
  return (
    <div className="ins-section-head">
      <h2 className="ins-section-title">
        {title} <span className="ins-title-count">{count}</span>
      </h2>
      <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={onMore}>See all</button>
    </div>
  );
}
