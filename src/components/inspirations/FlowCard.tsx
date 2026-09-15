import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { FLOW_CATEGORY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { ChevronRightIcon } from './Icons';
import { Screenshot } from './Screenshot';

/**
 * Flow tile: the ordered screens as a horizontal strip with step numbers, then
 * app and flow name. Clicking anywhere opens the flow viewer.
 *
 * `screens` is optional — some callers list flows without having fetched each
 * one's screens. The step count always comes from the flow's own screen ids,
 * so the label stays right whether or not the strip is filled.
 */
export function FlowCard({ flow, screens = [], app }: { flow: Flow; screens?: Screen[]; app?: App }) {
  const mobile = flow.platform !== 'web';
  const visible = mobile ? 4 : 3;
  const steps = flow.screenIds.length;

  return (
    <Link href={INSPIRATIONS_ROUTES.flow(flow)} className={`ins-flow-card ${mobile ? 'is-mobile' : ''}`}>
      {screens.length > 0 && (
        <div className="ins-flow-strip" aria-hidden>
          {screens.slice(0, visible).map((s, i) => (
            <div className="ins-flow-step" key={s.id}>
              <span className="ins-flow-step-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="ins-flow-step-shot">
                <Screenshot screen={s} />
              </div>
              {i < Math.min(screens.length, visible) - 1 && (
                <ChevronRightIcon size={12} className="ins-flow-arrow" />
              )}
            </div>
          ))}
          {screens.length > visible && <span className="ins-flow-more">+{screens.length - visible}</span>}
        </div>
      )}

      <div className="ins-flow-meta">
        {app && <AppLogo app={app} size={18} />}
        <div className="ins-flow-text">
          <p className="ins-flow-name">
            {app?.name} <span className="ins-flow-sep">·</span> {flow.name}
          </p>
          <p className="ins-flow-sub">
            {FLOW_CATEGORY_LABEL[flow.category] ?? flow.category} · {PLATFORM_LABEL[flow.platform] ?? flow.platform} ·{' '}
            {steps} {steps === 1 ? 'screen' : 'screens'}
          </p>
        </div>
      </div>
    </Link>
  );
}
