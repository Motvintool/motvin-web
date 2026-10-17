import type { Metadata } from 'next';
import { Inter, Outfit, Pacifico, Manrope, Sora, Plus_Jakarta_Sans } from 'next/font/google';
import { AuthModalProvider } from '@/components/shared/AuthModal';
import { AuthProvider } from '@/components/shared/AuthProvider';
import { DevPerformanceGuard } from '@/components/shared/DevPerformanceGuard';
import { InlineScript } from '@/components/shared/InlineScript';
import { BANNER_RESERVE_SCRIPT } from '@/components/library/ProductBanner';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import '@/styles/auth-modal.css';
import '@/styles/global.css';
import '@/styles/inspirations-cursor.css';

// Matches the weights the static site requested from Google Fonts. Exposed as
// CSS variables because the ported stylesheets reference them by variable
// (--font-outfit / --font-inter) rather than by literal family name.
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '700'],
  display: 'swap',
});

const pacifico = Pacifico({
  variable: '--font-pacifico',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Page headings (.ins-title): Sora, for the big titles only.
const heading = Sora({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
});

// The landing hero's headline: Plus Jakarta Sans.
const hero = Plus_Jakarta_Sans({
  variable: '--font-hero',
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Motvin: The creative toolkit for websites, colors, icons, AI, and more.',
  icons: {
    icon: { url: '/ASSET/Images/motvin%20logo%20(full%20color).svg', type: 'image/svg+xml' },
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable} ${pacifico.variable} ${manrope.variable} ${heading.variable} ${hero.variable}`} suppressHydrationWarning>
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
      </body>
    </html>
  );
}
