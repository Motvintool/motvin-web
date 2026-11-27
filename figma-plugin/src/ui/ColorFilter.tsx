import { useEffect, useRef, useState } from 'preact/hooks';
import { hexToRgb, hueOf, PALETTE_HUES, RAINBOW, type PaletteHue } from './colors';

/**
 * The colour button beside the filters, as on motvin.com: a dot (a rainbow
 * before anything is picked) that opens a hex field and nine swatches. Picking
 * some keeps only the apps whose brand colour is one of them; a typed hex
 * picks the swatch it is nearest to.
 */
export function ColorFilter({
  selected,
  onChange,
  counts,
}: {
  selected: PaletteHue[];
  onChange: (next: PaletteHue[]) => void;
  /** How many of this platform's apps have each colour, once their logos are read. */
  counts: Partial<Record<PaletteHue, number>>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const picked = PALETTE_HUES.filter((hue) => selected.includes(hue.id));
  // One dot: a rainbow with nothing picked, the colour when one is, those colours split round it when several.
  const mark =
    picked.length === 0
      ? RAINBOW
      : picked.length === 1
        ? picked[0].swatch
        : `conic-gradient(${picked.map((hue, i) => `${hue.swatch} ${(i / picked.length) * 100}% ${((i + 1) / picked.length) * 100}%`).join(', ')})`;
  const toggle = (id: PaletteHue) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  const typedRgb = hexToRgb(typed);
  const field = typedRgb ? `#${typed.trim().replace('#', '').toUpperCase()}` : picked[picked.length - 1]?.swatch.toUpperCase() ?? '';

  return (
    <div class={`color-filter${open ? ' open' : ''}`} ref={root}>
      <button
        type="button"
        class={picked.length ? 'pill color-pill on' : 'pill color-pill'}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={picked.length ? `App colour: ${picked.map((hue) => hue.label).join(', ')}` : 'Filter by app colour'}
        title={picked.length ? picked.map((hue) => hue.label).join(', ') : 'App colour'}
        onClick={() => setOpen(!open)}
      >
        <span class="color-dot" style={{ background: mark }} />
      </button>
      {open ? (
        <div class="color-menu">
          <label class="color-field">
            <span class="color-preview" style={{ background: field || undefined }} />
            <input
              value={typed}
              placeholder={field || '#000000'}
              aria-label="Hex colour"
              spellcheck={false}
              onInput={(event) => {
                const value = (event.target as HTMLInputElement).value;
                setTyped(value);
                const rgb = hexToRgb(value);
                if (rgb) onChange([hueOf(rgb)]);
              }}
            />
          </label>
          <div class="swatches">
            {PALETTE_HUES.map((hue) => {
              const count = counts[hue.id] ?? 0;
              const on = selected.includes(hue.id);
              return (
                <button
                  type="button"
                  class={`swatch${on ? ' on' : ''}${hue.id === 'mono' ? ' mono' : ''}`}
                  style={{ background: hue.swatch }}
                  aria-pressed={on}
                  disabled={!count && !on}
                  title={`${hue.label} · ${count === 1 ? '1 app' : `${count} apps`}`}
                  aria-label={`${hue.label}, ${count === 1 ? '1 app' : `${count} apps`}`}
                  onClick={() => {
                    setTyped('');
                    toggle(hue.id);
                  }}
                />
              );
            })}
          </div>
          {picked.length ? (
            <button type="button" class="color-clear" onClick={() => { setTyped(''); onChange([]); }}>
              Clear colours
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
