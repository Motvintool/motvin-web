import Link from 'next/link';

/**
 * The library's two top-level tabs (Figma "Tabs", node 1311:15013): "Apps" — iOS apps and Web Apps,
 * with the toolbar's switch choosing between them — and "Webs", the websites. Shared by the header
 * and by the toolbar when it docks over the header, so the two always read the same.
 */
export function AppTabs({
  appsOn,
  appsHref,
  webHref,
  scroll,
}: {
  appsOn: boolean;
  appsHref: string;
  webHref: string;
  /** Pass false to keep the scroll position when switching (the docked toolbar does). */
  scroll?: boolean;
}) {
  return (
    <nav className="ins-apptabs" aria-label="Library">
      <Link href={appsHref} scroll={scroll} className={`ins-apptab ${appsOn ? 'is-active' : ''}`} aria-current={appsOn ? 'page' : undefined}>
        Apps
        <span className="ins-apptab-icons" aria-hidden>
          <span className="ins-apptab-icon">
            <img src="/ASSET/Images/Motvin/tab-apps-icon-a.png" alt="" width={14} height={14} />
          </span>
          <span className="ins-apptab-icon">
            <img src="/ASSET/Images/Motvin/tab-apps-icon-b.png" alt="" width={14} height={14} />
          </span>
        </span>
      </Link>
      <Link href={webHref} scroll={scroll} className={`ins-apptab ${appsOn ? '' : 'is-active'}`} aria-current={appsOn ? undefined : 'page'}>
        Webs
      </Link>
    </nav>
  );
}
