'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App } from '@/lib/inspirations/types';

/** Icons in the pile (a phone drops fewer, smaller ones). */
const COUNT = 20;
const COUNT_PHONE = 12;
const SIZE = 80;
const SIZE_PHONE = 56;
/** How far the pointer may move on an icon and still count as a click (opens the app). */
const CLICK_SLOP = 6;
/** The fastest an icon may leave the hand (px per step), so a hard flick throws, not launches. */
const MAX_THROW = 28;

/**
 * The search page's playful dead end: the library's app icons dropped from
 * above the window as real rounded boxes (matter-js) that tumble, bounce and
 * settle into a heap on its bottom edge. Grab one to drag it, flick to throw
 * it, knock the rest about; a plain click still opens the app. Each icon is
 * a link, so the keyboard reaches them too.
 *
 * The physics library is loaded only once this mounts. Bodies are drawn by
 * writing each icon's transform every frame (no React renders per frame).
 * With reduced motion, the icons are laid out in a still, stacked heap
 * instead. The icons repeat when the library has fewer apps than the pile,
 * ordered so the same one doesn't sit next to itself.
 */
export function LogoPile({ apps }: { apps: App[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  // Set on a drag, so the click that follows it doesn't open the app.
  const draggedRef = useRef(false);

  const step = apps.length % 3 === 0 ? 1 : 3;
  const items = apps.length ? Array.from({ length: COUNT }, (_, i) => apps[(i * step) % apps.length]) : [];

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !items.length) return;
    let cancelled = false;
    let cleanup = () => {};

    void import('matter-js').then(({ default: Matter }) => {
      if (cancelled) return;
      const { Engine, Bodies, Body, Composite, Constraint, Sleeping } = Matter;
      let width = root.clientWidth;
      let height = root.clientHeight;
      const phone = width < 640;
      const size = phone ? SIZE_PHONE : SIZE;
      const count = phone ? COUNT_PHONE : COUNT;
      const els = itemRefs.current;
      els.forEach((el, i) => {
        if (!el) return;
        el.style.width = el.style.height = `${size}px`;
        el.style.display = i < count ? '' : 'none';
      });
      const place = (el: HTMLElement, x: number, y: number, angle: number) => {
        el.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) rotate(${angle}rad)`;
      };

      // Reduced motion: a still heap, floor row first, each row a little narrower.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const perRow = Math.max(3, Math.min(count, Math.floor((width * 0.8) / (size + 8))));
        let i = 0;
        for (let row = 0; i < count; row++) {
          const inRow = Math.min(count - i, Math.max(1, perRow - row * 3));
          const start = width / 2 - ((inRow - 1) * (size + 8)) / 2;
          for (let k = 0; k < inRow && i < count; k++, i++) {
            const el = els[i];
            if (el) place(el, start + k * (size + 8), height - size / 2 - row * size, 0);
          }
        }
        return;
      }

      const engine = Engine.create({ enableSleeping: true });
      engine.gravity.y = 1.1;

      // The floor on the window's bottom edge and a wall each side, reaching
      // well above it so a thrown icon can't escape over the top of one.
      const T = 200;
      let walls: Matter.Body[] = [];
      const buildWalls = () => {
        Composite.remove(engine.world, walls);
        walls = [
          Bodies.rectangle(width / 2, height + T / 2, width + T * 2, T, { isStatic: true }),
          Bodies.rectangle(-T / 2, height - height * 2, T, height * 6, { isStatic: true }),
          Bodies.rectangle(width + T / 2, height - height * 2, T, height * 6, { isStatic: true }),
        ];
        Composite.add(engine.world, walls);
      };
      buildWalls();

      // Dropped from staggered heights above the window, each turned a little
      // and spinning, so they arrive one after another and tumble as they land.
      const bodies = Array.from({ length: count }, (_, i) =>
        Bodies.rectangle(
          size + Math.random() * Math.max(1, width - size * 2),
          -size - i * size * 0.7 - Math.random() * 80,
          size,
          size,
          {
            chamfer: { radius: size * 0.26 },
            restitution: 0.3,
            friction: 0.4,
            frictionAir: 0.012,
            density: 0.0018,
            angle: (Math.random() - 0.5) * 0.9,
          },
        ),
      );
      bodies.forEach((b) => Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.12));
      Composite.add(engine.world, bodies);

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
        buildWalls();
        bodies.forEach((b) => Sleeping.set(b, false));
      };
      window.addEventListener('resize', onResize);

      // Step the world and draw each icon where its body is. One that ends
      // up far outside (thrown hard) drops back in from the top.
      let frame = 0;
      let last = performance.now();
      const tick = (now: number) => {
        Engine.update(engine, Math.min(32, now - last));
        last = now;
        bodies.forEach((b, i) => {
          if (b.position.y > height + 400 || b.position.x < -400 || b.position.x > width + 400) {
            Body.setPosition(b, { x: width / 2, y: -size });
            Body.setVelocity(b, { x: 0, y: 0 });
          }
          const el = els[i];
          if (el) place(el, b.position.x, b.position.y, b.angle);
        });
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(frame);
        els.slice(0, count).forEach((el, i) => el?.removeEventListener('pointerdown', downs[i]));
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('resize', onResize);
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
    <div ref={rootRef} className="ins-search-pile" aria-label="Apps in the library">
      {items.map((app, i) => (
        <Link
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          href={INSPIRATIONS_ROUTES.app(app)}
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
