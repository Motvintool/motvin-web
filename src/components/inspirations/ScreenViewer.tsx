'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { DetectedComponent } from '@/lib/inspirations/analysis';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Screen } from '@/lib/inspirations/types';
import { AnalysisPanel } from './AnalysisPanel';
import { AppLogo } from './AppLogo';
import { CollectionMenu } from './CollectionMenu';
import { ExtractionPanel } from './ExtractionPanel';
import { ArrowLeftIcon, CopyIcon, ExternalIcon, FlowIcon, LayersIcon, MoreIcon, ScanIcon, SparklesIcon } from './Icons';
import { Screenshot } from './MockScreen';
import { SaveButton } from './SaveButton';
import { ScreenGrid } from './ScreenGrid';
import { useToast } from './Toast';
import { useAsync } from './useAsync';
import { useLibrary } from './useLibrary';

/**
 * Immersive screen detail. The screenshot owns the page; metadata sits in a
 * narrow rail; the tools (Similar · Analyze · Extract · Flow) live in tabs
 * below and are addressable via `?tab=` so cards can deep-link to them.
 */

type Tab = 'overview' | 'similar' | 'analyze' | 'extract' | 'flow';
const TABS: { id: Tab; label: string; icon: typeof LayersIcon }[] = [
  { id: 'similar', label: 'Similar', icon: LayersIcon },
  { id: 'analyze', label: 'Analyze UI', icon: SparklesIcon },
  { id: 'extract', label: 'Extract UI', icon: ScanIcon },
  { id: 'flow', label: 'Flows', icon: FlowIcon },
];

