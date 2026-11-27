'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { LandingApp } from '@/components/landing/inspirations/useLandingLibrary';
import { inspirationsApi } from '@/lib/inspirations/api';
import { FigmaMark } from './FigmaMark';

/**
 * The /plugins hero: a Figma window with the Motvin plugin open, playing everything the plugin does. The
 * plugin is drawn after its real UI (figma-plugin/src/ui: App.tsx, styles.css, icons.tsx) at its real
 * 480px width and scaled down to fit, so its icons, spacing and type are the plugin's own. A pointer runs
 * a script of seven scenes: search and add a screen, add a whole flow, select several, shuffle, match the
 * selected frame, paste from motvin.com, and change the thumbnail size. Each lands on the canvas as the
 * plugin places it. It starts when the window comes into view; the chips under it jump to a scene. Under
 * reduced motion it stays still.
 */

const FIGMA_MARK = <FigmaMark />;

/** Small line icons for the Figma chrome around the plugin (24×24, stroke = currentColor). */
const UI = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  move: <path d="m6 4 12 6.5-5.5 1.5L10.5 18Z" />,
  frame: <path d="M8 3v18M16 3v18M3 8h18M3 16h18" />,
  rect: <path d="M5 5h14v14H5Z" />,
  pen: <path d="m12 3 6 9-6 9-6-9ZM12 12v9" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  hand: <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.5-1.7L8 15" />,
  comment: <path d="M5 5h14v10H10l-5 4Z" />,
  play: <path d="M8 5v14l11-7Z" />,
  image: <path d="M4 5h16v14H4ZM4 15l4.5-4.5L14 16M13 13l2.5-2.5L20 15" />,
  text2: <path d="M6 6h12M12 6v12" />,
};

function UiIcon({ name }: { name: keyof typeof UI }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      {UI[name]}
    </svg>
  );
}

/** The plugin's own icons (figma-plugin/src/ui/icons.tsx): its drawn ones, and motvin.com's search, filter and menu. */
const PI = {
  moon: <><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" /><path d="M16.5 3.5v3M15 5h3" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  screens: <rect x="7" y="3" width="10" height="18" rx="2.5" />,
  flows: <><rect x="3" y="6" width="6" height="12" rx="1.5" /><rect x="15" y="6" width="6" height="12" rx="1.5" /><path d="M10.5 12h3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l5 5L20 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  settings: <><path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" /><circle cx="12" cy="12" r="3" /></>,
  select: <><path d="M3.5 3.5h16v7.5" /><path d="M3.5 3.5v16H11" /><path d="M14 14 21 16.4 18 17.6 16.6 20.8Z" strokeMiterlimit="10" /></>,
  shuffle: <><path d="M3 17h4.5l9-10H21" /><path d="M3 7h4.5l2.6 2.9" /><path d="M13.9 14.1l2.6 2.9H21" /><path d="m18 4 3 3-3 3" /><path d="m18 14 3 3-3 3" /></>,
  match: <><path d="M4 9V4h5M15 4h5v5M4 15v5h5" /><circle cx="14" cy="14" r="3.5" /><path d="m16.6 16.6 3.4 3.4" /></>,
};

function PIcon({ name, size = 18 }: { name: keyof typeof PI; size?: number }) {
  return (
    <svg className="pd-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      {PI[name]}
    </svg>
  );
}

const SITE_SEARCH = (
  <svg className="pd-icon" width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <path d="M21.5668 21.5679L17.2155 17.216M19.4998 11.7009C19.4998 16.0087 16.0076 19.5009 11.6998 19.5009C7.39195 19.5009 3.89977 16.0087 3.89977 11.7009C3.89977 7.3931 7.39195 3.90092 11.6998 3.90092C16.0076 3.90092 19.4998 7.3931 19.4998 11.7009Z" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
  </svg>
);
const SITE_FILTER = (
  <svg className="pd-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 6H9M19 14H11" />
    <path d="M15 9C16.6569 9 18 7.65685 18 6C18 4.34315 16.6569 3 15 3C13.3431 3 12 4.34315 12 6C12 7.65685 13.3431 9 15 9Z" strokeLinecap="round" />
    <path d="M2 14C2 12.3431 3.34315 11 5 11C6.65685 11 8 12.3431 8 14C8 15.6569 6.65685 17 5 17C3.34315 17 2 15.6569 2 14Z" strokeLinecap="round" />
  </svg>
);
const SITE_MENU = (
  <svg className="pd-icon" width="20" height="17" viewBox="0 0 18 15" fill="currentColor" aria-hidden="true">
    <path d="M12.9888 8.11484H13.8888V6.31484H12.9888V7.21484V8.11484ZM1.00391 7.21484V8.11484H12.9888V7.21484V6.31484H1.00391V7.21484Z" />
    <path d="M16.9888 1.9H17.8888V0.1H16.9888V1V1.9ZM1.00391 1V1.9H16.9888V1V0.1H1.00391V1Z" />
    <path d="M7.98875 14.3336H8.88875V12.5336H7.98875V13.4336V14.3336ZM1.00391 13.4336V14.3336H7.98875V13.4336V12.5336H1.00391V13.4336Z" />
  </svg>
);
const ICONS_MARK = (
  <svg className="pd-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" opacity="0.45" d="M12 21s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 12 6.6Z" />
    <path fill="currentColor" d="M12 21s8.5-5.2 8.5-11.2A4.8 4.8 0 0 0 12 6.6Z" />
  </svg>
);

