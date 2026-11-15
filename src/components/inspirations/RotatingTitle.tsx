'use client';

import { useEffect, useState } from 'react';

/**
 * The Explore page's heading: five short phrases take turns. Each is typed in letter by letter, every
 * letter coming out of a blur into focus, then held until the next phrase replaces it.
 * Screen readers get one steady heading instead of a changing one; with reduced motion on, it
 * stays on the first phrase.
 *
 * `override` (the taxonomy link under the pointer) is typed in instead, and the rotation waits
 * while it is shown. Clearing it waits a moment before going back, so sliding from one link to
 * the next types the next name rather than flashing the phrase in between. `overrideEmoji` pops in
 * after the name's last letter.
 */
// Opens on "Discover".
const PHRASES = ['Discover', 'Explore', 'Find ideas', 'Get inspired', 'Browse all'];

/** Time each phrase is on screen, including the time it takes to type in (see .ins-rotor-char). */
const CYCLE_MS = 6500;

/** How long the hovered name lingers after the pointer leaves, before the phrase returns. */
const RELEASE_MS = 160;

/** How long the pointer has to rest on a link before its name is typed: a quick pass over a row,
 * or a wobble on the line between two, doesn't retype the heading. */
const SETTLE_MS = 90;

export function RotatingTitle({ override = null, overrideEmoji = null }: { override?: string | null; overrideEmoji?: string | null }) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState<string | null>(override);
  const [heldEmoji, setHeldEmoji] = useState<string | null>(overrideEmoji);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setHeld(override);
        setHeldEmoji(override ? overrideEmoji : null);
      },
      override ? SETTLE_MS : RELEASE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [override, overrideEmoji]);

  useEffect(() => {
    if (held) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [held]);

  const text = held ?? PHRASES[index];

  return (
    <span className="ins-rotor">
      <span className="ins-visually-hidden">Inspirations</span>
      <span key={held ? `hover:${held}` : index} className="ins-rotor-word" aria-hidden>
        {Array.from(text).map((char, i) => (
          <span key={i} className="ins-rotor-char" style={{ ['--i' as string]: i }}>
            {char}
          </span>
        ))}
        {held && heldEmoji && (
          <span className="ins-rotor-emoji" style={{ ['--i' as string]: Array.from(text).length }}>
            {heldEmoji}
          </span>
        )}
      </span>
    </span>
  );
}
