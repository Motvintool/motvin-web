import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { IMAGE_SIZE, optimizedImage } from '@/lib/inspirations/optimizedImage';
import type { LandingApp } from './useLandingLibrary';

const icon = (path: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const SEARCH_ICON = icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
const ARROW = <img className="lpi-bento-arrow" src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={20} height={20} aria-hidden="true" />;

const BOOKMARK = <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />;
const CHECK = <path d="m5 12.5 4.5 4.5L19 7.5" />;
const DOWNLOAD = <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>;

/** Phone apps with a cover, and the first web app, from the library. */
type Visual = { phones: LandingApp[]; web: LandingApp | null };

const at = (list: LandingApp[], n: number) => (list.length ? list[n % list.length] : null);

/* Small product previews, one per card, drawn from the library's own apps.
   Each one plays its part of the story when the card is hovered. */

function SearchPreview({ phones }: Visual) {
  const rows = ['Continue with Apple', 'Continue to payment', 'Continue as guest'];
  return (
    <div className="lpi-vis lpi-vis-search">
      <div className="lpi-vis-input">
        {SEARCH_ICON}
        <span>Continue</span>
        <i className="lpi-vis-caret" />
        <kbd>⌘K</kbd>
      </div>
      <ul className="lpi-vis-results">
        {rows.map((row, i) => {
          const app = at(phones, i);
          return (
            <li key={row} style={{ '--i': i } as CSSProperties}>
              {app?.logo ? <img src={app.logo} alt="" /> : <span className="lpi-vis-dot" />}
              <span className="lpi-vis-result-text">
                <mark>Continue</mark>
                {row.slice('Continue'.length)}
              </span>
            </li>
          );
        })}
      </ul>
      {/* The screens those matches come from, rising from the bottom edge. */}
      {phones.length ? (
        <div className="lpi-vis-search-shots">
          {[0, 1, 2].map((i) => (
            <img {...optimizedImage(at(phones, i)!.cover!, IMAGE_SIZE.small)} alt="" key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SavePreview({ phones }: Visual) {
  const shots = [3, 4, 5].map((n) => at(phones, n));
  return (
    <div className="lpi-vis lpi-vis-save">
      <div className="lpi-vis-board">
        <div className="lpi-vis-board-head">
          <span>Onboarding ideas</span>
          <span className="lpi-vis-avatars">
            {shots.map((app, i) => (app?.logo ? <img src={app.logo} alt="" key={i} /> : null))}
          </span>
        </div>
        <div className="lpi-vis-board-shots">
          {shots.map((app, i) =>
            app?.cover ? (
              <img {...optimizedImage(app.cover, IMAGE_SIZE.small)} alt="" key={i} style={{ '--i': i } as CSSProperties} />
            ) : null,
          )}
        </div>
      </div>
      <span className="lpi-vis-toast">
        {icon(BOOKMARK)}
        Saved to Onboarding ideas
      </span>
    </div>
  );
}

function PlatformPreview({ phones, web }: Visual) {
  const phone = at(phones, 2);
  return (
    <div className="lpi-vis lpi-vis-platform">
      <div className="lpi-vis-segment">
        <span className="lpi-vis-segment-thumb" />
        <span>iOS</span>
        <span>Web</span>
      </div>
      <div className="lpi-vis-devices">
        <div className="lpi-vis-browser">
          <span className="lpi-vis-browser-bar">
            <i />
            <i />
            <i />
          </span>
          {web?.cover ? <img {...optimizedImage(web.cover, IMAGE_SIZE.card)} alt="" /> : <span className="lpi-vis-browser-blank" />}
        </div>
        <div className="lpi-vis-phone">{phone?.cover ? <img {...optimizedImage(phone.cover, IMAGE_SIZE.small)} alt="" /> : null}</div>
      </div>
    </div>
  );
}

function DownloadPreview({ phones }: Visual) {
  const app = at(phones, 1);
  return (
    <div className="lpi-vis lpi-vis-download">
      <div className="lpi-vis-download-shots">
        {[1, 4, 6].map((n, i) => {
          const shot = at(phones, n);
          return shot?.cover ? (
            <img {...optimizedImage(shot.cover, IMAGE_SIZE.small)} alt="" key={n} style={{ '--i': i } as CSSProperties} />
          ) : null;
        })}
      </div>
      <div className="lpi-vis-file">
        {app?.logo ? <img src={app.logo} alt="" /> : <span className="lpi-vis-dot" />}
        <span className="lpi-vis-file-name">
          <b>{app?.name ?? 'App'}</b>
          {app?.screenCount != null ? <small>{app.screenCount.toLocaleString('en-US')} screens</small> : null}
          <span className="lpi-vis-bar">
            <i />
          </span>
        </span>
        <span className="lpi-vis-file-action">
          <span className="is-download">{icon(DOWNLOAD)}</span>
          <span className="is-done">{icon(CHECK)}</span>
        </span>
      </div>
    </div>
  );
}

const FEATURES: {
  title: string;
  text: string;
  href: string;
  size: 'wide' | 'small';
  Preview: (props: Visual) => ReactNode;
}[] = [
  {
    title: 'Search what screens say',
    text: 'Type a word from a button or heading and find every screen that shows it.',
    href: INSPIRATIONS_ROUTES.search,
    size: 'wide',
    Preview: SearchPreview,
  },
  {
    title: 'Save to collections',
    text: 'Keep the screens and apps you like in boards, and come back to them any time.',
    href: INSPIRATIONS_ROUTES.collections,
    size: 'small',
    Preview: SavePreview,
  },
  {
    title: 'iOS and web apps',
    text: 'Switch between phone apps and web apps without leaving the library.',
    href: INSPIRATIONS_ROUTES.apps,
    size: 'small',
    Preview: PlatformPreview,
  },
  {
    title: 'Download screens',
    text: 'Grab a single screen or every screen in an app, ready for your moodboard.',
    href: INSPIRATIONS_ROUTES.apps,
    size: 'wide',
    Preview: DownloadPreview,
  },
];

/** "What you can do" bento grid with small live previews. */
export function FeatureGrid({ apps }: { apps: LandingApp[] }) {
  const logos = apps.filter((app) => app.logo).slice(0, 7);
  const logoSrcs = logos.map((app) => app.logo!);
  const visual: Visual = {
    phones: apps.filter((app) => app.cover && !app.wide),
    web: apps.find((app) => app.cover && app.wide) ?? null,
  };

  return (
    <section className="lpi-grid-section">
      <div className="lpi-heading">
        <h2 className="lpi-title">Everything you need to find the right reference</h2>
      </div>
      <div className="lpi-bento">
        {FEATURES.map(({ title, text, href, size, Preview }) => (
          <Link href={href} className={`lpi-bento-card is-${size}`} key={title}>
            <Preview {...visual} />
            <div className="lpi-bento-copy">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
            {ARROW}
          </Link>
        ))}

        {/* Full-width last row: the library is growing, and it takes requests. */}
        <Link href={INSPIRATIONS_ROUTES.settingsRequests} className="lpi-bento-card is-full">
          <div className="lpi-bento-copy">
            <h3>Request an app</h3>
            <p>Missing something? Ask for an app and we will add it to the library.</p>
          </div>
          <div className="lpi-vis-request" aria-hidden="true">
            {logoSrcs.slice(0, 5).map((src, i) => (
              <img src={src} alt="" key={src} style={{ '--i': i } as CSSProperties} />
            ))}
            <span className="lpi-vis-request-add">
              {icon(<><path d="M12 5v14" /><path d="M5 12h14" /></>)}
            </span>
          </div>
          {ARROW}
        </Link>
      </div>
    </section>
  );
}