const words = (value: string | null | undefined) => (value ?? '').replace(/[_-]+/g, ' ');

/** A flow as the demo shows it: the library's flow with its step screens' pictures. */
type DemoFlow = { id: string; name: string; app: LandingApp; steps: string[] };

/** A few real iOS flows of three to five steps, each from a different app the page has, with their pictures. */
function useDemoFlows(apps: LandingApp[]): DemoFlow[] {
  const [flows, setFlows] = useState<DemoFlow[]>([]);

  // The library's apps arrive once; the flows are looked up then.
  useEffect(() => {
    if (!apps.length) return;
    let cancelled = false;
    void (async () => {
      const byId = new Map(apps.map((app) => [app.id, app]));
      const all = await inspirationsApi.listFlows();
      const seen = new Set<string>();
      const picked = all.filter((flow) => {
        const ok = flow.platform === 'ios' && !flow.parentId && flow.screenIds.length >= 3 && flow.screenIds.length <= 5 && byId.has(flow.appId) && !seen.has(flow.appId);
        if (ok) seen.add(flow.appId);
        return ok;
      }).slice(0, 4);
      const full = await Promise.all(picked.map((flow) => inspirationsApi.getFlow(flow.id).catch(() => null)));
      if (cancelled) return;
      setFlows(
        full.flatMap((entry) => {
          const app = entry ? byId.get(entry.flow.appId) : undefined;
          if (!entry || !app) return [];
          const shots = new Map(entry.screens.map((screen) => [screen.id, inspirationsApi.mediaUrl(screen.url)]));
          const steps = entry.flow.screenIds.map((id) => shots.get(id)).filter((url): url is string => Boolean(url));
          return steps.length >= 3 ? [{ id: entry.flow.id, name: entry.flow.name, app, steps }] : [];
        }).sort((x, y) => y.steps.length - x.steps.length),
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apps]);

  return flows;
}

type Size = 's' | 'm' | 'l';
type Adding = { target: number | 'picked' | 'pasted'; text: string; progress: number };
type Paste = null | 'open' | 'adding' | 'done';

/** What the plugin shows at a moment of the script. */
type Ui = {
  mode: 'screens' | 'flows';
  typed: string;
  /** What the results are for: a search, a shuffle (with its turn), or a match of the selected frame. */
  results: { kind: 'all' } | { kind: 'search'; app: string } | { kind: 'shuffle'; turn: number } | { kind: 'match'; type: string };
  size: Size;
  hover: number;
  selecting: boolean;
  picked: number[];
  adding: Adding | null;
  paste: Paste;
  pasteKeys: boolean;
  toast: string | null;
};

const START: Ui = { mode: 'screens', typed: '', results: { kind: 'all' }, size: 'm', hover: -1, selecting: false, picked: [], adding: null, paste: null, pasteKeys: false, toast: null };

/** A frame on the canvas, at its row and column: added screens go on the end of the last row while it has room,
    and a flow (or a batch that does not fit) starts a new row below, its steps in order. */
type Frame = { key: number; src: string; caption: string; row: number; col: number };

/** The canvas board, in its own units before the camera's zoom: a frame's size, its name above it, the gaps. */
const FW = 122;
const FH = (FW * 844) / 390;
const CAPTION = 16;
const GAP_X = 24;
const GAP_Y = 40;
const ROW_MAX = 5;
const ROW_H = CAPTION + FH + GAP_Y;

/** One beat of the script: where the pointer is, whether it presses, and what changes when the beat starts. */
type Beat = {
  scene: number;
  at?: string;
  press?: boolean;
  ms: number;
  ui?: (ui: Ui) => Partial<Ui>;
  /** Frames to put on the canvas (they are added, newest last, and become the selection). */
  place?: () => { src: string; caption: string }[];
  /** The placed frames are a flow's steps: they get a row of their own. */
  flow?: boolean;
  /** Selects the frame with this index on the canvas (for Match). */
  select?: number;
  /** Starts the canvas over with its first three screens (the loop's beginning). */
  reset?: boolean;
};

const SCENES = ['Search', 'Add a flow', 'Select several', 'Shuffle', 'Match', 'Paste', 'Sizes'];

/** A stable mix of a list for a shuffle turn. */
function mix<T>(items: T[], turn: number): T[] {
  const out = [...items];
  let seed = turn * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function PluginDemo({ apps }: { apps: LandingApp[] }) {
  const pool = useMemo(() => apps.filter((app) => app.cover && !app.wide).slice(0, 12), [apps]);
  const flows = useDemoFlows(apps);
  const ready = pool.length >= 6;

  const [ui, setUi] = useState<Ui>(START);
  const [beat, setBeat] = useState(0);
  const [running, setRunning] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  // The frames the last add put down, which play the landing.
  const [landed, setLanded] = useState<number[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState({ k: 0.708, h: 670 });
  const [canvasSize, setCanvasSize] = useState({ w: 970, h: 720 });

  // The screens the script searches for, adds and pastes (after the three that start on the canvas).
  const searched = pool[3];
  const flow = flows[0];
  const matchType = pool[4]?.coverType ?? 'home';

  // The script. Each scene starts from the plugin's resting state, so a chip can jump straight to it.
  const beats = useMemo<Beat[]>(() => {
    if (!ready || !searched) return [];
    const list: Beat[] = [];
    const add = (scene: number, beatParts: Omit<Beat, 'scene'>[]) => beatParts.forEach((b) => list.push({ scene, ...b }));
    const click = (at: string, ui?: Beat['ui'], ms = 700, extra: Partial<Beat> = {}): Omit<Beat, 'scene'>[] => [
      { at, ms: 720 },
      { at, press: true, ms: 260 },
      { at, ms, ui, ...extra },
    ];
    const name = searched.name.split(' ')[0].toLowerCase();

    // 1 · Search and add a screen.
    add(0, [
      { ms: 500, ui: () => ({ ...START }), reset: true },
      { at: 'search', ms: 720 },
      ...name.split('').map((_, i) => ({ at: 'search', ms: 95, ui: () => ({ typed: name.slice(0, i + 1) }) })),
      { at: 'search', ms: 650, ui: () => ({ results: { kind: 'search', app: searched.id } }) },
      { at: 'card-0', ms: 720, ui: () => ({ hover: 0 }) },
      { at: 'card-0', press: true, ms: 260 },
      { at: 'card-0', ms: 520, ui: () => ({ adding: { target: 0, text: 'Adding…', progress: 0.3 } }) },
      { at: 'card-0', ms: 380, ui: () => ({ adding: { target: 0, text: 'Adding…', progress: 0.85 } }) },
      { at: 'frame-new', ms: 2000, ui: () => ({ adding: null, hover: -1, toast: `Added ${searched.name} — ${words(searched.coverType) || 'Screen'}` }), place: () => [{ src: searched.cover ?? '', caption: `${searched.name} · iOS` }] },
    ]);

    // 2 · Add a whole flow: every step, in order.
    if (flow) {
      const n = flow.steps.length;
      add(1, [
        { ms: 400, ui: () => ({ ...START }) },
        ...click('mode-flows', () => ({ mode: 'flows' }), 800),
        { at: 'card-0', ms: 720, ui: () => ({ hover: 0 }) },
        { at: 'card-0', press: true, ms: 260 },
        { at: 'card-0', ms: 420, ui: () => ({ adding: { target: 0, text: 'Loading steps…', progress: 0.05 } }) },
        ...Array.from({ length: n }, (_, i) => ({ at: 'card-0', ms: 300, ui: () => ({ adding: { target: 0, text: `${i + 1} of ${n}`, progress: 0.1 + (0.9 * (i + 1)) / n } }) })),
        { at: 'frame-new', ms: 2300, ui: () => ({ adding: null, hover: -1, toast: `Added ${flow.app.name} — ${flow.name} (${n} steps)` }), place: () => flow.steps.map((src, i) => ({ src, caption: `${flow.app.name} · Step ${i + 1}` })), flow: true },
      ]);
    }

    // 3 · Select several, then add them together.
    const a = pool[1];
    const b = pool[2];
    add(2, [
      { ms: 400, ui: () => ({ ...START }) },
      ...click('q-select', () => ({ selecting: true }), 600),
      ...click('card-1', () => ({ picked: [1] }), 380),
      ...click('card-2', () => ({ picked: [1, 2] }), 420),
      ...click('add-picked', () => ({ adding: { target: 'picked', text: 'Adding…', progress: 0.5 } }), 600),
      { at: 'frame-new', ms: 2000, ui: () => ({ adding: null, selecting: false, picked: [], toast: 'Added 2 screens' }), place: () => [a, b].map((app) => ({ src: app.cover ?? '', caption: `${app.name} · iOS` })) },
    ]);

    // 4 · Shuffle for a fresh mix, twice.
    add(3, [
      { ms: 400, ui: () => ({ ...START }) },
      ...click('q-shuffle', () => ({ results: { kind: 'shuffle', turn: 1 } }), 1300),
      { at: 'q-shuffle', press: true, ms: 260 },
      { at: 'q-shuffle', ms: 1500, ui: () => ({ results: { kind: 'shuffle', turn: 2 } }) },
    ]);

    // 5 · Match: select a frame on the canvas, and the plugin finds screens like it.
    add(4, [
      { ms: 400, ui: () => ({ ...START }) },
      { at: 'frame-0', ms: 760 },
      { at: 'frame-0', press: true, ms: 260, select: 0 },
      { at: 'frame-0', ms: 500 },
      ...click('q-match', () => ({ typed: words(matchType), results: { kind: 'match', type: matchType }, toast: `Matching “${words(matchType)}”` }), 2000),
    ]);

    // 6 · Paste what was copied on motvin.com.
    const c = pool[5];
    add(5, [
      { ms: 400, ui: () => ({ ...START }) },
      ...click('paste', () => ({ paste: 'open' }), 900),
      { at: 'sheet', ms: 650, ui: () => ({ pasteKeys: true }) },
      { at: 'sheet', ms: 700, ui: () => ({ pasteKeys: false, paste: 'adding' }) },
      { at: 'sheet', ms: 800, ui: () => ({ paste: 'done' }) },
      { at: 'frame-new', ms: 2000, ui: () => ({ paste: null, toast: `✓ Added ${c.name} — ${words(c.coverType) || 'Screen'} to your canvas` }), place: () => [{ src: c.cover ?? '', caption: `${c.name} · iOS` }] },
    ]);

    // 7 · Thumbnail sizes: large, small, back to medium.
    add(6, [
      { ms: 400, ui: () => ({ ...START }) },
      ...click('size-l', () => ({ size: 'l' }), 1300),
      ...click('size-s', () => ({ size: 's' }), 1300),
      ...click('size-m', () => ({ size: 'm' }), 1000),
    ]);
    return list;
  }, [ready, searched, flow, pool, matchType]);

  // The canvas, kept in a ref too so a beat can read it when it starts. It begins with three screens in a row;
  // nothing is ever taken off it (until the loop starts over), as in Figma: added screens join it.
  const framesRef = useRef<Frame[]>([]);
  const frameKey = useRef(2);
  const firstRow = useCallback(() => pool.slice(0, 3).map((app, col) => ({ key: col, src: app.cover ?? '', caption: `${app.name} · iOS`, row: 0, col })), [pool]);
  const apply = useCallback(
    (index: number) => {
      const step = beats[index];
      if (!step) return;
      if (step.ui) setUi((prev) => ({ ...prev, ...step.ui!(prev) }));
      if (step.reset) framesRef.current = [];
      const base = framesRef.current.length ? framesRef.current : firstRow();
      if (step.place) {
        const items = step.place();
        const lastRow = Math.max(...base.map((frame) => frame.row));
        const inLast = base.filter((frame) => frame.row === lastRow);
        const lastIsFlow = inLast.some((frame) => frame.caption.includes(' · Step '));
        const join = !step.flow && !lastIsFlow && inLast.length + items.length <= ROW_MAX;
        const row = join ? lastRow : lastRow + 1;
        const start = join ? inLast.length : 0;
        const placed = items.map((frame, i) => ({ ...frame, row, col: start + i, key: (frameKey.current += 1) }));
        framesRef.current = [...base, ...placed];
        setFrames(framesRef.current);
        setSelected(placed.map((frame) => frame.key));
        setLanded(placed.map((frame) => frame.key));
      } else if (step.reset) {
        framesRef.current = base;
        setFrames(base);
        setSelected([base[base.length - 1].key]);
      } else if (step.select !== undefined) {
        framesRef.current = base;
        setFrames(base);
        setSelected(base[step.select] ? [base[step.select].key] : []);
      }
      setBeat(index);
    },
    [beats, firstRow],
  );

  // Start once the window is on screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!beats.length || !stage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        setRunning(true);
        apply(0);
      },
      { threshold: 0.35 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [beats.length, apply]);

  // The clock: each beat waits its time, then the next begins (the last loops to the first).
  useEffect(() => {
    if (!running || !beats.length) return;
    const timer = window.setTimeout(() => apply((beat + 1) % beats.length), beats[beat]?.ms ?? 600);
    return () => window.clearTimeout(timer);
  }, [running, beat, beats, apply]);

  // The toast fades after a while, as the plugin's does.
  useEffect(() => {
    if (!ui.toast) return;
    const timer = window.setTimeout(() => setUi((prev) => ({ ...prev, toast: null })), 2200);
    return () => window.clearTimeout(timer);
  }, [ui.toast]);

  // The plugin is drawn at its real 480px width and scaled to the window it floats in.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const fit = () => {
      const k = view.clientWidth / 480;
      if (k > 0) setScale({ k, h: view.clientHeight / k });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(view);
    return () => observer.disconnect();
  }, []);

  // The canvas's size, for the camera.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const measure = () => setCanvasSize({ w: canvasEl.clientWidth, h: canvasEl.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvasEl);
    return () => observer.disconnect();
  }, []);

  // The canvas begins with three screens; the script adds to it.
  const shown = frames.length ? frames : firstRow();
  const selection = frames.length ? selected : [2];

  // The camera: zooms out (never in past 100%) so every frame fits in the canvas left of the plugin, as
  // Figma's zoom to fit does, and moves there smoothly each time screens are added. On a small canvas it
  // stops at half size for height and pans down instead, keeping the newest row in view.
  const rows = shown.length ? Math.max(...shown.map((frame) => frame.row)) + 1 : 1;
  const cols = shown.length ? Math.max(...shown.map((frame) => frame.col)) + 1 : 3;
  const boardW = cols * (FW + GAP_X) - GAP_X;
  const boardH = rows * ROW_H - GAP_Y;
  const roomW = Math.max(120, canvasSize.w - 340 - 14 - 72);
  const roomH = Math.max(120, canvasSize.h - 48 - 72);
  const fitW = Math.min(1, roomW / boardW);
  const zoom = Math.min(fitW, Math.max(roomH / boardH, Math.min(0.5, fitW)));
  const tall = boardH * zoom > roomH;
  const camera = { x: 24 + (roomW - boardW * zoom) / 2, y: tall ? 40 + roomH - boardH * zoom : 40 + ((roomH - boardH * zoom) / 2) * 0.35, z: zoom };

  // The pointer goes to the element the beat names (data-pd), or rests on the canvas.
  const current = beats[beat];
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const cursor = cursorRef.current;
    if (!canvasEl || !cursor) return;
    const place = () => {
      const base = canvasEl.getBoundingClientRect();
      // Rects are on screen, the pointer moves in the canvas's own pixels: the page's scroll animation scales
      // the whole window (up to 1.03), so screen distances are divided by that scale.
      const k = canvasEl.offsetWidth ? base.width / canvasEl.offsetWidth : 1;
      let point: { x: number; y: number } | null = null;
      const target = current?.at;
      const world = canvasEl.querySelector('.plg-world');
      if (target?.startsWith('frame-') && world && getComputedStyle(world).display !== 'none') {
        // Where the frame sits on the board, through the camera (its rect is still moving while it lands).
        const frame = target === 'frame-new' ? shown.find((f) => f.key === selection.at(-1)) : shown[Number(target.slice(6))];
        if (frame) {
          const x = frame.col * (FW + GAP_X) + FW * 0.6;
          const y = frame.row * ROW_H + CAPTION + FH * 0.45;
          point = { x: camera.x + x * camera.z, y: camera.y + y * camera.z };
        }
      }
      if (!point && target) {
        const fallback = target.startsWith('frame-') ? 'card-0' : target;
        const el = canvasEl.querySelector(`[data-pd="${fallback}"]`);
        const r = el?.getBoundingClientRect();
        if (r && r.width) point = { x: (r.left - base.left + r.width * (fallback === 'search' ? 0.3 : 0.55)) / k, y: (r.top - base.top + r.height * 0.55) / k };
      }
      point ??= { x: canvasEl.offsetWidth * 0.3, y: canvasEl.offsetHeight * 0.72 };
      cursor.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px)`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [current, shown, selection, camera.x, camera.y, camera.z, scale]);

  // The plugin's results for this moment.
  const screens = (() => {
    const r = ui.results;
    if (r.kind === 'search') {
      const hit = pool.find((app) => app.id === r.app);
      return hit ? [hit, ...pool.filter((app) => app !== hit && app.industry === hit.industry), ...pool.filter((app) => app !== hit && app.industry !== hit.industry)] : pool;
    }
    if (r.kind === 'shuffle') return mix(pool, r.turn);
    if (r.kind === 'match') return [...pool.filter((app) => app.coverType === r.type), ...pool.filter((app) => app.coverType !== r.type)];
    return pool;
  })();
  const resultsKey = ui.mode === 'flows' ? 'flows' : `${ui.results.kind}-${'turn' in ui.results ? ui.results.turn : ''}`;
  const scene = running && current ? current.scene : -1;
  const jump = (to: number) => {
    const index = beats.findIndex((b) => b.scene === to);
    if (index < 0) return;
    setRunning(true);
    apply(index);
  };

  const card = (i: number, body: ReactNode, caption: ReactNode) => {
    const hovered = ui.hover === i;
    const picked = ui.picked.includes(i);
    const adding = ui.adding?.target === i ? ui.adding : null;
    return (
      <span key={i} data-pd={`card-${i}`} className={`pd-card${hovered || adding ? ' is-hover' : ''}${adding ? ' adding' : ''}${ui.selecting ? ' selecting' : ''}${picked ? ' picked' : ''}`}>
        <span className="pd-thumb">
          {body}
          <span className="pd-overlay" />
          {ui.selecting ? (
            <span className={picked ? 'pd-tick on' : 'pd-tick'}>{picked ? <PIcon name="check" size={13} /> : null}</span>
          ) : adding ? (
            <>
              <span className="pd-busy">{adding.text}</span>
              <span className="pd-progress"><span style={{ width: `${Math.round(adding.progress * 100)}%` }} /></span>
            </>
          ) : (
            <span className="pd-add"><PIcon name="plus" size={14} /> {ui.mode === 'flows' ? 'Add flow' : 'Add'}</span>
          )}
        </span>
        {caption}
      </span>
    );
  };

  return (
    <div className="plg-stage" ref={stageRef}>
      <div className="plg-window" aria-hidden="true">
        <div className="plg-topbar">
          <span className="plg-lights"><i /><i /><i /></span>
          <span className="plg-tool is-figma">{FIGMA_MARK}</span>
          <span className="plg-tool"><UiIcon name="menu" /></span>
          <span className="plg-file"><span>Drafts</span> / <b>Onboarding ideas</b></span>
          <span className="plg-topbar-right">
            <span className="plg-avatars"><i>S</i><i>A</i></span>
            <span className="plg-tool"><UiIcon name="play" /></span>
            <span className="plg-share">Share</span>
          </span>
        </div>

        <div className="plg-body">
          <aside className="plg-layers">
            <div className="plg-side-tabs"><b>File</b><span>Assets</span></div>
            <p className="plg-side-label">Pages</p>
            <p className="plg-page is-on">Page 1</p>
            <p className="plg-side-label">Layers</p>
            {[...shown].reverse().map((frame) => (
              <div key={frame.key} className={`plg-layer${selection.includes(frame.key) ? ' is-on' : ''}`}>
                <UiIcon name="frame" />
                {frame.caption}
              </div>
            ))}
            <div className="plg-layer is-child"><UiIcon name="image" />Screenshot</div>
            <div className="plg-layer is-child"><UiIcon name="text2" />View on Motvin</div>
          </aside>

          <div className="plg-canvas" ref={canvasRef}>
            <div className="plg-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`, '--z': camera.z } as CSSProperties}>
              {shown.map((frame) => {
                const on = selection.includes(frame.key);
                const last = on && selection.at(-1) === frame.key;
                return (
                  <figure
                    key={frame.key}
                    className={`plg-frame${on ? ' is-sel' : ''}${landed.includes(frame.key) ? ' is-landing' : ''}`}
                    style={{ left: frame.col * (FW + GAP_X), top: frame.row * ROW_H + CAPTION, '--i': frame.col } as CSSProperties}
                  >
                    <figcaption>{frame.caption}</figcaption>
                    <span className="plg-frame-shot">
                      <img src={frame.src} alt="" draggable={false} />
                      {on ? <><i className="plg-handle is-tl" /><i className="plg-handle is-tr" /><i className="plg-handle is-bl" /><i className="plg-handle is-br" /></> : null}
                      {last ? <em className="plg-size">390 × 844</em> : null}
                    </span>
                  </figure>
                );
              })}
            </div>

            {/* Figma shows a plugin as a window floating over the canvas; inside, the plugin's own UI. */}
            <div className="plg-panel">
              <div className="plg-panel-head">
                <img className="plg-panel-icon" src="/ASSET/Icons/motvin-logo.svg" alt="" />
                Motvin — Inspiration
                <span className="plg-panel-x">×</span>
              </div>
              <div className="pd-view" ref={viewRef}>
                <div className="pd" style={{ '--k': scale.k, height: scale.h } as CSSProperties}>
                  <div className="pd-chrome">
                    <header className="pd-top">
                      <img className="pd-logo" src="/ASSET/Icons/motvin-logo.svg" alt="" />
                      <span className="pd-spacer" />
                      <span className="pd-try">{ICONS_MARK}Try Icons</span>
                      <span className="pd-icon-button pd-theme"><PIcon name="moon" size={24} /></span>
                      <span className="pd-icon-button">{SITE_MENU}</span>
                    </header>
                    <div className="pd-controls">
                      <div className="pd-searchbar" data-pd="search">
                        {SITE_SEARCH}
                        {ui.typed ? (
                          <span className="pd-input is-typed">
                            {ui.typed}
                            {current?.at === 'search' ? <i className="pd-caret" /> : null}
                          </span>
                        ) : (
                          <span className="pd-input">Search screens…</span>
                        )}
                        {ui.typed ? <span className="pd-clear"><PIcon name="close" size={14} /></span> : null}
                        <span className="pd-divider" />
                        <span className="pd-platform">iOS<PIcon name="chevron" size={18} /></span>
                      </div>
                      <div className="pd-row">
                        <div className={ui.mode === 'flows' ? 'pd-modes flows' : 'pd-modes'}>
                          <span className={ui.mode === 'screens' ? 'pd-mode on' : 'pd-mode'} data-pd="mode-screens"><PIcon name="screens" size={17} /> Screens</span>
                          <span className={ui.mode === 'flows' ? 'pd-mode on' : 'pd-mode'} data-pd="mode-flows"><PIcon name="flows" size={17} /> Flows</span>
                        </div>
                        <span className="pd-pill pd-select">
                          <span>{ui.mode === 'flows' ? 'Category' : 'Type'}</span>
                          <PIcon name="chevron" size={18} />
                        </span>
                        <span className="pd-pill pd-round"><i className="pd-color-dot" /></span>
                        <span className="pd-pill pd-round">{SITE_FILTER}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pd-results">
                    <div key={resultsKey} className={`pd-grid size-${ui.size}${ui.mode === 'flows' ? ' flows' : ''}`}>
                      {ui.mode === 'flows'
                        ? flows.map((f, i) =>
                            card(
                              i,
                              <>
                                <img src={f.steps[0]} alt="" draggable={false} />
                                <span className="pd-badge">{f.steps.length} steps</span>
                              </>,
                              <span className="pd-caption">
                                <strong className="pd-app">{f.app.logo ? <img src={f.app.logo} alt="" /> : <i />}<span>{f.app.name}</span></strong>
                                <span>{f.name}</span>
                              </span>,
                            ),
                          )
                        : screens.slice(0, 12).map((app, i) =>
                            card(
                              i,
                              <img src={app.cover ?? ''} alt="" draggable={false} />,
                              <span className="pd-caption">
                                <strong className="pd-app">{app.logo ? <img src={app.logo} alt="" /> : <i />}<span>{app.name}</span></strong>
                                <span>{words(app.coverType) || app.industry}</span>
                              </span>,
                            ),
                          )}
                    </div>
                  </div>

                  {ui.selecting ? (
                    <footer className="pd-bottom selecting">
                      <span className="pd-icon-button pd-round-button"><PIcon name="close" size={18} /></span>
                      <span className="pd-picked-count">{ui.picked.length ? `${ui.picked.length} selected` : 'Tap screens to select'}</span>
                      <span className="pd-spacer" />
                      {ui.picked.length ? <span className="pd-link">Clear</span> : null}
                      <span className={`pd-add-picked${ui.picked.length ? '' : ' is-off'}`} data-pd="add-picked">
                        <PIcon name="plus" size={16} />
                        {ui.picked.length ? `Add ${ui.picked.length} to canvas` : 'Add to canvas'}
                      </span>
                    </footer>
                  ) : (
                    <footer className="pd-bottom">
                      <span className="pd-paste" data-pd="paste">Paste in<span className="pd-keys"><kbd>⌘</kbd><kbd>V</kbd></span></span>
                      <span className="pd-quick">
                        <span className="pd-quick-button" data-pd="q-select"><PIcon name="select" size={20} /></span>
                        <span className="pd-quick-button" data-pd="q-shuffle"><PIcon name="shuffle" size={20} /></span>
                        <span className="pd-quick-button" data-pd="q-match"><PIcon name="match" size={20} /></span>
                      </span>
                      <span className="pd-spacer" />
                      <span className="pd-sizes">
                        {(['s', 'm', 'l'] as Size[]).map((size) => (
                          <span key={size} className={ui.size === size ? 'pd-size on' : 'pd-size'} data-pd={`size-${size}`}><i className={`pd-dot pd-dot-${size}`} /></span>
                        ))}
                      </span>
                      <span className="pd-icon-button pd-round-button"><PIcon name="settings" size={20} /></span>
                    </footer>
                  )}

                  {ui.toast && !ui.paste ? (
                    <div key={ui.toast} className="pd-toast">
                      <span className="pd-toast-mark"><PIcon name="check" size={13} /></span>
                      <span>{ui.toast.replace(/^✓ /, '')}</span>
                    </div>
                  ) : null}

                  {ui.paste ? (
                    <div className="pd-sheet-backdrop">
                      <div className="pd-sheet" data-pd="sheet">
                        <div className="pd-paste-head">
                          <strong>Paste from Motvin</strong>
                          <span className="pd-paste-close"><PIcon name="close" size={18} /></span>
                        </div>
                        {ui.paste === 'open' ? (
                          <div className="pd-paste-zone">
                            <svg className="pd-paste-art" width="150" height="96" viewBox="0 0 150 96" fill="none">
                              <g transform="rotate(-12 48 70)"><rect x="30" y="16" width="38" height="62" rx="7" className="art-back" /></g>
                              <g transform="rotate(12 102 70)"><rect x="82" y="16" width="38" height="62" rx="7" className="art-back" /></g>
                              <rect x="53" y="8" width="44" height="72" rx="8" className="art-front" />
                              <rect x="59" y="16" width="32" height="9" rx="3" className="art-accent" />
                              <rect x="59" y="31" width="24" height="4" rx="2" className="art-line" />
                              <rect x="59" y="40" width="30" height="4" rx="2" className="art-line" />
                              <rect x="59" y="49" width="18" height="4" rx="2" className="art-line" />
                              <rect x="59" y="65" width="32" height="8" rx="4" className="art-line" />
                              <circle cx="97" cy="80" r="11" className="art-badge" />
                              <path d="M97 75v10M92 80h10" stroke="#fff" strokeWidth="2.2" />
                            </svg>
                            <p className="pd-paste-title">Paste screens and flows from <b>Motvin</b></p>
                            <p className={`pd-paste-keys${ui.pasteKeys ? ' is-pressed' : ''}`}>
                              <span>Press</span>
                              <kbd>⌘</kbd>
                              <kbd>V</kbd>
                              <span>to paste</span>
                            </p>
                          </div>
                        ) : (
                          <div className={`pd-paste-zone pd-paste-status is-${ui.paste}`}>
                            <span className="pd-paste-mark">{ui.paste === 'done' ? <PIcon name="check" size={26} /> : <span className="pd-spinner" />}</span>
                            <p className="pd-paste-title">{ui.paste === 'done' ? 'Added to your canvas' : 'Adding to your canvas…'}</p>
                            <p className="pd-paste-detail">{pool[5] ? `${pool[5].name} — ${words(pool[5].coverType) || 'Screen'}` : ''}</p>
                            <span className="pd-paste-progress"><span style={{ width: ui.paste === 'done' ? '100%' : '55%' }} /></span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <span ref={cursorRef} className={`plg-cursor${current?.press ? ' is-press' : ''}${running ? '' : ' is-off'}`} data-at={current?.at ?? ''}>
              <svg viewBox="0 0 24 24"><path d="M5 3v16.5l4.6-4.4 2.9 6.4 2.8-1.2-2.9-6.3H19Z" /></svg>
            </span>

            <div className="plg-toolbar">
              <span className="plg-tool is-on"><UiIcon name="move" /></span>
              <span className="plg-tool"><UiIcon name="frame" /></span>
              <span className="plg-tool"><UiIcon name="rect" /></span>
              <span className="plg-tool"><UiIcon name="pen" /></span>
              <span className="plg-tool"><UiIcon name="text" /></span>
              <span className="plg-tool"><UiIcon name="comment" /></span>
              <span className="plg-tool"><UiIcon name="hand" /></span>
            </div>
          </div>

          <aside className="plg-design">
            <div className="plg-side-tabs"><b>Design</b><span>Prototype</span><em>{Math.round(((camera.z * FW) / 390) * 100)}%</em></div>
            <p className="plg-side-label">Frame</p>
            <div className="plg-fields"><span><i>X</i>1240</span><span><i>Y</i>-320</span></div>
            <div className="plg-fields"><span><i>W</i>390</span><span><i>H</i>844</span></div>
            <p className="plg-side-label">Fill</p>
            <div className="plg-fields is-one"><span><i className="plg-swatch" />FFFFFF<em>100%</em></span></div>
            <p className="plg-side-label">Export</p>
            <div className="plg-fields is-one"><span>PNG<em>2x</em></span></div>
          </aside>
        </div>
      </div>

      {/* Every action the plugin has: the one playing is lit; click one to see it. */}
      <div className="plg-scenes" role="group" aria-label="What the plugin does">
        {SCENES.map((label, i) => (
          <button key={label} type="button" className={i === scene ? 'is-on' : ''} aria-pressed={i === scene} onClick={() => jump(i)} disabled={!beats.length || (i === 1 && !flow)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
