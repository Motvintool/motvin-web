'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { adminApi, type AdminState } from '@/lib/inspirations/admin';
import { inspirationsApi } from '@/lib/inspirations/api';
import { dayLabel } from '@/lib/inspirations/dates';
import type { Pattern } from '@/lib/inspirations/types';
import { INDUSTRY_LABEL, PLATFORM_LABEL, screenTypeLabel, styleLabel } from '@/lib/inspirations/taxonomy';
import { LayersIcon, SearchIcon } from '../Icons';

/**
 * Analytics: what the library holds and how it is growing — totals, the screens
 * added day by day, what kind of screens and UI they are, how complete the
 * flows are, and every app side by side. Read from the admin state alone, so it
 * is always the library as it is now.
 */

type Sort = 'name' | 'screens' | 'flows' | 'steps' | 'versions' | 'latest';

const DAYS = 14;

/** One hue per chart (each chart is a single series), from the validated categorical palette. */
const HUE = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', yellow: '#eda100', magenta: '#e87ba4', green: '#008300', violet: '#6250d6', red: '#e34948' } as const;

/** The categorical order, used in this order and never cycled; past it, the rest fold into "Other". */
const SERIES = [HUE.blue, HUE.orange, HUE.aqua, HUE.yellow, HUE.magenta, HUE.green, HUE.violet, HUE.red];
const OTHER = '#c9ccd3';

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const megabytes = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);
const localDay = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** The first `keep` rows as they are, the rest summed into one "Other" row. */
const folded = (rows: Array<[string, number]>, total: number, keep: number): Array<[string, number]> => {
  const head = rows.slice(0, keep);
  const rest = total - head.reduce((sum, [, value]) => sum + value, 0);
  return rest > 0 ? [...head, ['Other', rest]] : head;
};
const ranked = (counts: Map<string, number>, top: number) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);

