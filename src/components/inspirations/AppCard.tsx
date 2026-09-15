import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { Screenshot } from './MockScreen';

/**
 * App tile: logo, name, category, platforms, counts — plus a three-up strip
 * of its screens so the card reads as a collection, not a directory entry.
 */
export function AppCard({ app, preview = [] }: { app: App; preview?: Screen[] }) {
  return (
    <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-app-card">
      {preview.length > 0 && (
        <div className="ins-app-card-strip" aria-hidden>
          {preview.slice(0, 3).map((s) => (
            <div className="ins-app-card-thumb" key={s.id}>
              <Screenshot screen={s} />
            </div>
          ))}
        </div>
      )}
      <div className="ins-app-card-body">
        <AppLogo app={app} size={36} />
        <div className="ins-app-card-text">
          <p className="ins-app-card-name">{app.name}</p>
          <p className="ins-app-card-sub">
            {INDUSTRY_LABEL[app.industry]} · {app.platforms.map((p) => PLATFORM_LABEL[p]).join(' · ')}
          </p>
        </div>
      </div>
      <p className="ins-app-card-counts">
        <span>{app.screenCount} screens</span>
        <span>{app.flowCount} flows</span>
      </p>
    </Link>
  );
}
