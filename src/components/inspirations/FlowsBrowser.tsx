'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FLOW_PARAM } from './FlowPreview';
import { flowCategoryLabel } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { ChevronDownIcon, PlayIcon, SearchIcon } from './Icons';
import { Screenshot } from './Screenshot';

/**
 * Browsing flows as journeys rather than as cards.
 *
 * A flow only means anything in sequence, so each one is laid out as the strip
 * of screens you would actually walk, at a size you can read, scrolling
 * sideways. The list down the left is how you get to a journey by name without
 * scrolling the gallery — flows are grouped under their category, and the
 * groups collapse, because an app with forty journeys is otherwise a wall.
 *
 * Selecting in the list scrolls the strip into view rather than filtering to
 * it: the point of the page is to browse across journeys, and losing the rest
 * of them on every click works against that.
 */

type Entry = { flow: Flow; screens: Screen[] };

export function FlowsBrowser({ entries, apps }: { entries: Entry[]; apps: Map<string, App> }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => {
      const app = apps.get(entry.flow.appId);
      return (
        entry.flow.name.toLowerCase().includes(needle) ||
        (app?.name ?? '').toLowerCase().includes(needle) ||
        flowCategoryLabel(entry.flow.category).toLowerCase().includes(needle)
      );
    });
  }, [entries, apps, query]);

  /** Category → its flows, for the list down the left. */
  const groups = useMemo(() => {
    const byCategory = new Map<string, Entry[]>();
    for (const entry of matches) {
      const key = entry.flow.category || 'other';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(entry);
    }
    return [...byCategory.entries()].sort((a, b) => flowCategoryLabel(a[0]).localeCompare(flowCategoryLabel(b[0])));
  }, [matches]);

  const toggle = (category: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const jumpTo = (flowId: string) => {
    setSelected(flowId);
    rowRefs.current.get(flowId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ins-flows-layout">
      <aside className="ins-flows-nav" aria-label="Flows">
        <div className="ins-flows-search">
          <SearchIcon size={14} className="ins-flows-search-icon" />
          <input
            type="search"
            className="ins-flows-search-input"
            placeholder="Search flows…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search flows"
          />
        </div>

        {groups.length === 0 ? (
          <p className="ins-muted ins-flows-nav-empty">Nothing matches “{query}”.</p>
        ) : (
          <nav className="ins-flows-tree">
            {groups.map(([category, items]) => {
              const isCollapsed = collapsed.has(category);
              return (
                <div key={category} className="ins-flows-group">
                  <button
                    type="button"
                    className="ins-flows-group-btn"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggle(category)}
                  >
                    <span>{flowCategoryLabel(category)}</span>
                    <ChevronDownIcon
                      size={13}
                      className={`ins-flows-chevron ${isCollapsed ? 'is-collapsed' : ''}`}
                    />
                  </button>

                  {!isCollapsed && (
                    <ul className="ins-flows-items">
                      {items.map(({ flow }) => (
                        <li key={flow.id}>
                          <button
                            type="button"
                            className={`ins-flows-item ${selected === flow.id ? 'is-active' : ''}`}
                            onClick={() => jumpTo(flow.id)}
                          >
                            {flow.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>
        )}
      </aside>

      <div className="ins-flows-stream">
        {matches.map((entry) => (
          <FlowRow
            key={entry.flow.id}
            entry={entry}
            app={apps.get(entry.flow.appId)}
            active={selected === entry.flow.id}
            registerRef={(node) => {
              if (node) rowRefs.current.set(entry.flow.id, node);
              else rowRefs.current.delete(entry.flow.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One journey: its screens in order, scrolling sideways, with the name and
 * screen count beneath. The whole strip links to the preview overlay, which is
 * where the journey is actually walked.
 */
function FlowRow({
  entry,
  app,
  active,
  registerRef,
}: {
  entry: Entry;
  app?: App;
  active: boolean;
  registerRef: (node: HTMLDivElement | null) => void;
}) {
  const params = useSearchParams();
  const { flow, screens } = entry;

  const href = (() => {
    const sp = new URLSearchParams(params.toString());
    sp.set(FLOW_PARAM, flow.id);
    return `?${sp.toString()}`;
  })();

  return (
    <div ref={registerRef} className={`ins-flowrow ${active ? 'is-active' : ''}`}>
      <div className="ins-flowrow-strip">
        {screens.map((screen, index) => (
          <Link
            key={screen.id}
            href={href}
            scroll={false}
            className="ins-flowrow-shot"
            aria-label={`Step ${index + 1} of the ${flow.name} flow`}
          >
            <Screenshot screen={screen} />
            <span className="ins-flowrow-step">{index + 1}</span>
          </Link>
        ))}
        {screens.length === 0 && (
          <p className="ins-muted ins-flowrow-missing">
            This flow&rsquo;s screens are not published — check the licence and the build report.
          </p>
        )}
      </div>

      <div className="ins-flowrow-meta">
        <Link href={href} scroll={false} className="ins-flowrow-title">
          <span className="ins-flowrow-play" aria-hidden>
            <PlayIcon size={13} />
          </span>
          <span>
            <span className="ins-flowrow-name">{flow.name}</span>
            <span className="ins-flowrow-sub">
              {flow.screenIds.length} screen{flow.screenIds.length === 1 ? '' : 's'}
              {app ? ` · ${app.name}` : ''}
            </span>
          </span>
        </Link>
        {app && <AppLogo app={app} size={26} />}
      </div>
    </div>
  );
}