export function AnalyticsPanel({
  state,
  busy,
  run,
  onHeld,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
  /** Opens the Screens tab, where held-back screens are listed. */
  onHeld: () => void;
}) {
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: 'screens', desc: true });
  const [query, setQuery] = useState('');
  // The patterns themselves (names and screens) come from the public library.
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  useEffect(() => {
    let live = true;
    void inspirationsApi.listPatterns().then((list) => live && setPatterns(list), () => undefined);
    return () => {
      live = false;
    };
  }, []);

  const data = useMemo(() => {
    const published = state.files.filter((file) => file.published);
    const bytes = published.reduce((sum, file) => sum + file.bytes, 0);

    // Screens added per day, the last DAYS days, by when their file was written.
    const today = new Date();
    const days = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (DAYS - 1 - i));
      return localDay(d.getTime());
    });
    const perDay = new Map(days.map((day) => [day, 0]));
    for (const file of published) {
      const day = localDay(file.mtime);
      if (perDay.has(day)) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    const added = days.map((day) => ({ day, count: perDay.get(day) ?? 0 }));

    const count = (pick: (file: (typeof published)[number]) => string[]) => {
      const map = new Map<string, number>();
      for (const file of published) for (const key of pick(file)) map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    };
    const sidecar = (file: (typeof published)[number]) => (file.sidecar ?? {}) as { screenType?: string; elements?: string[]; style?: string[] };
    const typeCounts = count((file) => [sidecar(file).screenType || 'other']);
    const types = ranked(typeCounts, 8);
    const elements = ranked(count((file) => [...new Set(sidecar(file).elements ?? [])]), 10);
    const styles = ranked(count((file) => [...new Set(sidecar(file).style ?? [])]), 6);
    const industries = ranked(new Map(Object.entries(state.apps.reduce<Record<string, number>>((acc, app) => ({ ...acc, [app.industry]: (acc[app.industry] ?? 0) + 1 }), {}))), 8);

    // Flows: areas are the top of the tree, tasks sit inside them.
    const ids = new Set(state.flows.map((flow) => flow.id));
    const tasks = state.flows.filter((flow) => flow.parentId && ids.has(flow.parentId));
    const areas = state.flows.length - tasks.length;
    const steps = tasks.map((flow) => flow.screenIds.length);
    const sizes = [
      { label: '1 step', count: steps.filter((n) => n === 1).length },
      { label: '2–3 steps', count: steps.filter((n) => n >= 2 && n <= 3).length },
      { label: '4–6 steps', count: steps.filter((n) => n >= 4 && n <= 6).length },
      { label: '7+ steps', count: steps.filter((n) => n >= 7).length },
    ];
    const avgSteps = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;

    const platforms = state.vocabulary.platforms
      .map((platform) => ({
        platform,
        screens: published.filter((file) => file.platform === platform).length,
        apps: new Set(published.filter((file) => file.platform === platform).map((file) => file.appId)).size,
      }))
      .filter((entry) => entry.screens > 0);

    const apps = state.apps.map((app) => {
      const files = published.filter((file) => file.appId === app.id);
      const appTasks = tasks.filter((flow) => flow.appId === app.id);
      const logo = state.logos.find((name) => name.startsWith(`${app.id}.`));
      return {
        app,
        logo: logo ? inspirationsApi.mediaUrl(`/api/inspirations/logos/${logo}`) : null,
        screens: files.length,
        flows: state.flows.filter((flow) => flow.appId === app.id).length,
        steps: appTasks.length ? appTasks.reduce((sum, flow) => sum + flow.screenIds.length, 0) / appTasks.length : 0,
        versions: app.versions?.length ?? 0,
        latest: app.versions?.find((version) => version.isLatest)?.id ?? app.currentVersion ?? '',
        updated: files.reduce((max, file) => Math.max(max, file.mtime), 0),
      };
    });

    return {
      published,
      held: state.files.length - published.length,
      bytes,
      added,
      addedTotal: added.reduce((sum, entry) => sum + entry.count, 0),
      types,
      typeCount: typeCounts.size,
      elements,
      styles,
      industries,
      tasks: tasks.length,
      areas,
      sizes,
      avgSteps,
      thin: sizes[0].count,
      appsWithoutFlows: apps.filter((entry) => entry.flows === 0).length,
      platforms,
      apps,
    };
  }, [state]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = data.apps.filter((entry) => !needle || entry.app.name.toLowerCase().includes(needle) || entry.app.id.includes(needle));
    const value = (entry: (typeof list)[number]) => (sort.by === 'name' ? entry.app.name.toLowerCase() : entry[sort.by]);
    return [...list].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -order : order;
    });
  }, [data.apps, query, sort]);

  const appCount = state.apps.length || 1;
  const byScreens = [...data.apps].sort((a, b) => b.screens - a.screens);
  const bySize = state.apps
    .map((app) => ({ name: app.name, bytes: data.published.filter((file) => file.appId === app.id).reduce((sum, file) => sum + file.bytes, 0) }))
    .sort((a, b) => b.bytes - a.bytes);
    const mostScreens = Math.max(1, ...data.apps.map((entry) => entry.screens));
  const head = (by: Sort, label: string, numeric = true) => (
    <button
      type="button"
      role="columnheader"
      aria-sort={sort.by === by ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      className={`ins-analytics-sort ${sort.by === by ? 'is-on' : ''} ${numeric ? 'is-num' : ''}`}
      onClick={() => setSort((current) => ({ by, desc: current.by === by ? !current.desc : by !== 'name' }))}
    >
      {label}
      <span aria-hidden>{sort.by === by ? (sort.desc ? '↓' : '↑') : ''}</span>
    </button>
  );

  return (
    <div className="ins-admin-panel ins-analytics">
      <div className="ins-kpis">
        <Kpi color={HUE.blue} value={(state.counts.screens ?? 0).toLocaleString()} label="Screens" note={`${Math.round((state.counts.screens ?? 0) / appCount)} per app on average`} badge={`+${data.addedTotal.toLocaleString()}`} badgeTitle={`Added in the last ${DAYS} days`}>
          <Sparkline values={data.added.map((entry) => entry.count)} color={HUE.blue} />
        </Kpi>
        <Kpi
          color={HUE.orange}
          value={state.apps.length.toLocaleString()}
          label="Apps"
          note={`${data.industries.length} categories`}
          side={
            <span className="ins-kpi-logos">
              {byScreens.slice(0, 3).map((entry) =>
                entry.logo ? <img key={entry.app.id} src={entry.logo} alt={entry.app.name} title={entry.app.name} /> : <span key={entry.app.id} title={entry.app.name}>{entry.app.name.slice(0, 1)}</span>,
              )}
              {state.apps.length > 3 && <span className="ins-kpi-logos-more">+{state.apps.length - 3}</span>}
            </span>
          }
        >
          <MiniSplit rows={folded(data.industries.map(([key, value]) => [INDUSTRY_LABEL[key as keyof typeof INDUSTRY_LABEL] ?? key, value]), state.apps.length, 2)} />
        </Kpi>
        <Kpi color={HUE.violet} value={(state.counts.flows ?? 0).toLocaleString()} label="Flows" note={`${data.avgSteps.toFixed(1)} steps per task`} side={<Ring value={data.tasks ? (data.tasks - data.thin) / data.tasks : 0} color={HUE.violet} size={42} stroke={5} label="2+" small title={`${Math.round(data.tasks ? ((data.tasks - data.thin) / data.tasks) * 100 : 0)}% of tasks have 2 or more steps`} />}>
          <MiniSplit rows={[['Areas', data.areas], ['Tasks', data.tasks]]} colors={[HUE.violet, '#b3abef']} counts />
        </Kpi>
        <Kpi color={HUE.aqua} value={(state.counts.patterns ?? 0).toLocaleString()} label="Patterns" note="Most common">
          <ul className="ins-kpi-list">
            {[...patterns].sort((a, b) => b.screenIds.length - a.screenIds.length).slice(0, 2).map((pattern) => (
              <li key={pattern.id}>
                <span>{pattern.name}</span>
                <span className="ins-kpi-list-bar"><span style={{ width: `${(pattern.screenIds.length / Math.max(1, ...patterns.map((entry) => entry.screenIds.length))) * 100}%`, background: HUE.aqua }} /></span>
                <span className="ins-muted">{pattern.screenIds.length}</span>
              </li>
            ))}
            {!patterns.length && <li className="ins-muted">Loading…</li>}
          </ul>
        </Kpi>
        <Kpi color={HUE.magenta} value={megabytes(data.bytes)} label="Library size" note={`${Math.round(data.bytes / Math.max(1, data.published.length) / 1024)} KB per screen`}>
          <MiniSplit rows={folded(bySize.slice(0, 2).map((entry) => [entry.name, entry.bytes]), data.bytes, 2)} format={megabytes} />
        </Kpi>
        {data.held > 0 && <Kpi value={String(data.held)} label="Held back" note="Not published — open Screens to see why" onClick={onHeld} warn />}
      </div>

      <section className="ins-analytics-card">
        <CardHead title="Screens added" desc={`The last ${DAYS} days — ${plural(data.addedTotal, 'screen')} in all.`} />
        <AreaChart points={data.added.map((entry) => ({ label: dayLabel(entry.day), short: String(Number(entry.day.slice(8))), value: entry.count }))} color={HUE.blue} unit="screen" />
      </section>

      <div className="ins-analytics-pair">
        <section className="ins-analytics-card">
          <CardHead title="Screen types" desc="What the published screens are." aside={`${data.typeCount} types`} />
          <Donut rows={folded(data.types.map(([key, value]) => [screenTypeLabel(key), value]), data.published.length, 6)} total={data.published.length} center="screens" />
        </section>
        <section className="ins-analytics-card">
          <CardHead title="UI elements" desc="Share of screens that show each one." aside={data.elements[0] ? `${data.elements[0][0].replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())} leads` : undefined} />
          <ProgressGrid rows={data.elements.map(([key, value]) => [key.replace(/-/g, ' '), value])} total={data.published.length} color={HUE.aqua} />
        </section>
      </div>

      <div className="ins-analytics-pair">
        <section className="ins-analytics-card">
          <CardHead title="Flow health" desc="How complete the tasks are." aside={`${data.avgSteps.toFixed(1)} steps avg`} />
          <div className="ins-health">
            <Ring value={data.tasks ? (data.tasks - data.thin) / data.tasks : 0} color={HUE.violet} label="2+ steps" />
            <dl className="ins-statlist">
              <div><dt>Areas</dt><dd>{data.areas.toLocaleString()}</dd></div>
              <div><dt>Tasks</dt><dd>{data.tasks.toLocaleString()}</dd></div>
              <div title="Tasks with a single screen — often too thin; a longer recording fills them in."><dt>1-step tasks</dt><dd className={data.thin ? 'is-warn' : ''}>{data.thin.toLocaleString()}</dd></div>
              <div title="Apps whose screens are in no flow yet."><dt>Apps without flows</dt><dd>{data.appsWithoutFlows.toLocaleString()}</dd></div>
            </dl>
          </div>
          <p className="ins-analytics-sub">Task length</p>
          <SegmentBar rows={data.sizes.map((size) => [size.label, size.count])} unit="task" />
        </section>
        <section className="ins-analytics-card">
          <CardHead title="Apps by category" desc="Where the library is deepest." aside={`${data.industries.length} categories`} />
          <SegmentBar rows={folded(data.industries.map(([key, value]) => [INDUSTRY_LABEL[key as keyof typeof INDUSTRY_LABEL] ?? key, value]), state.apps.length, 5)} unit="app" />
          {data.styles.length > 0 && (
            <>
              <p className="ins-analytics-sub">Visual style</p>
              <SegmentBar rows={data.styles.map(([key, value]) => [styleLabel(key), value])} unit="screen" />
            </>
          )}
          {data.platforms.length > 0 && (
            <>
              <p className="ins-analytics-sub">Platform</p>
              <SegmentBar rows={data.platforms.map((entry) => [`${PLATFORM_LABEL[entry.platform] ?? entry.platform} · ${plural(entry.apps, 'app')}`, entry.screens])} unit="screen" />
            </>
          )}
        </section>
      </div>

      <section className="ins-analytics-card">
        <div className="ins-analytics-tablehead">
          <CardHead title="Apps" desc="Click a column to sort." />
          <label className="ins-analytics-search">
            <SearchIcon size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an app" aria-label="Find an app" />
          </label>
        </div>
        <div className="ins-analytics-table" role="table">
          <div className="ins-analytics-row is-head" role="row">
            {head('name', 'App', false)}
            {head('screens', 'Screens')}
            {head('flows', 'Flows')}
            {head('steps', 'Avg steps')}
            {head('versions', 'Versions')}
            {head('latest', 'Latest')}
          </div>
          {shown.map((entry) => (
            <Link key={entry.app.id} href={`/inspirations/app/${entry.app.id}`} className="ins-analytics-row" role="row">
              <span role="cell" className="ins-analytics-app">
                {entry.logo ? <img src={entry.logo} alt="" /> : <span className="ins-analytics-app-blank">{entry.app.name.slice(0, 1)}</span>}
                <span>
                  <span className="ins-analytics-app-name">{entry.app.name}</span>
                  <span className="ins-analytics-app-meta">{INDUSTRY_LABEL[entry.app.industry as keyof typeof INDUSTRY_LABEL] ?? entry.app.industry}</span>
                </span>
              </span>
              <span role="cell" className="ins-analytics-num">
                <span className="ins-analytics-minibar" style={{ width: `${(entry.screens / mostScreens) * 56}px`, background: HUE.blue }} />
                {entry.screens}
              </span>
              <span role="cell" className="ins-analytics-num">{entry.flows}</span>
              <span role="cell" className="ins-analytics-num">{entry.steps ? entry.steps.toFixed(1) : '—'}</span>
              <span role="cell" className="ins-analytics-num">{entry.versions}</span>
              <span role="cell" className="ins-analytics-num ins-muted">{entry.latest ? dayLabel(entry.latest) : '—'}</span>
            </Link>
          ))}
          {!shown.length && <p className="ins-analytics-empty">No app matches “{query}”.</p>}
        </div>
      </section>

      <section className="ins-analytics-card ins-analytics-build">
        <CardHead
          title="Library build"
          desc={`${state.generatedAt ? `Last built ${new Date(state.generatedAt).toLocaleString()}.` : 'Not built yet.'} Every change made here rebuilds it by itself — rebuild by hand only after editing files on disk or running the crawler yourself.`}
        />
        <button type="button" className="ins-btn" disabled={busy} onClick={() => void run(async () => ({ report: await adminApi.rebuild() }))}>
          <LayersIcon size={15} /> Rebuild manifest
        </button>
      </section>
    </div>
  );
}

