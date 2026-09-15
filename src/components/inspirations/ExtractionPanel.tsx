'use client';

import Link from 'next/link';
import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { elementLabel } from '@/lib/inspirations/taxonomy';
import type { DetectedComponent, Screen } from '@/lib/inspirations/types';
import { BookmarkIcon, CopyIcon, DownloadIcon, ExternalIcon, LayersIcon, ScanIcon } from './Icons';
import { LineSkeleton } from './Skeletons';
import { useToast } from './Toast';
import { useAsync } from './useAsync';
import { useLibrary } from './useLibrary';

/**
 * "Extract UI" — the components an analyzer detected in this screen.
 *
 * Two sources, in order: the stored analysis for the screen, which can locate
 * components on the image; failing that, the component kinds recorded for the
 * screen in its sidecar metadata, which are listed without positions because
 * none were measured. If neither exists the panel says so rather than
 * inventing a component list.
 */
export function ExtractionPanel({
  screen,
  onHighlight,
}: {
  screen: Screen;
  onHighlight?: (component: DetectedComponent | null) => void;
}) {
  const { data, loading } = useAsync(() => inspirationsApi.analyze(screen.id), `extract:${screen.id}`);
  const { show } = useToast();
  const { isSaved, toggleSaved } = useLibrary();
  const [selected, setSelected] = useState<DetectedComponent | null>(null);

  const analysis = data?.analysis ?? null;

  // Located components from a real analysis pass, else the recorded kinds.
  const components: DetectedComponent[] = analysis?.components?.length
    ? analysis.components
    : screen.elements.map((kind) => ({
        kind,
        label: elementLabel(kind),
        count: 1,
      }));

  const located = Boolean(analysis?.components?.length);

  const select = (c: DetectedComponent | null) => {
    setSelected(c);
    onHighlight?.(c);
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      show(`${label} copied`);
    } catch {
      show('Copy not available');
    }
  };

  const exportJson = () => {
    const payload = {
      screen: screen.id,
      source: screen.source,
      components,
      typography: analysis?.typography ?? null,
      located,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${screen.id}-components.json`;
    a.click();
    URL.revokeObjectURL(url);
    show('Exported');
  };

  if (loading) {
    return (
      <div className="ins-panel" aria-busy>
        <div className="ins-panel-head">
          <ScanIcon size={15} className="ins-pulse" />
          <span className="ins-panel-title">Loading components…</span>
        </div>
        <div className="ins-detected">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ins-skel" style={{ width: 90 + (i % 3) * 20, height: 30, borderRadius: 8 }} />
          ))}
        </div>
        <LineSkeleton width="60%" />
      </div>
    );
  }

  if (components.length === 0) {
    return (
      <div className="ins-panel">
        <div className="ins-panel-head">
          <ScanIcon size={15} />
          <span className="ins-panel-title">No components recorded</span>
        </div>
        <p className="ins-panel-body">
          Nothing has been detected in this screen yet. Components appear once an analyzer has run
          over it, or once its sidecar file lists them.
        </p>
      </div>
    );
  }

  const iconComponent = components.find((c) => c.kind === 'icon');
  const componentId = selected ? `${screen.id}:${selected.kind}` : null;

  return (
    <div className="ins-panel">
      <div className="ins-panel-head">
        <ScanIcon size={15} />
        <span className="ins-panel-title">Detected components</span>
        <span className="ins-panel-hint">
          {components.length} {components.length === 1 ? 'type' : 'types'}
          {located ? '' : ' · positions not measured'}
        </span>
      </div>

      <div className="ins-detected" role="listbox" aria-label="Detected components">
        {components.map((c) => (
          <button
            key={c.kind}
            type="button"
            role="option"
            aria-selected={selected?.kind === c.kind}
            className={`ins-detected-chip ${selected?.kind === c.kind ? 'is-active' : ''}`}
            onClick={() => select(selected?.kind === c.kind ? null : c)}
            onMouseEnter={() => c.box && onHighlight?.(c)}
            onMouseLeave={() => onHighlight?.(selected)}
          >
            <span>{c.label}</span>
            {c.count > 1 && <span className="ins-detected-count">{c.count}</span>}
          </button>
        ))}
      </div>

      {selected && componentId && (
        <div className="ins-extract-actions">
          <button type="button" className="ins-btn ins-btn--sm" onClick={() => copy(JSON.stringify(selected, null, 2), selected.label)}>
            <CopyIcon size={13} /> Copy
          </button>
          <button
            type="button"
            className={`ins-btn ins-btn--sm ${isSaved('component', componentId) ? 'is-active' : ''}`}
            onClick={() => show(toggleSaved('component', componentId) ? `${selected.label} saved` : 'Removed')}
          >
            <BookmarkIcon size={13} filled={isSaved('component', componentId)} /> Save
          </button>
          <button type="button" className="ins-btn ins-btn--sm" onClick={exportJson}>
            <DownloadIcon size={13} /> Export
          </button>
          <Link href={`${INSPIRATIONS_ROUTES.uiElements}?kind=${selected.kind}`} className="ins-btn ins-btn--sm">
            <LayersIcon size={13} /> Find Similar
          </Link>
        </div>
      )}

      {analysis?.typography && analysis.typography.length > 0 && (
        <section className="ins-analysis-block">
          <h3 className="ins-analysis-title">Typography</h3>
          <ul className="ins-analysis-list ins-analysis-list--kv">
            {analysis.typography.map((t) => (
              <li key={t.role}>
                <span className="ins-kv-key">{t.role}</span>
                <span className="ins-kv-val">{t.spec}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {iconComponent && (
        <section className="ins-iconhandoff">
          <div className="ins-iconhandoff-head">
            <h3 className="ins-analysis-title">Icons in this screen</h3>
            <p className="ins-iconhandoff-desc">
              Search the Motvin icon library for a match, then copy or download it as SVG or PNG.
            </p>
          </div>
          {iconComponent.iconQueries && iconComponent.iconQueries.length > 0 && (
            <div className="ins-iconhandoff-chips">
              {iconComponent.iconQueries.map((q) => (
                <a key={q} href={INSPIRATIONS_ROUTES.iconLibrary(q)} className="ins-chip ins-chip--sm ins-chip--link" target="_blank" rel="noopener noreferrer">
                  {q}
                  <ExternalIcon size={11} />
                </a>
              ))}
            </div>
          )}
          <a href={INSPIRATIONS_ROUTES.iconLibrary('')} className="ins-btn ins-btn--sm" target="_blank" rel="noopener noreferrer">
            <ExternalIcon size={13} /> Open icon library
          </a>
        </section>
      )}
    </div>
  );
}
