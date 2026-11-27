'use client';

import { useId, useState } from 'react';
import { useLandingLibrary, type LandingApp } from '@/components/landing/inspirations/useLandingLibrary';
import { HeroLogoSlot, useAppLogoPicks } from '@/components/landing/HeroAppLogos';
import { FIGMA_PLUGIN_URL } from '@/lib/figma/plugin';
import { FigmaMark } from './FigmaMark';
import { PluginDemo } from './PluginDemo';
import type { LibraryCounts } from '@/lib/inspirations/types';

/**
 * The /plugins page's sections: the hero (a Figma window with the plugin open
 * and real screens landing on the canvas), the three ways screens get in,
 * "Copy to Figma" step by step, what the plugin does, and the FAQ. Reuses the
 * landing page's heading classes and /mcp's hero, steps and FAQ styles; its
 * own classes are prefixed plg-.
 */

const FIGMA_MARK = <FigmaMark />;

/**
 * "Three ways in": each card opens with a small picture of the way it works, drawn with real screens from the
 * library, then a title and one line. Search in the plugin · Copy to Figma from the website · Match a frame.
 */
function WaySearch({ shots }: { shots: LandingApp[] }) {
  return (
    <div className="plg-way-art is-dark">
      <div className="plg-wa-search">
        <svg viewBox="0 0 24 24"><path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM15.3 15.3 20 20" /></svg>
        <span>paywall<i className="plg-wa-caret" /></span>
        <b>iOS</b>
      </div>
      <div className="plg-wa-grid">
        {shots.slice(0, 3).map((app, i) => (
          <span key={app.id} className={i === 1 ? 'is-lit' : ''}>
            <img src={app.cover ?? ''} alt="" />
            {i === 1 ? <em>+ Add</em> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function WayCopy({ shot }: { shot: LandingApp | undefined }) {
  return (
    <div className="plg-way-art is-copy">
      <div className="plg-wa-page">
        <span className="plg-wa-shot">{shot?.cover ? <img src={shot.cover} alt="" /> : null}</span>
        <ul className="plg-wa-menu">
          <li>Save to board</li>
          <li className="is-on">
            <span className="plg-wa-fig">{FIGMA_MARK}</span>Copy to Figma
          </li>
          <li>Share link</li>
        </ul>
      </div>
      <svg className="plg-wa-arrow" viewBox="0 0 40 12"><path d="M0 6h36M31 1l5 5-5 5" /></svg>
      <span className="plg-wa-keys">
        <span><kbd>⌘</kbd><kbd>V</kbd></span>
        <small>in Figma</small>
      </span>
    </div>
  );
}

function WayMatch({ shots }: { shots: LandingApp[] }) {
  return (
    <div className="plg-way-art is-canvas">
      <div className="plg-wa-frame">
        <small>Login</small>
        <span className="plg-wa-wire">
          <i /><i /><i className="is-btn" />
        </span>
      </div>
      <svg className="plg-wa-arrow" viewBox="0 0 40 12"><path d="M0 6h36M31 1l5 5-5 5" /></svg>
      <div className="plg-wa-matches">
        {shots.slice(3, 5).map((app) => (
          <span key={app.id}><img src={app.cover ?? ''} alt="" /></span>
        ))}
      </div>
    </div>
  );
}

/** What the plugin does, for the scrolling wall (as on /mcp): a small line icon in the site's sharp style, a title, one line. */
const FEATURES = [
  { title: 'Screens and whole flows', text: 'Add one screen, or every step of a flow in order.', icon: <><path d="M3 6h6v12H3ZM15 6h6v12h-6Z" /><path d="M10.5 12h3" /></> },
  { title: 'Platforms kept apart', text: 'iOS, Web Apps and Webs never mix in your results.', icon: <><path d="M3 5h12v9H3ZM7 18h4" /><path d="M17 9h4v10h-4Z" /></> },
  { title: 'Filters like the site', text: 'Type, app, industry, style, UI element and colour.', icon: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><path d="M13 5h4v4h-4ZM7 15h4v4H7Z" /></> },
  { title: 'Select several', text: 'Tick a few screens and add them side by side.', icon: <><path d="M3.5 3.5h16v7.5M3.5 3.5v16H11" /><path d="M14 14 21 16.4 18 17.6 16.6 20.8Z" /></> },
  { title: 'Shuffle for ideas', text: 'Not sure yet? Get a fresh mix of real screens.', icon: <><path d="M3 17h4.5l9-10H21M3 7h4.5l2.6 2.9M13.9 14.1l2.6 2.9H21" /><path d="m18 4 3 3-3 3M18 14l3 3-3 3" /></> },
  { title: 'Captions and links', text: 'Every screen keeps its app, type and source link.', icon: <><path d="M5 3h14v11H5Z" /><path d="M5 18h9M5 21h6" /></> },
  { title: 'Lands where you look', text: 'Centred in view, or right beside your selection.', icon: <><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><path d="M10 10h4v4h-4Z" /></> },
  { title: 'Fits your setup', text: 'Light, dark or Figma’s theme, resizable from any side.', icon: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" /></> },
];

const FAQ = [
  { q: 'Is the plugin free?', a: 'Yes. Browsing the library in the plugin needs no account at all. Adding screens to your canvas asks you to sign in once with your free Motvin account.' },
  { q: 'How do I sign in?', a: 'Click any screen, then Sign in with Motvin. A browser tab opens on motvin.com; check the code matches and click Allow. The plugin signs itself in and adds what you clicked.' },
  { q: 'How does Copy to Figma work?', a: 'On motvin.com, open a screen or flow (or select several) and choose Copy to Figma. Only a short code is copied. Open the plugin in Figma and press ⌘V: it looks the screens up and adds them.' },
  { q: 'Are the screens editable layers?', a: 'They are full-resolution images, sized to the real device (an iPhone screen arrives at 390 points wide). Use them as references, moodboards or a base to design over.' },
  { q: 'Does it use AI or upload my file?', a: 'No. Match selection reads your frame’s layer names and text inside Figma and matches words; nothing about your file leaves Figma. Your sign-in and settings stay on your computer.' },
  { q: 'Which platforms are in it?', a: 'The same library as motvin.com: iOS, Web Apps and Webs, kept apart. Flows are available for iOS and Web Apps.' },
];

function formatCount(value: number): string {
  return value >= 1000 ? `${Math.floor(value / 1000)},${String(value % 1000).padStart(3, '0')}` : String(value);
}

/** Phone screens with a cover, for the hero's plugin grid and canvas. */
function phoneApps(apps: LandingApp[]): LandingApp[] {
  return apps.filter((app) => app.cover && !app.wide);
}

function Hero({ apps, counts }: { apps: LandingApp[]; counts: LibraryCounts | null }) {
  const screens = counts ? formatCount(counts.screens) : null;
  const { logos, picks, next } = useAppLogoPicks();
  return (
    <section className="mh plg-hero" aria-labelledby="plg-title">
      <div className="mh-card plg-hero-card">
        <div className="mh-glow" aria-hidden="true" />
        {/* The headline with the home page's floating app logos either side (landing.css .hero-floating-graphics):
            real logos from the library; clicking one swaps in another app. */}
        <div className="plg-title-wrap">
          <h1 className="mh-title" id="plg-title">
            Real app screens,
            <br />
            right on your canvas
          </h1>
          <div className="hero-floating-graphics plg-floats" aria-hidden="true">
            <div className="container-left">
              <img alt="" className="hero-float hf-l-sparkle" src="/ASSET/Icons/imgI2.svg" width={35} height={35} />
              <img alt="" className="hero-float hf-l-at" src="/ASSET/Icons/imgI4.svg" width={40} height={40} />
              <HeroLogoSlot className="hf-l-app1" fallback="/ASSET/landing/hero-app-icon-1.webp" slot={0} logos={logos} picks={picks} onNext={next} />
              <HeroLogoSlot className="hf-l-app2" fallback="/ASSET/landing/hero-app-icon-2.webp" slot={1} logos={logos} picks={picks} onNext={next} />
            </div>
            <div className="container-right">
              <img alt="" className="hero-float hf-r-gear" src="/ASSET/Icons/imgI7.svg" width={40} height={40} />
              <HeroLogoSlot className="hf-r-app3" fallback="/ASSET/landing/hero-app-icon-3.webp" slot={2} logos={logos} picks={picks} onNext={next} />
              <HeroLogoSlot className="hf-r-app4" fallback="/ASSET/landing/hero-app-icon-4.webp" slot={3} logos={logos} picks={picks} onNext={next} />
              <img alt="" className="hero-float hf-r-sparkle" src="/ASSET/landing/hero-sparkle-green.svg" width={35} height={35} />
            </div>
          </div>
        </div>
        <p className="mh-lead">
          Search {screens ? `${screens} real screens` : 'thousands of real screens'} and flows without leaving Figma,{' '}
          <br className="mh-lead-break" />
          or copy them on motvin.com and paste them in.
        </p>
        <div className="mh-actions">
          <a href={FIGMA_PLUGIN_URL} className="mh-cta" target="_blank" rel="noopener noreferrer">
            <span className="mh-cta-plus plg-cta-figma" aria-hidden="true">
              {FIGMA_MARK}
            </span>
            Get the Figma plugin
          </a>
        </div>
        <PluginDemo apps={apps} />
      </div>
    </section>
  );
}

export function PluginsLanding() {
  const { apps, counts } = useLandingLibrary();
  const phones = phoneApps(apps);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const faqId = useId();

  return (
    <>
      <Hero apps={apps} counts={counts} />

      <section className="plg-ways" aria-labelledby="plg-ways-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="plg-ways-title">Three ways to bring screens in</h2>
          <p className="lpi-lead">Search, paste or match. Every route ends on your Figma canvas.</p>
        </div>
        <ul className="plg-ways-list">
          <li>
            <WaySearch shots={phones} />
            <h3>Search inside Figma</h3>
            <p>Search the library in the plugin and click a screen to add it.</p>
          </li>
          <li>
            <WayCopy shot={phones[5]} />
            <h3>Copy from motvin.com</h3>
            <p>Choose Copy to Figma on the site, then press ⌘V in the plugin.</p>
          </li>
          <li>
            <WayMatch shots={phones} />
            <h3>Match your frame</h3>
            <p>Select a frame you are designing; Match finds real screens like it.</p>
          </li>
        </ul>
      </section>

      <section className="plg-features" aria-labelledby="plg-features-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="plg-features-title">Made for how designers work</h2>
          <p className="lpi-lead">
            The whole Motvin library{counts ? `: ${formatCount(counts.apps)} apps, ${formatCount(counts.screens)} screens, ${formatCount(counts.flows)} flows` : ''}. Everything you can do on the website, inside Figma.
          </p>
        </div>
        {/* Three columns scrolling in a zigzag (up, down, up), like /mcp's tools: each column holds every card in a
            different order, twice over to close the loop; the copies are hidden from screen readers. Hover pauses. */}
        <div className="mcpp-wall">
          {[0, 3, 6].map((offset, col) => {
            const column = [...FEATURES.slice(offset), ...FEATURES.slice(0, offset)];
            return (
              <ul key={offset} className={`mcpp-wall-col${col % 2 ? ' is-down' : ''}`} aria-hidden={col > 0 || undefined}>
                {[...column, ...column].map((feature, i) => (
                  <li key={`${feature.title}-${i}`} className="mcpp-tool plg-feature" aria-hidden={i >= column.length || undefined}>
                    <svg className="plg-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                      {feature.icon}
                    </svg>
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                  </li>
                ))}
              </ul>
            );
          })}
        </div>
      </section>

      <section className="mcpp-steps plg-copy" id="plg-copy" aria-labelledby="plg-copy-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="plg-copy-title">Copy to Figma</h2>
          <p className="lpi-lead">No downloads, no dragging files around. Copy on the website, paste in Figma.</p>
        </div>
        <ol className="mcpp-steps-list plg-steps-list">
          <li><b>1</b><h3>Pick on motvin.com</h3><p>Open a screen or a flow, or select several screens in a row.</p></li>
          <li><b>2</b><h3>Copy to Figma</h3><p>From the button, the ··· menu or a right-click. Only a short code is copied.</p></li>
          <li><b>3</b><h3>Open the plugin</h3><p>In Figma, run Motvin — Inspiration from Plugins.</p></li>
          <li><b>4</b><h3>Press ⌘V</h3><p>The screens land on your canvas, a flow in step order, with captions.</p></li>
        </ol>
      </section>

      <section className="mcpp-faq" aria-labelledby="plg-faq-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="plg-faq-title">Questions</h2>
        </div>
        <div className="mcpp-faq-list">
          {FAQ.map((item, index) => {
            const open = index === openFaq;
            const answerId = `${faqId}-${index}`;
            return (
              <div key={item.q} className={`mcpp-faq-item${open ? ' is-open' : ''}`}>
                <button type="button" className="mcpp-faq-q" aria-expanded={open} aria-controls={answerId} onClick={() => setOpenFaq(open ? null : index)}>
                  {item.q}
                  <span className="mcpp-faq-icon" aria-hidden="true" />
                </button>
                <div className="mcpp-faq-a" id={answerId} role="region" hidden={!open}>
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
