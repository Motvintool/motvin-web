'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FLOW_PARAM } from './FlowPreview';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { ChevronDownIcon, PlayOutlineIcon, SearchIcon } from './Icons';
import { Screenshot } from './Screenshot';

/**
 * Browsing flows as journeys rather than as cards.
 *
 * A flow only means anything in sequence, so each one is laid out as the strip
 * of screens you would actually walk, at a size you can read, scrolling
 * sideways. The list down the left is the app's flow tree: sections in the
 * order they were walked, with the journeys that branch off a section and
 * return to it nested beneath it, to any depth — "Calendar" holding "Editing
 * ovulation" and "Filtering calendar". Branches collapse, because an app with
 * forty journeys is otherwise a wall.
 *
 * Selecting in the tree scrolls the strip into view rather than filtering to
 * it: the point of the page is to browse across journeys, and losing the rest
 * of them on every click works against that.
 */

export type Entry = { flow: Flow; screens: Screen[] };

export type Node = { entry: Entry; children: Node[]; depth: number };

/**
 * Nests flows by `parentId`, keeping the order they were recorded in. A parent
 * that is missing from the list leaves its children at the top level rather
 * than losing them.
 */
export function buildTree(entries: Entry[]): Node[] {
  const byId = new Map(entries.map((entry) => [entry.flow.id, entry]));
  const childrenOf = new Map<string | null, Entry[]>();
  for (const entry of entries) {
    const parent = entry.flow.parentId && byId.has(entry.flow.parentId) && entry.flow.parentId !== entry.flow.id ? entry.flow.parentId : null;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(entry);
  }
  const seen = new Set<string>();
  const build = (parent: string | null, depth: number): Node[] =>
    (childrenOf.get(parent) ?? [])
      .filter((entry) => !seen.has(entry.flow.id) && seen.add(entry.flow.id))
      .map((entry) => ({ entry, depth, children: build(entry.flow.id, depth + 1) }));
  return build(null, 0);
}

