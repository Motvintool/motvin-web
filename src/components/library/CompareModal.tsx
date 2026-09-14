'use client';

import { useEffect, useMemo, useState } from 'react';
import { renderForCategory } from '@/lib/render';
import type { LibraryItem } from '@/lib/api/normalize';
import type { CategoryConfig } from '@/lib/config/categories';
import { ModalPortal } from './ModalPortal';

/**
 * Read-only comparison grid — port of openCompare() in
 * motvin-ui/JS/motvin-icons.js (2698–2722).
 *
 * Rendered as one card per selected item with attribute rows: Source, Style,
 * Shapes, Path len, BBox, License. Shapes / Path len / BBox come from an
 * off-DOM measurement pass (iconStats()) — the SVG is briefly appended to a
 * hidden container so getTotalLength() and getBBox() have something to read.
 *
 * There are no actions inside; the modal is deliberately just information.
 */

type Props = {
  items: readonly LibraryItem[];
  config: CategoryConfig;
  open: boolean;
  onClose: () => void;
};

type IconStats = {
  shapes: number;
  pathLength: number;
  bbox: { width: number; height: number };
};

function initialStats(): IconStats {
  return { shapes: 0, pathLength: 0, bbox: { width: 0, height: 0 } };
}

export function CompareModal({ items, config, open, onClose }: Props) {
  // One stats entry per item, keyed by id. Kept as a single map so a
  // re-render doesn't remount every card.
  const [stats, setStats] = useState<Record<string, IconStats>>({});

  // Small preview markup per card — kept memoised so a re-render doesn't
  // rebuild every SVG string.
  const previews = useMemo(() => {
    const out: Record<string, string> = {};
    for (const item of items) {
      out[item.id] = renderForCategory(
        config.slug,
        item,
        { size: 48, stroke: 1.75, color: '#0F1116' },
      );
    }
    return out;
  }, [items, config.slug]);

  // Measure every selected item off-DOM once the modal opens or the selection
  // changes. `getBBox` and `getTotalLength` need the SVG to be attached, so
  // the container is a fixed offscreen div rather than nothing.
  useEffect(() => {
    if (!open) return;
    if (items.length === 0) {
      setStats({});
      return;
    }
    const staging = document.createElement('div');
    staging.style.cssText =
      'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;';
    document.body.appendChild(staging);

    const next: Record<string, IconStats> = {};
    for (const item of items) {
      const holder = document.createElement('div');
      holder.innerHTML = previews[item.id] ?? '';
      staging.appendChild(holder);
      const svg = holder.querySelector('svg');
      if (svg) {
        let pathLength = 0;
        let shapes = 0;
        const nodes = svg.querySelectorAll('path, line, circle, rect, polyline, polygon, ellipse');
        nodes.forEach((node) => {
          shapes += 1;
          try {
            pathLength += (node as SVGGeometryElement).getTotalLength?.() ?? 0;
          } catch {
            /* engine can throw for degenerate geometry — count without length */
          }
        });
        let bbox = { width: 0, height: 0 };
        try {
          const measured = (svg as SVGGraphicsElement).getBBox();
          bbox = {
            width: Math.round(measured.width * 10) / 10,
            height: Math.round(measured.height * 10) / 10,
          };
        } catch {
          /* ignore */
        }
        next[item.id] = { shapes, pathLength: Math.round(pathLength), bbox };
      } else {
        next[item.id] = initialStats();
      }
    }
    staging.remove();
    setStats(next);
  }, [open, items, previews]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <ModalPortal>
    <div
      className="mi-modal is-open"
      id="compare-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Compare selected items"
    >
      <div className="mi-modal-backdrop" onClick={onClose} data-close />
      <div className="mi-modal-card mi-modal-wide" onClick={(e) => e.stopPropagation()}>
        <button className="mi-modal-close" onClick={onClose} data-close aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="mi-compare">
          <div className="mi-compare-head">
            <h3>Visual comparison</h3>
            <p className="mi-muted">Which {config.noun} fits your interface best?</p>
          </div>
          <div className="mi-compare-grid" id="compare-grid">
            {items.map((item) => {
              const s = stats[item.id] ?? initialStats();
              return (
                <div className="mi-compare-item" key={item.id} data-id={item.id}>
                  <div
                    className="mi-compare-preview"
                    dangerouslySetInnerHTML={{ __html: previews[item.id] ?? '' }}
                  />
                  <div className="mi-compare-name">
                    <strong>{item.name}</strong>
                  </div>
                  <dl className="mi-compare-attrs">
                    <div className="mi-compare-attr">
                      <dt>Source</dt>
                      <dd>{item.sourceName}</dd>
                    </div>
                    <div className="mi-compare-attr">
                      <dt>Style</dt>
                      <dd>{item.style}</dd>
                    </div>
                    <div className="mi-compare-attr">
                      <dt>Shapes</dt>
                      <dd>{s.shapes}</dd>
                    </div>
                    <div className="mi-compare-attr">
                      <dt>Path len</dt>
                      <dd>{s.pathLength}</dd>
                    </div>
                    <div className="mi-compare-attr">
                      <dt>BBox</dt>
                      <dd>
                        {s.bbox.width}×{s.bbox.height}
                      </dd>
                    </div>
                    <div className="mi-compare-attr">
                      <dt>License</dt>
                      <dd>{item.license}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
