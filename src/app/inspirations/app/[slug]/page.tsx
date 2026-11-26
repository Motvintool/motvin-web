import type { Metadata } from 'next';
import { breadcrumbJsonLd, pageMetadata, sectionPath } from '@/lib/config/share';
import { JsonLd } from '@/components/shared/JsonLd';
import { WEBS_PLATFORMS } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AppDetailView } from '@/components/inspirations/views/AppDetailView';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';

/**
 * App detail. Rendered on demand rather than pre-generated: the app list lives
 * in the backend store and changes whenever screens are ingested, so there is
 * no build-time set of slugs to enumerate.
 */

export async function generateMetadata({ params, searchParams }: PageProps<'/inspirations/app/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const data = await inspirationsApi.getApp(slug).catch(() => null);
  if (!data) return {};
  const { app } = data;
  // An app on iOS and the web is two pages (each shows only its own screens); an app on one is one page.
  const path = `/inspirations/app/${app.slug}`;
  const onBoth = app.platforms.includes('ios') && app.platforms.some((p) => WEBS_PLATFORMS.includes(p));
  const title = `${app.name} — ${INDUSTRY_LABEL[app.industry] ?? app.industry} screens & flows — Motvin`;
  const description = app.tagline
    ? `${app.screenCount} screens and ${app.flowCount} flows from ${app.name}. ${app.tagline}`
    : `${app.screenCount} screens and ${app.flowCount} flows from ${app.name}.`;
  // The app's own picture (opengraph-image.tsx) instead of the site's. Named here: Next doesn't let the file's
  // picture replace one pageMetadata already set.
  const image = { url: `${path}/opengraph-image`, width: 1200, height: 630, alt: `${app.name} screens on Motvin Inspirations` };
  const meta = pageMetadata(title, description, onBoth ? sectionPath(path, await searchParams) : path);
  return {
    ...meta,
    openGraph: { ...meta.openGraph, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function AppDetailPage({ params }: PageProps<'/inspirations/app/[slug]'>) {
  const { slug } = await params;
  const data = await inspirationsApi.getApp(slug).catch(() => null);
  if (!data) notFound();
  const { app, screens, flows } = data;
  // A pattern lists the screens of every app that has it (most of this page's weight); the page only ever looks
  // at this app's, so only those are sent.
  const ownScreens = new Set(screens.map((s) => s.id));
  const patterns = data.patterns.map((p) => ({ ...p, screenIds: p.screenIds.filter((id) => ownScreens.has(id)) }));
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Motvin', path: '/' },
          { name: 'Apps', path: INSPIRATIONS_ROUTES.apps },
          { name: app.name, path: INSPIRATIONS_ROUTES.app(app) },
        ])}
      />
      <Suspense fallback={null}>
        <AppDetailView app={app} screens={screens} flows={flows} patterns={patterns} />
      </Suspense>
    </>
  );
}
