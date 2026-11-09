'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PALETTE_HUES, hueOf, type PaletteHue } from '@/lib/inspirations/hues';

/** The `?color=` param: the picked colours, comma-separated (red,blue). */
export const PALETTE_PARAM = 'color';

export function readPaletteParam(value: string | null): PaletteHue[] {
  const ids = new Set<string>(PALETTE_HUES.map((h) => h.id));
  return (value ?? '').split(',').filter((v): v is PaletteHue => ids.has(v));
}

/**
 * "● ⌄" before Filters: opens a colour field and a grid of swatches, and picking some keeps only the apps whose
 * brand colour (their logo's) is one of them. Its dot shows the picked colours (a rainbow before any).
 */
export function PaletteFilter({
  selected,
  onChange,
  counts,
}: {
  selected: PaletteHue[];
  onChange: (next: PaletteHue[]) => void;
  /** How many of the listed apps have each colour, once their logos are read. */
  counts?: Partial<Record<PaletteHue, number>>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const picked = PALETTE_HUES.filter((h) => selected.includes(h.id));
  // The pill's one dot: a rainbow with nothing picked, the colour when one is, those colours split round it when several.
  const mark =
    picked.length === 0
      ? 'conic-gradient(#e5484d, #f76b15, #f5c518, #30a46c, #12a594, #0090ff, #8e4ec6, #e93d82, #e5484d)'
      : picked.length === 1
        ? picked[0].swatch
        : `conic-gradient(${picked.map((h, i) => `${h.swatch} ${(i / picked.length) * 100}% ${((i + 1) / picked.length) * 100}%`).join(', ')})`;
  const toggle = (id: PaletteHue) => onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  // The field: a hex typed in (any colour, matched to its nearest swatch), else the last picked swatch's.
  const [typed, setTyped] = useState('');
  const typedHex = /^#?[0-9a-f]{6}$/i.test(typed.trim()) ? `#${typed.trim().replace('#', '').toUpperCase()}` : null;
  const last = picked[picked.length - 1];
  const fieldColour = typedHex ?? last?.swatch.toUpperCase() ?? null;
  const onType = (value: string) => {
    setTyped(value);
    const hex = /^#?[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().replace('#', '') : null;
    if (!hex) return;
    const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
    onChange([hueOf(rgb)]);
  };

  return (
    <div ref={rootRef} className="ins-colorf-filter">
      <button
        type="button"
        className={`ins-fsort ins-colorf-pill ${picked.length ? 'is-applied' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={picked.length ? `App colour: ${picked.map((h) => h.label).join(', ')}` : 'Filter by app colour'}
        title="App colour"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ins-colorf-mark" style={{ background: mark }} aria-hidden />
        <span className="ins-fpill-chev" aria-hidden />
      </button>
      {open && (
        <div className="ins-colorf-pop">
          <section className="ins-colorf-card" role="group" aria-label="Filter apps by colour">
            {/* The field: the colour's square and its hex — type any hex to find the apps nearest that colour. */}
            <div className="ins-colorf-field">
              {/* The square opens the browser's own colour picker; what's picked there fills the hex. */}
              <span className={`ins-colorf-field-swatch ${fieldColour ? '' : 'is-empty'}`} style={fieldColour ? { background: fieldColour } : undefined}>
                <input
                  type="color"
                  className="ins-colorf-native"
                  value={(fieldColour ?? '#000000').toLowerCase()}
                  aria-label="Pick any colour"
                  onChange={(e) => onType(e.target.value.toUpperCase())}
                />
              </span>
              <input
                type="text"
                inputMode="text"
                spellCheck={false}
                maxLength={7}
                value={typed || (last ? last.swatch.toUpperCase() : '')}
                placeholder="#000000"
                aria-label="Colour as a hex code"
                onChange={(e) => onType(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
              {picked.length > 0 && (
                <button
                  type="button"
                  className="ins-colorf-clear"
                  onClick={() => {
                    setTyped('');
                    onChange([]);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="ins-colorf-grid">
              {PALETTE_HUES.map((h) => {
                const on = selected.includes(h.id);
                const count = counts?.[h.id];
                return (
                  <button
                    key={h.id}
                    type="button"
                    className={`ins-colorf-dot ${on ? 'is-picked' : ''} ${h.id === 'yellow' ? 'is-light' : ''}`}
                    style={{ '--hue': h.id === 'mono' ? undefined : h.swatch } as CSSProperties}
                    aria-pressed={on}
                    aria-label={`${h.label}${count !== undefined ? `, ${count} apps` : ''}`}
                    title={`${h.label}${count !== undefined ? ` · ${count} app${count === 1 ? '' : 's'}` : ''}`}
                    onClick={() => {
                      setTyped('');
                      toggle(h.id);
                    }}
                  >
                    {on && (
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M2.5 6.2 5 8.6l4.5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
