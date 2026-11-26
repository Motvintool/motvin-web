import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { appCardScreens, coverScreen } from '@/lib/inspirations/cover';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, PLATFORMS, type Screen } from '@/lib/inspirations/types';

/**
 * An app page's link preview: the app's logo, name and counts beside its own screens, instead of the site's one
 * picture — what WhatsApp, Slack, LinkedIn and X show when an app page is shared. The app's first platform (iOS
 * first, as its page opens), three phone screens or one wide web screen. Made on first request, then cached.
 */

export const alt = "The app's screens on Motvin Inspirations";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

const BACKGROUND = '#0b0b0f';
const PHONE = { width: 196, gap: 20, count: 3 };
const WIDE = { width: 640 };

/**
 * A library image as a PNG data URL, resized to `width` — the renderer reads neither WebP (what the library stores)
 * nor a URL it would have to fetch itself. Null when the image can't be loaded; the preview goes out without it.
 */
async function pngDataUrl(path: string | null, width: number): Promise<string | null> {
  const url = inspirationsApi.mediaUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return null;
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

/** The screens to show: the app card's own picks, topped up with the cover order's next ones for phones. */
function previewScreens(cardScreens: string[], screens: Screen[], count: number): Screen[] {
  const picked = appCardScreens({ cardScreens }, screens);
  const rest = screens.filter((s) => s.screenType !== 'splash' && !picked.includes(s));
  while (picked.length < count && rest.length) {
    const next = coverScreen(rest);
    if (!next) break;
    picked.push(next);
    rest.splice(rest.indexOf(next), 1);
  }
  return picked.slice(0, count);
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await inspirationsApi.getApp(slug).catch(() => null);
  const motvinLogo = `data:image/png;base64,${(
    await sharp(await readFile(join(process.cwd(), 'public/ASSET/Images/motvin logo (full color).svg'))).resize({ width: 64 }).png().toBuffer()
  ).toString('base64')}`;

  if (!data) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BACKGROUND, color: '#fff', fontSize: 56 }}>
          Motvin Inspirations
        </div>
      ),
      size,
    );
  }

  const { app, screens } = data;
  const platform = PLATFORMS.find((p) => screens.some((s) => s.platform === p));
  const onPlatform = screens.filter((s) => s.platform === platform);
  const wide = isDesktopPlatform(platform);
  const shown = previewScreens(app.cardScreens, onPlatform, wide ? 1 : PHONE.count);
  const [logo, ...shots] = await Promise.all([
    pngDataUrl(app.logo, 192),
    ...shown.map((s) => pngDataUrl(s.url, (wide ? WIDE.width : PHONE.width) * 2)),
  ]);
  const counts = app.platformCounts?.[platform ?? 'ios'] ?? { screens: app.screenCount, flows: app.flowCount };

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: BACKGROUND, color: '#fff', padding: '64px 0 64px 72px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: wide ? 400 : 440, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {logo ? <img src={logo} alt="" width={96} height={96} style={{ borderRadius: 22, marginBottom: 32 }} /> : null}
            <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.05 }}>{app.name}</div>
            <div style={{ fontSize: 28, color: '#a1a1aa', marginTop: 16 }}>{`${INDUSTRY_LABEL[app.industry] ?? app.industry} app`}</div>
            <div style={{ fontSize: 28, color: '#e4e4e7', marginTop: 28 }}>{`${counts.screens} screens · ${counts.flows} flows`}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={motvinLogo} alt="" width={36} height={36} />
            <div style={{ fontSize: 28, marginLeft: 14 }}>Motvin Inspirations</div>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
          {shots.map((src, i) => {
            const screen = shown[i];
            const width = wide ? WIDE.width : PHONE.width;
            // A long scrolled capture shows its top, cut to the picture's height.
            const height = Math.min(Math.round((width * screen.height) / screen.width), size.height - 128);
            return src ? (
              <img
                key={screen.id}
                src={src}
                alt=""
                width={width}
                height={height}
                style={{ objectFit: 'cover', objectPosition: 'top', borderRadius: wide ? 14 : 26, marginLeft: i ? PHONE.gap : 0, border: '1px solid #27272a' }}
              />
            ) : null;
          })}
        </div>
      </div>
    ),
    size,
  );
}
