import type { Metadata } from 'next';
import { Inter, Outfit, Pacifico } from 'next/font/google';
import { AuthModalProvider } from '@/components/shared/AuthModal';
import { AuthProvider } from '@/components/shared/AuthProvider';
import { BANNER_RESERVE_SCRIPT } from '@/components/library/ProductBanner';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import '@/styles/auth-modal.css';

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

export const metadata: Metadata = {
  title: 'Motvin: The creative toolkit for websites, colors, icons, AI, and more.',
  icons: {
    icon: { url: '/ASSET/Images/motvin%20logo%20(full%20color).svg', type: 'image/svg+xml' },
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable} ${pacifico.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets data-theme on <html> before first paint to avoid a flash of the
            wrong theme. Must stay blocking and must run before any stylesheet. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Reserves the library banner's height before first paint, so the
            app shell doesn't jump down once the banner mounts. */}
        <script dangerouslySetInnerHTML={{ __html: BANNER_RESERVE_SCRIPT }} />
      </head>
      {/* Extensions commonly add attributes to <body> before React
          hydrates; that mismatch is theirs, not ours. */}
      <body suppressHydrationWarning>
        <AuthProvider>
          <AuthModalProvider>{children}</AuthModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
