'use client';

import { useState } from 'react';
import type { App, Flow } from '@/lib/inspirations/types';
import { FloatCollectionBar } from './FloatCollectionBar';

/**
 * The select circle on a flow row, the same circle a screen or app card has:
 * shows on the row's hover, stays filled once picked.
 */
export function FlowSelectRing({ flow, selected, onToggle }: { flow: Flow; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`ins-card-select-ring ins-flows-row-select ${selected ? 'is-selected' : ''}`}
      aria-label={selected ? `Deselect ${flow.name}` : `Select ${flow.name}`}
      aria-pressed={selected}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      {selected && <span className="ins-card-select-check" aria-hidden />}
    </button>
  );
}

/**
 * Which flows are picked, and the "Add to Collection" bar for them (as the
 * screen and app grids have), saving each as a flow.
 */
export function useFlowSelection(flows: Flow[], apps: Map<string, App>) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setIds(new Set());
  const picked = flows.filter((f) => ids.has(f.id));
  // Logos for the bar, newest pick first, each app once.
  const pickedApps = [...new Map(picked.map((f) => [f.appId, apps.get(f.appId)])).values()]
    .filter((app): app is App => Boolean(app))
    .reverse();

  const bar =
    picked.length > 0 ? (
      <FloatCollectionBar
        items={picked.map((f) => ({ type: 'flow' as const, id: f.id }))}
        apps={pickedApps}
        onClose={clear}
        onSaved={clear}
      />
    ) : null;

  return { isSelected: (id: string) => ids.has(id), toggle, bar };
}