function Kpi({ value, label, note, onClick, warn = false, color, badge, badgeTitle, side, children }: { value: string; label: string; note: string; onClick?: () => void; warn?: boolean; color?: string; badge?: string; badgeTitle?: string; side?: ReactNode; children?: ReactNode }) {
  const body = (
    <>
      <span className="ins-kpi-top">
        <span className="ins-kpi-label">
          {color && <span className="ins-kpi-dot" style={{ background: color }} aria-hidden />}
          {label}
        </span>
        {badge && <span className="ins-kpi-badge" title={badgeTitle}>{badge}</span>}
      </span>
      <span className="ins-kpi-main">
        <span className="ins-kpi-text">
          <span className="ins-kpi-value">{value}</span>
          {note && <span className="ins-kpi-note">{note}</span>}
        </span>
        {side}
      </span>
      {children && <span className="ins-kpi-visual">{children}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={`ins-kpi ${warn ? 'is-warn' : ''}`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="ins-kpi">{body}</div>
  );
}

/** A thin bar split into parts, with a one-line legend under it. */
function MiniSplit({ rows, colors, counts = false, format }: { rows: Array<[string, number]>; colors?: string[]; counts?: boolean; format?: (n: number) => string }) {
  const total = rows.reduce((sum, [, value]) => sum + value, 0) || 1;
  const color = (label: string, i: number) => colors?.[i] ?? (label === 'Other' ? OTHER : SERIES[i]);
  return (
    <span className="ins-minisplit">
      <span className="ins-minisplit-track">
        {rows.map(([label, value], i) => (
          <span key={label} style={{ flexGrow: value, background: color(label, i) }} data-tip={`${label} · ${format ? format(value) : value.toLocaleString()} · ${Math.round((value / total) * 100)}%`} />
        ))}
      </span>
      <span className="ins-minisplit-legend">
        {rows.map(([label, value], i) => (
          <span key={label}>
            <i style={{ background: color(label, i) }} />
            {label} <b>{counts ? value.toLocaleString() : `${Math.round((value / total) * 100)}%`}</b>
          </span>
        ))}
      </span>
    </span>
  );
}

function CardHead({ title, desc, aside }: { title: string; desc: string; aside?: string }) {
  return (
    <header className="ins-analytics-head">
      <span className="ins-analytics-head-text">
        <h3>{title}</h3>
        <p>{desc}</p>
      </span>
      {aside && <span className="ins-analytics-pill">{aside}</span>}
    </header>
  );
}


/** A smooth line through the points, as an SVG path in a width × height box. */
function smoothPath(values: number[], width: number, height: number, pad = 4) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((value, i) => [i * step, height - pad - (value / max) * (height - pad * 2)] as const);
  return pts.reduce((path, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const mid = (px + x) / 2;
    return `${path} C${mid},${py} ${mid},${y} ${x},${y}`;
  }, '');
}

/** A tiny trend line for a KPI card. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const line = smoothPath(values, 84, 28, 3);
  return (
    <svg className="ins-spark" viewBox="0 0 84 28" aria-hidden preserveAspectRatio="none">
      <path d={`${line} L84,28 L0,28 Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** An area chart with a crosshair and the exact figure on hover. */
function AreaChart({ points, color, unit }: { points: Array<{ label: string; short: string; value: number }>; color: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 170;
  const max = Math.max(1, ...points.map((p) => p.value));
  const line = smoothPath(points.map((p) => p.value), W, H, 8);
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50);
  const y = (v: number) => 100 - (8 + (v / max) * (H - 16)) / H * 100;
  const active = hover === null ? null : points[hover];
  return (
    <div className="ins-area" onMouseLeave={() => setHover(null)}>
      <div className="ins-area-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="ins-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="ins-area-grid" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#ins-area-fill)" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {active && hover !== null && (
          <>
            <span className="ins-area-cross" style={{ left: `${x(hover)}%` }} />
            <span className="ins-area-dot" style={{ left: `${x(hover)}%`, top: `${y(active.value)}%`, borderColor: color }} />
            <span className="ins-area-tip" style={{ left: `${Math.min(88, Math.max(12, x(hover)))}%` }}>
              <strong>{plural(active.value, unit)}</strong> {active.label}
            </span>
          </>
        )}
        <div className="ins-area-hits" style={{ gridTemplateColumns: `repeat(${points.length}, 1fr)` }}>
          {points.map((p, i) => (
            <span key={p.label} onMouseEnter={() => setHover(i)} aria-label={`${p.label}: ${plural(p.value, unit)}`} />
          ))}
        </div>
      </div>
      <div className="ins-area-axis" style={{ gridTemplateColumns: `repeat(${points.length}, 1fr)` }}>
        {points.map((p) => (
          <span key={p.label}>{p.short}</span>
        ))}
      </div>
    </div>
  );
}

