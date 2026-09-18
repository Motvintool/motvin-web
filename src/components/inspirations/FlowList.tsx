'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FLOW_PARAM } from './FlowPreview';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { ChevronRightIcon } from './Icons';
import { SaveButton } from './SaveButton';
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
    <section className="ins-flowblock" aria-label={`${flow.name} flow`}>
      <header className="ins-flowblock-head">
        {app && <AppLogo app={app} size={38} className="ins-flowblock-logo" />}

        <div className="ins-flowblock-titles">
          <h2 className="ins-flowblock-title">
            {app && (
              <>
                <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-flowblock-app">
                  {app.name}
                </Link>
                <span className="ins-flowblock-slash" aria-hidden>
                  /
                </span>
              </>
            )}
            <Link href={previewHref} scroll={false} className="ins-flowblock-flow">
              {flow.name}
            </Link>
          </h2>
          <p className="ins-flowblock-count">
            {steps} {steps === 1 ? 'Screen' : 'Screens'}
          </p>
        </div>

        <div className="ins-flowblock-actions">
          <SaveButton type="flow" id={flow.id} variant="button" label="Save" />
          {app && (
            <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-btn ins-btn--ghost ins-btn--sm">
              View App <ChevronRightIcon size={13} />
            </Link>
          )}
        </div>
      </header>

      <div className="ins-flowrow-strip">
        {screens.map((screen, index) => (
          <Link
            key={screen.id}
            href={previewHref}
            scroll={false}
            className="ins-flowrow-shot"
            aria-label={`Step ${index + 1} of the ${flow.name} flow`}
          >
            <Screenshot screen={screen} />
            <span className="ins-flowrow-step">{index + 1}</span>
          </Link>
        ))}
        {screens.length === 0 && (
          <p className="ins-muted ins-flowrow-missing">
            This flow&rsquo;s screens are not published yet.
          </p>
        )}
      </div>
    </section>
  );
}
