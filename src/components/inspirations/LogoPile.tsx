'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, Platform } from '@/lib/inspirations/types';

/** The most logos dropped, each app once. */
const MAX_ICONS = 12;
const SIZE = 68;
const SIZE_PHONE = 48;
/** How far the pointer may move on an icon and still count as a click (opens the app). */
const CLICK_SLOP = 6;
/** The fastest an icon may leave the hand (px per step), so a hard flick throws, not launches. */
const MAX_THROW = 28;
/** The shelf the icons land on: its gap from the window's bottom edge and its thickness. */
const SHELF_BOTTOM = 28;
const SHELF_H = 14;
/** On a phone the dock's round buttons (Buddy, the assistant) stand at the window's right foot: the shelf stops short of them (this far, until they're drawn), so no icon settles under them. */
const DOCK_CLEAR_PHONE = 80;
const DOCK_GAP = 8;
/** The cricket bat that stands in for the mouse pointer: its drawing's size,
 * the point on the blade that sits under the pointer (the sweet spot, on its
 * face), and the blade the physics knows (centre offset from the sweet spot
 * along the bat, width, length). */
const BAT_W = 36;
const BAT_H = 100;
const BAT_HOT = { x: 18, y: 66 };
const BLADE = { offset: 1, w: 30, h: 62 };
/** Its resting tilt, and how far a swing can turn it either way (radians). */
const BAT_TILT = 0.45;
const BAT_SWING = 0.95;
/** The hand's sideways speed (px per move, smoothed) at which the bat grins. */
const BAT_GRIN = 6;
/** Frames the hand must hold still before the bat stops being solid (about a tenth of a second). */
const BAT_SETTLE = 6;
/** One physics step (ms): the world always moves in 60fps steps. */
const STEP = 1000 / 60;
/** The longest the drop waits for the logos to be decoded (ms). */
const DECODE_WAIT = 1200;
/** The collision category of an inline pile's ceiling; a ball meets it only once wholly inside the box. */
const CEILING = 0x0002;
/** Frames the pile must stay wholly still before its frame loop stops. */
const IDLE_FRAMES = 20;
/** The tallest an inline pile's box gets (its CSS min-height). */
const INLINE_MAX = 440;
/** The slowest hit (px per step, along the hit) that makes a ball boing; gentler touches don't. */
const BOING_MIN = 1.5;

/**
 * The search page's playful dead end: the library's app logos dropped from
 * above as balls (matter-js) that bounce, roll and settle on a frosted shelf
 * near the window's foot. Once one comes to rest, its logo rolls itself the
 * right way up, so every logo ends readable. Anywhere over this empty state,
 * the mouse pointer becomes a little cricket bat (solid to the physics, with
 * a face that blinks, and grins on a big swing) that tilts as it's held and
 * swings with the hand: hit the balls with it. Off it (the header, a modal)
 * and over its button, the usual pointer is back. Grab a ball to drag it, flick to throw it; a
 * plain click still opens the app. Each app shows once (up to MAX_ICONS),
 * and each ball is a link, so the keyboard reaches them too.
 *
 * The pile fills the window, the shelf at its foot, for an empty state that
 * is the page (search). `inline` keeps it inside the empty state's own box
 * instead, the shelf under the message, for one that sits low in a page
 * (an app's tabs), where the window's foot would be on top of the message;
 * the bat is out only over that box.
 *
 * The physics library is loaded only once this mounts. Bodies are drawn by
 * writing each icon's transform every frame (no React renders per frame).
 * With reduced motion, the icons are laid out in a still, stacked heap
 * instead.
 */
