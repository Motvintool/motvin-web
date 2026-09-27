'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FLOW_PARAM } from './FlowPreview';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { PlayOutlineIcon } from './Icons';
import { Screenshot } from './Screenshot';

/**
 * Every flow in the library, one under another.
 *
 * Across apps there is nothing sensible to group by — the useful question is
 * "whose flow is this?", so each one leads with the app it came from and the
 * journey's name, then the screens in walk order.
 *
 * The per-app equivalent is FlowsBrowser, which does group, because inside one
 * product the categories are what you navigate by.
 */

type Entry = { flow: Flow; screens: Screen[] };

export function FlowList({ entries, apps }: { entries: Entry[]; apps: Map<string, App> }) {
  return (
    <div className="ins-flowlist">
      {entries.map((entry) => (
        <FlowBlock key={entry.flow.id} entry={entry} app={apps.get(entry.flow.appId)} />
      ))}
    </div>
  );
}

function FlowBlock({ entry, app }: { entry: Entry; app?: App }) {
  const params = useSearchParams();
  const { flow, screens } = entry;
  const steps = flow.screenIds.length;

  const previewHref = (() => {
    const sp = new URLSearchParams(params.toString());
    sp.set(FLOW_PARAM, flow.id);
    return `?${sp.toString()}`;
  })();

  return (
    <div className="ins-flows-row">
      <div className="ins-flows-row-meta">
        <Link href={previewHref} scroll={false} className="ins-flows-row-title">
          <span className="ins-flows-row-play" aria-hidden>
            <PlayOutlineIcon size={16} />
          </span>
          <span className="ins-flows-row-text">
            <span className="ins-flows-row-name">{flow.name}</span>
            <span className="ins-flows-row-sub">
              {steps} {steps === 1 ? 'screen' : 'screens'}
              {app ? ` · ${app.name}` : ''}
            </span>
          </span>
        </Link>
        {app && <AppLogo app={app} size={40} className="ins-flows-row-logo" />}
      </div>

      <div className="ins-flows-row-strip">
        {screens.map((screen, index) => (
          <Link
            key={screen.id}
            href={previewHref}
            scroll={false}
            className="ins-flows-row-shot"
            aria-label={`Step ${index + 1} of the ${flow.name} flow`}
          >
            <Screenshot screen={screen} />
          </Link>
        ))}
        {screens.length === 0 && (
          <p className="ins-muted ins-flows-row-missing">
            This flow&rsquo;s screens are not published yet.
          </p>
        )}
      </div>
    </div>
  );
}
