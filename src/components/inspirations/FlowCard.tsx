import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { FLOW_CATEGORY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { ChevronRightIcon } from './Icons';
import { Screenshot } from './MockScreen';

/**
 * Flow tile: the ordered screens as a horizontal strip with step numbers,
 * then app + flow name. Clicking anywhere opens the flow viewer.
 */
export function FlowCard({ flow, screens, app }: { flow: Flow; screens: Screen[]; app?: App }) {
  const mobile = flow.platform !== 'web';
  return (
    <Link href={INSPIRATIONS_ROUTES.flow(flow)} className={`ins-flow-card ${mobile ? 'is-mobile' : ''}`}>
      <div className="ins-flow-strip" aria-hidden>
        {screens.slice(0, mobile ? 4 : 3).map((s, i) => (
          <div className="ins-flow-step" key={s.id}>
            <span className="ins-flow-step-num">{String(i + 1).padStart(2, '0')}</span>
            <div className="ins-flow-step-shot">
              <Screenshot screen={s} />
            </div>
            {i < Math.min(screens.length, mobile ? 4 : 3) - 1 && <ChevronRightIcon size={12} className="ins-flow-arrow" />}
          </div>
        ))}
        {screens.length > (mobile ? 4 : 3) && <span className="ins-flow-more">+{screens.length - (mobile ? 4 : 3)}</span>}
      </div>
      <div className="ins-flow-meta">
        {app && <AppLogo app={app} size={18} />}
        <div className="ins-flow-text">
          <p className="ins-flow-name">
            {app?.name} <span className="ins-flow-sep">·</span> {flow.name}
          </p>
          <p className="ins-flow-sub">
            {FLOW_CATEGORY_LABEL[flow.category]} · {PLATFORM_LABEL[flow.platform]} · {screens.length} screens
          </p>
        </div>
      </div>
    </Link>
  );
}
