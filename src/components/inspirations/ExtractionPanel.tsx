'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DetectedComponent } from '@/lib/inspirations/analysis';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Screen } from '@/lib/inspirations/types';
import { BookmarkIcon, CopyIcon, DownloadIcon, ExternalIcon, LayersIcon, ScanIcon } from './Icons';
import { LineSkeleton } from './Skeletons';
import { useToast } from './Toast';
import { useAsync } from './useAsync';
import { useLibrary } from './useLibrary';

/**
 * "Extract UI" — detected components with copy / save / export / similar
 * actions. Selecting a component highlights it on the screenshot via
 * `onHighlight`, and an `icon` component opens the hand-off into the Motvin
 * icon library (Copy SVG / Download SVG / PNG live there).
 */
export function ExtractionPanel({
  screen,
  onHighlight,
}: {
  screen: Screen;
  onHighlight?: (component: DetectedComponent | null) => void;
}) {
  const { data, loading } = useAsync(() => inspirationsApi.extract(screen.id), `extract:${screen.id}`);
  const { show } = useToast();
  const { isSaved, toggleSaved } = useLibrary();
  const [selected, setSelected] = useState<DetectedComponent | null>(null);

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
    if (!data) return;
    const blob = new Blob([JSON.stringify({ screen: screen.id, ...data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${screen.id}-extraction.json`;
    a.click();
    URL.revokeObjectURL(url);
    show('Exported');
  };

  if (loading || !data) {
    return (
      <div className="ins-panel" aria-busy>
        <div className="ins-panel-head">
          <ScanIcon size={15} className="ins-pulse" />
          <span className="ins-panel-title">Detecting components…</span>
        </div>
        <div className="ins-detected">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="ins-skel" style={{ width: 90 + (i % 3) * 20, height: 30, borderRadius: 8 }} />)}
        </div>
        <LineSkeleton width="60%" />
      </div>
    );
  }

  const iconComponent = data.components.find((c) => c.kind === 'icon');
  const componentId = selected ? `${screen.id}:${selected.kind}` : null;

  return (
    <div className="ins-panel">
      <div className="ins-panel-head">
        <ScanIcon size={15} />
        <span className="ins-panel-title">Detected components</span>
        <span className="ins-panel-hint">{data.components.length} types</span>
      </div>

      <div className="ins-detected" role="listbox" aria-label="Detected components">
        {data.components.map((c) => (
          <button
            key={c.kind}
            type="button"
            role="option"
            aria-selected={selected?.kind === c.kind}
            className={`ins-detected-chip ${selected?.kind === c.kind ? 'is-active' : ''}`}
            onClick={() => select(selected?.kind === c.kind ? null : c)}
            onMouseEnter={() => onHighlight?.(c)}
            onMouseLeave={() => onHighlight?.(selected)}
          >
            <span>{c.label}</span>
            <span className="ins-detected-count">{c.count}</span>
          </button>
        ))}
      </div>

      {selected && componentId && (
        <div className="ins-extract-actions">
          <button type="button" className="ins-btn ins-btn--sm" onClick={() => copy(JSON.stringify(selected, null, 2), selected.label)}>
            <CopyIcon size={13} /> Copy
          </button>
          <button type="button" className={`ins-btn ins-btn--sm ${isSaved('component', componentId) ? 'is-active' : ''}`} onClick={() => show(toggleSaved('component', componentId) ? `${selected.label} saved` : 'Removed')}>
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

      <div className="ins-extract-cols">
        <section className="ins-analysis-block">
          <h3 className="ins-analysis-title">Typography</h3>
          <ul className="ins-analysis-list ins-analysis-list--kv">
            {data.typography.map((t) => (
              <li key={t.role}>
                <span className="ins-kv-key">{t.role}</span>
                <span className="ins-kv-val">{t.spec}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="ins-analysis-block">
          <h3 className="ins-analysis-title">Colors</h3>
          <ul className="ins-analysis-list ins-analysis-list--kv">
            {data.colors.map((c) => (
              <li key={c.role}>
                <button type="button" className="ins-color-row" onClick={() => copy(c.hex, c.hex)} title="Copy hex">
                  <span className="ins-color-dot" style={{ background: c.hex }} />
                  <span className="ins-kv-key">{c.role}</span>
                  <span className="ins-kv-val">{c.hex}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {iconComponent && (
        <section className="ins-iconhandoff">
          <div className="ins-iconhandoff-head">
            <h3 className="ins-analysis-title">Icons in this screen</h3>
            <p className="ins-iconhandoff-desc">
              {iconComponent.count} icons detected. Find matching or similar icons in the Motvin icon library, then copy or download as SVG / PNG.
            </p>
          </div>
          <div className="ins-iconhandoff-chips">
            {iconComponent.iconQueries?.map((q) => (
              <a key={q} href={INSPIRATIONS_ROUTES.iconLibrary(q)} className="ins-chip ins-chip--sm ins-chip--link" target="_blank" rel="noopener noreferrer">
                {q}
                <ExternalIcon size={11} />
              </a>
            ))}
          </div>
          <a href={INSPIRATIONS_ROUTES.iconLibrary(iconComponent.iconQueries?.[0] ?? '')} className="ins-btn ins-btn--sm" target="_blank" rel="noopener noreferrer">
            <ExternalIcon size={13} /> Find similar icons
          </a>
        </section>
      )}
    </div>
  );
}
