'use client';

import { inspirationsApi } from '@/lib/inspirations/api';
import { CopyIcon, SparklesIcon } from './Icons';
import { LineSkeleton } from './Skeletons';
import { useToast } from './Toast';
import { useAsync } from './useAsync';

/**
 * "Analyze UI" — the findings an analyzer has stored for this screen, read
 * from `data/inspirations/analysis/<screen-id>.json`.
 *
 * When nothing has been stored the panel says the screen has not been analyzed
 * yet. It never derives findings from tags: describing a real screenshot's
 * layout or typography without having looked at it would be a guess presented
 * as a reading of the image.
 */
export function AnalysisPanel({ screenId }: { screenId: string }) {
  const { data, loading } = useAsync(() => inspirationsApi.analyze(screenId), `analyze:${screenId}`);
  const { show } = useToast();

  const analysis = data?.analysis ?? null;

  const copyAll = async () => {
    if (!analysis) return;
    const text = analysis.sections
      .map((s) => `${s.title.toUpperCase()}\n${s.points.map((p) => `- ${p}`).join('\n')}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      show('Analysis copied');
    } catch {
      show('Copy not available');
    }
  };

  if (loading) {
    return (
      <div className="ins-panel" aria-busy>
        <div className="ins-panel-head">
          <SparklesIcon size={15} className="ins-pulse" />
          <span className="ins-panel-title">Loading analysis…</span>
        </div>
        <div className="ins-analysis-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="ins-analysis-block">
              <LineSkeleton width="35%" />
              <LineSkeleton width="90%" />
              <LineSkeleton width="70%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data?.analyzed || !analysis) {
    return (
      <div className="ins-panel">
        <div className="ins-panel-head">
          <SparklesIcon size={15} />
          <span className="ins-panel-title">Not analyzed yet</span>
        </div>
        <p className="ins-panel-body">
          No analysis has been stored for this screen. Once an analyzer has run over it, its
          findings on layout, typography, colour, spacing, components and navigation appear here.
        </p>
        <p className="ins-panel-note">
          Results are written to <code>data/inspirations/analysis/{screenId}.json</code> in
          motvin-backend.
        </p>
      </div>
    );
  }

  return (
    <div className="ins-panel">
      <div className="ins-panel-head">
        <SparklesIcon size={15} />
        <span className="ins-panel-title">UI analysis</span>
        {analysis.analyzer && <span className="ins-panel-hint">{analysis.analyzer}</span>}
        <span className="ins-spacer" />
        <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={copyAll}>
          <CopyIcon size={13} />
          Copy
        </button>
      </div>

      {analysis.palette && analysis.palette.length > 0 && (
        <div className="ins-palette">
          {analysis.palette.map((c) => (
            <button
              key={`${c.role}-${c.hex}`}
              type="button"
              className="ins-swatch"
              title={`Copy ${c.hex}`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(c.hex);
                  show(`${c.hex} copied`);
                } catch {
                  show('Copy not available');
                }
              }}
            >
              <span className="ins-swatch-color" style={{ background: c.hex }} />
              <span className="ins-swatch-text">
                <span className="ins-swatch-role">{c.role}</span>
                <span className="ins-swatch-hex">{c.hex}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="ins-analysis-grid">
        {analysis.sections.map((section) => (
          <section key={section.title} className="ins-analysis-block">
            <h3 className="ins-analysis-title">{section.title}</h3>
            <ul className="ins-analysis-list">
              {section.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
