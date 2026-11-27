import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

/**
 * The panel's tour: dims everything except one part at a time and explains it in a small card, with Back,
 * Next and Skip. Shown once to a first-time person, and again from Settings. A part that is not on screen
 * (no results yet, say) is left out.
 */

interface Step {
  /** What to light up: one element, or several taken together. */
  target: string[];
  title: string;
  text: string;
}

const STEPS: Step[] = [
  { target: ['.searchbar'], title: 'Search', text: 'Type what you need, like “login” or “paywall”. Press / to jump here.' },
  { target: ['.searchbar .platform'], title: 'Pick a platform', text: 'iOS, Web Apps and Webs are separate libraries.' },
  { target: ['.modes'], title: 'Screens or flows', text: 'A flow adds every step of a journey at once.' },
  { target: ['.row-controls > .pill.dropdown', '.row-controls .color-pill', '.row-controls > button.pill'], title: 'Filter', text: 'Narrow by type, app colour, industry, style and more.' },
  { target: ['.grid .card'], title: 'Add to your canvas', text: 'Click a screen to put it on your canvas. Browsing is free; adding asks you to sign in once.' },
  { target: ['.paste-button'], title: 'Paste in', text: 'Used “Copy to Figma” on motvin.com? Press ⌘V here to add it.' },
  { target: ['.quick'], title: 'Quick actions', text: 'Select several at once, shuffle for fresh ideas, or match the frame selected on your canvas.' },
  { target: ['.settings'], title: 'Settings', text: 'Captions, where screens land, theme, and the tour again.' },
];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The box around a step's parts, or null when none is on screen. */
function boxOf(step: Step): Box | null {
  const rects = step.target
    .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
    .filter((rect): rect is DOMRect => Boolean(rect && rect.width && rect.height));
  if (!rects.length) return null;
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const right = Math.max(...rects.map((rect) => rect.right));
  const pad = 6;
  return { top: top - pad, left: left - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 };
}

const CARD_WIDTH = 300;
const CARD_HEIGHT = 160;

export function Tour({ onDone }: { onDone: () => void }) {
  // Only the steps whose parts are on screen as the tour starts.
  const [steps] = useState(() => STEPS.filter((step) => boxOf(step)));
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [, setSize] = useState(0);
  const step = steps[index];

  useLayoutEffect(() => {
    if (step) setBox(boxOf(step));
  }, [index]);

  useEffect(() => {
    const onResize = () => {
      setSize(window.innerWidth + window.innerHeight);
      if (step) setBox(boxOf(step));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone();
      else if (event.key === 'ArrowRight' || event.key === 'Enter') next();
      else if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });

  if (!step || !box) return null;
  const last = index === steps.length - 1;
  const next = () => (last ? onDone() : setIndex(index + 1));

  // The card goes under the lit part when it fits, else above it; kept inside the panel.
  const below = box.top + box.height + 10 + CARD_HEIGHT < window.innerHeight;
  const width = Math.min(CARD_WIDTH, window.innerWidth - 24);
  const left = Math.min(Math.max(12, box.left + box.width / 2 - width / 2), window.innerWidth - width - 12);
  const position = below ? { top: box.top + box.height + 10, left } : { top: Math.max(12, box.top - 10 - CARD_HEIGHT), left };

  return (
    <div class="tour" role="dialog" aria-modal="true" aria-label="Tour of the panel">
      <div class="tour-spot" style={{ ...box }} />
      <div class="tour-card" style={{ ...position, width }}>
        <p class="tour-step">
          {index + 1} of {steps.length}
        </p>
        <h2>{step.title}</h2>
        <p class="tour-text">{step.text}</p>
        <div class="tour-actions">
          <span class="tour-dots" aria-hidden="true">
            {steps.map((_, dot) => (
              <span class={dot === index ? 'on' : ''} />
            ))}
          </span>
          {last ? null : (
            <button class="link-button" onClick={onDone}>
              Skip
            </button>
          )}
          {index > 0 ? (
            <button class="secondary tour-back" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          ) : null}
          <button class="primary" onClick={next} autoFocus>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