export function ScreenViewer({ screen, app }: { screen: Screen; app?: App }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { show } = useToast();
  const { markViewed } = useLibrary();
  const [highlight, setHighlight] = useState<DetectedComponent | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const tabParam = params.get('tab');
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'overview';

  useEffect(() => {
    markViewed('screen', screen.id);
  }, [markViewed, screen.id]);

  const setTab = useCallback(
    (next: Tab) => {
      const sp = new URLSearchParams(params.toString());
      if (next === 'overview') sp.delete('tab');
      else sp.set('tab', next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const { data: flows } = useAsync(() => inspirationsApi.getScreenFlows(screen.id), `flows:${screen.id}`);
  const { data: patterns } = useAsync(() => inspirationsApi.getScreenPatterns(screen.id), `patterns:${screen.id}`);
  const { data: similar, loading: similarLoading } = useAsync(
    () => (tab === 'similar' || tab === 'overview' ? inspirationsApi.similar(screen.id, tab === 'overview' ? 10 : 20) : Promise.resolve([])),
    `similar:${screen.id}:${tab === 'similar' ? 'full' : 'short'}`,
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      show('Link copied');
    } catch {
      show('Copy not available');
    }
  };

  return (
    <div className="ins-screenview">
      <div className="ins-detail-top">
        <button type="button" className="ins-back" onClick={() => (window.history.length > 1 ? router.back() : router.push(INSPIRATIONS_ROUTES.explore))}>
          <ArrowLeftIcon size={15} />
          Back
        </button>
      </div>

      <header className="ins-detail-head">
        <div className="ins-detail-title-wrap">
          {app && (
            <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-detail-app">
              <AppLogo app={app} size={22} />
              <span>{app.name}</span>
            </Link>
          )}
          <h1 className="ins-detail-title">{screen.name}</h1>
          <p className="ins-detail-sub">
            {SCREEN_TYPE_LABEL[screen.screenType]} · {INDUSTRY_LABEL[screen.industry]} · {PLATFORM_LABEL[screen.platform]}
          </p>
        </div>
        <div className="ins-detail-actions">
          <SaveButton type="screen" id={screen.id} variant="button" />
          <CollectionMenu type="screen" id={screen.id} variant="button" />
          <div className="ins-popwrap">
            <button type="button" className="ins-iconbtn ins-iconbtn--outline" aria-label="More actions" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((o) => !o)}>
              <MoreIcon size={16} />
            </button>
            {moreOpen && (
              <div className="ins-popover ins-popover--right" role="menu" onMouseLeave={() => setMoreOpen(false)}>
                <button type="button" className="ins-popover-item" role="menuitem" onClick={() => { void copyLink(); setMoreOpen(false); }}>
                  <CopyIcon size={14} /> <span>Copy link</span>
                </button>
                {app && (
                  <a href={app.website} className="ins-popover-item" role="menuitem" target="_blank" rel="noopener noreferrer">
                    <ExternalIcon size={14} /> <span>Visit website</span>
                  </a>
                )}
                <a href={screen.provenance.sourceUrl} className="ins-popover-item" role="menuitem" target="_blank" rel="noopener noreferrer">
                  <ExternalIcon size={14} /> <span>Source</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`ins-screenview-body ${screen.platform !== 'web' ? 'is-mobile' : ''}`}>
        <figure className="ins-stage ins-stage--detail">
          <div className="ins-stage-shot ins-stage-shot--detail">
            <Screenshot screen={screen} />
            {highlight && (
              <span
                className="ins-highlight"
                style={{
                  left: `${highlight.box.x * 100}%`,
                  top: `${highlight.box.y * 100}%`,
                  width: `${highlight.box.w * 100}%`,
                  height: `${highlight.box.h * 100}%`,
                }}
                aria-hidden
              >
                <span className="ins-highlight-label">{highlight.label}</span>
              </span>
            )}
          </div>
        </figure>

        <aside className="ins-info">
          <dl className="ins-info-list">
            <div className="ins-info-row">
              <dt>App</dt>
              <dd>{app ? <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-link">{app.name}</Link> : '—'}</dd>
            </div>
            <div className="ins-info-row">
              <dt>Platform</dt>
              <dd><Link href={`${INSPIRATIONS_ROUTES.screens}?platform=${screen.platform}`} className="ins-link">{PLATFORM_LABEL[screen.platform]}</Link></dd>
            </div>
            <div className="ins-info-row">
              <dt>Screen type</dt>
              <dd><Link href={`${INSPIRATIONS_ROUTES.screens}?type=${screen.screenType}`} className="ins-link">{SCREEN_TYPE_LABEL[screen.screenType]}</Link></dd>
            </div>
            <div className="ins-info-row">
              <dt>Industry</dt>
              <dd><Link href={`${INSPIRATIONS_ROUTES.screens}?industry=${screen.industry}`} className="ins-link">{INDUSTRY_LABEL[screen.industry]}</Link></dd>
            </div>
            <div className="ins-info-row">
              <dt>Style</dt>
              <dd>{screen.style.map((s) => STYLE_LABEL[s]).join(', ')}</dd>
            </div>
            <div className="ins-info-row">
              <dt>Tags</dt>
              <dd className="ins-info-tags">
                {screen.tags.map((t) => (
                  <Link key={t} href={INSPIRATIONS_ROUTES.searchFor(t)} className="ins-tag">{t}</Link>
                ))}
              </dd>
            </div>
            {patterns && patterns.length > 0 && (
              <div className="ins-info-row">
                <dt>Patterns</dt>
                <dd className="ins-info-tags">
                  {patterns.map((p) => (
                    <Link key={p.id} href={INSPIRATIONS_ROUTES.pattern(p)} className="ins-tag">{p.name}</Link>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          <div className="ins-info-actions">
            <button type="button" className="ins-btn ins-btn--block" onClick={() => setTab('flow')} disabled={!flows?.length}>
              <FlowIcon size={15} /> View Flow {flows && flows.length > 0 && <span className="ins-badge">{flows.length}</span>}
            </button>
            <button type="button" className="ins-btn ins-btn--block" onClick={() => setTab('similar')}>
              <LayersIcon size={15} /> Find Similar
            </button>
            <button type="button" className="ins-btn ins-btn--block ins-btn--primary" onClick={() => setTab('analyze')}>
              <SparklesIcon size={15} /> Analyze UI
            </button>
            <button type="button" className="ins-btn ins-btn--block" onClick={() => setTab('extract')}>
              <ScanIcon size={15} /> Extract UI
            </button>
          </div>
        </aside>
      </div>

      <div className="ins-tabbar" role="tablist" aria-label="Screen tools">
        <button type="button" role="tab" aria-selected={tab === 'overview'} className={`ins-tab ${tab === 'overview' ? 'is-active' : ''}`} onClick={() => setTab('overview')}>
          Overview
        </button>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ins-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={14} />
            {label}
            {id === 'flow' && flows && flows.length > 0 && <span className="ins-tab-count">{flows.length}</span>}
          </button>
        ))}
      </div>

      <section className="ins-tabpanel" role="tabpanel">
        {tab === 'overview' && (
          <>
            <h2 className="ins-section-title">More like this</h2>
            <ScreenGrid screens={similar ?? []} loading={similarLoading} />
            <div className="ins-section-foot">
              <button type="button" className="ins-btn ins-btn--ghost" onClick={() => setTab('similar')}>See all similar</button>
            </div>
          </>
        )}
        {tab === 'similar' && <ScreenGrid screens={similar ?? []} loading={similarLoading} />}
        {tab === 'analyze' && <AnalysisPanel screenId={screen.id} />}
        {tab === 'extract' && <ExtractionPanel screen={screen} onHighlight={setHighlight} />}
        {tab === 'flow' && (
          <div className="ins-flowlist">
            {(flows ?? []).length === 0 && <p className="ins-muted">This screen isn&apos;t part of a captured flow yet.</p>}
            {(flows ?? []).map((f) => (
              <FlowRow key={f.id} flowId={f.id} name={f.name} screenIds={f.screenIds} currentId={screen.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FlowRow({ flowId, name, screenIds, currentId }: { flowId: string; name: string; screenIds: string[]; currentId: string }) {
  const { data: screens } = useAsync(() => inspirationsApi.getScreens(screenIds), `flowrow:${flowId}`);
  return (
    <div className="ins-flowrow">
      <div className="ins-flowrow-head">
        <p className="ins-flowrow-name">{name}</p>
        <Link href={INSPIRATIONS_ROUTES.flow({ id: flowId })} className="ins-link">Open flow</Link>
      </div>
      <ol className="ins-flowrow-steps">
        {(screens ?? []).map((s, i) => (
          <li key={s.id} className={`ins-flowrow-step ${s.id === currentId ? 'is-current' : ''}`}>
            <Link href={INSPIRATIONS_ROUTES.screen(s)} className="ins-flowrow-link">
              <span className="ins-flowrow-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="ins-flowrow-shot"><Screenshot screen={s} /></span>
              <span className="ins-flowrow-label">{SCREEN_TYPE_LABEL[s.screenType]}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