function flatten(nodes: Node[]): Node[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

/** Keeps the nodes that match and every ancestor of a match, so a hit is never orphaned. */
export function prune(nodes: Node[], matches: (entry: Entry) => boolean): Node[] {
  return nodes
    .map((node) => {
      const children = prune(node.children, matches);
      return matches(node.entry) || children.length ? { ...node, children } : null;
    })
    .filter((node): node is Node => Boolean(node));
}

export function FlowsBrowser({ entries, apps }: { entries: Entry[]; apps: Map<string, App> }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const params = useSearchParams();

  const tree = useMemo(() => buildTree(entries), [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tree;
    return prune(tree, (entry) => {
      const app = apps.get(entry.flow.appId);
      return (
        entry.flow.name.toLowerCase().includes(needle) ||
        (app?.name ?? '').toLowerCase().includes(needle) ||
        entry.screens.some((screen) => screen.name.toLowerCase().includes(needle))
      );
    });
  }, [tree, apps, query]);

  // The stream reads in tree order — a section, then the journeys that branch
  // from it — so the rail and the strips agree about what comes next.
  const ordered = useMemo(() => flatten(visible), [visible]);

  const toggle = (flowId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  };

  const jumpTo = (flowId: string) => {
    setSelected(flowId);
    rowRefs.current.get(flowId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * A flow's rows beneath its name: its own screens as leaves and its child
   * flows as branches, interleaved in walk order. A screen that a child flow
   * also lists is shown once, under the child — the parent's strip still has
   * it, but the tree names each screen in the most specific place it belongs.
   */
  const renderNode = (node: Node) => {
    const { flow, screens } = node.entry;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(flow.id) && !query.trim();
    const inChild = new Set(node.children.flatMap((child) => child.entry.flow.screenIds));
    const items: { at: number; screen?: Screen; child?: Node }[] = [
      ...screens.filter((screen) => !inChild.has(screen.id)).map((screen) => ({ at: flow.screenIds.indexOf(screen.id), screen })),
      ...node.children.map((child) => ({ at: flow.screenIds.indexOf(child.entry.flow.screenIds[0]), child })),
    ].sort((a, b) => a.at - b.at);
    const collapsible = items.length > 0 && node.depth === 0;
    return (
      <li key={flow.id} className="ins-flowtree-node" style={{ '--depth': node.depth } as React.CSSProperties}>
        <div className={`ins-flowtree-row ${selected === flow.id ? 'is-active' : ''} ${node.depth === 0 ? 'is-root' : ''}`}>
          <button type="button" className="ins-flowtree-name" onClick={() => jumpTo(flow.id)}>
            {flow.name}
          </button>
          {(hasChildren || collapsible) && (
            <button
              type="button"
              className="ins-flowtree-toggle"
              aria-label={isCollapsed ? `Expand ${flow.name}` : `Collapse ${flow.name}`}
              aria-expanded={!isCollapsed}
              onClick={() => toggle(flow.id)}
            >
              <ChevronDownIcon size={13} className={`ins-flows-chevron ${isCollapsed ? 'is-collapsed' : ''}`} />
            </button>
          )}
        </div>
        {!isCollapsed && items.length > 0 && (
          <ul className="ins-flowtree-children">
            {items.map((item) =>
              item.child ? (
                renderNode(item.child)
              ) : (
                <li key={item.screen!.id} className="ins-flowtree-node" style={{ '--depth': node.depth + 1 } as React.CSSProperties}>
                  <div className="ins-flowtree-row is-leaf">
                    <Link
                      href={(() => {
                        const sp = new URLSearchParams(params.toString());
                        sp.set(FLOW_PARAM, flow.id);
                        return `?${sp.toString()}`;
                      })()}
                      scroll={false}
                      className="ins-flowtree-name ins-flowtree-leaf"
                    >
                      {item.screen!.name}
                    </Link>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="ins-flows-layout">
      <aside className="ins-flows-nav" aria-label="Flows">
        <div className="ins-flows-search">
          <SearchIcon size={20} className="ins-flows-search-icon" />
          <input
            type="search"
            className="ins-flows-search-input"
            placeholder="Search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search flows"
          />
        </div>

        {visible.length === 0 ? (
          <p className="ins-muted ins-flows-nav-empty">Nothing matches “{query}”.</p>
        ) : (
          <nav>
            <ul className="ins-flowtree">{visible.map(renderNode)}</ul>
          </nav>
        )}
      </aside>

      <div className="ins-flows-stream">
        {ordered.map((node) => (
          <FlowRow
            key={node.entry.flow.id}
            entry={node.entry}
            parent={node.entry.flow.parentId ? entries.find((e) => e.flow.id === node.entry.flow.parentId)?.flow ?? null : null}
            app={apps.get(node.entry.flow.appId)}
            active={selected === node.entry.flow.id}
            registerRef={(el) => {
              if (el) rowRefs.current.set(node.entry.flow.id, el);
              else rowRefs.current.delete(node.entry.flow.id);
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
 * where the journey is actually walked. A branch names the flow it branches
 * from, so a row read on its own still says where it sits.
 */
function FlowRow({
  entry,
  parent,
  app,
  active,
  registerRef,
}: {
  entry: Entry;
  parent: Flow | null;
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
    <div ref={registerRef} className={`ins-flows-row ${active ? 'is-active' : ''}`}>
      <div className="ins-flows-row-meta">
        <Link href={href} scroll={false} className="ins-flows-row-title">
          <span className="ins-flows-row-play" aria-hidden>
            <PlayOutlineIcon size={16} />
          </span>
          <span className="ins-flows-row-text">
            <span className="ins-flows-row-name">
              {parent && <span className="ins-flows-row-parent">{parent.name} › </span>}
              {flow.name}
            </span>
            <span className="ins-flows-row-sub">
              {flow.screenIds.length} screen{flow.screenIds.length === 1 ? '' : 's'}
              {app ? ` · ${app.name}` : ''}
            </span>
          </span>
        </Link>
        {app && <AppLogo app={app} size={40} className="ins-flows-row-logo" />}
      </div>

      <div className="ins-flows-row-strip">
        {screens.map((screen, index) => (
          <Link
            key={screen.id}
            href={href}
            scroll={false}
            className="ins-flows-row-shot"
            aria-label={`Step ${index + 1} of the ${flow.name} flow`}
          >
            <Screenshot screen={screen} />
          </Link>
        ))}
        {screens.length === 0 && (
          <p className="ins-muted ins-flows-row-missing">
            This flow&rsquo;s screens are not published — check the licence and the build report.
          </p>
        )}
      </div>
    </div>
  );
}