/** A donut of shares: a thick ring of rounded slices with the total inside, and a legend beside it. */
function Donut({ rows, total, center }: { rows: Array<[string, number]>; total: number; center: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const SIZE = 180;
  const STROKE = 20;
  const R = (SIZE - STROKE - 8) / 2;
  const C = 2 * Math.PI * R;
  // Rounded ends reach half the stroke past each end; leave that plus a small gap between slices.
  const GAP = STROKE + 3;
  const sum = Math.max(1, total);
  const starts = rows.map((_, i) => rows.slice(0, i).reduce((acc, [, value]) => acc + (value / sum) * C, 0));
  const color = (label: string, i: number) => (label === 'Other' ? OTHER : SERIES[i]);
  const shown = rows.find(([label]) => label === hover);
  const most = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <div className={`ins-donut ${hover ? 'is-hovering' : ''}`}>
      <div className="ins-donut-chart">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} className="ins-donut-track" style={{ strokeWidth: STROKE }} />
          {rows.map(([label, value], i) => {
            const arc = (value / sum) * C;
            const length = Math.max(0.01, arc - GAP);
            return (
              <circle
                key={label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={color(label, i)}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${length} ${C - length}`}
                strokeDashoffset={-(starts[i] + GAP / 2)}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                onMouseEnter={() => setHover(label)}
                onMouseLeave={() => setHover(null)}
                className={`ins-donut-seg ${hover === label ? 'is-on' : ''}`}
              />
            );
          })}
        </svg>
        <span className="ins-donut-center">
          <strong>{shown ? `${Math.round((shown[1] / sum) * 100)}%` : total.toLocaleString()}</strong>
          <span>{shown ? shown[0] : center}</span>
        </span>
      </div>
      <ul className="ins-donut-legend">
        {rows.map(([label, value], i) => (
          <li key={label} className={hover === label ? 'is-on' : ''} onMouseEnter={() => setHover(label)} onMouseLeave={() => setHover(null)}>
            <span className="ins-legend-dot" style={{ background: color(label, i) }} />
            <span className="ins-donut-legend-label">{label}</span>
            <span className="ins-donut-legend-bar">
              <span style={{ width: `${(value / most) * 100}%`, background: color(label, i) }} />
            </span>
            <span className="ins-donut-legend-pct">{Math.round((value / sum) * 100)}%</span>
            <span className="ins-donut-legend-count">{value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A progress ring with its percentage in the middle. */
function Ring({ value, color, label, size = 116, stroke = 10, title, small = false }: { value: number; color: string; label?: string; size?: number; stroke?: number; title?: string; small?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span className={`ins-ring ${small ? 'is-small' : ''}`} style={{ width: size, height: size }} title={title}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity="0.14" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {label && (
        <span className="ins-ring-text">
          <strong>{pct}%</strong>
          <span>{label}</span>
        </span>
      )}
    </span>
  );
}

/** One bar split into its parts (2px apart), with a legend of each part's count and share. */
function SegmentBar({ rows, unit }: { rows: Array<[string, number]>; unit: string }) {
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  const color = (label: string, i: number) => (label === 'Other' ? OTHER : SERIES[i]);
  if (!total) return <p className="ins-analytics-empty">Nothing yet.</p>;
  return (
    <div className="ins-segbar">
      <div className="ins-segbar-track">
        {rows.map(([label, value], i) => (
          <span key={label} style={{ flexGrow: value, background: color(label, i) }} data-tip={`${label} · ${plural(value, unit)} · ${Math.round((value / total) * 100)}%`} />
        ))}
      </div>
      <ul className="ins-segbar-legend">
        {rows.map(([label, value], i) => (
          <li key={label}>
            <span className="ins-legend-dot" style={{ background: color(label, i) }} />
            {label} <span className="ins-muted">{Math.round((value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


/** Two columns of labelled progress bars: the share of screens that show each item. */
function ProgressGrid({ rows, total, color }: { rows: Array<[string, number]>; total: number; color: string }) {
  if (!rows.length) return <p className="ins-analytics-empty">Nothing yet.</p>;
  return (
    <ul className="ins-progress-grid" style={{ '--hue': color } as CSSProperties}>
      {rows.map(([label, value]) => {
        const pct = Math.round((value / Math.max(1, total)) * 100);
        return (
          <li key={label} data-tip={`${plural(value, 'screen')} show it`}>
            <span className="ins-progress-row">
              <span className="ins-progress-label">{label}</span>
              <span className="ins-progress-pct">{pct}%</span>
            </span>
            <span className="ins-progress-track">
              <span style={{ width: `${pct}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
