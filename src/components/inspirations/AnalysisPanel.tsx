'use client';

import Link from 'next/link';
import { inspirationsApi } from '@/lib/inspirations/api';
import { PATTERN_BY_SLUG } from '@/lib/inspirations/data/build';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { CopyIcon, SparklesIcon } from './Icons';
import { LineSkeleton } from './Skeletons';
import { useToast } from './Toast';
import { useAsync } from './useAsync';

/**
 * "Analyze UI" — structured read-out of a screen: layout, typography,
 * colours, spacing, components, navigation, patterns, style. A tool, not a
 * chat: the result is a set of short scannable lists.
 */
export function AnalysisPanel({ screenId }: { screenId: string }) {
  const { data, loading } = useAsync(() => inspirationsApi.analyze(screenId), `analyze:${screenId}`);
  const { show } = useToast();

  const copyAll = async () => {
    if (!data) return;
    const text = data.sections.map((s) => `${s.title.toUpperCase()}\n${s.points.map((p) => `- ${p}`).join('\n')}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      show('Analysis copied');
    } catch {
      show('Copy not available');
    }
  };

  if (loading || !data) {
    return (
      <div className="ins-panel" aria-busy>
        <div className="ins-panel-head">
          <SparklesIcon size={15} className="ins-pulse" />
          <span className="ins-panel-title">Analyzing layout, type and colour…</span>
        </div>
        <div className="ins-analysis-grid">
          {Array.from({ length: 6 }, (_, i) => (
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

  return (
    <div className="ins-panel">
      <div className="ins-panel-head">
        <SparklesIcon size={15} />
        <span className="ins-panel-title">UI analysis</span>
        <span className="ins-spacer" />
        <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={copyAll}>
          <CopyIcon size={13} />
          Copy
        </button>
      </div>

      <div className="ins-palette">
        {data.palette.map((c) => (
          <button
            key={c.role}
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

      <div className="ins-analysis-grid">
        {data.sections.map((section) => (
          <section key={section.title} className="ins-analysis-block">
            <h3 className="ins-analysis-title">{section.title}</h3>
            <ul className="ins-analysis-list">
              {section.points.map((point, i) => {
                if (section.title === 'Patterns') {
                  const pattern = Array.from(PATTERN_BY_SLUG.values()).find((p) => p.name === point);
                  if (pattern) {
                    return (
                      <li key={i}>
                        <Link href={INSPIRATIONS_ROUTES.pattern(pattern)} className="ins-link">{point}</Link>
                      </li>
                    );
                  }
                }
                return <li key={i}>{point}</li>;
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
