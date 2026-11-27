import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';

/**
 * The panel's dropdown, in place of the browser's own <select>, so the list
 * matches the panel's theme. A long list gets a search box; arrow keys, Enter
 * and Escape work as in a native menu; clicking outside closes it.
 */

export interface Option {
  value: string;
  label: string;
  /** A small image beside the label, such as an app logo. */
  image?: string | null;
}

interface Props {
  /** Shown when nothing is picked, and as the accessible name. */
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  /** Offer "label" itself as the first choice, which clears the pick. */
  clearable?: boolean;
  /** Which edge of the button the list lines up with. */
  align?: 'left' | 'right';
  class?: string;
}

/** Lists longer than this get a search box. */
const SEARCH_FROM = 10;

export function Dropdown(props: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  const choices = useMemo(() => {
    const all = props.clearable ? [{ value: '', label: props.label }, ...props.options] : props.options;
    const wanted = filter.trim().toLowerCase();
    return wanted ? all.filter((option) => option.value && option.label.toLowerCase().includes(wanted)) : all;
  }, [props.options, props.clearable, props.label, filter]);

  const picked = props.options.find((option) => option.value === props.value);
  const searchable = props.options.length > SEARCH_FROM;

  useEffect(() => {
    if (!open) return;
    setFilter('');
    setActive(Math.max(0, (props.clearable ? [{ value: '' }, ...props.options] : props.options).findIndex((o) => o.value === props.value)));
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    requestAnimationFrame(() => (searchable ? searchBox.current?.focus() : list.current?.focus()));
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  // A menu wider than its button would run past the panel's edge: slide it back inside.
  useLayoutEffect(() => {
    if (!open || !menu.current) return setShift(0);
    const box = menu.current.getBoundingClientRect();
    const gap = 8;
    if (box.right > window.innerWidth - gap) setShift(window.innerWidth - gap - box.right);
    else if (box.left < gap) setShift(gap - box.left);
  }, [open]);

  // Keep the highlighted row in view while moving with the keyboard.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (value: string) => {
    props.onChange(value);
    setOpen(false);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + choices.length) % Math.max(choices.length, 1));
    } else if (event.key === 'Enter' && choices[active]) {
      event.preventDefault();
      choose(choices[active].value);
    }
  };

  const on = Boolean(props.value);
  return (
    <div class={`dropdown ${props.class ?? ''}${on ? ' on' : ''}${open ? ' open' : ''}`} ref={root}>
      <button
        type="button"
        class="dropdown-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={picked ? `${props.label}: ${picked.label}` : props.label}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {picked?.image ? <img class="option-image" src={picked.image} alt="" crossOrigin="anonymous" /> : null}
        <span class="dropdown-text">{picked ? picked.label : props.label}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open ? (
        <div ref={menu} class={`dropdown-menu ${props.align === 'right' ? 'right' : 'left'}`} style={shift ? { translate: `${shift}px 0` } : undefined} onKeyDown={onKey}>
          {searchable ? (
            <div class="dropdown-search">
              <Icon name="search" size={14} />
              <input
                ref={searchBox}
                value={filter}
                placeholder={`Find ${props.label.toLowerCase()}`}
                onInput={(event) => {
                  setFilter((event.target as HTMLInputElement).value);
                  setActive(0);
                }}
              />
            </div>
          ) : null}
          <div class="dropdown-list" role="listbox" aria-label={props.label} tabIndex={-1} ref={list}>
            {choices.length ? (
              choices.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === props.value}
                  data-index={index}
                  class={`option${index === active ? ' active' : ''}${option.value === props.value ? ' selected' : ''}${option.value ? '' : ' reset'}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option.value)}
                >
                  {option.image ? <img class="option-image" src={option.image} alt="" loading="lazy" crossOrigin="anonymous" /> : null}
                  <span>{option.value ? option.label : `Any ${props.label.toLowerCase()}`}</span>
                  {option.value === props.value ? <Icon name="check" size={16} /> : null}
                </button>
              ))
            ) : (
              <p class="dropdown-empty">No match</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