export function LogoPile({ apps, inline = false, platforms }: { apps: App[]; inline?: boolean; /** The section shown: each logo opens its app there. */ platforms?: readonly Platform[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);
  const batRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  // Set on a drag, so the click that follows it doesn't open the app.
  const draggedRef = useRef(false);

  const items = apps.slice(0, MAX_ICONS);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !items.length) return;
    let cancelled = false;
    let cleanup = () => {};

    void import('matter-js').then(({ default: Matter }) => {
      if (cancelled) return;
      const { Engine, Bodies, Body, Composite, Constraint, Events, Sleeping } = Matter;
      let width = root.clientWidth;
      const phone = width < 640;
      const size = phone ? SIZE_PHONE : SIZE;
      // Inline, the box reaches down to the window's foot where there's room
      // (so the heap is in view without scrolling), never shorter than the
      // message and a row of balls on the shelf, nor taller than its CSS.
      const box = inline ? root.closest<HTMLElement>('.ins-search-empty') : null;
      if (box) {
        const top = box.getBoundingClientRect().top;
        const copy = box.querySelector('.ins-search-empty-copy')?.getBoundingClientRect();
        const least = (copy ? copy.bottom - top : 160) + size + SHELF_BOTTOM + SHELF_H + 24;
        const fit = window.innerHeight - top - 12;
        box.style.minHeight = `${Math.round(Math.max(least, Math.min(INLINE_MAX, fit)))}px`;
      }
      let height = root.clientHeight;
      const count = items.length;
      const els = itemRefs.current;
      els.forEach((el) => {
        if (el) el.style.width = el.style.height = `${size}px`;
      });
      // The ball moves; only its logo turns, so the shine on it stays put.
      const logos = els.map((el) => el?.querySelector('img') ?? null);
      const place = (i: number, x: number, y: number, angle: number) => {
        const el = els[i];
        if (el) el.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`;
        const logo = logos[i];
        if (logo) logo.style.transform = `rotate(${angle}rad)`;
      };
      // The shelf: centred, nearly the window's width (narrower on a wide
      // one). On a phone it runs from the left margin to short of the dock's
      // buttons at the right, its middle (shelfX) shifted left to match.
      let shelfW = 0;
      let shelfX = 0;
      let shelfTop = 0;
      const placeShelf = () => {
        // Where the dock's buttons begin, if any stand low enough to meet the pile.
        let dockLeft = width - DOCK_CLEAR_PHONE + 12;
        if (phone && !inline) {
          const low = [...document.querySelectorAll('.ins-dock-pill')]
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.bottom > window.innerHeight - 200);
          if (low.length) dockLeft = Math.min(...low.map((r) => r.left));
        }
        const dock = phone && !inline ? Math.max(0, width - dockLeft + DOCK_GAP - 12) : 0;
        shelfW = Math.min(width - (phone ? 24 : 64) - dock, 1120);
        shelfX = width / 2 - dock / 2;
        shelfTop = height - SHELF_BOTTOM - SHELF_H;
        const shelf = shelfRef.current;
        if (shelf) {
          shelf.style.width = `${shelfW}px`;
          shelf.style.left = `${shelfX}px`;
        }
      };
      placeShelf();
      const floorY = shelfTop;

      // Reduced motion: a still heap, floor row first, each row a little narrower.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const perRow = Math.max(3, Math.min(count, Math.floor((width * 0.8) / (size + 8))));
        let i = 0;
        for (let row = 0; i < count; row++) {
          const inRow = Math.min(count - i, Math.max(1, perRow - row * 3));
          const start = shelfX - ((inRow - 1) * (size + 8)) / 2;
          for (let k = 0; k < inRow && i < count; k++, i++) {
            place(i, start + k * (size + 8), floorY - size / 2 - row * size, 0);
          }
        }
        return;
      }

      // More solver passes than the default, so balls resting against each
      // other settle (and sleep) instead of trembling.
      const engine = Engine.create({ enableSleeping: true, positionIterations: 12, velocityIterations: 8 });
      engine.gravity.y = 1.1;

      // The shelf (with a lip at each end, so the balls don't roll off), the
      // window's bottom edge under it for anything knocked off, and a wall
      // each side reaching well above, so a thrown ball can't escape.
      const T = 200;
      let walls: Matter.Body[] = [];
      const buildWalls = () => {
        Composite.remove(engine.world, walls);
        const shelfL = shelfX - shelfW / 2;
        const shelfR = shelfX + shelfW / 2;
        // A phone's shortened shelf (clear of the dock) holds fewer in a row,
        // so its lips stand taller: the icons heap up rather than roll off
        // the end and under the dock's buttons.
        const lip = phone && !inline ? size * 2.6 : size * 0.6;
        walls = [
          Bodies.rectangle(shelfX, shelfTop + SHELF_H / 2, shelfW, SHELF_H, { isStatic: true, chamfer: { radius: SHELF_H / 2 } }),
          Bodies.rectangle(shelfL + 3, shelfTop - lip / 2, 6, lip, { isStatic: true, chamfer: { radius: 3 } }),
          Bodies.rectangle(shelfR - 3, shelfTop - lip / 2, 6, lip, { isStatic: true, chamfer: { radius: 3 } }),
          Bodies.rectangle(width / 2, height + T / 2, width + T * 2, T, { isStatic: true }),
          Bodies.rectangle(-T / 2, height - height * 2, T, height * 6, { isStatic: true }),
          Bodies.rectangle(width + T / 2, height - height * 2, T, height * 6, { isStatic: true }),
        ];
        // Inline, a ceiling too, so the box is walled on all four sides: a
        // hard hit bounces off its top rather than flying out of the panel.
        // Only a ball wholly inside meets it (see CEILING), so the drop in
        // from above still comes through.
        if (inline) {
          walls.push(Bodies.rectangle(width / 2, -T / 2, width + T * 2, T, { isStatic: true, collisionFilter: { category: CEILING } }));
        }
        Composite.add(engine.world, walls);
      };
      buildWalls();

      // Dropped from staggered heights above the window, each spinning, so
      // they arrive one after another and bounce as they land.
      const bodies = Array.from({ length: count }, (_, i) =>
        Bodies.circle(
          shelfX - shelfW / 2 + size + Math.random() * Math.max(1, shelfW - size * 2),
          -size - i * size * 0.7 - Math.random() * 80,
          size / 2,
          {
            restitution: 0.55,
            // Enough grip that two balls side by side stop rubbing and
            // spinning each other.
            friction: 0.15,
            frictionStatic: 0.6,
            frictionAir: 0.012,
            density: 0.0016,
            // Passes the ceiling until it's wholly inside (set in the frame loop).
            collisionFilter: { category: 0x0001, mask: ~CEILING },
          },
        ),
      );
      bodies.forEach((b) => Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.2));
      Composite.add(engine.world, bodies);
      // What's drawn for each ball: its logo's turn (following the ball's
      // spin while it moves, eased upright once it's still) and its position
      // (eased while still), so a resting ball's tiny physics jitter against
      // its neighbours never shows as a flicker.
      const shown = Array.from({ length: count }, () => ({ x: NaN, y: NaN, angle: 0, lastAngle: 0 }));

      // A little boing on impact: when a ball lands, or hits another ball or
      // the bat, it squashes along the hit and springs back, more for a
      // harder hit. Played on the ball's `scale` (not its transform), so it
      // sits on top of the hover and drag lift.
      const indexOf = new Map(bodies.map((b, i) => [b.id, i]));
      const arts = els.map((el) => el?.querySelector<HTMLElement>('.ins-search-pile-art') ?? null);
      const lastBoing = new Float64Array(count);
      const boing = (i: number, impact: number, vertical: boolean) => {
        const art = arts[i];
        const now = performance.now();
        if (!art || now - lastBoing[i] < 160) return;
        lastBoing[i] = now;
        const k = Math.min(0.2, 0.05 + (impact - BOING_MIN) * 0.015);
        const squash = vertical ? `${1 + k} ${1 - k}` : `${1 - k} ${1 + k}`;
        const rebound = vertical ? `${1 - k * 0.4} ${1 + k * 0.4}` : `${1 + k * 0.4} ${1 - k * 0.4}`;
        art.animate([{ scale: '1 1' }, { scale: squash, offset: 0.3 }, { scale: rebound, offset: 0.65 }, { scale: '1 1' }], {
          duration: 340,
          easing: 'ease-out',
        });
      };
      // When each touching pair last came apart: two balls that part and
      // meet again straight away are settling against each other, not
      // hitting, so they don't boing again.
      const parted = new Map<string, number>();
      Events.on(engine, 'collisionEnd', (e) => {
        const now = performance.now();
        for (const pair of e.pairs) parted.set(pair.id, now);
      });
      Events.on(engine, 'collisionStart', (e) => {
        for (const pair of e.pairs) {
          const { bodyA, bodyB, collision } = pair;
          if (performance.now() - (parted.get(pair.id) ?? -Infinity) < 250) continue;
          const a = indexOf.get(bodyA.id);
          const b = indexOf.get(bodyB.id);
          if (a === undefined && b === undefined) continue;
          // How fast the two meet along the hit (velocities are still the
          // ones from before the hit here).
          const { normal } = collision;
          const impact = Math.abs((bodyA.velocity.x - bodyB.velocity.x) * normal.x + (bodyA.velocity.y - bodyB.velocity.y) * normal.y);
          if (impact < BOING_MIN) continue;
          const vertical = Math.abs(normal.y) >= Math.abs(normal.x);
          if (a !== undefined) boing(a, impact, vertical);
          if (b !== undefined) boing(b, impact, vertical);
        }
      });

      // The bat: a solid blade that follows the mouse (not touch) anywhere
      // over this empty state, tilted as it's held and swinging with the
      // hand's sideways speed. Drawn by the bat element; the system pointer
      // is hidden while it's out (html.ins-bat-on).
      const batEl = batRef.current;
      const zone = root.closest<HTMLElement>('.ins-search-empty');
      const blade = Bodies.rectangle(-1000, -1000, BLADE.w, BLADE.h, { isStatic: true, chamfer: { radius: 13 } });
      Composite.add(engine.world, blade);
      const bat = { on: false, x: -1000, y: -1000, vx: 0, angle: BAT_TILT, lastX: 0 };
      // (Re)starts the frame loop, which stops itself once the pile is still
      // (set once it exists, below). The bat coming out starts it too, as the
      // pile is plainly in view then.
      let wake = () => {};
      const setBatOn = (on: boolean) => {
        if (bat.on === on) return;
        if (on) wake();
        bat.on = on;
        document.documentElement.classList.toggle('ins-bat-on', on);
        if (!on) Body.setPosition(blade, { x: -1000, y: -1000 });
      };
      const onHover = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse' || drag) return;
        const r = root.getBoundingClientRect();
        // Over this empty state (its message, the balls) or, filling the
        // window, the page round it, from its top down; inline, only over its
        // own box. Never the header above it, or anything laid over it (a
        // modal, the chat button). Over its button (or any other control but
        // the balls) the usual pointer is back, so it's plain what will be
        // clicked.
        const t = e.target instanceof Node ? e.target : null;
        const inBox = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        const over = !!zone && !!t && (inline ? inBox && zone.contains(t) : zone.contains(t) || t.contains(zone));
        const control = t instanceof Element && !root.contains(t) && t.closest('a, button, input, select, textarea, [role="button"]');
        setBatOn(over && !control && e.clientY >= (zone?.getBoundingClientRect().top ?? 0));
        bat.vx = bat.vx * 0.5 + (e.clientX - bat.lastX) * 0.5;
        bat.lastX = e.clientX;
        bat.x = e.clientX - r.left;
        bat.y = e.clientY - r.top;
      };
      const onHoverOut = () => setBatOn(false);
      window.addEventListener('pointermove', onHover);
      document.documentElement.addEventListener('pointerleave', onHoverOut);
      // One step of the bat, from the frame loop: swing toward the hand's
      // speed, move the blade there (with its speed, so it shoves rather
      // than just overlapping), and wake any resting ball it reaches. Held
      // still (resting on the pile, or aiming at a ball to click), it goes
      // through the balls instead: a still blade overlapping a ball would
      // push it into its neighbours and back every frame, and they'd fight.
      let batStill = 0;
      const stepBat = () => {
        if (!bat.on) return;
        bat.vx *= 0.82;
        const goal = BAT_TILT + Math.max(-BAT_SWING, Math.min(BAT_SWING, bat.vx * 0.05));
        bat.angle += (goal - bat.angle) * 0.3;
        // Inline, the whole bat stays in the box, however it's turned: its
        // sweet spot is held back from each edge by as far as the drawing
        // reaches past it that way, so it stops at the wall rather than
        // being cut off by it.
        let bx = bat.x;
        let by = bat.y;
        if (inline) {
          const cos = Math.cos(bat.angle);
          const sin = Math.sin(bat.angle);
          const xs: number[] = [];
          const ys: number[] = [];
          for (const [px, py] of [
            [-BAT_HOT.x, -BAT_HOT.y],
            [BAT_W - BAT_HOT.x, -BAT_HOT.y],
            [-BAT_HOT.x, BAT_H - BAT_HOT.y],
            [BAT_W - BAT_HOT.x, BAT_H - BAT_HOT.y],
          ]) {
            xs.push(px * cos - py * sin);
            ys.push(px * sin + py * cos);
          }
          bx = Math.max(-Math.min(...xs) + 2, Math.min(width - Math.max(...xs) - 2, bx));
          by = Math.max(-Math.min(...ys) + 2, Math.min(height - Math.max(...ys) - 2, by));
        }
        // The blade's centre: BLADE.offset along the bat from the sweet spot,
        // turned with it.
        const cx = bx - Math.sin(bat.angle) * BLADE.offset;
        const cy = by + Math.cos(bat.angle) * BLADE.offset;
        // Just come out (from where it's parked off screen): it lands where
        // the hand is, which may be inside a ball, so it starts out passing
        // through, as if held still, until the hand moves.
        const jumped = blade.position.x < -500;
        const dx = jumped ? 0 : Math.max(-18, Math.min(18, cx - blade.position.x));
        const dy = jumped ? 0 : Math.max(-18, Math.min(18, cy - blade.position.y));
        batStill = jumped ? BAT_SETTLE : Math.hypot(dx, dy) > 0.5 ? 0 : batStill + 1;
        const solid = batStill < BAT_SETTLE;
        blade.collisionFilter.mask = solid ? 0xffffffff : 0;
        Body.setPosition(blade, { x: cx, y: cy });
        Body.setAngle(blade, bat.angle);
        Body.setVelocity(blade, { x: dx, y: dy });
        if (solid && batStill === 0) {
          bodies.forEach((b) => {
            if (b.isSleeping && Math.hypot(b.position.x - cx, b.position.y - cy) < size + BLADE.h / 2) Sleeping.set(b, false);
          });
        }
        if (batEl) {
          batEl.style.transform = `translate3d(${bx - BAT_HOT.x}px, ${by - BAT_HOT.y}px, 0) rotate(${bat.angle}rad)`;
          batEl.classList.toggle('is-swinging', Math.abs(bat.vx) > BAT_GRIN);
        }
      };

      // Drag: a spring from the pointer to the point grabbed on the icon, so
      // it swings from where it's held and flies off with the pointer's speed.
      let drag: { constraint: Matter.Constraint; el: HTMLElement; x0: number; y0: number } | null = null;
      const local = (e: PointerEvent) => {
        const r = root.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const onDown = (i: number) => (e: PointerEvent) => {
        if (e.button !== 0) return;
        const el = els[i];
        const body = bodies[i];
        if (!el || !body) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        // Put down while holding an icon, so it doesn't shove it.
        setBatOn(false);
        wake();
        const p = local(e);
        Sleeping.set(body, false);
        const constraint = Constraint.create({
          pointA: p,
          bodyB: body,
          pointB: { x: p.x - body.position.x, y: p.y - body.position.y },
          stiffness: 0.18,
          damping: 0.08,
          length: 0,
        });
        Composite.add(engine.world, constraint);
        drag = { constraint, el, x0: e.clientX, y0: e.clientY };
        draggedRef.current = false;
        el.classList.add('is-dragging');
      };
      const onMove = (e: PointerEvent) => {
        if (!drag) return;
        drag.constraint.pointA = local(e);
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > CLICK_SLOP) draggedRef.current = true;
      };
      const onUp = () => {
        if (!drag) return;
        const body = drag.constraint.bodyB;
        if (body) {
          const { x, y } = body.velocity;
          const speed = Math.hypot(x, y);
          if (speed > MAX_THROW) Body.setVelocity(body, { x: (x / speed) * MAX_THROW, y: (y / speed) * MAX_THROW });
        }
        Composite.remove(engine.world, drag.constraint);
        drag.el.classList.remove('is-dragging');
        drag = null;
      };
      const downs = els.slice(0, count).map((el, i) => {
        const handler = onDown(i);
        el?.addEventListener('pointerdown', handler);
        return handler;
      });
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);

      const onResize = () => {
        width = root.clientWidth;
        height = root.clientHeight;
        placeShelf();
        buildWalls();
        bodies.forEach((b) => Sleeping.set(b, false));
        wake();
      };
      window.addEventListener('resize', onResize);
      // On a phone the dock's buttons may not be drawn yet when the shelf is
      // first placed: measured again once they are, before the icons land.
      // Any icon already falling outside the shorter shelf drops again from above it.
      const redock = phone && !inline
        ? setTimeout(() => {
            onResize();
            const left = shelfX - shelfW / 2 + size / 2;
            const right = shelfX + shelfW / 2 - size / 2;
            bodies.forEach((b, i) => {
              if (b.position.x >= left && b.position.x <= right) return;
              Body.setPosition(b, { x: left + Math.random() * Math.max(1, right - left), y: -size });
              Body.setVelocity(b, { x: 0, y: 0 });
              // As a respawn: drawn where it now is, not slid there from where it was.
              shown[i].x = NaN;
              prev[i].x = b.position.x;
              prev[i].y = b.position.y;
            });
          }, 700)
        : undefined;

      // Step the world and draw each icon where its body is. One that ends
      // up far outside (thrown hard) drops back in from the top.
      let frame = 0;
      let last = performance.now();
      // Each body's place before the latest step, so a frame that falls
      // between two steps draws it part way from one to the other.
      const prev = bodies.map((b) => ({ x: b.position.x, y: b.position.y, angle: b.angle }));
      let acc = 0;
      const tick = (now: number) => {
        stepBat();
        // The world moves in fixed 60fps steps, however often frames come (a
        // 120Hz screen, a late frame): an uneven step makes matter-js jerky.
        // What's drawn is interpolated between the last two steps, so the
        // balls glide at any frame rate. Never a step back in time: the first
        // frame's timestamp can come before the moment the pile was built.
        acc += Math.min(50, Math.max(0, now - last));
        last = now;
        for (let n = 0; acc >= STEP && n < 4; n++) {
          bodies.forEach((b, i) => {
            prev[i].x = b.position.x;
            prev[i].y = b.position.y;
            prev[i].angle = b.angle;
          });
          Engine.update(engine, STEP);
          acc -= STEP;
        }
        acc = Math.min(acc, STEP);
        const alpha = acc / STEP;
        bodies.forEach((b, i) => {
          // On a phone, one that's come off the shortened shelf (it would lie
          // under the dock's buttons, or half off the screen) drops back in too.
          const offShelf =
            phone && !inline && b.position.y > shelfTop + size / 2 && (b.position.x < shelfX - shelfW / 2 || b.position.x > shelfX + shelfW / 2);
          if (offShelf || b.position.y > height + 400 || b.position.x < -400 || b.position.x > width + 400) {
            Body.setPosition(b, { x: shelfX, y: -size });
            shown[i].x = NaN;
            Body.setVelocity(b, { x: 0, y: 0 });
            b.collisionFilter.mask = ~CEILING;
            prev[i].x = b.position.x;
            prev[i].y = b.position.y;
          }
          // Wholly inside now: from here on the ceiling holds it in.
          const mask = b.collisionFilter.mask ?? ~CEILING;
          if (!(mask & CEILING) && b.position.y - size / 2 > 1) b.collisionFilter.mask = mask | CEILING;
          const p = prev[i];
          const x = p.x + (b.position.x - p.x) * alpha;
          const y = p.y + (b.position.y - p.y) * alpha;
          const angle = p.angle + (b.angle - p.angle) * alpha;
          const s = shown[i];
          const moving = b.speed > 0.4 || Math.abs(b.angularVelocity) > 0.02 || drag?.constraint.bodyB === b;
          if (moving || Number.isNaN(s.x)) {
            s.x = x;
            s.y = y;
            s.angle += angle - s.lastAngle;
          } else {
            // Still: drift to where the body is, and ease the logo round to
            // upright, the short way (to the full turn nearest its turn now).
            s.x += (x - s.x) * 0.2;
            s.y += (y - s.y) * 0.2;
            const turn = Math.PI * 2;
            s.angle += (Math.round(s.angle / turn) * turn - s.angle) * 0.12;
          }
          s.lastAngle = angle;
          place(i, s.x, s.y, s.angle);
        });
        // Nothing left to do (every ball asleep and drawn where it rests,
        // logo upright; no bat, nothing held) or out of sight: stop until
        // something wakes it, so a still pile costs nothing.
        const turn = Math.PI * 2;
        const still =
          !bat.on &&
          !drag &&
          bodies.every((b, i) => {
            const s = shown[i];
            return (
              b.isSleeping &&
              Math.abs(s.x - b.position.x) < 0.05 &&
              Math.abs(s.y - b.position.y) < 0.05 &&
              Math.abs(s.angle - Math.round(s.angle / turn) * turn) < 0.002
            );
          });
        idleFrames = still ? idleFrames + 1 : 0;
        if (idleFrames > IDLE_FRAMES || !visible) {
          running = false;
          return;
        }
        frame = requestAnimationFrame(tick);
      };
      // The drop starts once the pile is in view (at once for one filling the
      // window; when it's scrolled to for an inline one below the fold), so
      // the balls are seen falling rather than found already landed. After
      // that, the loop runs only while something moves and the pile is on
      // screen.
      let started = false;
      let running = false;
      let visible = true;
      let idleFrames = 0;
      // The logos are decoded before the first drop (or DECODE_WAIT at the
      // most), so no image decodes mid-fall and stalls a frame.
      let decoded = false;
      void Promise.race([
        Promise.all(logos.map((img) => img?.decode?.().catch(() => {}))),
        new Promise((r) => setTimeout(r, DECODE_WAIT)),
      ]).then(() => {
        decoded = true;
        if (started) wake();
      });
      wake = () => {
        started = true;
        if (cancelled || !decoded || running || !visible) return;
        running = true;
        idleFrames = 0;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      };
      const seen = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          wake();
          seen.disconnect();
        }
      }, { threshold: inline ? 1 : 0.2 });
      // Inline, once its shelf is wholly in view, so the landing is seen too.
      seen.observe(inline ? (shelfRef.current ?? root) : root);
      // Scrolled away, it pauses; back in view, it picks up where it was.
      const onScreen = new IntersectionObserver((entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible && started) wake();
      });
      onScreen.observe(root);

      cleanup = () => {
        seen.disconnect();
        onScreen.disconnect();
        cancelAnimationFrame(frame);
        els.slice(0, count).forEach((el, i) => el?.removeEventListener('pointerdown', downs[i]));
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('resize', onResize);
        clearTimeout(redock);
        window.removeEventListener('pointermove', onHover);
        document.documentElement.removeEventListener('pointerleave', onHoverOut);
        document.documentElement.classList.remove('ins-bat-on');
        Events.off(engine, 'collisionStart');
        Events.off(engine, 'collisionEnd');
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
    // The pile is built once per set of apps; the bodies own their positions after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps.length]);

  if (!items.length) return null;

  return (
    <div ref={rootRef} className={`ins-search-pile${inline ? ' is-inline' : ''}`} aria-label="Apps in the library">
      {/* The frosted shelf the balls land on. */}
      <div ref={shelfRef} className="ins-search-pile-shelf" aria-hidden />
      {/* The bat that stands in for the pointer: a chubby willow blade with a
          face (blinking eyes, rosy cheeks; happy eyes on a big swing) and a
          grip in the Motvin mark's colours. */}
      <div ref={batRef} className="ins-search-bat" aria-hidden>
        <svg width={BAT_W} height={BAT_H} viewBox={`0 0 ${BAT_W} ${BAT_H}`} fill="none">
          <defs>
            <linearGradient id="ins-bat-grip" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#60A5FA" />
            </linearGradient>
            <linearGradient id="ins-bat-willow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F1D49B" />
              <stop offset="45%" stopColor="#FCEBC6" />
              <stop offset="100%" stopColor="#E8C688" />
            </linearGradient>
          </defs>
          <circle cx="18" cy="5.5" r="4.5" fill="url(#ins-bat-grip)" />
          <rect x="14" y="6" width="8" height="29" rx="4" fill="url(#ins-bat-grip)" />
          {[12, 18, 24, 30].map((y) => (
            <rect key={y} x="14" y={y} width="8" height="1.4" rx="0.7" fill="rgba(255,255,255,0.45)" />
          ))}
          {/* The blade in one piece: shoulders curving out from the handle's
              neck, a rounded toe; a collar where the grip ends hides the seam. */}
          <path
            d="M14 33C14 38 3 39 3 49V84.5Q3 98.5 18 98.5Q33 98.5 33 84.5V49C33 39 22 38 22 33Z"
            fill="url(#ins-bat-willow)"
            stroke="rgba(150,105,45,0.3)"
            strokeLinejoin="round"
          />
          <rect x="13" y="30.5" width="10" height="3.5" rx="1.75" fill="#4F93F5" />
          <rect x="13" y="30.5" width="10" height="1.2" rx="0.6" fill="rgba(255,255,255,0.35)" />
          <rect x="7.5" y="47" width="3.5" height="34" rx="1.75" fill="rgba(255,255,255,0.55)" />
          <g className="ins-search-bat-eyes">
            <ellipse cx="13" cy="62" rx="2.4" ry="2.8" fill="#141414" />
            <ellipse cx="23" cy="62" rx="2.4" ry="2.8" fill="#141414" />
            <circle cx="13.9" cy="61" r="0.85" fill="#fff" />
            <circle cx="23.9" cy="61" r="0.85" fill="#fff" />
          </g>
          <g className="ins-search-bat-happy" stroke="#141414" strokeWidth="1.7" strokeLinecap="round">
            <path d="M10.6 63q2.4-3.4 4.8 0" />
            <path d="M20.6 63q2.4-3.4 4.8 0" />
          </g>
          <ellipse cx="9.5" cy="67.5" rx="3" ry="1.8" fill="#FF8FA3" opacity="0.6" />
          <ellipse cx="26.5" cy="67.5" rx="3" ry="1.8" fill="#FF8FA3" opacity="0.6" />
          <path d="M15.6 67q2.4 2.6 4.8 0" stroke="#141414" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      {items.map((app, i) => (
        <Link
          key={app.id}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          href={INSPIRATIONS_ROUTES.app(app, app.platforms.find((p) => !platforms?.length || platforms.includes(p)))}
          className="ins-search-pile-item"
          aria-label={`Open ${app.name}`}
          title={app.name}
          draggable={false}
          onClick={(e) => {
            // After a drag, the release isn't a click.
            if (draggedRef.current) e.preventDefault();
            draggedRef.current = false;
          }}
        >
          <span className="ins-search-pile-art">
            <img src={inspirationsApi.mediaUrl(app.logo) ?? ''} alt="" draggable={false} />
          </span>
        </Link>
      ))}
    </div>
  );
}
