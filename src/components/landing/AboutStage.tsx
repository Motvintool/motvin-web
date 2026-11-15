'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { IMAGE_SIZE, optimizedImage } from '@/lib/inspirations/optimizedImage';
import { useLandingLibrary } from './inspirations/useLandingLibrary';

/**
 * The About page's hero picture: a soft sky with clouds, a phone in the
 * middle playing through real iOS screens from the library, and Motvin's
 * tools floating round it as tilted pills. Decorative, so hidden from
 * assistive tech; the headline above says what it shows.
 *
 * The pills and the phone each carry a depth class that AboutAnimations
 * moves at its own speed as the page scrolls.
 */

// How long each screen stays on the phone before the next one fades in, in ms.
const SCREEN_INTERVAL = 2800;
// The most screens the phone plays through.
const MAX_SCREENS = 8;
// How long the Dynamic Island stays open, showing the app, after each new screen, in ms.
const ISLAND_OPEN_MS = 1700;
// When the island first opens, once the first screen is in, in ms.
const ISLAND_FIRST_DELAY = 900;

type Pill = { label: string; icon: string; className: string; style: CSSProperties };

/** Where each pill floats, as a share of the stage, and how it tilts. */
const PILLS: Pill[] = [
  { label: 'Browse real app screens', icon: '/ASSET/Icons/motvin-logo.svg', className: 'is-a', style: { left: '58%', top: '13%', rotate: '9deg' } },
  { label: 'Search flows and patterns', icon: '/ASSET/Icons/Motvin/ai-search.svg', className: 'is-b', style: { left: '15%', top: '38%', rotate: '-9deg' } },
  { label: '350k+ editable icons', icon: '/ASSET/svg/motvin-icons.svg', className: 'is-c', style: { left: '63%', top: '52%', rotate: '-8deg' } },
  { label: 'Ask Motvin Buddy', icon: '/ASSET/Icons/Motvin/bot-Illustration.svg', className: 'is-d', style: { left: '20%', top: '69%', rotate: '0deg' } },
  { label: '10k+ logos', icon: '/ASSET/svg/motvin-logos.svg', className: 'is-e', style: { left: '45%', top: '82%', rotate: '5deg' } },
  { label: 'Save to collections', icon: '/ASSET/Icons/Motvin/collection.svg', className: 'is-f', style: { left: '77%', top: '30%', rotate: '6deg' } },
];

export function AboutStage() {
  const { apps } = useLandingLibrary();
  // Phone apps only, one screen each, resized for the phone.
  const screens = useMemo(
    () =>
      apps
        .filter((app) => app.cover && !app.wide)
        .slice(0, MAX_SCREENS)
        .map((app) => ({
          id: app.id,
          name: app.name,
          logo: app.logo ? optimizedImage(app.logo, 32) : null,
          ...optimizedImage(app.cover as string, IMAGE_SIZE.card),
        })),
    [apps],
  );
  const [shown, setShown] = useState(0);
  // The Dynamic Island opens like a live activity as each screen comes in,
  // showing that app's logo and name, then closes back to the pill.
  const [islandOpen, setIslandOpen] = useState(false);

  useEffect(() => {
    if (!screens.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let close: ReturnType<typeof setTimeout> | undefined;
    const openIsland = () => {
      setIslandOpen(true);
      clearTimeout(close);
      close = setTimeout(() => setIslandOpen(false), ISLAND_OPEN_MS);
    };
    const first = setTimeout(openIsland, ISLAND_FIRST_DELAY);
    const timer =
      screens.length > 1
        ? setInterval(() => {
            setShown((i) => (i + 1) % screens.length);
            openIsland();
          }, SCREEN_INTERVAL)
        : undefined;
    return () => {
      clearTimeout(first);
      clearTimeout(close);
      clearInterval(timer);
    };
  }, [screens.length]);

  const current = screens[shown];

  return (
    <div className="abt-stage" aria-hidden="true">
      <div className="abt-stage-sky">
        <span className="abt-stage-glow" />

        <div className="abt-phone">
          <div className={`abt-phone-screen${screens.length ? ' has-shots' : ''}`}>
            <div className="abt-phone-status">
              <span>9:41</span>
              <i className={`abt-phone-island${islandOpen && current ? ' is-open' : ''}`}>
                {current ? (
                  <span className="abt-island-app" key={current.id}>
                    {current.logo ? <img {...current.logo} alt="" width={20} height={20} /> : null}
                    <b>{current.name}</b>
                    {/* A small live waveform, like an activity in progress. */}
                    <span className="abt-island-wave">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                ) : null}
              </i>
              <span className="abt-phone-icons">
                <i />
                <i />
                <i />
              </span>
            </div>
            {screens.map((screen, i) => (
              <img
                key={screen.id}
                className={`abt-phone-shot${i === shown ? ' is-shown' : ''}`}
                src={screen.src}
                srcSet={screen.srcSet}
                alt=""
                draggable={false}
              />
            ))}
          </div>
        </div>

        {/* Two banks of cloud, in front of the phone's lower half. */}
        <span className="abt-cloud is-left">
          <i />
          <i />
          <i />
        </span>
        <span className="abt-cloud is-right">
          <i />
          <i />
          <i />
        </span>

        {PILLS.map((pill) => (
          <span key={pill.label} className={`abt-pill ${pill.className}`} style={pill.style}>
            <span className="abt-pill-inner">
              <img src={pill.icon} alt="" width={20} height={20} />
              {pill.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
