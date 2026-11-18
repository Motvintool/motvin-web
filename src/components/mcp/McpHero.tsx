'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { LibraryCounts } from '@/lib/inspirations/types';
import { TOOL_ICONS } from './toolIcons';

/**
 * The /mcp hero: the headline, one button, and below them the picture of
 * what the server does — a glowing core (Motvin) with a ring turning round
 * it and the AI tools in a row through it. Every couple of seconds the next tool lights up and its
 * mark rises into the core: the library, routed to whichever tool the
 * person uses. Tools further from the core sit smaller and fainter, for depth.
 *
 * Pure CSS motion apart from the active index; still under reduced motion.
 */

const CYCLE_MS = 2200;

function formatCount(value: number): string {
  return value >= 1000 ? `${Math.floor(value / 1000)},${String(value % 1000).padStart(3, '0')}` : String(value);
}

export function McpHero({ counts }: { counts: LibraryCounts | null }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % TOOL_ICONS.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  const tool = TOOL_ICONS[active];
  const screens = counts ? formatCount(counts.screens) : null;
  const apps = counts ? formatCount(counts.apps) : null;

  // Half the tools each side of the core.
  const indexed = TOOL_ICONS.map((item, i) => [item, i] as const);
  const left = indexed.slice(0, Math.ceil(indexed.length / 2));
  const right = indexed.slice(Math.ceil(indexed.length / 2));

  // `depth` is how many places a tool is from the core (1 = beside it).
  const toolButton = (item: (typeof TOOL_ICONS)[number], i: number, depth: number) => (
    <li key={item.id} className={`mh-tool${i === active ? ' is-active' : ''}`} style={{ '--d': depth } as CSSProperties}>
      <button type="button" onClick={() => setActive(i)} aria-label={item.name} aria-pressed={i === active}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={item.path} />
        </svg>
      </button>
    </li>
  );

  return (
    <section className="mh" aria-labelledby="mh-title">
      <div className="mh-card">
        <div className="mh-glow" aria-hidden="true" />

        <h1 className="mh-title" id="mh-title">
          Real app screens
          <br />
          for every AI tool
        </h1>
        <p className="mh-lead">
          Connect Claude, Cursor, ChatGPT or Codex to Motvin.{' '}
          <br className="mh-lead-break" />
          Your AI searches {screens ? `${screens} real screens` : 'thousands of real screens'} and flows before it designs.
        </p>

        <div className="mh-actions">
          <a href="#mcp-setup" className="mh-cta">
            <span className="mh-cta-plus" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            Connect in a minute
          </a>
        </div>

        {/* The stage: the tools in one line with the core in the middle of
            them, as the reference has it; the lit one's mark is in the core. */}
        <div className="mh-stage" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="mh-row">
            <ul className="mh-tools" aria-label="Works with">
              {left.map(([item, i], n) => toolButton(item, i, left.length - n))}
            </ul>

            <div className="mh-orb" aria-hidden="true">
              {/* Light spreading out from the core in rings, like ripples on water. */}
              <span className="mh-ripple" />
              <span className="mh-ripple" />
              <span className="mh-ripple" />
              <span className="mh-ripple" />
              <span className="mh-orb-halo" />
              <span className="mh-orb-ring" />
              <span className="mh-orb-core">
                <svg key={tool.id} className="mh-orb-mark" viewBox="0 0 24 24" fill="currentColor">
                  <path d={tool.path} />
                </svg>
              </span>
            </div>

            <ul className="mh-tools" aria-label="Works with">
              {right.map(([item, i], n) => toolButton(item, i, n + 1))}
            </ul>
          </div>

          <p className="mh-tagline">
            One connection. {apps ? `${apps} apps · ${screens} screens` : 'Every screen in the library'}, inside <b key={tool.id}>{tool.name}</b>.
          </p>
        </div>
      </div>
    </section>
  );
}
