import type { Metadata } from 'next';
import { pageMetadata, SITE_URL } from '@/lib/config/share';
import localFont from 'next/font/local';
import { AuthModalProvider } from '@/components/shared/AuthModal';
import { AuthProvider } from '@/components/shared/AuthProvider';
import { DevPerformanceGuard } from '@/components/shared/DevPerformanceGuard';
import { InlineScript } from '@/components/shared/InlineScript';
import { CookieBanner } from '@/components/shared/CookieBanner';
import { BANNER_RESERVE_SCRIPT } from '@/components/library/ProductBanner';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import '@/styles/auth-modal.css';
import '@/styles/cookie-banner.css';
import '@/styles/global.css';
import '@/styles/inspirations-cursor.css';

// Matches the weights the static site requested from Google Fonts. Exposed as
// CSS variables because the ported stylesheets reference them by variable
// (--font-outfit / --font-inter) rather than by literal family name.
/*
 * The fonts ship with the site (src/app/fonts: Google Fonts' own Latin files, each one variable file covering
 * the weights below) rather than being fetched from Google during the build: the deploy server can't always
 * reach Google Fonts, and a build that can't fetch them fails.
 */
const outfit = localFont({
  src: './fonts/outfit-latin.woff2',
  variable: '--font-outfit',
  weight: '300 700',
  display: 'swap',
});

const inter = localFont({
  src: './fonts/inter-latin.woff2',
  variable: '--font-inter',
  weight: '200 700',
  display: 'swap',
});

const pacifico = localFont({
  src: './fonts/pacifico-latin.woff2',
  variable: '--font-pacifico',
  weight: '400',
  display: 'swap',
});

const manrope = localFont({
  src: './fonts/manrope-latin.woff2',
  variable: '--font-manrope',
  weight: '400 700',
  display: 'swap',
});

const heading = localFont({
  src: './fonts/sora-latin.woff2',
  variable: '--font-heading',
  weight: '600',
  display: 'swap',
});

const hero = localFont({
  src: './fonts/plus-jakarta-sans-latin.woff2',
  variable: '--font-hero',
  weight: '600',
  display: 'swap',
});

export const metadata: Metadata = {
  // Turns the link preview's picture path into a full link (see lib/config/share).
  metadataBase: new URL(SITE_URL),
  ...pageMetadata(
    'Motvin: The creative toolkit for websites, colors, icons, AI, and more.',
    'Real UI screens, flows and patterns from top apps, plus tools for colors, type, icons and more.',
  ),
  icons: {
    icon: { url: '/ASSET/Images/motvin%20logo%20(full%20color).svg', type: 'image/svg+xml' },
    // The logo on white, for an iPhone's home screen (iOS ignores the SVG).
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // data-scroll-behavior: landing pages turn on smooth scrolling (landing.css); from Next 16 this attribute is
    // what makes a page change still jump straight to the top instead of gliding up from the old position.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${outfit.variable} ${inter.variable} ${pacifico.variable} ${manrope.variable} ${heading.variable} ${hero.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets data-theme on <html> before first paint to avoid a flash of the
            wrong theme. Must stay blocking and must run before any stylesheet. */}
        <InlineScript html={THEME_INIT_SCRIPT} />
        {/* Reserves the library banner's height before first paint, so the
            app shell doesn't jump down once the banner mounts. */}
        <InlineScript html={BANNER_RESERVE_SCRIPT} />
      </head>
      {/* Extensions commonly add attributes to <body> before React
          hydrates; that mismatch is theirs, not ours. */}
      <body suppressHydrationWarning>
        <DevPerformanceGuard />
        <AuthProvider>
          <AuthModalProvider>{children}</AuthModalProvider>
        </AuthProvider>
        <CookieBanner />
      </body>
    </html>
  );
}
