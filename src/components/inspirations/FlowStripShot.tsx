'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { FLOW_PARAM, STEP_PARAM } from './FlowPreview';
import { Screenshot } from './Screenshot';
import { useScreenContextMenu } from './useScreenContextMenu';

/**
 * One screen in a flow's strip (FlowList on the Flows page, FlowsBrowser on
 * an app's Flows tab). A click opens the flow; a right-click gives the same
 * screenshot menu as a screen card — Copy PNG, Download PNG, Copy link, the
 * link opening the flow on this very step.
 */
export function FlowStripShot({
  flow,
  screen,
  app,
  href,
  label,
}: {
  flow: Flow;
  screen: Screen;
  app?: App;
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // This page as it is (an app's Flows tab, a collection), with the flow open on this step.
  const shotMenu = useScreenContextMenu(screen, app, () => {
    const sp = new URLSearchParams(params.toString());
    sp.set(FLOW_PARAM, flow.id);
    sp.set(STEP_PARAM, screen.id);
    return new URL(`${pathname}?${sp.toString()}`, window.location.origin).toString();
  });
  return (
    <>
      <Link href={href} scroll={false} className="ins-flows-row-shot" aria-label={label} onContextMenu={shotMenu.onContextMenu}>
        <Screenshot screen={screen} />
      </Link>
      {shotMenu.menu}
    </>
  );
}
